import { IsInt, IsOptional, IsString, Min } from 'class-validator';

export class UpdateDoctorProfileDto {
  @IsOptional()
  @IsString()
  specialty?: string;

  @IsOptional()
  @IsString()
  bio?: string;

  @IsOptional()
  @IsInt()
  @Min(0)
  consultFeeCents?: number;

  /** رقم الحساب على تطبيق شام كاش لاستلام تحويلات المرضى يدويًا */
  @IsOptional()
  @IsString()
  shamCashAccountNumber?: string;
}
