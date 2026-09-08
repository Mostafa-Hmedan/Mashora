import { Injectable, UnauthorizedException } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { createHmac, timingSafeEqual } from 'crypto';
import { randomUUID } from 'crypto';
import type {
  CreateCheckoutParams,
  CreateCheckoutResult,
  PaymentProviderAdapter,
  RefundResult,
  VerifiedWebhookEvent,
} from './payment-provider.interface';

/**
 * مثال تطبيق لبوابة Moyasar (نمط مشابه لبقية البوابات العربية).
 * ملاحظة: استدعاء الـ API الفعلي لإنشاء الفاتورة محذوف قصدًا هنا (TODO) —
 * الجزء الحرج أمنيًا هو verifyWebhook وهو مكتمل ومطبَّق بشكل صارم.
 */
@Injectable()
export class MoyasarProvider implements PaymentProviderAdapter {
  constructor(private readonly config: ConfigService) {}

  async createCheckout(params: CreateCheckoutParams): Promise<CreateCheckoutResult> {
    // TODO: استبدل هذا باستدعاء حقيقي لـ Moyasar Invoice API باستخدام PAYMENT_API_KEY.
    // يجب أن يمرَّر callback_url = PAYMENT_CALLBACK_BASE_URL حتى تصل نتيجة الدفع كـ webhook موقّع.
    const providerRefId = `moyasar_${randomUUID()}`;
    const checkoutUrl = `https://api.moyasar.com/v1/invoices/${providerRefId}`;
    return { providerRefId, checkoutUrl };
  }

  verifyWebhook(rawBody: Buffer, headers: Record<string, string>): VerifiedWebhookEvent {
    const secret = this.config.get<string>('PAYMENT_WEBHOOK_SECRET')!;
    const signatureHeader = headers['x-moyasar-signature'] ?? headers['x-webhook-signature'];

    if (!signatureHeader) {
      throw new UnauthorizedException('توقيع الـ webhook مفقود');
    }

    const expected = createHmac('sha256', secret).update(rawBody).digest('hex');
    const providedBuf = Buffer.from(signatureHeader);
    const expectedBuf = Buffer.from(expected);

    // مقارنة بزمن ثابت لمنع timing attacks، وتفادي رمي استثناء عند اختلاف الطول
    const isValid =
      providedBuf.length === expectedBuf.length && timingSafeEqual(providedBuf, expectedBuf);

    if (!isValid) {
      throw new UnauthorizedException('توقيع الـ webhook غير صالح');
    }

    const payload = JSON.parse(rawBody.toString('utf8'));
    return {
      providerRefId: payload.id ?? payload.invoice_id,
      isPaid: payload.status === 'paid',
      rawPayload: payload,
    };
  }

  async refund(providerRefId: string, amountCents: number): Promise<RefundResult> {
    // TODO: استبدل هذا باستدعاء حقيقي لـ Moyasar Refund API:
    // POST https://api.moyasar.com/v1/payments/{id}/refund باستخدام PAYMENT_API_KEY
    void amountCents;
    return { refundRefId: `refund_${randomUUID()}_for_${providerRefId}` };
  }
}
