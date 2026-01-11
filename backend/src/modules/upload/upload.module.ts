import { Module } from '@nestjs/common';
import { MulterModule } from '@nestjs/platform-express';
import { memoryStorage } from 'multer';
import { CloudinaryService } from './cloudinary.service';
import {
  UploadController,
  ProductImageUploadController,
  BusinessImageUploadController,
} from './upload.controller';

@Module({
  imports: [
    MulterModule.register({
      storage: memoryStorage(),
      limits: {
        fileSize: 10 * 1024 * 1024, // 10MB
        files: 10,
      },
    }),
  ],
  controllers: [
    UploadController,
    ProductImageUploadController,
    BusinessImageUploadController,
  ],
  providers: [CloudinaryService],
  exports: [CloudinaryService],
})
export class UploadModule {}
