import { Controller, Headers, HttpCode, HttpStatus, Post, Query, Req } from '@nestjs/common';
import type { Request } from 'express';
import { PaymentsService } from './payments.service';
import { Public } from '../common/decorators/public.decorator';

@Controller('payments')
export class PaymentsController {
  constructor(private readonly paymentsService: PaymentsService) {}

  /**
   * نقطة استقبال الـ webhook من بوابة الدفع. يجب أن يصل الـ body كـ Buffer خام
   * (انظر main.ts: express.raw على هذا المسار تحديدًا) حتى يصح التحقق من التوقيع/السر.
   */
  @Public()
  @Post('webhook')
  @HttpCode(HttpStatus.OK)
  async webhook(
    @Req() req: Request,
    @Headers() headers: Record<string, string>,
    @Query() query: Record<string, string>,
  ) {
    const rawBody = req.body as Buffer;
    return this.paymentsService.handleVerifiedWebhook(rawBody, headers, query);
  }
}
