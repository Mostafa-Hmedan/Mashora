import { Module } from '@nestjs/common';
import { ConfigModule } from '@nestjs/config';
import { ScheduleModule } from '@nestjs/schedule';
import { APP_GUARD } from '@nestjs/core';
import { PrismaModule } from './prisma/prisma.module';
import { AuthModule } from './auth/auth.module';
import { UsersModule } from './users/users.module';
import { DoctorsModule } from './doctors/doctors.module';
import { AvailabilityModule } from './availability/availability.module';
import { BookingsModule } from './bookings/bookings.module';
import { PaymentsModule } from './payments/payments.module';
import { VideoModule } from './video/video.module';
import { NotificationsModule } from './notifications/notifications.module';
import { MedicalRecordsModule } from './medical-records/medical-records.module';
import { ReviewsModule } from './reviews/reviews.module';
import { AdminModule } from './admin/admin.module';
import { JwtAuthGuard } from './common/guards/jwt-auth.guard';
import { RolesGuard } from './common/guards/roles.guard';

@Module({
  imports: [
    ConfigModule.forRoot({ isGlobal: true }),
    ScheduleModule.forRoot(),
    PrismaModule,
    AuthModule,
    UsersModule,
    DoctorsModule,
    AvailabilityModule,
    BookingsModule,
    PaymentsModule,
    VideoModule,
    NotificationsModule,
    MedicalRecordsModule,
    ReviewsModule,
    AdminModule,
  ],
  providers: [
    // كل المسارات محمية بـ JWT افتراضيًا؛ استخدم @Public() للاستثناء (login, webhook..)
    { provide: APP_GUARD, useClass: JwtAuthGuard },
    { provide: APP_GUARD, useClass: RolesGuard },
  ],
})
export class AppModule {}
