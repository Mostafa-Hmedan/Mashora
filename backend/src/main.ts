import { NestFactory } from '@nestjs/core';
import { ValidationPipe } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import helmet from 'helmet';
import * as express from 'express';
import { AppModule } from './app.module';

async function bootstrap() {
  const app = await NestFactory.create(AppModule);
  const config = app.get(ConfigService);

  app.use(helmet());
  app.enableCors({ origin: config.get<string>('FRONTEND_URL'), credentials: true });

  // مهم جدًا: مسار webhook الدفع يحتاج الـ body كـ Buffer خام لأجل إعادة حساب/مطابقة
  // التوقيع أو السر بدقة (أي تحويل مسبق للـ body قد يغيّر البايتات ويكسر التحقق)،
  // لذلك نستثنيه من express.json() العام ونطبّق عليه express.raw() فقط.
  app.use('/payments/webhook', express.raw({ type: '*/*' }));
  app.use(express.json());

  app.useGlobalPipes(
    new ValidationPipe({
      whitelist: true,
      forbidNonWhitelisted: true,
      transform: true,
    }),
  );

  const port = config.get<string>('PORT') ?? 3000;
  await app.listen(port);
  console.log(`🚀 Backend running on http://localhost:${port}`);
}
bootstrap();
