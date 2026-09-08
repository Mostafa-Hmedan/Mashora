import { IsOptional, IsString } from 'class-validator';

export class RejectDoctorDto {
  @IsOptional()
  @IsString()
  reason?: string;
}
