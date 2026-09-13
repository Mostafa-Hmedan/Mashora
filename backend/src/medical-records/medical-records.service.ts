import { Inject, BadRequestException,
  ConflictException,
  ForbiddenException,
  Injectable,
  NotFoundException, } from '@nestjs/common';
import type { PrismaService } from '../prisma/prisma.service';
import { PRISMA_SERVICE } from '../prisma/prisma.constants';
import { BookingStatus, NotificationType } from '@prisma/client';
import { CreateMedicalRecordDto } from './dto/create-medical-record.dto';
import { NotificationsService } from '../notifications/notifications.service';
import { PdfGeneratorService } from './pdf-generator.service';

@Injectable()
export class MedicalRecordsService {
  constructor(
    @Inject(PRISMA_SERVICE) private readonly prisma: PrismaService,
    private readonly notifications: NotificationsService,
    private readonly pdfGenerator: PdfGeneratorService,
  ) {}

  /**
   * الطبيب فقط، ولحجزه هو، وبعد اكتمال الجلسة فعليًا — يمنع كتابة تقرير طبي لموعد لم يُعقد.
   */
  async createForBooking(doctorUserId: string, bookingId: string, dto: CreateMedicalRecordDto) {
    const booking = await this.prisma.booking.findUnique({
      where: { id: bookingId },
      include: { doctor: true, user: true, medicalRecord: true },
    });
    if (!booking) throw new NotFoundException('الحجز غير موجود');
    if (booking.doctor.userId !== doctorUserId) {
      throw new ForbiddenException('لا يمكنك كتابة تقرير لحجز ليس لك');
    }
    if (booking.status !== BookingStatus.COMPLETED) {
      throw new BadRequestException('لا يمكن إصدار تقرير طبي قبل اكتمال الجلسة');
    }
    if (booking.medicalRecord) {
      throw new ConflictException('يوجد تقرير طبي بالفعل لهذا الحجز');
    }

    const record = await this.prisma.medicalRecord.create({
      data: {
        bookingId,
        diagnosis: dto.diagnosis,
        medications: dto.medications as any,
        followUpNotes: dto.followUpNotes,
        followUpDate: dto.followUpDate ? new Date(dto.followUpDate) : undefined,
      },
    });

    const doctorUser = await this.prisma.user.findUnique({ where: { id: doctorUserId } });
    const pdfPath = await this.pdfGenerator.generateMedicalRecordPdf({
      recordId: record.id,
      patientName: booking.user.fullName,
      doctorName: doctorUser!.fullName,
      diagnosis: record.diagnosis,
      medications: dto.medications,
      followUpNotes: record.followUpNotes ?? undefined,
      followUpDate: record.followUpDate ?? undefined,
      sessionDate: booking.confirmedAt ?? booking.createdAt,
    });

    const updated = await this.prisma.medicalRecord.update({
      where: { id: record.id },
      data: { pdfPath },
    });

    await this.notifications.notifyUser(booking.userId, NotificationType.MEDICAL_RECORD_READY, {
      title: 'وصل تقريرك الطبي',
      body: `أرسل لك د. ${doctorUser!.fullName} التقرير الطبي لجلستكم`,
      data: { bookingId, medicalRecordId: record.id },
    });

    return updated;
  }

  async getForBookingAsUser(userId: string, bookingId: string) {
    const booking = await this.prisma.booking.findUnique({
      where: { id: bookingId },
      include: { medicalRecord: true, doctor: true },
    });
    if (!booking) throw new NotFoundException('الحجز غير موجود');

    const isPatient = booking.userId === userId;
    const isDoctor = booking.doctor.userId === userId;
    if (!isPatient && !isDoctor) throw new ForbiddenException('لا يمكنك الوصول إلى هذا التقرير');
    if (!booking.medicalRecord) throw new NotFoundException('لا يوجد تقرير طبي لهذا الحجز بعد');

    return booking.medicalRecord;
  }

  async listMine(userId: string) {
    return this.prisma.medicalRecord.findMany({
      where: { booking: { userId } },
      include: {
        booking: { include: { doctor: { include: { user: { select: { id: true, fullName: true } } } } } },
      },
      orderBy: { createdAt: 'desc' },
    });
  }
}
