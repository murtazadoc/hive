import { Module } from '@nestjs/common';
import {
  TrackingController,
  AdminAnalyticsController,
  BusinessAnalyticsController,
  ProductAnalyticsController,
} from './analytics.controller';
import { AnalyticsService } from './analytics.service';

@Module({
  controllers: [
    TrackingController,
    AdminAnalyticsController,
    BusinessAnalyticsController,
    ProductAnalyticsController,
  ],
  providers: [AnalyticsService],
  exports: [AnalyticsService],
})
export class AnalyticsModule {}
