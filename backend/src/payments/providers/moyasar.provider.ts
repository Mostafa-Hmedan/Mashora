import { BadGatewayException, Injectable, Logger, UnauthorizedException } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { timingSafeEqual } from 'crypto';
import { randomUUID } from 'crypto';
import axios from 'axios';
import type {
  CreateCheckoutParams,
  CreateCheckoutResult,
  PaymentProviderAdapter,
  RefundResult,
  VerifiedWebhookEvent,
} from './payment-provider.interface';

/**
 * تطبيق بوابة Moyasar عبر Invoice API الرسمي (https://docs.moyasar.com/invoices).
 * المصادقة: HTTP Basic Auth حيث الـ Secret Key هو اسم المستخدم وكلمة المرور فارغة.
 */
@Injectable()
export class MoyasarProvider implements PaymentProviderAdapter {
  private readonly logger = new Logger(MoyasarProvider.name);
  private readonly apiBase = 'https://api.moyasar.com/v1';

  constructor(private readonly config: ConfigService) {}

  private authConfig() {
    const secretKey = this.config.get<string>('PAYMENT_API_KEY')!;
    return { auth: { username: secretKey, password: '' } };
  }

  async createCheckout(params: CreateCheckoutParams): Promise<CreateCheckoutResult> {
    const callbackUrl = this.config.get<string>('PAYMENT_CALLBACK_BASE_URL')!;

    try {
      const response = await axios.post(
        `${this.apiBase}/invoices`,
        {
          amount: params.amountCents,
          currency: params.currency,
          description: params.description,
          callback_url: callbackUrl,
          metadata: { bookingId: params.bookingId },
        },
        this.authConfig(),
      );

      return {
        providerRefId: response.data.id,
        checkoutUrl: response.data.url,
      };
    } catch (err) {
      this.logger.error('فشل إنشاء فاتورة Moyasar', err as Error);
      throw new BadGatewayException('تعذّر إنشاء عملية الدفع لدى البوابة، حاول لاحقًا');
    }
  }

  /**
   * Moyasar يوثّق طلبات الـ webhook بوضع سر مشترك (secret_token) في رابط الـ webhook نفسه
   * كـ query parameter — تحدّده أنت عند إنشاء الـ webhook من لوحة التحكم، وترسله Moyasar
   * كما هو في كل استدعاء لاحق. نتحقق منه بمقارنة زمن ثابت (لا يوجد HMAC منفصل هنا).
   * راجع: https://docs.moyasar.com/webhooks
   */
  verifyWebhook(
    rawBody: Buffer,
    headers: Record<string, string>,
    query: Record<string, string>,
  ): VerifiedWebhookEvent {
    void headers;
    const expectedSecret = this.config.get<string>('PAYMENT_WEBHOOK_SECRET')!;
    const providedSecret = query['secret_token'] ?? '';

    if (!providedSecret) {
      throw new UnauthorizedException('secret_token مفقود في رابط الـ webhook');
    }

    const providedBuf = Buffer.from(providedSecret);
    const expectedBuf = Buffer.from(expectedSecret);

    // مقارنة بزمن ثابت لمنع timing attacks، وتفادي رمي استثناء عند اختلاف الطول
    const isValid =
      providedBuf.length === expectedBuf.length && timingSafeEqual(providedBuf, expectedBuf);

    if (!isValid) {
      throw new UnauthorizedException('secret_token غير صالح');
    }

    const payload = JSON.parse(rawBody.toString('utf8'));
    // Moyasar يرسل كائن الـ invoice نفسه كـ payload، بحالة الفاتورة (paid/failed/..)
    const invoice = payload.data ?? payload;
    return {
      providerRefId: invoice.id,
      isPaid: invoice.status === 'paid',
      rawPayload: payload,
    };
  }

  /**
   * providerRefId هنا هو invoice id (المخزَّن في Payment.providerRefId). Moyasar الاسترداد
   * يتم على مستوى الـ payment الفعلي، لذا نجلب الفاتورة أولاً لنستخرج آخر payment ناجح عليها.
   */
  async refund(providerRefId: string, amountCents: number): Promise<RefundResult> {
    try {
      const invoiceRes = await axios.get(`${this.apiBase}/invoices/${providerRefId}`, this.authConfig());
      const payments: Array<{ id: string; status: string }> = invoiceRes.data.payments ?? [];
      const paidPayment = payments.find((p) => p.status === 'paid');
      if (!paidPayment) {
        throw new BadGatewayException('لا توجد دفعة ناجحة على هذه الفاتورة لاستردادها');
      }

      const refundRes = await axios.post(
        `${this.apiBase}/payments/${paidPayment.id}/refund`,
        { amount: amountCents },
        this.authConfig(),
      );

      return { refundRefId: refundRes.data.id ?? `refund_${randomUUID()}` };
    } catch (err) {
      if (err instanceof BadGatewayException) throw err;
      this.logger.error(`فشل استرداد الدفعة لدى Moyasar (invoice ${providerRefId})`, err as Error);
      throw new BadGatewayException('تعذّر تنفيذ الاسترداد لدى البوابة، حاول لاحقًا');
    }
  }
}
