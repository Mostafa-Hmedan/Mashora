import { Injectable, Logger, NotFoundException } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import axios from 'axios';
import { randomUUID } from 'crypto';
import { PrismaService } from '../prisma/prisma.service';

/**
 * تكامل Daily.co لغرف الفيديو المدمجة داخل التطبيق.
 * يُستدعى createRoomForBooking فقط بعد تأكيد الدفع فعليًا (من PaymentsService.confirmPayment) —
 * لا مسار آخر في النظام ينشئ غرفة فيديو، وهذا يمنع الالتفاف على الدفع.
 */
@Injectable()
export class VideoService {
  private readonly logger = new Logger(VideoService.name);
  private readonly apiBase = 'https://api.daily.co/v1';

  constructor(
    private readonly prisma: PrismaService,
    private readonly config: ConfigService,
  ) {}

  private authHeaders() {
    return { Authorization: `Bearer ${this.config.get<string>('DAILY_API_KEY')}` };
  }

  /** ينشئ غرفة فيديو مرتبطة بحجز مؤكَّد. idempotent — لا يعيد الإنشاء لو موجودة سلفًا. */
  async createRoomForBooking(bookingId: string) {
    const booking = await this.prisma.booking.findUnique({
      where: { id: bookingId },
      include: { slot: true, videoRoom: true },
    });
    if (!booking) throw new NotFoundException('الحجز غير موجود');
    if (booking.videoRoom) return booking.videoRoom;

    // مدة إتاحة الغرفة: من بداية الموعد حتى ساعة بعد نهايته كهامش أمان
    const expiresAt = new Date(booking.slot.endsAt.getTime() + 60 * 60 * 1000);
    const roomName = `mashora-${booking.id}-${randomUUID().slice(0, 8)}`;

    const response = await axios.post(
      `${this.apiBase}/rooms`,
      {
        name: roomName,
        privacy: 'private',
        properties: {
          exp: Math.floor(expiresAt.getTime() / 1000),
          enable_chat: true,
          enable_screenshare: true,
          eject_at_room_exp: true,
        },
      },
      { headers: this.authHeaders() },
    );

    const roomUrl: string = response.data.url;

    return this.prisma.videoRoom.create({
      data: {
        bookingId: booking.id,
        provider: 'DAILY',
        roomName,
        roomUrl,
        expiresAt,
      },
    });
  }

  /** رمز دخول مؤقت خاص بالمستخدم (meeting token) — بديل آمن عن مشاركة رابط الغرفة الخام مباشرة */
  async createMeetingToken(bookingId: string, userName: string, isOwner: boolean) {
    const booking = await this.prisma.booking.findUnique({
      where: { id: bookingId },
      include: { videoRoom: true },
    });
    if (!booking?.videoRoom) {
      throw new NotFoundException('لا توجد غرفة فيديو لهذا الحجز بعد');
    }

    const response = await axios.post(
      `${this.apiBase}/meeting-tokens`,
      {
        properties: {
          room_name: booking.videoRoom.roomName,
          user_name: userName,
          is_owner: isOwner,
          exp: Math.floor(booking.videoRoom.expiresAt.getTime() / 1000),
        },
      },
      { headers: this.authHeaders() },
    );

    return { token: response.data.token, roomUrl: booking.videoRoom.roomUrl };
  }

  async deleteRoom(roomName: string) {
    try {
      await axios.delete(`${this.apiBase}/rooms/${roomName}`, { headers: this.authHeaders() });
    } catch (err) {
      this.logger.warn(`تعذّر حذف غرفة Daily.co ${roomName}`, err as Error);
    }
  }
}
