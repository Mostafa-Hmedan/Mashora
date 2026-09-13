import { Controller, ForbiddenException, Get, Query, Res } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import type { Response } from 'express';
import { Public } from '../common/decorators/public.decorator';

/**
 * صفحة دفع محاكاة — تظهر فقط عندما PAYMENT_PROVIDER=MOCK (بيئة تطوير محلية).
 * تحاكي بصريًا صفحة بوابة دفع حقيقية، وعند الضغط على "دفع ناجح" ترسل نفس نوع
 * الطلب الذي ترسله بوابة حقيقية إلى /payments/webhook — يمر عبر التحقق نفسه.
 */
@Controller('payments')
export class MockCheckoutController {
  constructor(private readonly config: ConfigService) {}

  @Public()
  @Get('mock-checkout')
  page(@Query('ref') ref: string, @Query('amount') amount: string, @Query('currency') currency: string, @Res() res: Response) {
    if (this.config.get<string>('PAYMENT_PROVIDER') !== 'MOCK') {
      throw new ForbiddenException('صفحة الدفع المحاكاة غير مفعّلة');
    }

    const secretToken = this.config.get<string>('PAYMENT_WEBHOOK_SECRET') ?? 'mock-secret';
    const amountDisplay = (Number(amount) / 100).toFixed(2);

    res.setHeader('Content-Type', 'text/html; charset=utf-8');
    res.send(`<!doctype html>
<html lang="ar" dir="rtl">
<head><meta charset="utf-8"><title>محاكاة الدفع (تطوير فقط)</title></head>
<body style="font-family: sans-serif; max-width: 420px; margin: 60px auto; text-align: center;">
  <h2>⚠️ صفحة دفع محاكاة (Mock)</h2>
  <p>هذه ليست بوابة دفع حقيقية — للتطوير المحلي فقط.</p>
  <p><strong>المبلغ:</strong> ${amountDisplay} ${currency}</p>
  <p><strong>المرجع:</strong> ${ref}</p>
  <button id="pay" style="padding: 12px 24px; font-size: 16px; cursor: pointer;">✅ محاكاة دفع ناجح</button>
  <button id="fail" style="padding: 12px 24px; font-size: 16px; cursor: pointer; margin-inline-start: 8px;">❌ محاكاة دفع فاشل</button>
  <p id="result"></p>
  <script>
    async function send(status) {
      const res = await fetch('/payments/webhook?secret_token=${secretToken}', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ providerRefId: '${ref}', status }),
      });
      document.getElementById('result').textContent = res.ok
        ? 'تم الإرسال، ارجع للتطبيق للتحقق من حالة الحجز.'
        : 'فشل الإرسال: ' + res.status;
    }
    document.getElementById('pay').onclick = () => send('paid');
    document.getElementById('fail').onclick = () => send('failed');
  </script>
</body>
</html>`);
  }
}
