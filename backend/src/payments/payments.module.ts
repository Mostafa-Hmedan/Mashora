import { Module } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { PaymentsService } from './payments.service';
import { PaymentsController } from './payments.controller';
import { MockCheckoutController } from './mock-checkout.controller';
import { PAYMENT_PROVIDER_ADAPTER } from './payments.constants';
import { MoyasarProvider } from './providers/moyasar.provider';
import { PayTabsProvider } from './providers/paytabs.provider';
import { MockPaymentProvider } from './providers/mock.provider';
import { VideoModule } from '../video/video.module';
import { NotificationsModule } from '../notifications/notifications.module';

@Module({
  imports: [VideoModule, NotificationsModule],
  controllers: [PaymentsController, MockCheckoutController],
  providers: [
    PaymentsService,
    MoyasarProvider,
    PayTabsProvider,
    MockPaymentProvider,
    {
      // نقطة تبديل واحدة: أضف provider جديد (HyperPayProvider..) واختره هنا حسب env
      // بدون أي تغيير في PaymentsService أو باقي النظام
      provide: PAYMENT_PROVIDER_ADAPTER,
      useFactory: (
        moyasar: MoyasarProvider,
        paytabs: PayTabsProvider,
        mock: MockPaymentProvider,
        config: ConfigService,
      ) => {
        const providerName = config.get<string>('PAYMENT_PROVIDER');

        // حاجز صارم: بوابة المحاكاة ممنوعة تمامًا خارج بيئة التطوير، مهما كان env مضبوطًا
        if (providerName === 'MOCK' && config.get<string>('NODE_ENV') === 'production') {
          throw new Error(
            'PAYMENT_PROVIDER=MOCK ممنوع في بيئة الإنتاج (NODE_ENV=production) — اضبط بوابة دفع حقيقية',
          );
        }

        switch (providerName) {
          case 'MOCK':
            return mock;
          case 'PAYTABS':
            return paytabs;
          case 'MOYASAR':
          default:
            return moyasar;
        }
      },
      inject: [MoyasarProvider, PayTabsProvider, MockPaymentProvider, ConfigService],
    },
  ],
  exports: [PaymentsService],
})
export class PaymentsModule {}
