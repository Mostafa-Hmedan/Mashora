import { Module } from '@nestjs/common';
import { MedicalRecordsService } from './medical-records.service';
import { MedicalRecordsController } from './medical-records.controller';
import { PdfGeneratorService } from './pdf-generator.service';
import { NotificationsModule } from '../notifications/notifications.module';

@Module({
  imports: [NotificationsModule],
  providers: [MedicalRecordsService, PdfGeneratorService],
  controllers: [MedicalRecordsController],
  exports: [MedicalRecordsService],
})
export class MedicalRecordsModule {}
