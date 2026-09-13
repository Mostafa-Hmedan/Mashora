import { Inject, ForbiddenException, Injectable, NotFoundException } from '@nestjs/common';
import type { PrismaService } from '../prisma/prisma.service';
import { PRISMA_SERVICE } from '../prisma/prisma.constants';
import { DoctorStatus } from '@prisma/client';
import { UpdateDoctorProfileDto } from './dto/update-doctor-profile.dto';
import { ImageUploadService } from '../common/services/image-upload.service';

@Injectable()
export class DoctorsService {
  constructor(
    @Inject(PRISMA_SERVICE) private readonly prisma: PrismaService,
    private readonly imageUpload: ImageUploadService,
  ) {}

  /** قائمة عامة بالأطباء المعتمدين فقط — هذا ما يراه المستخدم عند البحث عن طبيب */
  async listApproved(specialty?: string) {
    return this.prisma.doctorProfile.findMany({
      where: {
        status: DoctorStatus.APPROVED,
        specialty: specialty ? { contains: specialty, mode: 'insensitive' } : undefined,
      },
      include: { user: { select: { id: true, fullName: true } } },
      orderBy: { createdAt: 'desc' },
    });
  }

  async getApprovedById(doctorId: string) {
    const doctor = await this.prisma.doctorProfile.findUnique({
      where: { id: doctorId },
      include: { user: { select: { id: true, fullName: true } } },
    });
    if (!doctor || doctor.status !== DoctorStatus.APPROVED) {
      throw new NotFoundException('الطبيب غير موجود أو غير معتمد بعد');
    }
    return doctor;
  }

  async getOwnProfile(userId: string) {
    const profile = await this.prisma.doctorProfile.findUnique({ where: { userId } });
    if (!profile) throw new NotFoundException('لا يوجد ملف طبيب لهذا الحساب');
    return profile;
  }

  async updateOwnProfile(userId: string, dto: UpdateDoctorProfileDto) {
    const profile = await this.getOwnProfile(userId);
    return this.prisma.doctorProfile.update({
      where: { id: profile.id },
      data: dto,
    });
  }

  /** تُستخدم داخليًا للتأكد أن الطبيب معتمد قبل السماح له بإدارة الجدول أو استلام حجوزات */
  async assertApprovedOwner(userId: string) {
    const profile = await this.getOwnProfile(userId);
    if (profile.status !== DoctorStatus.APPROVED) {
      throw new ForbiddenException('حسابك كطبيب بانتظار موافقة الإدارة أو تم رفضه/إيقافه');
    }
    return profile;
  }

  /** يرفع/يستبدل صورة QR الخاصة بحساب الطبيب على شام كاش، تظهر لكل مرضاه عند اختيار الدفع اليدوي */
  async uploadShamCashQr(userId: string, file: Express.Multer.File) {
    const profile = await this.getOwnProfile(userId);
    const relativePath = await this.imageUpload.saveImage(file, 'shamcash-qr');
    return this.prisma.doctorProfile.update({
      where: { id: profile.id },
      data: { shamCashQrImagePath: relativePath },
    });
  }
}
