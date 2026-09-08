import { BadRequestException, ForbiddenException, Injectable, NotFoundException } from '@nestjs/common';
import { PrismaService } from '../prisma/prisma.service';
import { DoctorsService } from '../doctors/doctors.service';
import { SlotStatus } from '@prisma/client';
import { CreateSlotDto } from './dto/create-slot.dto';

@Injectable()
export class AvailabilityService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly doctorsService: DoctorsService,
  ) {}

  async createSlot(userId: string, dto: CreateSlotDto) {
    const doctor = await this.doctorsService.assertApprovedOwner(userId);

    const startsAt = new Date(dto.startsAt);
    const endsAt = new Date(dto.endsAt);
    if (startsAt >= endsAt) {
      throw new BadRequestException('وقت البداية يجب أن يكون قبل وقت النهاية');
    }
    if (startsAt < new Date()) {
      throw new BadRequestException('لا يمكن إنشاء فترة توفر في الماضي');
    }

    const overlap = await this.prisma.availabilitySlot.findFirst({
      where: {
        doctorId: doctor.id,
        status: { in: [SlotStatus.OPEN, SlotStatus.HELD, SlotStatus.BOOKED] },
        AND: [{ startsAt: { lt: endsAt } }, { endsAt: { gt: startsAt } }],
      },
    });
    if (overlap) {
      throw new BadRequestException('يوجد تعارض مع فترة توفر أخرى');
    }

    return this.prisma.availabilitySlot.create({
      data: { doctorId: doctor.id, startsAt, endsAt },
    });
  }

  /** الفترات المتاحة للحجز لطبيب معيّن — يراها المستخدم */
  async listOpenSlots(doctorId: string) {
    return this.prisma.availabilitySlot.findMany({
      where: { doctorId, status: SlotStatus.OPEN, startsAt: { gt: new Date() } },
      orderBy: { startsAt: 'asc' },
    });
  }

  async listMySlots(userId: string) {
    const doctor = await this.doctorsService.getOwnProfile(userId);
    return this.prisma.availabilitySlot.findMany({
      where: { doctorId: doctor.id },
      orderBy: { startsAt: 'asc' },
    });
  }

  async cancelSlot(userId: string, slotId: string) {
    const doctor = await this.doctorsService.getOwnProfile(userId);
    const slot = await this.prisma.availabilitySlot.findUnique({ where: { id: slotId } });
    if (!slot || slot.doctorId !== doctor.id) {
      throw new NotFoundException('الفترة غير موجودة');
    }
    if (slot.status === SlotStatus.BOOKED) {
      throw new ForbiddenException('لا يمكن إلغاء فترة محجوزة بالفعل، يجب إلغاء الحجز أولاً');
    }
    return this.prisma.availabilitySlot.update({
      where: { id: slotId },
      data: { status: SlotStatus.CANCELLED },
    });
  }
}
