import { IsEnum, IsString, MinLength } from 'class-validator';
import { DevicePlatform } from '@prisma/client';

export class RegisterDeviceDto {
  @IsString()
  @MinLength(10)
  token: string;

  @IsEnum(DevicePlatform)
  platform: DevicePlatform;
}
