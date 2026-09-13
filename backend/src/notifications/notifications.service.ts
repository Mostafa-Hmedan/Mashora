import { Inject, Injectable, Logger } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import type { PrismaService } from '../prisma/prisma.service';
import { PRISMA_SERVICE } from '../prisma/prisma.constants';
import { NotificationType, DevicePlatform } from '@prisma/client';
import { cert, getApps, initializeApp, type App } from 'firebase-admin/app';
import { getMessaging } from 'firebase-admin/messaging';

@Injectable()
export class NotificationsService {
  private readonly logger = new Logger(NotificationsService.name);
  private app: App | null = null;

  constructor(
    @Inject(PRISMA_SERVICE) private readonly prisma: PrismaService,
    private readonly config: ConfigService,
  ) {}

  private getApp(): App | null {
    if (this.app) return this.app;

    const projectId = this.config.get<string>('FIREBASE_PROJECT_ID');
    const clientEmail = this.config.get<string>('FIREBASE_CLIENT_EMAIL');
    const privateKey = this.config.get<string>('FIREBASE_PRIVATE_KEY')?.replace(/\\n/g, '\n');

    if (!projectId || !clientEmail || !privateKey) {
      // بيئة تطوير بدون مفاتيح Firebase حقيقية بعد — نسجّل فقط بدل الإرسال الفعلي
      return null;
    }

    const existing = getApps();
    this.app = existing.length ? existing[0] : initializeApp({ credential: cert({ projectId, clientEmail, privateKey }) });
    return this.app;
  }

  async registerDevice(userId: string, token: string, platform: DevicePlatform) {
    return this.prisma.deviceToken.upsert({
      where: { token },
      create: { userId, token, platform },
      update: { userId, lastUsedAt: new Date() },
    });
  }

  async unregisterDevice(token: string) {
    return this.prisma.deviceToken.deleteMany({ where: { token } });
  }

  /**
   * يرسل إشعار Push لكل أجهزة مستخدم معيّن. لا يفشل مسار العمل الأساسي أبدًا بسبب فشل الإشعار —
   * دومًا نسجّل الخطأ ونكمل (best-effort)، لأن الإشعار ثانوي وليس جزءًا من ضمان سلامة البيانات.
   */
  async notifyUser(
    userId: string,
    type: NotificationType,
    payload: { title: string; body: string; data?: Record<string, string> },
  ) {
    const tokens = await this.prisma.deviceToken.findMany({ where: { userId } });
    if (tokens.length === 0) {
      this.logger.debug(`لا توجد أجهزة مسجَّلة للمستخدم ${userId} (نوع: ${type})`);
      return { sent: 0 };
    }

    const app = this.getApp();
    if (!app) {
      this.logger.debug(`[DEV] إشعار محاكى للمستخدم ${userId}: ${payload.title} — ${payload.body}`);
      return { sent: 0, simulated: true };
    }

    try {
      const response = await getMessaging(app).sendEachForMulticast({
        tokens: tokens.map((t) => t.token),
        notification: { title: payload.title, body: payload.body },
        data: { type, ...(payload.data ?? {}) },
      });
      return { sent: response.successCount };
    } catch (err) {
      this.logger.error(`فشل إرسال إشعار FCM للمستخدم ${userId}`, err as Error);
      return { sent: 0, error: true };
    }
  }
}
