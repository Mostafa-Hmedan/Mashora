import { BadRequestException, Inject, Injectable, Logger } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import type { PrismaService } from '../prisma/prisma.service';
import { PRISMA_SERVICE } from '../prisma/prisma.constants';
import { BookingStatus, PaymentStatus, SlotStatus } from '@prisma/client';
import { PAYMENT_PROVIDER_ADAPTER } from './payments.constants';
import type { PaymentProviderAdapter } from './providers/payment-provider.interface';
import { VideoService } from '../video/video.service';
import { NotificationsService } from '../notifications/notifications.service';
import { NotificationType } from '@prisma/client';

@Injectable()
export class PaymentsService {
  private readonly logger = new Logger(PaymentsService.name);

  constructor(
    @Inject(PRISMA_SERVICE) private readonly prisma: PrismaService,
    private readonly config: ConfigService,
    @Inject(PAYMENT_PROVIDER_ADAPTER) private readonly provider: PaymentProviderAdapter,
    private readonly videoService: VideoService,
    private readonly notifications: NotificationsService,
  ) {}

  /** يُستدعى من BookingsService بعد إنشاء الحجز بحالة PENDING_PAYMENT */
  async createCheckoutForBooking(bookingId: string) {
    const booking = await this.prisma.booking.findUnique({
      where: { id: bookingId },
      include: { user: true },
    });
    if (!booking) throw new BadRequestException('الحجز غير موجود');

    const result = await this.provider.createCheckout({
      bookingId: booking.id,
      amountCents: booking.amountCents,
      currency: booking.currency,
      customerEmail: booking.user.email,
      description: `حجز موعد استشارة #${booking.id}`,
    });

    const providerName = this.config.get<string>('PAYMENT_PROVIDER')!;

    const payment = await this.prisma.payment.create({
      data: {
        bookingId: booking.id,
        provider: providerName as any,
        providerRefId: result.providerRefId,
        amountCents: booking.amountCents,
        currency: booking.currency,
        checkoutUrl: result.checkoutUrl,
        status: PaymentStatus.CREATED,
      },
    });

    return { checkoutUrl: result.checkoutUrl, paymentId: payment.id };
  }

  /**
   * نقطة الحقيقة الوحيدة لتأكيد الدفع. لا تُستدعى أبدًا من طلب يرسله المستخدم مباشرة —
   * فقط من AuthController الخاص بالـ webhook بعد التحقق من التوقيع في الطبقة الأدنى.
   */
  async handleVerifiedWebhook(
    rawBody: Buffer,
    headers: Record<string, string>,
    query: Record<string, string>,
  ) {
    let verified;
    let signatureValid = true;
    try {
      verified = this.provider.verifyWebhook(rawBody, headers, query);
    } catch (err) {
      signatureValid = false;
      // نسجل كل محاولة حتى الفاشلة للتدقيق الأمني، دون كشف تفاصيل الخطأ للمرسل
      await this.prisma.webhookEvent.create({
        data: {
          provider: this.config.get<string>('PAYMENT_PROVIDER') as any,
          signatureValid: false,
          payload: this.safeParse(rawBody),
        },
      });
      throw err;
    }

    await this.prisma.webhookEvent.create({
      data: {
        provider: this.config.get<string>('PAYMENT_PROVIDER') as any,
        providerRefId: verified.providerRefId,
        signatureValid,
        payload: verified.rawPayload as any,
      },
    });

    if (!verified.isPaid) {
      await this.prisma.payment.updateMany({
        where: { providerRefId: verified.providerRefId },
        data: { status: PaymentStatus.FAILED, rawWebhookPayload: verified.rawPayload as any },
      });
      return { handled: true, paid: false };
    }

    return this.confirmPayment(verified.providerRefId, verified.rawPayload);
  }

  private async confirmPayment(providerRefId: string, rawPayload: unknown) {
    const payment = await this.prisma.payment.findUnique({ where: { providerRefId } });
    if (!payment) {
      this.logger.warn(`Webhook لعملية دفع غير معروفة: ${providerRefId}`);
      return { handled: false, reason: 'payment_not_found' };
    }

    // Idempotency: إذا سبق تأكيد هذا الدفع لا نكرر إنشاء الاجتماع أو تحديث الحالة
    if (payment.status === PaymentStatus.PAID) {
      return { handled: true, paid: true, alreadyProcessed: true };
    }

    await this.prisma.payment.update({
      where: { id: payment.id },
      data: {
        status: PaymentStatus.PAID,
        paidAt: new Date(),
        rawWebhookPayload: rawPayload as any,
      },
    });

    await this.confirmBookingAndNotify(payment.bookingId);
    return { handled: true, paid: true };
  }

  /**
   * نقطة تجميع مشتركة تُستدعى بعد ثبوت الدفع (بأي وسيلة: webhook إلكتروني، أو موافقة أدمن
   * على إثبات تحويل يدوي عبر ManualPaymentsService). تحوّل الحجز CONFIRMED، تحجز الـ slot
   * نهائيًا BOOKED، تنشئ غرفة الفيديو، وترسل إشعارات الطرفين.
   */
  async confirmBookingAndNotify(bookingId: string) {
    const booking = await this.prisma.$transaction(async (tx) => {
      const updatedBooking = await tx.booking.update({
        where: { id: bookingId },
        data: { status: BookingStatus.CONFIRMED, confirmedAt: new Date() },
        include: {
          // select صريح (لا include: true) لاستثناء passwordHash من الاستجابة —
          // هذا الكائن يُرجَع مباشرة كـ response من مسارات مثل admin/manual-payments/approve
          doctor: { include: { user: { select: { id: true, fullName: true, email: true } } } },
          user: { select: { id: true, fullName: true, email: true } },
        },
      });

      await tx.availabilitySlot.update({
        where: { id: updatedBooking.slotId },
        data: { status: SlotStatus.BOOKED, heldUntil: null },
      });

      return updatedBooking;
    });

    // إنشاء غرفة الفيديو بعد تأكيد الدفع فعليًا في قاعدة البيانات — لا مسار آخر ينشئها
    try {
      await this.videoService.createRoomForBooking(booking.id);
    } catch (err) {
      this.logger.error(`فشل إنشاء غرفة فيديو للحجز ${booking.id}`, err as Error);
      // لا نرجع الدفع للخلف؛ الحجز مؤكد بغض النظر، ويمكن إعادة محاولة إنشاء الغرفة لاحقًا
    }

    await this.notifications.notifyUser(booking.userId, NotificationType.PAYMENT_SUCCEEDED, {
      title: 'تم تأكيد الحجز',
      body: `تم الدفع بنجاح، موعدك مع د. ${booking.doctor.user.fullName} مؤكَّد الآن`,
      data: { bookingId: booking.id },
    });
    await this.notifications.notifyUser(booking.doctor.userId, NotificationType.NEW_BOOKING_FOR_DOCTOR, {
      title: 'حجز جديد',
      body: `لديك موعد جديد مؤكَّد مع ${booking.user.fullName}`,
      data: { bookingId: booking.id },
    });

    return booking;
  }

  private safeParse(rawBody: Buffer) {
    try {
      return JSON.parse(rawBody.toString('utf8'));
    } catch {
      return { raw: rawBody.toString('base64') };
    }
  }

  /** يُستدعى من BookingsService ضمن سياسة الإلغاء لدفعة مؤكَّدة فعليًا (status = PAID) */
  async refundForBooking(bookingId: string) {
    const payment = await this.prisma.payment.findUnique({ where: { bookingId } });
    if (!payment || payment.status !== PaymentStatus.PAID) {
      throw new BadRequestException('لا توجد دفعة مؤكَّدة لهذا الحجز يمكن استردادها');
    }

    const result = await this.provider.refund(payment.providerRefId, payment.amountCents);

    return this.prisma.payment.update({
      where: { id: payment.id },
      data: {
        status: PaymentStatus.REFUNDED,
        refundedAt: new Date(),
        refundRefId: result.refundRefId,
      },
    });
  }
}
