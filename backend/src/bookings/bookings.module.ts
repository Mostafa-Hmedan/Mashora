import { Module } from '@nestjs/common';
import { BookingsService } from './bookings.service';
import { BookingsController } from './bookings.controller';
import { BookingsCleanupTask } from './bookings-cleanup.task';
import { AppointmentRemindersTask } from './appointment-reminders.task';
import { PaymentsModule } from '../payments/payments.module';
import { NotificationsModule } from '../notifications/notifications.module';

@Module({
  imports: [PaymentsModule, NotificationsModule],
  providers: [BookingsService, BookingsCleanupTask, AppointmentRemindersTask],
  controllers: [BookingsController],
  exports: [BookingsService],
})
export class BookingsModule {}
