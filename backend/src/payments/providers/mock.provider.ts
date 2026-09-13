import { Injectable, UnauthorizedException } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { randomUUID } from 'crypto';
import type {
  CreateCheckoutParams,
  CreateCheckoutResult,
  PaymentProviderAdapter,
  RefundResult,
  VerifiedWebhookEvent,
} from './payment-provider.interface';

/**
 * مزوّد دفع محاكى للتطوير المحلي — لا يتصل بأي خدمة خارجية.
 * يُستخدم مؤقتًا لحين توفّر حساب تاجر حقيقي لدى بوابة دفع (بوابات PayTabs/Moyasar/HyperPay
 * الحالية جميعها ترفض التسجيل من سوريا بسبب العقوبات، بغض النظر عن رقم الهاتف).
 *
 * التدفق: createCheckout يرجّع رابطًا لصفحة تأكيد داخلية (MockPaymentController) بدل تحويل
 * خارجي فعلي. عند الضغط على "دفع ناجح" في تلك الصفحة، تُرسل استدعاء إلى نفس
 * /payments/webhook بتوقيع صالح — فيمر الطلب عبر PaymentsService.handleVerifiedWebhook
 * بنفس المسار تمامًا الذي ستأخذه بوابة حقيقية، دون تجاوز أي تحقق أمني حقيقي في الكود.
 *
 * ⚠️ لا تُفعَّل هذه البوابة أبدًا في بيئة إنتاج (PAYMENT_PROVIDER=MOCK يجب أن يبقى حصرًا
 * لـ NODE_ENV=development)؛ الحارس الفعلي لهذا القيد موجود في payments.module.ts.
 */
@Injectable()
export class MockPaymentProvider implements PaymentProviderAdapter {
  constructor(private readonly config: ConfigService) {}

  async createCheckout(params: CreateCheckoutParams): Promise<CreateCheckoutResult> {
    const providerRefId = `mock_${randomUUID()}`;
    const appBaseUrl = `http://localhost:${this.config.get<string>('PORT') ?? '3000'}`;
    return {
      providerRefId,
      checkoutUrl: `${appBaseUrl}/payments/mock-checkout?ref=${providerRefId}&amount=${params.amountCents}&currency=${params.currency}`,
    };
  }

  verifyWebhook(
    rawBody: Buffer,
    headers: Record<string, string>,
    query: Record<string, string>,
  ): VerifiedWebhookEvent {
    void headers;
    const expectedSecret = this.config.get<string>('PAYMENT_WEBHOOK_SECRET') ?? 'mock-secret';
    if (query['secret_token'] !== expectedSecret) {
      throw new UnauthorizedException('secret_token غير صالح (mock)');
    }

    const payload = JSON.parse(rawBody.toString('utf8'));
    return {
      providerRefId: payload.providerRefId,
      isPaid: payload.status === 'paid',
      rawPayload: payload,
    };
  }

  async refund(providerRefId: string, amountCents: number): Promise<RefundResult> {
    void amountCents;
    return { refundRefId: `mock_refund_${randomUUID()}_for_${providerRefId}` };
  }
}
