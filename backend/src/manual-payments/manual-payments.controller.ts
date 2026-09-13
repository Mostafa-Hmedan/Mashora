import { Inject, BadRequestException,
  Body,
  Controller,
  ForbiddenException,
  Get,
  NotFoundException,
  Param,
  Patch,
  Post,
  Res,
  UploadedFile,
  UseInterceptors, } from '@nestjs/common';
import { FileInterceptor } from '@nestjs/platform-express';
import type { Response } from 'express';
import { existsSync } from 'fs';
import { ManualPaymentsService } from './manual-payments.service';
import type { PrismaService } from '../prisma/prisma.service';
import { PRISMA_SERVICE } from '../prisma/prisma.constants';
import { ImageUploadService } from '../common/services/image-upload.service';
import { RejectProofDto } from './dto/reject-proof.dto';
import { CurrentUser } from '../common/decorators/current-user.decorator';
import type { AuthenticatedUser } from '../common/decorators/current-user.decorator';
import { Roles } from '../common/decorators/roles.decorator';
import { Role } from '../common/enums/role.enum';

@Controller()
export class ManualPaymentsController {
  constructor(
    private readonly manualPaymentsService: ManualPaymentsService,
    @Inject(PRISMA_SERVICE) private readonly prisma: PrismaService,
    private readonly imageUpload: ImageUploadService,
  ) {}

  @Post('bookings/:bookingId/manual-payment-proof')
  @UseInterceptors(FileInterceptor('file'))
  submitProof(
    @CurrentUser() user: AuthenticatedUser,
    @Param('bookingId') bookingId: string,
    @UploadedFile() file?: Express.Multer.File,
  ) {
    if (!file) throw new BadRequestException('لم يتم إرفاق صورة الإثبات');
    return this.manualPaymentsService.submitProof(user.userId, bookingId, file);
  }

  /** المريض أو الطبيب صاحب الحجز فقط يقدر يشوف صورة الإثبات، بالإضافة للأدمن */
  @Get('bookings/:bookingId/manual-payment-proof')
  async viewProof(
    @CurrentUser() user: AuthenticatedUser,
    @Param('bookingId') bookingId: string,
    @Res() res: Response,
  ) {
    const booking = await this.prisma.booking.findUnique({
      where: { id: bookingId },
      include: { doctor: true, manualPaymentProof: true },
    });
    if (!booking) throw new NotFoundException('الحجز غير موجود');

    const isOwner = booking.userId === user.userId;
    const isDoctor = booking.doctor.userId === user.userId;
    const isAdmin = user.role === Role.ADMIN;
    if (!isOwner && !isDoctor && !isAdmin) {
      throw new ForbiddenException('لا يمكنك الوصول إلى هذا الإثبات');
    }
    if (!booking.manualPaymentProof) throw new NotFoundException('لا يوجد إثبات دفع مرفوع بعد');

    const absolutePath = this.imageUpload.resolveAbsolutePath(booking.manualPaymentProof.proofImagePath);
    if (!existsSync(absolutePath)) throw new NotFoundException('الملف غير موجود على الخادم');
    res.sendFile(absolutePath);
  }

  @Roles(Role.ADMIN)
  @Get('admin/manual-payments/pending')
  listPending() {
    return this.manualPaymentsService.listPending();
  }

  @Roles(Role.ADMIN)
  @Patch('admin/manual-payments/:bookingId/approve')
  approve(@CurrentUser() admin: AuthenticatedUser, @Param('bookingId') bookingId: string) {
    return this.manualPaymentsService.approve(admin.userId, bookingId);
  }

  @Roles(Role.ADMIN)
  @Patch('admin/manual-payments/:bookingId/reject')
  reject(
    @CurrentUser() admin: AuthenticatedUser,
    @Param('bookingId') bookingId: string,
    @Body() dto: RejectProofDto,
  ) {
    return this.manualPaymentsService.reject(admin.userId, bookingId, dto.reason);
  }
}
