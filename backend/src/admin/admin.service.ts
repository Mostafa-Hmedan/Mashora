import { Inject, BadRequestException, Injectable, NotFoundException } from '@nestjs/common';
import type { PrismaService } from '../prisma/prisma.service';
import { PRISMA_SERVICE } from '../prisma/prisma.constants';
import { DoctorStatus } from '@prisma/client';

@Injectable()
export class AdminService {
  constructor(@Inject(PRISMA_SERVICE) private readonly prisma: PrismaService) {}

  private readonly userSummarySelect = { id: true, fullName: true, email: true, phone: true, isActive: true };

  async listPendingDoctors() {
    return this.prisma.doctorProfile.findMany({
      where: { status: DoctorStatus.PENDING },
      include: { user: { select: this.userSummarySelect } },
      orderBy: { createdAt: 'asc' },
    });
  }

  async listAllDoctors() {
    return this.prisma.doctorProfile.findMany({
      include: { user: { select: this.userSummarySelect } },
      orderBy: { createdAt: 'desc' },
    });
  }

  async approveDoctor(adminId: string, doctorId: string) {
    const doctor = await this.prisma.doctorProfile.findUnique({ where: { id: doctorId } });
    if (!doctor) throw new NotFoundException('ملف الطبيب غير موجود');
    if (doctor.status === DoctorStatus.APPROVED) {
      throw new BadRequestException('الطبيب معتمد بالفعل');
    }
    return this.prisma.doctorProfile.update({
      where: { id: doctorId },
      data: {
        status: DoctorStatus.APPROVED,
        approvedAt: new Date(),
        approvedById: adminId,
        rejectionReason: null,
      },
    });
  }

  async rejectDoctor(doctorId: string, reason?: string) {
    const doctor = await this.prisma.doctorProfile.findUnique({ where: { id: doctorId } });
    if (!doctor) throw new NotFoundException('ملف الطبيب غير موجود');
    return this.prisma.doctorProfile.update({
      where: { id: doctorId },
      data: { status: DoctorStatus.REJECTED, rejectionReason: reason },
    });
  }

  async suspendDoctor(doctorId: string, reason?: string) {
    const doctor = await this.prisma.doctorProfile.findUnique({ where: { id: doctorId } });
    if (!doctor) throw new NotFoundException('ملف الطبيب غير موجود');
    return this.prisma.doctorProfile.update({
      where: { id: doctorId },
      data: { status: DoctorStatus.SUSPENDED, rejectionReason: reason },
    });
  }

  async listAllBookings() {
    return this.prisma.booking.findMany({
      include: {
        user: { select: { id: true, fullName: true, email: true } },
        doctor: { include: { user: { select: { id: true, fullName: true } } } },
        payment: true,
        videoRoom: true,
        medicalRecord: true,
      },
      orderBy: { createdAt: 'desc' },
    });
  }

  async listAllUsers() {
    const users = await this.prisma.user.findMany({
      include: { doctorProfile: true },
      orderBy: { createdAt: 'desc' },
    });
    return users.map(({ passwordHash, ...rest }) => rest);
  }

  async setUserActive(userId: string, isActive: boolean) {
    const user = await this.prisma.user.findUnique({ where: { id: userId } });
    if (!user) throw new NotFoundException('المستخدم غير موجود');
    return this.prisma.user.update({ where: { id: userId }, data: { isActive } });
  }
}
