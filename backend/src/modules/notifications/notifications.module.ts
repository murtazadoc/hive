import { Module } from '@nestjs/common';
import {
  NotificationsController,
  AdminNotificationsController,
  NotificationWebhooksController,
} from './notifications.controller';
import { NotificationsService } from './notifications.service';
import { PushService } from './push.service';
import { SMSService } from './sms.service';

@Module({
  controllers: [
    NotificationsController,
    AdminNotificationsController,
    NotificationWebhooksController,
  ],
  providers: [
    NotificationsService,
    PushService,
    SMSService,
  ],
  exports: [
    NotificationsService,
    PushService,
    SMSService,
  ],
})
export class NotificationsModule {}
