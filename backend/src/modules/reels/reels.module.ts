import { Module } from '@nestjs/common';
import { ReelsController } from './reels.controller';
import { VideoService } from './video.service';
import { UploadModule } from '../upload/upload.module';

@Module({
  imports: [UploadModule],
  controllers: [ReelsController],
  providers: [VideoService],
  exports: [VideoService],
})
export class ReelsModule {}
