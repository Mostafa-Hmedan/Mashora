import { Inject, BadRequestException, ConflictException, ForbiddenException, Injectable, NotFoundException } from '@nestjs/common';
import type { PrismaService } from '../prisma/prisma.service';
import { PRISMA_SERVICE } from '../prisma/prisma.constants';
import { BookingStatus } from '@prisma/client';
import { CreateReviewDto } from './dto/create-review.dto';

@Injectable()
export class ReviewsService {
  constructor(@Inject(PRISMA_SERVICE) private readonly prisma: PrismaService) {}

  /** المريض فقط يقيّم، ولحجزه هو، وبعد اكتمال الجلسة فعليًا — مرة واحدة لكل حجز */
  async createForBooking(userId: string, bookingId: string, dto: CreateReviewDto) {
    const booking = await this.prisma.booking.findUnique({
      where: { id: bookingId },
      include: { review: true },
    });
    if (!booking) throw new NotFoundException('الحجز غير موجود');
    if (booking.userId !== userId) throw new ForbiddenException('لا يمكنك تقييم حجز ليس لك');
    if (booking.status !== BookingStatus.COMPLETED) {
      throw new BadRequestException('لا يمكن التقييم قبل اكتمال الجلسة');
    }
    if (booking.review) throw new ConflictException('سبق أن قيّمت هذا الحجز');

    return this.prisma.$transaction(async (tx) => {
      const review = await tx.review.create({
        data: {
          bookingId,
          userId,
          doctorId: booking.doctorId,
          rating: dto.rating,
          comment: dto.comment,
        },
      });

      // إعادة حساب متوسط التقييم تراكميًا بدل إعادة تجميع كل المراجعات في كل مرة
      const doctor = await tx.doctorProfile.findUniqueOrThrow({ where: { id: booking.doctorId } });
      const newCount = doctor.ratingCount + 1;
      const newAvg = (doctor.ratingAvg * doctor.ratingCount + dto.rating) / newCount;
      await tx.doctorProfile.update({
        where: { id: booking.doctorId },
        data: { ratingAvg: newAvg, ratingCount: newCount },
      });

      return review;
    });
  }

  async listForDoctor(doctorId: string) {
    return this.prisma.review.findMany({
      where: { doctorId },
      include: { user: { select: { fullName: true } } },
      orderBy: { createdAt: 'desc' },
    });
  }
}
