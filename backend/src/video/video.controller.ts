import { Controller, ForbiddenException, Get, NotFoundException, Param, Post } from '@nestjs/common';
import { VideoService } from './video.service';
import { PrismaService } from '../prisma/prisma.service';
import { CurrentUser } from '../common/decorators/current-user.decorator';
import type { AuthenticatedUser } from '../common/decorators/current-user.decorator';
import { BookingStatus } from '@prisma/client';

@Controller('bookings/:bookingId/video')
export class VideoController {
  constructor(
    private readonly videoService: VideoService,
    private readonly prisma: PrismaService,
  ) {}

  /** يتحقق من أن المستخدم الحالي طرف فعلي في الحجز (مريض أو الطبيب صاحب الحجز)، ويرجع الحجز */
  private async assertParticipant(bookingId: string, user: AuthenticatedUser) {
    const booking = await this.prisma.booking.findUnique({
      where: { id: bookingId },
      include: { doctor: true },
    });
    if (!booking) throw new NotFoundException('الحجز غير موجود');

    const isPatient = booking.userId === user.userId;
    const isDoctor = booking.doctor.userId === user.userId;
    if (!isPatient && !isDoctor) {
      throw new ForbiddenException('لست طرفًا في هذا الحجز');
    }
    return { booking, isDoctor };
  }

  /** يمنح المستخدم رمز دخول مؤقت لغرفة الفيديو، ويسجّل بداية الجلسة عند أول دخول */
  @Post('token')
  async getToken(@Param('bookingId') bookingId: string, @CurrentUser() user: AuthenticatedUser) {
    const { booking, isDoctor } = await this.assertParticipant(bookingId, user);

    if (booking.status !== BookingStatus.CONFIRMED && booking.status !== BookingStatus.IN_SESSION) {
      throw new ForbiddenException('الجلسة غير متاحة حاليًا لهذا الحجز');
    }

    if (booking.status === BookingStatus.CONFIRMED) {
      await this.prisma.booking.update({
        where: { id: bookingId },
        data: { status: BookingStatus.IN_SESSION, sessionStartedAt: new Date() },
      });
    }

    const userRecord = await this.prisma.user.findUnique({ where: { id: user.userId } });
    return this.videoService.createMeetingToken(bookingId, userRecord!.fullName, isDoctor);
  }

  /** يُستدعى صراحة (زر "إنهاء الجلسة") من الطبيب عند انتهاء الاستشارة */
  @Post('end')
  async endSession(@Param('bookingId') bookingId: string, @CurrentUser() user: AuthenticatedUser) {
    const { isDoctor } = await this.assertParticipant(bookingId, user);
    if (!isDoctor) throw new ForbiddenException('الطبيب فقط يمكنه إنهاء الجلسة');
    return this.prisma.booking.update({
      where: { id: bookingId },
      data: { status: BookingStatus.COMPLETED, sessionEndedAt: new Date() },
    });
  }

  @Get()
  async getRoomInfo(@Param('bookingId') bookingId: string, @CurrentUser() user: AuthenticatedUser) {
    const { booking } = await this.assertParticipant(bookingId, user);
    const room = await this.prisma.videoRoom.findUnique({ where: { bookingId: booking.id } });
    if (!room) throw new NotFoundException('لم تُنشأ غرفة فيديو بعد لهذا الحجز');
    return room;
  }
}
