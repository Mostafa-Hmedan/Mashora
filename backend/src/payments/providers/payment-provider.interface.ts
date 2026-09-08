/**
 * واجهة موحّدة لأي بوابة دفع (PayTabs / HyperPay / Moyasar / Tap).
 * الهدف: تبديل البوابة لاحقًا بدون لمس منطق الحجوزات.
 */
export interface CreateCheckoutParams {
  bookingId: string;
  amountCents: number;
  currency: string;
  customerEmail: string;
  description: string;
}

export interface CreateCheckoutResult {
  providerRefId: string; // معرّف العملية لدى البوابة
  checkoutUrl: string; // الرابط الذي يُحوَّل إليه المستخدم للدفع
}

export interface VerifiedWebhookEvent {
  providerRefId: string;
  isPaid: boolean;
  rawPayload: unknown;
}

export interface RefundResult {
  refundRefId: string;
}

export interface PaymentProviderAdapter {
  createCheckout(params: CreateCheckoutParams): Promise<CreateCheckoutResult>;

  /**
   * يتحقق من توقيع الـ webhook الوارد (HMAC أو ما يعادله حسب البوابة).
   * يجب أن يرمي استثناء أو يرجع نتيجة غير صالحة عند فشل التحقق —
   * لا يُسمح أبدًا بمعاملة payload غير موقّع كدفع ناجح.
   */
  verifyWebhook(rawBody: Buffer, headers: Record<string, string>): VerifiedWebhookEvent;

  /** يسترد مبلغ دفعة مؤكَّدة (كليًا أو جزئيًا) لدى البوابة، ضمن سياسة الإلغاء */
  refund(providerRefId: string, amountCents: number): Promise<RefundResult>;
}
