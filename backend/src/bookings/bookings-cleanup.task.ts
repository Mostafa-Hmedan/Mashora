import { Injectable, Logger } from '@nestjs/common';
import { Cron, CronExpression } from '@nestjs/schedule';
import { BookingsService } from './bookings.service';

/**
 * يحرر دوريًا فترات التوفر (slots) التي بقيت HELD لحجز لم تكمل الدفع خلال المهلة،
 * حتى لا تُحجب فترة توفر إلى الأبد بسبب مستخدم بدأ الدفع ولم يكمله.
 */
@Injectable()
export class BookingsCleanupTask {
  private readonly logger = new Logger(BookingsCleanupTask.name);

  constructor(private readonly bookingsService: BookingsService) {}

  @Cron(CronExpression.EVERY_MINUTE)
  async handleExpiredHolds() {
    const result = await this.bookingsService.releaseExpiredHolds();
    if (result.released > 0) {
      this.logger.log(`تم تحرير ${result.released} فترة/فترات منتهية المهلة`);
    }
  }
}
