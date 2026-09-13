import { Inject, BadRequestException,
  ConflictException,
  ForbiddenException,
  Injectable,
  NotFoundException, } from '@nestjs/common';
import type { PrismaService } from '../prisma/prisma.service';
import { PRISMA_SERVICE } from '../prisma/prisma.constants';
import { BookingStatus, ManualProofStatus, NotificationType, PaymentMethod } from '@prisma/client';
import { ImageUploadService } from '../common/services/image-upload.service';
import { PaymentsService } from '../payments/payments.service';
import { NotificationsService } from '../notifications/notifications.service';

@Injectable()
export class ManualPaymentsService {
  constructor(
    @Inject(PRISMA_SERVICE) private readonly prisma: PrismaService,
    private readonly imageUpload: ImageUploadService,
    private readonly paymentsService: PaymentsService,
    private readonly notifications: NotificationsService,
  ) {}

  /**
   * المريض يرفع صورة إثبات التحويل بعد أن حوّل يدويًا عبر شام كاش. هذا لا يؤكد الحجز —
   * فقط ينقله إلى PENDING_VERIFICATION بانتظار مراجعة الأدمن (نقطة الحقيقة الوحيدة للقبول).
   */
  async submitProof(userId: string, bookingId: string, file: Express.Multer.File) {
    const booking = await this.prisma.booking.findUnique({
      where: { id: bookingId },
      include: { manualPaymentProof: true },
    });
    if (!booking) throw new NotFoundException('الحجز غير موجود');
    if (booking.userId !== userId) throw new ForbiddenException('لا يمكنك رفع إثبات لحجز ليس لك');
    if (booking.paymentMethod !== PaymentMethod.MANUAL_SHAMCASH) {
      throw new BadRequestException('هذا الحجز ليس بطريقة الدفع اليدوي');
    }
    if (booking.status !== BookingStatus.PENDING_PAYMENT) {
      throw new BadRequestException('لا يمكن رفع إثبات دفع في حالة الحجز الحالية');
    }

    const relativePath = await this.imageUpload.saveImage(file, 'manual-payment-proofs');

    // upsert: يسمح للمريض بإعادة الرفع بعد رفض سابق (سجل واحد فقط لكل حجز)
    const proof = await this.prisma.manualPaymentProof.upsert({
      where: { bookingId },
      create: { bookingId, proofImagePath: relativePath, status: ManualProofStatus.PENDING },
      update: {
        proofImagePath: relativePath,
        status: ManualProofStatus.PENDING,
        rejectionReason: null,
        reviewedByAdminId: null,
        reviewedAt: null,
      },
    });

    await this.prisma.booking.update({
      where: { id: bookingId },
      data: { status: BookingStatus.PENDING_VERIFICATION },
    });

    return proof;
  }

  async listPending() {
    return this.prisma.manualPaymentProof.findMany({
      where: { status: ManualProofStatus.PENDING },
      include: {
        booking: {
          include: {
            user: { select: { id: true, fullName: true, email: true } },
            doctor: { include: { user: { select: { fullName: true } } } },
            slot: true,
          },
        },
      },
      orderBy: { createdAt: 'asc' },
    });
  }

  /** الأدمن فقط — نقطة الحقيقة الوحيدة لتحويل حجز دفع يدوي إلى CONFIRMED */
  async approve(adminId: string, bookingId: string) {
    const proof = await this.getProofOrThrow(bookingId);
    if (proof.status !== ManualProofStatus.PENDING) {
      throw new ConflictException('تمت مراجعة هذا الإثبات بالفعل');
    }

    await this.prisma.manualPaymentProof.update({
      where: { bookingId },
      data: { status: ManualProofStatus.APPROVED, reviewedByAdminId: adminId, reviewedAt: new Date() },
    });

    return this.paymentsService.confirmBookingAndNotify(bookingId);
  }

  async reject(adminId: string, bookingId: string, reason?: string) {
    const proof = await this.getProofOrThrow(bookingId);
    if (proof.status !== ManualProofStatus.PENDING) {
      throw new ConflictException('تمت مراجعة هذا الإثبات بالفعل');
    }

    await this.prisma.manualPaymentProof.update({
      where: { bookingId },
      data: {
        status: ManualProofStatus.REJECTED,
        reviewedByAdminId: adminId,
        reviewedAt: new Date(),
        rejectionReason: reason,
      },
    });

    // نُعيد الحجز إلى PENDING_PAYMENT (وليس إلغاءه) ليتمكن المريض من رفع إثبات صحيح من جديد
    // ضمن نفس مهلة الحجز؛ لو انتهت المهلة أصلًا فسيتولى BookingsCleanupTask تحريرها كالمعتاد.
    const booking = await this.prisma.booking.update({
      where: { id: bookingId },
      data: { status: BookingStatus.PENDING_PAYMENT },
      include: { user: { select: { id: true, fullName: true, email: true } } },
    });

    await this.notifications.notifyUser(booking.userId, NotificationType.PAYMENT_FAILED, {
      title: 'تعذّر التحقق من إثبات الدفع',
      body: reason ?? 'الرجاء رفع صورة إثبات تحويل واضحة وصحيحة',
      data: { bookingId },
    });

    return booking;
  }

  private async getProofOrThrow(bookingId: string) {
    const proof = await this.prisma.manualPaymentProof.findUnique({ where: { bookingId } });
    if (!proof) throw new NotFoundException('لا يوجد إثبات دفع مرفوع لهذا الحجز');
    return proof;
  }
}
