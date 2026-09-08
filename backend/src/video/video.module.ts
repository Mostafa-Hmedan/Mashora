import { Module } from '@nestjs/common';
import { VideoService } from './video.service';
import { VideoController } from './video.controller';

@Module({
  providers: [VideoService],
  controllers: [VideoController],
  exports: [VideoService],
})
export class VideoModule {}
