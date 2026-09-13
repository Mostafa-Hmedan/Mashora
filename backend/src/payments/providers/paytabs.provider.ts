import { BadGatewayException, Injectable, Logger, UnauthorizedException } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { createHmac, timingSafeEqual } from 'crypto';
import axios from 'axios';
import type {
  CreateCheckoutParams,
  CreateCheckoutResult,
  PaymentProviderAdapter,
  RefundResult,
  VerifiedWebhookEvent,
} from './payment-provider.interface';

/**
 * تطبيق بوابة PayTabs عبر PT2 API (https://site.paytabs.com/en/pt2-api/).
 * لا يشترط رقم جوال سعودي للتسجيل — متاح لعدة دول عربية (مصر، الإمارات، الأردن، السعودية..).
 * المصادقة: هيدر Authorization = Server Key (بدون Bearer). المنطقة (region) تحدَّد
 * عبر PAYTABS_REGION لأن نطاق الـ API يختلف حسب حساب التاجر (SAU/ARE/EGY/JOR/OMN/GLOBAL).
 */
@Injectable()
export class PayTabsProvider implements PaymentProviderAdapter {
  private readonly logger = new Logger(PayTabsProvider.name);

  constructor(private readonly config: ConfigService) {}

  private get apiBase() {
    const region = this.config.get<string>('PAYTABS_REGION') ?? 'GLOBAL';
    return `https://secure-${region.toLowerCase()}.paytabs.com`;
  }

  private authHeaders() {
    return { headers: { Authorization: this.config.get<string>('PAYTABS_SERVER_KEY')! } };
  }

  async createCheckout(params: CreateCheckoutParams): Promise<CreateCheckoutResult> {
    const profileId = this.config.get<string>('PAYTABS_PROFILE_ID');
    const callbackUrl = this.config.get<string>('PAYMENT_CALLBACK_BASE_URL')!;

    try {
      const response = await axios.post(
        `${this.apiBase}/payment/request`,
        {
          profile_id: profileId,
          tran_type: 'sale',
          tran_class: 'ecom',
          cart_id: params.bookingId,
          cart_description: params.description,
          cart_currency: params.currency,
          cart_amount: params.amountCents / 100, // PayTabs يتوقع المبلغ بوحدة العملة الكاملة، لا سنتات
          customer_details: { email: params.customerEmail },
          callback: callbackUrl,
          return: callbackUrl,
        },
        this.authHeaders(),
      );

      return {
        providerRefId: response.data.tran_ref,
        checkoutUrl: response.data.redirect_url,
      };
    } catch (err) {
      this.logger.error('فشل إنشاء عملية دفع PayTabs', err as Error);
      throw new BadGatewayException('تعذّر إنشاء عملية الدفع لدى البوابة، حاول لاحقًا');
    }
  }

  /**
   * PayTabs يرسل هيدر "signature" = HMAC-SHA256(body, Server Key) بصيغة hex.
   * راجع: https://site.paytabs.com/en/pt2-api/callback/
   */
  verifyWebhook(
    rawBody: Buffer,
    headers: Record<string, string>,
    query: Record<string, string>,
  ): VerifiedWebhookEvent {
    void query;
    const serverKey = this.config.get<string>('PAYTABS_SERVER_KEY')!;
    const signatureHeader = headers['signature'];

    if (!signatureHeader) {
      throw new UnauthorizedException('توقيع الـ webhook مفقود');
    }

    const expected = createHmac('sha256', serverKey).update(rawBody).digest('hex');
    const providedBuf = Buffer.from(signatureHeader);
    const expectedBuf = Buffer.from(expected);

    const isValid =
      providedBuf.length === expectedBuf.length && timingSafeEqual(providedBuf, expectedBuf);

    if (!isValid) {
      throw new UnauthorizedException('توقيع الـ webhook غير صالح');
    }

    const payload = JSON.parse(rawBody.toString('utf8'));
    // PayTabs: payment_result.response_status === 'A' يعني موافَق عليها (Approved)
    return {
      providerRefId: payload.tran_ref,
      isPaid: payload.payment_result?.response_status === 'A',
      rawPayload: payload,
    };
  }

  async refund(providerRefId: string, amountCents: number): Promise<RefundResult> {
    const profileId = this.config.get<string>('PAYTABS_PROFILE_ID');

    try {
      const response = await axios.post(
        `${this.apiBase}/payment/request`,
        {
          profile_id: profileId,
          tran_type: 'refund',
          tran_class: 'ecom',
          tran_ref: providerRefId,
          cart_amount: amountCents / 100,
        },
        this.authHeaders(),
      );

      return { refundRefId: response.data.tran_ref };
    } catch (err) {
      this.logger.error(`فشل استرداد الدفعة لدى PayTabs (tran_ref ${providerRefId})`, err as Error);
      throw new BadGatewayException('تعذّر تنفيذ الاسترداد لدى البوابة، حاول لاحقًا');
    }
  }
}
