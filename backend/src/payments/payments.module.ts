import { Module } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { PaymentsService } from './payments.service';
import { PaymentsController } from './payments.controller';
import { PAYMENT_PROVIDER_ADAPTER } from './payments.constants';
import { MoyasarProvider } from './providers/moyasar.provider';
import { PayTabsProvider } from './providers/paytabs.provider';
import { VideoModule } from '../video/video.module';
import { NotificationsModule } from '../notifications/notifications.module';

@Module({
  imports: [VideoModule, NotificationsModule],
  controllers: [PaymentsController],
  providers: [
    PaymentsService,
    MoyasarProvider,
    PayTabsProvider,
    {
      // نقطة تبديل واحدة: أضف provider جديد (HyperPayProvider..) واختره هنا حسب env
      // بدون أي تغيير في PaymentsService أو باقي النظام
      provide: PAYMENT_PROVIDER_ADAPTER,
      useFactory: (moyasar: MoyasarProvider, paytabs: PayTabsProvider, config: ConfigService) => {
        const providerName = config.get<string>('PAYMENT_PROVIDER');
        switch (providerName) {
          case 'PAYTABS':
            return paytabs;
          case 'MOYASAR':
          default:
            return moyasar;
        }
      },
      inject: [MoyasarProvider, PayTabsProvider, ConfigService],
    },
  ],
  exports: [PaymentsService],
})
export class PaymentsModule {}
