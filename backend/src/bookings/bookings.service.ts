import { Inject, BadRequestException,
  ConflictException,
  ForbiddenException,
  Injectable,
  NotFoundException, } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import type { PrismaService } from '../prisma/prisma.service';
import { PRISMA_SERVICE } from '../prisma/prisma.constants';
import { BookingStatus, NotificationType, PaymentMethod, SlotStatus } from '@prisma/client';
import { CreateBookingDto } from './dto/create-booking.dto';
import { PaymentsService } from '../payments/payments.service';
import { NotificationsService } from '../notifications/notifications.service';

/** الحد الأدنى للإلغاء مع استرداد كامل: يجب أن يبقى على الموعد 24 ساعة فأكثر */
const CANCELLATION_WINDOW_HOURS = 24;

@Injectable()
export class BookingsService {
  constructor(
    @Inject(PRISMA_SERVICE) private readonly prisma: PrismaService,
    private readonly config: ConfigService,
    private readonly paymentsService: PaymentsService,
    private readonly notifications: NotificationsService,
  ) {}

  /**
   * ينشئ الحجز بحالة PENDING_PAYMENT ويحجز الـ slot مؤقتًا (HELD) بمهلة زمنية.
   * لا يتحول الحجز إلى CONFIRMED هنا إطلاقًا — ذلك يحدث فقط عبر webhook الدفع.
   */
  async create(userId: string, dto: CreateBookingDto) {
    const holdMinutes = Number(this.config.get<string>('BOOKING_HOLD_MINUTES') ?? '15');

    const booking = await this.prisma.$transaction(async (tx) => {
      // قفل منطقي عبر شرط الحالة نفسه: التحديث لا ينجح إلا إذا كانت الفترة لا تزال OPEN،
      // وهذا يمنع اثنين من حجز نفس الفترة في نفس اللحظة (race condition) على مستوى القاعدة
      const slot = await tx.availabilitySlot.findUnique({
        where: { id: dto.slotId },
        include: { doctor: true },
      });
      if (!slot) throw new NotFoundException('الفترة غير موجودة');
      if (slot.startsAt < new Date()) {
        throw new BadRequestException('لا يمكن حجز فترة في الماضي');
      }
      if (
        dto.paymentMethod === PaymentMethod.MANUAL_SHAMCASH &&
        !slot.doctor.shamCashAccountNumber &&
        !slot.doctor.shamCashQrImagePath
      ) {
        throw new BadRequestException('هذا الطبيب لم يفعّل استلام الدفع اليدوي عبر شام كاش بعد');
      }

      const updateResult = await tx.availabilitySlot.updateMany({
        where: { id: dto.slotId, status: SlotStatus.OPEN },
        data: {
          status: SlotStatus.HELD,
          heldUntil: new Date(Date.now() + holdMinutes * 60 * 1000),
        },
      });
      if (updateResult.count === 0) {
        throw new ConflictException('هذه الفترة لم تعد متاحة، الرجاء اختيار فترة أخرى');
      }

      return tx.booking.create({
        data: {
          userId,
          doctorId: slot.doctorId,
          slotId: slot.id,
          amountCents: slot.doctor.consultFeeCents,
          currency: slot.doctor.currency,
          notes: dto.notes,
          status: BookingStatus.PENDING_PAYMENT,
          paymentMethod: dto.paymentMethod ?? PaymentMethod.GATEWAY,
        },
        include: { doctor: true },
      });
    });

    // الدفع اليدوي (شام كاش): لا بوابة إلكترونية هنا — نرجع للمريض بيانات استلام الطبيب
    // ليحوّل يدويًا، ثم يرفع إثبات التحويل عبر manual-payments لاحقًا.
    if (booking.paymentMethod === PaymentMethod.MANUAL_SHAMCASH) {
      return {
        booking,
        manualPayment: {
          shamCashAccountNumber: booking.doctor.shamCashAccountNumber,
          shamCashQrImageUrl: booking.doctor.shamCashQrImagePath
            ? `/doctors/${booking.doctorId}/shamcash-qr`
            : null,
        },
      };
    }

    const checkout = await this.paymentsService.createCheckoutForBooking(booking.id);
    return { booking, ...checkout };
  }

  async listMine(userId: string) {
    return this.prisma.booking.findMany({
      where: { userId },
      include: {
        doctor: { include: { user: { select: { id: true, fullName: true } } } },
        slot: true,
        videoRoom: true,
        payment: true,
      },
      orderBy: { createdAt: 'desc' },
    });
  }

  async listForDoctor(userId: string) {
    const doctor = await this.prisma.doctorProfile.findUnique({ where: { userId } });
    if (!doctor) throw new NotFoundException('لا يوجد ملف طبيب لهذا الحساب');
    return this.prisma.booking.findMany({
      where: { doctorId: doctor.id },
      include: {
        user: { select: { id: true, fullName: true, email: true } },
        slot: true,
        videoRoom: true,
      },
      orderBy: { createdAt: 'desc' },
    });
  }

  async getOneForUser(userId: string, bookingId: string) {
    const booking = await this.prisma.booking.findUnique({
      where: { id: bookingId },
      include: {
        doctor: { include: { user: { select: { id: true, fullName: true } } } },
        slot: true,
        videoRoom: true,
        payment: true,
      },
    });
    if (!booking) throw new NotFoundException('الحجز غير موجود');
    if (booking.userId !== userId) throw new ForbiddenException('لا يمكنك الوصول إلى هذا الحجز');
    return booking;
  }

  /**
   * يلغي الحجز. قبل الدفع: تحرير فوري بدون قيود. بعد التأكيد: يُسمح فقط ضمن نافذة
   * الإلغاء (24 ساعة قبل الموعد) مع استرداد كامل تلقائي؛ بعدها يُرفض الإلغاء من هنا.
   */
  async cancel(userId: string, bookingId: string) {
    const booking = await this.prisma.booking.findUnique({
      where: { id: bookingId },
      include: { slot: true, doctor: true },
    });
    if (!booking) throw new NotFoundException('الحجز غير موجود');
    if (booking.userId !== userId) throw new ForbiddenException('لا يمكنك إلغاء هذا الحجز');
    if (
      booking.status === BookingStatus.COMPLETED ||
      booking.status === BookingStatus.IN_SESSION ||
      booking.status === BookingStatus.CANCELLED
    ) {
      throw new BadRequestException('لا يمكن إلغاء هذا الحجز في حالته الحالية');
    }

    let shouldRefund = false;
    if (booking.status === BookingStatus.CONFIRMED) {
      const hoursUntilAppointment = (booking.slot.startsAt.getTime() - Date.now()) / (60 * 60 * 1000);
      if (hoursUntilAppointment < CANCELLATION_WINDOW_HOURS) {
        throw new BadRequestException(
          `لا يمكن إلغاء موعد مؤكَّد قبل أقل من ${CANCELLATION_WINDOW_HOURS} ساعة من موعده، تواصل مع الدعم`,
        );
      }
      shouldRefund = true;
    }

    await this.prisma.$transaction([
      this.prisma.booking.update({
        where: { id: bookingId },
        data: { status: BookingStatus.CANCELLED, cancelledAt: new Date() },
      }),
      this.prisma.availabilitySlot.update({
        where: { id: booking.slotId },
        data: { status: SlotStatus.OPEN, heldUntil: null },
      }),
    ]);

    if (shouldRefund) {
      await this.paymentsService.refundForBooking(bookingId);
    }

    await this.notifications.notifyUser(booking.userId, NotificationType.BOOKING_CANCELLED, {
      title: 'تم إلغاء الحجز',
      body: shouldRefund
        ? 'تم إلغاء موعدك واسترداد المبلغ المدفوع بالكامل'
        : 'تم إلغاء موعدك',
      data: { bookingId },
    });
    await this.notifications.notifyUser(booking.doctor.userId, NotificationType.BOOKING_CANCELLED, {
      title: 'ألغى المريض الموعد',
      body: 'تم إلغاء أحد مواعيدك من قبل المريض',
      data: { bookingId },
    });

    return { success: true, refunded: shouldRefund };
  }

  /**
   * تُستدعى دوريًا (cron) لتحرير الفترات التي انتهت مهلة حجزها المؤقت دون إتمام الدفع.
   */
  async releaseExpiredHolds() {
    const expiredSlots = await this.prisma.availabilitySlot.findMany({
      where: { status: SlotStatus.HELD, heldUntil: { lt: new Date() } },
      include: { booking: true },
    });

    for (const slot of expiredSlots) {
      await this.prisma.$transaction([
        this.prisma.availabilitySlot.update({
          where: { id: slot.id },
          data: { status: SlotStatus.OPEN, heldUntil: null },
        }),
        ...(slot.booking
          ? [
              this.prisma.booking.update({
                where: { id: slot.booking.id },
                data: { status: BookingStatus.EXPIRED },
              }),
            ]
          : []),
      ]);
    }

    return { released: expiredSlots.length };
  }
}
