import { Module } from '@nestjs/common';
import { ImageUploadService } from './services/image-upload.service';

@Module({
  providers: [ImageUploadService],
  exports: [ImageUploadService],
})
export class CommonModule {}
