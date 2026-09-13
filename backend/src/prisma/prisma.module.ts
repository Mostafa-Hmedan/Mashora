import { Global, Inject, Module, OnApplicationShutdown } from '@nestjs/common';
import { createPrismaService, type PrismaService } from './prisma.service';
import { PRISMA_SERVICE } from './prisma.constants';

/**
 * PrismaService أصبح type فقط (ناتج $extends)، وليس class — لذلك DI token هو الرمز
 * PRISMA_SERVICE، ونحقن القيمة عبر factory بدل useClass التقليدي. باقي الموديولز
 * تحقنه بـ @Inject(PRISMA_SERVICE) private readonly prisma: PrismaService.
 */
@Global()
@Module({
  providers: [
    {
      provide: PRISMA_SERVICE,
      useFactory: async () => {
        const client = createPrismaService();
        await client.$connect();
        return client;
      },
    },
  ],
  exports: [PRISMA_SERVICE],
})
export class PrismaModule implements OnApplicationShutdown {
  constructor(@Inject(PRISMA_SERVICE) private readonly prisma: PrismaService) {}

  async onApplicationShutdown() {
    await this.prisma.$disconnect();
  }
}
