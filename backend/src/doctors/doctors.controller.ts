import {
  BadRequestException,
  Body,
  Controller,
  Get,
  NotFoundException,
  Param,
  Patch,
  Post,
  Query,
  Res,
  UploadedFile,
  UseInterceptors,
} from '@nestjs/common';
import { FileInterceptor } from '@nestjs/platform-express';
import type { Response } from 'express';
import { existsSync } from 'fs';
import { DoctorsService } from './doctors.service';
import { ImageUploadService } from '../common/services/image-upload.service';
import { Public } from '../common/decorators/public.decorator';
import { Roles } from '../common/decorators/roles.decorator';
import { Role } from '../common/enums/role.enum';
import { CurrentUser } from '../common/decorators/current-user.decorator';
import type { AuthenticatedUser } from '../common/decorators/current-user.decorator';
import { UpdateDoctorProfileDto } from './dto/update-doctor-profile.dto';

@Controller('doctors')
export class DoctorsController {
  constructor(
    private readonly doctorsService: DoctorsService,
    private readonly imageUpload: ImageUploadService,
  ) {}

  @Public()
  @Get()
  list(@Query('specialty') specialty?: string) {
    return this.doctorsService.listApproved(specialty);
  }

  @Roles(Role.DOCTOR)
  @Get('me')
  getMyProfile(@CurrentUser() user: AuthenticatedUser) {
    return this.doctorsService.getOwnProfile(user.userId);
  }

  @Roles(Role.DOCTOR)
  @Patch('me')
  updateMyProfile(@CurrentUser() user: AuthenticatedUser, @Body() dto: UpdateDoctorProfileDto) {
    return this.doctorsService.updateOwnProfile(user.userId, dto);
  }

  @Public()
  @Get(':id')
  getOne(@Param('id') id: string) {
    return this.doctorsService.getApprovedById(id);
  }

  @Roles(Role.DOCTOR)
  @Post('me/shamcash-qr')
  @UseInterceptors(FileInterceptor('file'))
  uploadShamCashQr(@CurrentUser() user: AuthenticatedUser, @UploadedFile() file?: Express.Multer.File) {
    if (!file) throw new BadRequestException('لم يتم إرفاق ملف الصورة');
    return this.doctorsService.uploadShamCashQr(user.userId, file);
  }

  /**
   * صورة QR عامة (Public) — أي شخص يفكر بالحجز مع هذا الطبيب يحتاج يراها ليقرر الدفع اليدوي،
   * ولا تحمل أي بيانات حساسة (مجرد رمز استلام دفع، وليس بيانات حساب مصرفي كاملة).
   */
  @Public()
  @Get(':id/shamcash-qr')
  async getShamCashQr(@Param('id') id: string, @Res() res: Response) {
    const doctor = await this.doctorsService.getApprovedById(id);
    if (!doctor.shamCashQrImagePath) {
      throw new NotFoundException('لم يرفع هذا الطبيب صورة QR بعد');
    }
    const absolutePath = this.imageUpload.resolveAbsolutePath(doctor.shamCashQrImagePath);
    if (!existsSync(absolutePath)) throw new NotFoundException('الملف غير موجود على الخادم');
    res.sendFile(absolutePath);
  }
}
