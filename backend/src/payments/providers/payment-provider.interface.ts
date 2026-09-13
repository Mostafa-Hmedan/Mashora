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
   * يتحقق من صحة الـ webhook الوارد (HMAC في هيدر، أو secret token في الـ query، حسب البوابة).
   * يجب أن يرمي استثناء عند فشل التحقق — لا يُسمح أبدًا بمعاملة payload غير موثَّق كدفع ناجح.
   * @param query معطيات الرابط (query string) — بعض البوابات (Moyasar) تضع سر التحقق هنا
   */
  verifyWebhook(
    rawBody: Buffer,
    headers: Record<string, string>,
    query: Record<string, string>,
  ): VerifiedWebhookEvent;

  /** يسترد مبلغ دفعة مؤكَّدة (كليًا أو جزئيًا) لدى البوابة، ضمن سياسة الإلغاء */
  refund(providerRefId: string, amountCents: number): Promise<RefundResult>;
}
