import {
  Controller,
  Get,
  Post,
  Put,
  Delete,
  Body,
  Param,
  Query,
  UseGuards,
  HttpCode,
  HttpStatus,
} from '@nestjs/common';
import { ApiTags, ApiOperation, ApiBearerAuth } from '@nestjs/swagger';
import { JwtAuthGuard } from '../auth/guards/jwt-auth.guard';
import { Public, UserId } from '../auth/decorators/public.decorator';
import { NotificationsService } from './notifications.service';
import { PushService } from './push.service';
import { SMSService } from './sms.service';

// =====================================================
// NOTIFICATIONS CONTROLLER
// =====================================================
@ApiTags('notifications')
@Controller('notifications')
@UseGuards(JwtAuthGuard)
@ApiBearerAuth()
export class NotificationsController {
  constructor(
    private readonly notificationsService: NotificationsService,
    private readonly pushService: PushService,
  ) {}

  @Get()
  @ApiOperation({ summary: 'Get my notifications' })
  async getNotifications(
    @UserId() userId: string,
    @Query('limit') limit?: number,
    @Query('cursor') cursor?: string,
    @Query('unread') unreadOnly?: boolean,
  ) {
    return this.notificationsService.getNotifications(userId, {
      limit,
      cursor,
      unreadOnly,
    });
  }

  @Get('unread-count')
  @ApiOperation({ summary: 'Get unread count' })
  async getUnreadCount(@UserId() userId: string) {
    const count = await this.notificationsService.getUnreadCount(userId);
    return { count };
  }

  @Post(':id/read')
  @HttpCode(HttpStatus.OK)
  @ApiOperation({ summary: 'Mark notification as read' })
  async markAsRead(@UserId() userId: string, @Param('id') id: string) {
    await this.notificationsService.markAsRead(id, userId);
    return { success: true };
  }

  @Post('read-all')
  @HttpCode(HttpStatus.OK)
  @ApiOperation({ summary: 'Mark all notifications as read' })
  async markAllAsRead(@UserId() userId: string) {
    const count = await this.notificationsService.markAllAsRead(userId);
    return { count };
  }

  @Post(':id/click')
  @HttpCode(HttpStatus.OK)
  @ApiOperation({ summary: 'Track notification click' })
  async trackClick(@UserId() userId: string, @Param('id') id: string) {
    await this.notificationsService.trackClick(id, userId);
    return { success: true };
  }

  // =====================================================
  // PREFERENCES
  // =====================================================
  @Get('preferences')
  @ApiOperation({ summary: 'Get notification preferences' })
  async getPreferences(@UserId() userId: string) {
    return this.notificationsService.getPreferences(userId);
  }

  @Put('preferences')
  @ApiOperation({ summary: 'Update notification preferences' })
  async updatePreferences(
    @UserId() userId: string,
    @Body() updates: {
      pushEnabled?: boolean;
      smsEnabled?: boolean;
      emailEnabled?: boolean;
      inAppEnabled?: boolean;
      orderUpdates?: boolean;
      promotions?: boolean;
      newProducts?: boolean;
      priceDrops?: boolean;
      messages?: boolean;
      follows?: boolean;
      quietHoursEnabled?: boolean;
      quietHoursStart?: string;
      quietHoursEnd?: string;
      promotionFrequency?: string;
    },
  ) {
    return this.notificationsService.updatePreferences(userId, updates);
  }

  // =====================================================
  // DEVICE TOKENS
  // =====================================================
  @Post('tokens')
  @ApiOperation({ summary: 'Register push token' })
  async registerToken(
    @UserId() userId: string,
    @Body() body: {
      token: string;
      platform: 'ios' | 'android' | 'web';
      deviceId?: string;
      deviceName?: string;
      appVersion?: string;
      osVersion?: string;
    },
  ) {
    await this.pushService.registerToken(userId, body.token, body.platform, {
      deviceId: body.deviceId,
      deviceName: body.deviceName,
      appVersion: body.appVersion,
      osVersion: body.osVersion,
    });
    return { success: true };
  }

  @Delete('tokens/:token')
  @ApiOperation({ summary: 'Unregister push token' })
  async unregisterToken(@UserId() userId: string, @Param('token') token: string) {
    await this.pushService.unregisterToken(userId, token);
    return { success: true };
  }
}

// =====================================================
// ADMIN NOTIFICATIONS CONTROLLER
// =====================================================
@ApiTags('admin-notifications')
@Controller('admin/notifications')
@UseGuards(JwtAuthGuard)
@ApiBearerAuth()
export class AdminNotificationsController {
  constructor(
    private readonly notificationsService: NotificationsService,
    private readonly pushService: PushService,
    private readonly smsService: SMSService,
  ) {}

  @Post('send')
  @ApiOperation({ summary: 'Send notification to user(s)' })
  async sendNotification(
    @Body() body: {
      userIds: string[];
      title: string;
      body: string;
      type?: string;
      imageUrl?: string;
      actionType?: string;
      actionData?: Record<string, any>;
      channels?: ('push' | 'sms' | 'email' | 'in_app')[];
    },
  ) {
    await this.notificationsService.notifyMany(body.userIds, {
      type: body.type || 'announcement',
      title: body.title,
      body: body.body,
      imageUrl: body.imageUrl,
      actionType: body.actionType,
      actionData: body.actionData,
      channels: body.channels,
    });
    return { success: true, count: body.userIds.length };
  }

  @Post('send-sms')
  @ApiOperation({ summary: 'Send SMS directly' })
  async sendSMS(
    @Body() body: { phoneNumber: string; message: string },
  ) {
    const result = await this.smsService.send(body.phoneNumber, body.message);
    return result;
  }

  @Post('test-push')
  @ApiOperation({ summary: 'Test push notification' })
  async testPush(
    @Body() body: { userId: string; title: string; body: string },
  ) {
    const result = await this.pushService.sendToUser(body.userId, {
      title: body.title,
      body: body.body,
    });
    return result;
  }
}

// =====================================================
// WEBHOOKS CONTROLLER
// =====================================================
@ApiTags('webhooks')
@Controller('webhooks')
export class NotificationWebhooksController {
  constructor(private readonly smsService: SMSService) {}

  @Post('sms/delivery')
  @Public()
  @HttpCode(HttpStatus.OK)
  @ApiOperation({ summary: 'SMS delivery webhook' })
  async smsDeliveryReport(@Body() body: any) {
    // Africa's Talking delivery report format
    if (body.id && body.status) {
      await this.smsService.handleDeliveryReport({
        id: body.id,
        status: body.status,
        phoneNumber: body.phoneNumber,
        failureReason: body.failureReason,
      });
    }
    return { success: true };
  }
}
