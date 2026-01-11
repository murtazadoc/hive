import { Module } from '@nestjs/common';
import {
  AdminModerationController,
  UserReportController,
  BusinessLicenseController,
} from './moderation.controller';
import { ModerationService } from './moderation.service';
import { ContentDetectionService } from './detection.service';

@Module({
  controllers: [
    AdminModerationController,
    UserReportController,
    BusinessLicenseController,
  ],
  providers: [
    ModerationService,
    ContentDetectionService,
  ],
  exports: [
    ModerationService,
    ContentDetectionService,
  ],
})
export class ModerationModule {}
