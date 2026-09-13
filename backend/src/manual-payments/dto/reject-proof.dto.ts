import { IsOptional, IsString } from 'class-validator';

export class RejectProofDto {
  @IsOptional()
  @IsString()
  reason?: string;
}
