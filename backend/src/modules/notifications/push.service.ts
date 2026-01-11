import { Injectable, Logger } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { PrismaService } from '../../prisma/prisma.service';
import { v4 as uuidv4 } from 'uuid';

// =====================================================
// TYPES
// =====================================================
export interface PushPayload {
  title: string;
  body: string;
  imageUrl?: string;
  data?: Record<string, string>;
  badge?: number;
  sound?: string;
  channelId?: string;
}

export interface PushResult {
  success: boolean;
  messageId?: string;
  error?: string;
}

// =====================================================
// PUSH SERVICE (FCM + Expo)
// =====================================================
@Injectable()
export class PushService {
  private readonly logger = new Logger(PushService.name);
  private readonly fcmUrl = 'https://fcm.googleapis.com/v1/projects';
  private readonly expoUrl = 'https://exp.host/--/api/v2/push/send';
  
  private fcmAccessToken: string | null = null;
  private fcmTokenExpiry: number = 0;

  constructor(
    private configService: ConfigService,
    private prisma: PrismaService,
  ) {}

  // =====================================================
  // DEVICE TOKEN MANAGEMENT
  // =====================================================

  /**
   * Register a device token
   */
  async registerToken(
    userId: string,
    token: string,
    platform: 'ios' | 'android' | 'web',
    deviceInfo?: {
      deviceId?: string;
      deviceName?: string;
      appVersion?: string;
      osVersion?: string;
    },
  ): Promise<void> {
    await this.prisma.deviceToken.upsert({
      where: { userId_token: { userId, token } },
      create: {
        id: uuidv4(),
        userId,
        token,
        platform,
        ...deviceInfo,
        isActive: true,
      },
      update: {
        platform,
        ...deviceInfo,
        isActive: true,
        lastUsedAt: new Date(),
      },
    });

    this.logger.log(`Registered token for user ${userId} on ${platform}`);
  }

  /**
   * Unregister a device token
   */
  async unregisterToken(userId: string, token: string): Promise<void> {
    await this.prisma.deviceToken.updateMany({
      where: { userId, token },
      data: { isActive: false },
    });
  }

  /**
   * Get active tokens for a user
   */
  async getUserTokens(userId: string): Promise<Array<{
    id: string;
    token: string;
    platform: string;
  }>> {
    return this.prisma.deviceToken.findMany({
      where: { userId, isActive: true },
      select: { id: true, token: true, platform: true },
    });
  }

  // =====================================================
  // SEND PUSH NOTIFICATIONS
  // =====================================================

  /**
   * Send push to a single user
   */
  async sendToUser(
    userId: string,
    payload: PushPayload,
    notificationId?: string,
  ): Promise<{ sent: number; failed: number }> {
    const tokens = await this.getUserTokens(userId);
    
    if (tokens.length === 0) {
      return { sent: 0, failed: 0 };
    }

    let sent = 0;
    let failed = 0;

    for (const { id: tokenId, token, platform } of tokens) {
      const result = await this.sendToDevice(token, platform, payload);
      
      // Log the push
      await this.logPush({
        userId,
        deviceTokenId: tokenId,
        title: payload.title,
        body: payload.body,
        data: payload.data,
        status: result.success ? 'sent' : 'failed',
        errorMessage: result.error,
        notificationId,
      });

      if (result.success) {
        sent++;
      } else {
        failed++;
        
        // Deactivate invalid tokens
        if (this.isInvalidTokenError(result.error)) {
          await this.prisma.deviceToken.update({
            where: { id: tokenId },
            data: { isActive: false },
          });
        }
      }
    }

    return { sent, failed };
  }

  /**
   * Send push to multiple users
   */
  async sendToUsers(
    userIds: string[],
    payload: PushPayload,
  ): Promise<{ sent: number; failed: number }> {
    let totalSent = 0;
    let totalFailed = 0;

    // Process in batches
    const batchSize = 100;
    for (let i = 0; i < userIds.length; i += batchSize) {
      const batch = userIds.slice(i, i + batchSize);
      
      const results = await Promise.all(
        batch.map((userId) => this.sendToUser(userId, payload)),
      );

      for (const result of results) {
        totalSent += result.sent;
        totalFailed += result.failed;
      }

      // Rate limiting
      if (i + batchSize < userIds.length) {
        await this.sleep(100);
      }
    }

    return { sent: totalSent, failed: totalFailed };
  }

  /**
   * Send to a specific device
   */
  private async sendToDevice(
    token: string,
    platform: string,
    payload: PushPayload,
  ): Promise<PushResult> {
    // Check if Expo token
    if (token.startsWith('ExponentPushToken')) {
      return this.sendViaExpo(token, payload);
    }

    // Otherwise use FCM
    return this.sendViaFCM(token, platform, payload);
  }

  // =====================================================
  // FIREBASE CLOUD MESSAGING
  // =====================================================

  private async sendViaFCM(
    token: string,
    platform: string,
    payload: PushPayload,
  ): Promise<PushResult> {
    try {
      const accessToken = await this.getFCMAccessToken();
      const projectId = this.configService.get('FCM_PROJECT_ID');

      const message: any = {
        token,
        notification: {
          title: payload.title,
          body: payload.body,
        },
        data: payload.data || {},
      };

      // Platform-specific config
      if (platform === 'android') {
        message.android = {
          notification: {
            icon: 'ic_notification',
            color: '#F59E0B',
            channelId: payload.channelId || 'default',
            sound: payload.sound || 'default',
          },
        };
      } else if (platform === 'ios') {
        message.apns = {
          payload: {
            aps: {
              badge: payload.badge,
              sound: payload.sound || 'default',
            },
          },
        };
      }

      if (payload.imageUrl) {
        message.notification.image = payload.imageUrl;
      }

      const response = await fetch(
        `${this.fcmUrl}/${projectId}/messages:send`,
        {
          method: 'POST',
          headers: {
            'Authorization': `Bearer ${accessToken}`,
            'Content-Type': 'application/json',
          },
          body: JSON.stringify({ message }),
        },
      );

      const data = await response.json();

      if (response.ok) {
        return { success: true, messageId: data.name };
      }

      return { success: false, error: data.error?.message || 'FCM error' };
    } catch (error: any) {
      this.logger.error(`FCM send failed: ${error.message}`);
      return { success: false, error: error.message };
    }
  }

  private async getFCMAccessToken(): Promise<string> {
    // Check cached token
    if (this.fcmAccessToken && Date.now() < this.fcmTokenExpiry) {
      return this.fcmAccessToken;
    }

    // Get new token using service account
    const serviceAccount = JSON.parse(
      this.configService.get('FCM_SERVICE_ACCOUNT') || '{}',
    );

    // In production, use google-auth-library
    // For now, return configured token
    const token = this.configService.get('FCM_ACCESS_TOKEN') || '';
    this.fcmAccessToken = token;
    this.fcmTokenExpiry = Date.now() + 3500 * 1000; // ~1 hour

    return token;
  }

  // =====================================================
  // EXPO PUSH NOTIFICATIONS
  // =====================================================

  private async sendViaExpo(
    token: string,
    payload: PushPayload,
  ): Promise<PushResult> {
    try {
      const message = {
        to: token,
        title: payload.title,
        body: payload.body,
        data: payload.data || {},
        sound: payload.sound || 'default',
        badge: payload.badge,
        channelId: payload.channelId || 'default',
      };

      const response = await fetch(this.expoUrl, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          'Accept': 'application/json',
        },
        body: JSON.stringify(message),
      });

      const result = await response.json();
      const ticket = result.data?.[0] || result;

      if (ticket.status === 'ok') {
        return { success: true, messageId: ticket.id };
      }

      return {
        success: false,
        error: ticket.message || ticket.details?.error || 'Expo error',
      };
    } catch (error: any) {
      this.logger.error(`Expo send failed: ${error.message}`);
      return { success: false, error: error.message };
    }
  }

  // =====================================================
  // HELPERS
  // =====================================================

  private async logPush(data: {
    userId?: string;
    deviceTokenId?: string;
    title: string;
    body: string;
    data?: Record<string, string>;
    status: string;
    errorMessage?: string;
    notificationId?: string;
  }): Promise<void> {
    await this.prisma.pushNotificationLog.create({
      data: {
        id: uuidv4(),
        userId: data.userId,
        deviceTokenId: data.deviceTokenId,
        title: data.title,
        body: data.body,
        data: data.data,
        provider: 'fcm',
        status: data.status,
        errorMessage: data.errorMessage,
        notificationId: data.notificationId,
      },
    });
  }

  private isInvalidTokenError(error?: string): boolean {
    if (!error) return false;
    const invalidErrors = [
      'NotRegistered',
      'InvalidRegistration',
      'DeviceNotRegistered',
      'InvalidToken',
    ];
    return invalidErrors.some((e) => error.includes(e));
  }

  private sleep(ms: number): Promise<void> {
    return new Promise((resolve) => setTimeout(resolve, ms));
  }
}
