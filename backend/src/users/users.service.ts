import { Injectable, NotFoundException } from '@nestjs/common';
import { PrismaService } from '../prisma/prisma.service';

@Injectable()
export class UsersService {
  constructor(private readonly prisma: PrismaService) {}

  async findById(id: string) {
    const user = await this.prisma.user.findUnique({
      where: { id },
      include: { doctorProfile: true },
    });
    if (!user) throw new NotFoundException('المستخدم غير موجود');
    const { passwordHash, ...rest } = user;
    return rest;
  }

  async listUsers(role?: string) {
    const users = await this.prisma.user.findMany({
      where: role ? { role: role as any } : undefined,
      include: { doctorProfile: true },
      orderBy: { createdAt: 'desc' },
    });
    return users.map(({ passwordHash, ...rest }) => rest);
  }

  async setActive(id: string, isActive: boolean) {
    return this.prisma.user.update({ where: { id }, data: { isActive } });
  }
}
