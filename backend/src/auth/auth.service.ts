import {
  BadRequestException,
  ConflictException,
  Injectable,
  UnauthorizedException,
} from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { JwtService } from '@nestjs/jwt';
import * as bcrypt from 'bcrypt';
import { randomUUID } from 'crypto';
import { PrismaService } from '../prisma/prisma.service';
import { Role } from '../common/enums/role.enum';
import { RegisterDto } from './dto/register.dto';
import { LoginDto } from './dto/login.dto';

const BCRYPT_ROUNDS = 12;

@Injectable()
export class AuthService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly jwt: JwtService,
    private readonly config: ConfigService,
  ) {}

  async register(dto: RegisterDto) {
    const existing = await this.prisma.user.findUnique({ where: { email: dto.email } });
    if (existing) {
      throw new ConflictException('البريد الإلكتروني مستخدم بالفعل');
    }

    const role = dto.role ?? Role.USER;

    if (role === Role.DOCTOR) {
      if (!dto.specialty || dto.consultFeeCents == null) {
        throw new BadRequestException('يجب تحديد التخصص وسعر الاستشارة عند التسجيل كطبيب');
      }
    }

    const passwordHash = await bcrypt.hash(dto.password, BCRYPT_ROUNDS);

    const user = await this.prisma.user.create({
      data: {
        email: dto.email,
        passwordHash,
        fullName: dto.fullName,
        phone: dto.phone,
        role,
        // ملف الطبيب يُنشأ بحالة PENDING تلقائيًا؛ لا صلاحيات فعلية حتى موافقة الأدمن
        doctorProfile:
          role === Role.DOCTOR
            ? {
                create: {
                  specialty: dto.specialty!,
                  bio: dto.bio,
                  consultFeeCents: dto.consultFeeCents!,
                },
              }
            : undefined,
      },
      include: { doctorProfile: true },
    });

    const tokens = await this.issueTokens(user.id, user.email, user.role);
    return {
      user: this.sanitizeUser(user),
      ...tokens,
    };
  }

  async login(dto: LoginDto) {
    const user = await this.prisma.user.findUnique({
      where: { email: dto.email },
      include: { doctorProfile: true },
    });
    if (!user || !user.isActive) {
      throw new UnauthorizedException('بيانات الدخول غير صحيحة');
    }

    const passwordMatches = await bcrypt.compare(dto.password, user.passwordHash);
    if (!passwordMatches) {
      throw new UnauthorizedException('بيانات الدخول غير صحيحة');
    }

    const tokens = await this.issueTokens(user.id, user.email, user.role);
    return {
      user: this.sanitizeUser(user),
      ...tokens,
    };
  }

  async refresh(refreshToken: string) {
    let payload: { sub: string };
    try {
      payload = await this.jwt.verifyAsync(refreshToken, {
        secret: this.config.get<string>('JWT_REFRESH_SECRET'),
      });
    } catch {
      throw new UnauthorizedException('رمز التحديث غير صالح');
    }

    const tokenHash = this.hashToken(refreshToken);
    const stored = await this.prisma.refreshToken.findFirst({
      where: { userId: payload.sub, tokenHash, revoked: false },
    });
    if (!stored || stored.expiresAt < new Date()) {
      throw new UnauthorizedException('رمز التحديث غير صالح أو منتهي');
    }

    const user = await this.prisma.user.findUnique({ where: { id: payload.sub } });
    if (!user || !user.isActive) {
      throw new UnauthorizedException('المستخدم غير موجود أو معطّل');
    }

    // تدوير الرمز: إبطال القديم وإصدار جديد (منع إعادة الاستخدام)
    await this.prisma.refreshToken.update({
      where: { id: stored.id },
      data: { revoked: true },
    });

    return this.issueTokens(user.id, user.email, user.role);
  }

  async logout(userId: string, refreshToken: string) {
    const tokenHash = this.hashToken(refreshToken);
    await this.prisma.refreshToken.updateMany({
      where: { userId, tokenHash },
      data: { revoked: true },
    });
    return { success: true };
  }

  private async issueTokens(userId: string, email: string, role: string) {
    const payload = { sub: userId, email, role };

    // jsonwebtoken يتوقع نوع مخصص (StringValue) لا `string` العام؛ القيمة تأتي من .env كنص صالح دائمًا (مثل "15m")
    const accessToken = await this.jwt.signAsync(payload, {
      secret: this.config.get<string>('JWT_ACCESS_SECRET'),
      expiresIn: this.config.get<string>('JWT_ACCESS_EXPIRES_IN') as any,
    });

    const refreshToken = await this.jwt.signAsync(
      { sub: userId },
      {
        secret: this.config.get<string>('JWT_REFRESH_SECRET'),
        expiresIn: this.config.get<string>('JWT_REFRESH_EXPIRES_IN') as any,
      },
    );

    const expiresInDays = this.parseDaysFromExpiry(
      this.config.get<string>('JWT_REFRESH_EXPIRES_IN') ?? '7d',
    );
    await this.prisma.refreshToken.create({
      data: {
        id: randomUUID(),
        userId,
        tokenHash: this.hashToken(refreshToken),
        expiresAt: new Date(Date.now() + expiresInDays * 24 * 60 * 60 * 1000),
      },
    });

    return { accessToken, refreshToken };
  }

  private hashToken(token: string): string {
    // تخزين هاش فقط لرمز التحديث بدلاً من القيمة الخام في قاعدة البيانات
    return require('crypto').createHash('sha256').update(token).digest('hex');
  }

  private parseDaysFromExpiry(expiry: string): number {
    const match = /^(\d+)d$/.exec(expiry);
    return match ? Number(match[1]) : 7;
  }

  private sanitizeUser(user: { passwordHash?: string; [key: string]: any }) {
    const { passwordHash, ...rest } = user;
    return rest;
  }
}
