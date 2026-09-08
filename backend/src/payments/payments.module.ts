import { Module } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { PaymentsService } from './payments.service';
import { PaymentsController } from './payments.controller';
import { PAYMENT_PROVIDER_ADAPTER } from './payments.constants';
import { MoyasarProvider } from './providers/moyasar.provider';
import { VideoModule } from '../video/video.module';
import { NotificationsModule } from '../notifications/notifications.module';

@Module({
  imports: [VideoModule, NotificationsModule],
  controllers: [PaymentsController],
  providers: [
    PaymentsService,
    MoyasarProvider,
    {
      // نقطة تبديل واحدة: أضف provider جديد (PayTabsProvider..) واختره هنا حسب env
      // بدون أي تغيير في PaymentsService أو باقي النظام
      provide: PAYMENT_PROVIDER_ADAPTER,
      useFactory: (moyasar: MoyasarProvider, config: ConfigService) => {
        const providerName = config.get<string>('PAYMENT_PROVIDER');
        switch (providerName) {
          case 'MOYASAR':
          default:
            return moyasar;
        }
      },
      inject: [MoyasarProvider, ConfigService],
    },
  ],
  exports: [PaymentsService],
})
export class PaymentsModule {}
