import { Type } from 'class-transformer';
import { IsArray, IsDateString, IsOptional, IsString, MinLength, ValidateNested } from 'class-validator';

export class MedicationDto {
  @IsString()
  @MinLength(1)
  name: string;

  @IsString()
  @MinLength(1)
  dosage: string;

  @IsString()
  @MinLength(1)
  duration: string;
}

export class CreateMedicalRecordDto {
  @IsString()
  @MinLength(3)
  diagnosis: string;

  @IsArray()
  @ValidateNested({ each: true })
  @Type(() => MedicationDto)
  medications: MedicationDto[];

  @IsOptional()
  @IsString()
  followUpNotes?: string;

  @IsOptional()
  @IsDateString()
  followUpDate?: string;
}
