import { Body, Controller, Get, NotFoundException, Param, Post, Res } from '@nestjs/common';
import type { Response } from 'express';
import { MedicalRecordsService } from './medical-records.service';
import { PdfGeneratorService } from './pdf-generator.service';
import { CreateMedicalRecordDto } from './dto/create-medical-record.dto';
import { CurrentUser } from '../common/decorators/current-user.decorator';
import type { AuthenticatedUser } from '../common/decorators/current-user.decorator';
import { Roles } from '../common/decorators/roles.decorator';
import { Role } from '../common/enums/role.enum';
import { existsSync } from 'fs';

@Controller()
export class MedicalRecordsController {
  constructor(
    private readonly medicalRecordsService: MedicalRecordsService,
    private readonly pdfGenerator: PdfGeneratorService,
  ) {}

  @Roles(Role.DOCTOR)
  @Post('bookings/:bookingId/medical-record')
  create(
    @CurrentUser() user: AuthenticatedUser,
    @Param('bookingId') bookingId: string,
    @Body() dto: CreateMedicalRecordDto,
  ) {
    return this.medicalRecordsService.createForBooking(user.userId, bookingId, dto);
  }

  @Get('bookings/:bookingId/medical-record')
  getOne(@CurrentUser() user: AuthenticatedUser, @Param('bookingId') bookingId: string) {
    return this.medicalRecordsService.getForBookingAsUser(user.userId, bookingId);
  }

  @Get('medical-records/me')
  listMine(@CurrentUser() user: AuthenticatedUser) {
    return this.medicalRecordsService.listMine(user.userId);
  }

  @Get('bookings/:bookingId/medical-record/pdf')
  async downloadPdf(
    @CurrentUser() user: AuthenticatedUser,
    @Param('bookingId') bookingId: string,
    @Res() res: Response,
  ) {
    const record = await this.medicalRecordsService.getForBookingAsUser(user.userId, bookingId);
    if (!record.pdfPath) throw new NotFoundException('ملف PDF غير متوفر بعد لهذا التقرير');

    const absolutePath = this.pdfGenerator.resolveAbsolutePath(record.pdfPath);
    if (!existsSync(absolutePath)) throw new NotFoundException('الملف غير موجود على الخادم');

    res.download(absolutePath, `medical-record-${bookingId}.pdf`);
  }
}
