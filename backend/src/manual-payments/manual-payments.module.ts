import { Module } from '@nestjs/common';
import { ManualPaymentsService } from './manual-payments.service';
import { ManualPaymentsController } from './manual-payments.controller';
import { CommonModule } from '../common/common.module';
import { PaymentsModule } from '../payments/payments.module';
import { NotificationsModule } from '../notifications/notifications.module';

@Module({
  imports: [CommonModule, PaymentsModule, NotificationsModule],
  providers: [ManualPaymentsService],
  controllers: [ManualPaymentsController],
  exports: [ManualPaymentsService],
})
export class ManualPaymentsModule {}
