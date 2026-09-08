import { Injectable, Logger } from '@nestjs/common';
import { Cron, CronExpression } from '@nestjs/schedule';
import { PrismaService } from '../prisma/prisma.service';
import { NotificationsService } from '../notifications/notifications.service';
import { BookingStatus, NotificationType } from '@prisma/client';

/** نافذة التذكير: نُنبّه المريض والطبيب قبل 30 دقيقة من بداية الموعد */
const REMINDER_LEAD_MINUTES = 30;

/**
 * يرسل تذكيرًا بالموعد قبل بدايته بمدة ثابتة، مرة واحدة فقط لكل حجز (reminderSentAt).
 * يعمل فقط على الحجوزات المؤكَّدة فعليًا (CONFIRMED) — لا تذكير لحجز لم يُدفع بعد.
 */
@Injectable()
export class AppointmentRemindersTask {
  private readonly logger = new Logger(AppointmentRemindersTask.name);

  constructor(
    private readonly prisma: PrismaService,
    private readonly notifications: NotificationsService,
  ) {}

  @Cron(CronExpression.EVERY_5_MINUTES)
  async sendUpcomingReminders() {
    const now = new Date();
    const windowEnd = new Date(now.getTime() + REMINDER_LEAD_MINUTES * 60 * 1000);

    const dueBookings = await this.prisma.booking.findMany({
      where: {
        status: BookingStatus.CONFIRMED,
        reminderSentAt: null,
        slot: { startsAt: { gte: now, lte: windowEnd } },
      },
      include: { slot: true, user: true, doctor: { include: { user: true } } },
    });

    for (const booking of dueBookings) {
      const timeLabel = booking.slot.startsAt.toISOString().slice(11, 16);

      await this.notifications.notifyUser(booking.userId, NotificationType.APPOINTMENT_REMINDER, {
        title: 'تذكير بموعدك',
        body: `موعدك مع د. ${booking.doctor.user.fullName} الساعة ${timeLabel}`,
        data: { bookingId: booking.id },
      });
      await this.notifications.notifyUser(booking.doctor.userId, NotificationType.APPOINTMENT_REMINDER, {
        title: 'تذكير بموعد',
        body: `لديك موعد مع ${booking.user.fullName} الساعة ${timeLabel}`,
        data: { bookingId: booking.id },
      });

      await this.prisma.booking.update({
        where: { id: booking.id },
        data: { reminderSentAt: new Date() },
      });
    }

    if (dueBookings.length > 0) {
      this.logger.log(`تم إرسال ${dueBookings.length} تذكير/تذكيرات بمواعيد قادمة`);
    }
  }
}
