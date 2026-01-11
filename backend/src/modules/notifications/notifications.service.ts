import { Injectable, Logger } from '@nestjs/common';
import { PrismaService } from '../../prisma/prisma.service';
import { PushService } from './push.service';
import { SMSService } from './sms.service';
import { v4 as uuidv4 } from 'uuid';

// =====================================================
// TYPES
// =====================================================
export interface NotificationPayload {
  type: string;
  title: string;
  body: string;
  imageUrl?: string;
  actionType?: string;
  actionData?: Record<string, any>;
  channels?: ('push' | 'sms' | 'email' | 'in_app')[];
  groupKey?: string;
  metadata?: Record<string, any>;
}

export interface TemplateVariables {
  [key: string]: string | number;
}

// =====================================================
// NOTIFICATIONS SERVICE
// =====================================================
@Injectable()
export class NotificationsService {
  private readonly logger = new Logger(NotificationsService.name);

  constructor(
    private prisma: PrismaService,
    private pushService: PushService,
    private smsService: SMSService,
  ) {}

  // =====================================================
  // SEND NOTIFICATIONS
  // =====================================================

  /**
   * Send notification to a user
   */
  async notify(
    userId: string,
    payload: NotificationPayload,
  ): Promise<string> {
    // Get user preferences
    const prefs = await this.getPreferences(userId);
    
    // Check if user wants this type
    if (!this.shouldSendType(prefs, payload.type)) {
      this.logger.debug(`User ${userId} has disabled ${payload.type} notifications`);
      return '';
    }

    // Check quiet hours
    if (this.isInQuietHours(prefs)) {
      this.logger.debug(`User ${userId} is in quiet hours`);
      // Still create in-app, skip push/sms
      payload.channels = payload.channels?.filter(c => c === 'in_app') || ['in_app'];
    }

    // Create notification record
    const notification = await this.prisma.notification.create({
      data: {
        id: uuidv4(),
        userId,
        type: payload.type,
        title: payload.title,
        body: payload.body,
        imageUrl: payload.imageUrl,
        actionType: payload.actionType,
        actionData: payload.actionData || {},
        channels: payload.channels || ['push', 'in_app'],
        groupKey: payload.groupKey,
        metadata: payload.metadata || {},
      },
    });

    // Send via enabled channels
    const channels = payload.channels || ['push', 'in_app'];

    if (channels.includes('push') && prefs.pushEnabled) {
      this.sendPush(userId, notification.id, payload).catch((e) =>
        this.logger.error(`Push failed: ${e.message}`),
      );
    }

    if (channels.includes('sms') && prefs.smsEnabled) {
      this.sendSMS(userId, notification.id, payload).catch((e) =>
        this.logger.error(`SMS failed: ${e.message}`),
      );
    }

    return notification.id;
  }

  /**
   * Send notification using a template
   */
  async notifyWithTemplate(
    userId: string,
    templateCode: string,
    variables: TemplateVariables,
    options?: {
      channels?: ('push' | 'sms' | 'email' | 'in_app')[];
      actionData?: Record<string, any>;
    },
  ): Promise<string> {
    const template = await this.prisma.notificationTemplate.findUnique({
      where: { code: templateCode },
    });

    if (!template || !template.isActive) {
      this.logger.warn(`Template ${templateCode} not found or inactive`);
      return '';
    }

    // Render template
    const title = this.renderTemplate(template.titleTemplate, variables);
    const body = this.renderTemplate(template.bodyTemplate, variables);

    return this.notify(userId, {
      type: template.type,
      title,
      body,
      imageUrl: template.pushImageUrl || undefined,
      actionType: template.pushActionType || undefined,
      actionData: options?.actionData,
      channels: options?.channels,
    });
  }

  /**
   * Notify multiple users
   */
  async notifyMany(
    userIds: string[],
    payload: NotificationPayload,
  ): Promise<void> {
    for (const userId of userIds) {
      await this.notify(userId, payload);
    }
  }

  // =====================================================
  // IN-APP NOTIFICATIONS
  // =====================================================

  /**
   * Get user's notifications
   */
  async getNotifications(
    userId: string,
    options?: {
      limit?: number;
      cursor?: string;
      unreadOnly?: boolean;
    },
  ): Promise<any[]> {
    return this.prisma.notification.findMany({
      where: {
        userId,
        ...(options?.unreadOnly && { readAt: null }),
      },
      orderBy: { createdAt: 'desc' },
      take: options?.limit || 20,
      ...(options?.cursor && {
        skip: 1,
        cursor: { id: options.cursor },
      }),
    });
  }

  /**
   * Get unread count
   */
  async getUnreadCount(userId: string): Promise<number> {
    return this.prisma.notification.count({
      where: { userId, readAt: null },
    });
  }

  /**
   * Mark notification as read
   */
  async markAsRead(notificationId: string, userId: string): Promise<void> {
    await this.prisma.notification.updateMany({
      where: { id: notificationId, userId },
      data: { readAt: new Date() },
    });
  }

  /**
   * Mark all as read
   */
  async markAllAsRead(userId: string): Promise<number> {
    const result = await this.prisma.notification.updateMany({
      where: { userId, readAt: null },
      data: { readAt: new Date() },
    });
    return result.count;
  }

  /**
   * Track notification click
   */
  async trackClick(notificationId: string, userId: string): Promise<void> {
    await this.prisma.notification.updateMany({
      where: { id: notificationId, userId },
      data: { clickedAt: new Date(), readAt: new Date() },
    });
  }

  // =====================================================
  // PREFERENCES
  // =====================================================

  /**
   * Get notification preferences
   */
  async getPreferences(userId: string) {
    let prefs = await this.prisma.notificationPreference.findUnique({
      where: { userId },
    });

    if (!prefs) {
      // Create default preferences
      prefs = await this.prisma.notificationPreference.create({
        data: {
          id: uuidv4(),
          userId,
          pushEnabled: true,
          smsEnabled: true,
          emailEnabled: true,
          inAppEnabled: true,
          orderUpdates: true,
          promotions: true,
          newProducts: true,
          priceDrops: true,
          messages: true,
          follows: true,
        },
      });
    }

    return prefs;
  }

  /**
   * Update preferences
   */
  async updatePreferences(
    userId: string,
    updates: Partial<{
      pushEnabled: boolean;
      smsEnabled: boolean;
      emailEnabled: boolean;
      inAppEnabled: boolean;
      orderUpdates: boolean;
      promotions: boolean;
      newProducts: boolean;
      priceDrops: boolean;
      messages: boolean;
      follows: boolean;
      quietHoursEnabled: boolean;
      quietHoursStart: string;
      quietHoursEnd: string;
      promotionFrequency: string;
    }>,
  ) {
    return this.prisma.notificationPreference.upsert({
      where: { userId },
      create: {
        id: uuidv4(),
        userId,
        ...updates,
      },
      update: updates,
    });
  }

  // =====================================================
  // SPECIFIC NOTIFICATION TYPES
  // =====================================================

  /**
   * Notify order status change
   */
  async notifyOrderUpdate(
    userId: string,
    orderNumber: string,
    status: string,
    businessName: string,
    amount?: number,
  ): Promise<void> {
    const templateMap: Record<string, string> = {
      'paid': 'payment_received',
      'confirmed': 'order_confirmed',
      'shipped': 'order_shipped',
      'delivered': 'order_delivered',
    };

    const templateCode = templateMap[status];
    if (!templateCode) return;

    await this.notifyWithTemplate(userId, templateCode, {
      order_number: orderNumber,
      business_name: businessName,
      amount: amount?.toLocaleString() || '',
    }, {
      channels: ['push', 'sms', 'in_app'],
      actionData: { screen: 'OrderDetail', orderNumber },
    });
  }

  /**
   * Notify new follower
   */
  async notifyNewFollower(
    businessOwnerId: string,
    followerName: string,
    businessName: string,
  ): Promise<void> {
    await this.notifyWithTemplate(businessOwnerId, 'new_follower', {
      follower_name: followerName,
      business_name: businessName,
    }, {
      channels: ['push', 'in_app'],
    });
  }

  /**
   * Notify price drop
   */
  async notifyPriceDrop(
    userIds: string[],
    productId: string,
    productName: string,
    oldPrice: number,
    newPrice: number,
  ): Promise<void> {
    for (const userId of userIds) {
      await this.notifyWithTemplate(userId, 'price_drop', {
        product_name: productName,
        old_price: oldPrice.toLocaleString(),
        new_price: newPrice.toLocaleString(),
      }, {
        channels: ['push', 'in_app'],
        actionData: { screen: 'ProductDetail', productId },
      });
    }
  }

  // =====================================================
  // PRIVATE HELPERS
  // =====================================================

  private async sendPush(
    userId: string,
    notificationId: string,
    payload: NotificationPayload,
  ): Promise<void> {
    const result = await this.pushService.sendToUser(
      userId,
      {
        title: payload.title,
        body: payload.body,
        imageUrl: payload.imageUrl,
        data: {
          notificationId,
          actionType: payload.actionType || '',
          ...Object.entries(payload.actionData || {}).reduce(
            (acc, [k, v]) => ({ ...acc, [k]: String(v) }),
            {},
          ),
        },
      },
      notificationId,
    );

    // Update notification with push status
    await this.prisma.notification.update({
      where: { id: notificationId },
      data: {
        pushSent: result.sent > 0,
        pushSentAt: result.sent > 0 ? new Date() : undefined,
        pushError: result.failed > 0 ? 'Some devices failed' : undefined,
      },
    });
  }

  private async sendSMS(
    userId: string,
    notificationId: string,
    payload: NotificationPayload,
  ): Promise<void> {
    // Get user's phone number
    const user = await this.prisma.user.findUnique({
      where: { id: userId },
      select: { phone: true },
    });

    if (!user?.phone) return;

    // Get SMS template if exists
    const template = await this.prisma.notificationTemplate.findFirst({
      where: { type: payload.type, smsTemplate: { not: null } },
    });

    const message = template?.smsTemplate
      ? this.renderTemplate(template.smsTemplate, payload.metadata || {})
      : `HIVE: ${payload.body}`;

    const result = await this.smsService.send(user.phone, message, {
      userId,
      notificationId,
    });

    // Update notification
    await this.prisma.notification.update({
      where: { id: notificationId },
      data: {
        smsSent: result.success,
        smsSentAt: result.success ? new Date() : undefined,
        smsMessageId: result.messageId,
      },
    });
  }

  private renderTemplate(template: string, variables: TemplateVariables): string {
    return template.replace(/\{\{(\w+)\}\}/g, (_, key) => {
      return String(variables[key] ?? '');
    });
  }

  private shouldSendType(prefs: any, type: string): boolean {
    const typeMap: Record<string, keyof typeof prefs> = {
      'order_update': 'orderUpdates',
      'payment': 'orderUpdates',
      'promotion': 'promotions',
      'price_drop': 'priceDrops',
      'new_product': 'newProducts',
      'message': 'messages',
      'social': 'follows',
    };

    const prefKey = typeMap[type];
    return prefKey ? prefs[prefKey] !== false : true;
  }

  private isInQuietHours(prefs: any): boolean {
    if (!prefs.quietHoursEnabled || !prefs.quietHoursStart || !prefs.quietHoursEnd) {
      return false;
    }

    const now = new Date();
    const currentTime = `${now.getHours().toString().padStart(2, '0')}:${now.getMinutes().toString().padStart(2, '0')}`;

    const start = prefs.quietHoursStart;
    const end = prefs.quietHoursEnd;

    // Handle overnight quiet hours (e.g., 22:00 - 07:00)
    if (start > end) {
      return currentTime >= start || currentTime <= end;
    }

    return currentTime >= start && currentTime <= end;
  }
}
