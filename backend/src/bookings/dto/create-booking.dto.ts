import { IsEnum, IsOptional, IsString, IsUUID } from 'class-validator';
import { PaymentMethod } from '@prisma/client';

export class CreateBookingDto {
  @IsUUID()
  slotId: string;

  @IsOptional()
  @IsString()
  notes?: string;

  /** GATEWAY (افتراضي): بوابة إلكترونية. MANUAL_SHAMCASH: تحويل يدوي يراجعه الأدمن */
  @IsOptional()
  @IsEnum(PaymentMethod)
  paymentMethod?: PaymentMethod;
}
