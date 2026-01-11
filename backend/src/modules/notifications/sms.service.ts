import { Injectable, Logger } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { PrismaService } from '../../prisma/prisma.service';
import { v4 as uuidv4 } from 'uuid';

// =====================================================
// TYPES
// =====================================================
export interface SMSResult {
  success: boolean;
  messageId?: string;
  cost?: number;
  error?: string;
}

// =====================================================
// SMS SERVICE (Africa's Talking)
// =====================================================
@Injectable()
export class SMSService {
  private readonly logger = new Logger(SMSService.name);
  private readonly apiUrl = 'https://api.africastalking.com/version1/messaging';
  private readonly sandboxUrl = 'https://api.sandbox.africastalking.com/version1/messaging';

  private readonly apiKey: string;
  private readonly username: string;
  private readonly senderId: string;
  private readonly isProduction: boolean;

  constructor(
    private configService: ConfigService,
    private prisma: PrismaService,
  ) {
    this.apiKey = this.configService.get('AT_API_KEY') || '';
    this.username = this.configService.get('AT_USERNAME') || 'sandbox';
    this.senderId = this.configService.get('AT_SENDER_ID') || 'HIVE';
    this.isProduction = this.configService.get('AT_ENVIRONMENT') === 'production';
  }

  private get baseUrl(): string {
    return this.isProduction ? this.apiUrl : this.sandboxUrl;
  }

  // =====================================================
  // SEND SMS
  // =====================================================

  /**
   * Send SMS to a single number
   */
  async send(
    phoneNumber: string,
    message: string,
    options?: {
      userId?: string;
      notificationId?: string;
    },
  ): Promise<SMSResult> {
    const formattedNumber = this.formatPhoneNumber(phoneNumber);
    
    if (!formattedNumber) {
      return { success: false, error: 'Invalid phone number' };
    }

    // Check message length (SMS max 160 chars, or 70 for Unicode)
    const isUnicode = /[^\x00-\x7F]/.test(message);
    const maxLength = isUnicode ? 70 : 160;
    const truncatedMessage = message.length > maxLength * 3 
      ? message.slice(0, maxLength * 3 - 3) + '...'
      : message;

    try {
      const response = await fetch(this.baseUrl, {
        method: 'POST',
        headers: {
          'apiKey': this.apiKey,
          'Content-Type': 'application/x-www-form-urlencoded',
          'Accept': 'application/json',
        },
        body: new URLSearchParams({
          username: this.username,
          to: formattedNumber,
          message: truncatedMessage,
          from: this.senderId,
        }),
      });

      const data = await response.json();
      const recipient = data.SMSMessageData?.Recipients?.[0];

      // Log to database
      const smsRecord = await this.logSMS({
        phoneNumber: formattedNumber,
        message: truncatedMessage,
        userId: options?.userId,
        notificationId: options?.notificationId,
        status: recipient?.status === 'Success' ? 'sent' : 'failed',
        messageId: recipient?.messageId,
        cost: parseFloat(recipient?.cost?.replace('KES ', '') || '0'),
        error: recipient?.status !== 'Success' ? recipient?.status : undefined,
      });

      if (recipient?.status === 'Success') {
        return {
          success: true,
          messageId: recipient.messageId,
          cost: parseFloat(recipient.cost?.replace('KES ', '') || '0'),
        };
      }

      return {
        success: false,
        error: recipient?.status || data.SMSMessageData?.Message || 'Send failed',
      };
    } catch (error: any) {
      this.logger.error(`SMS send failed: ${error.message}`);
      
      await this.logSMS({
        phoneNumber: formattedNumber,
        message: truncatedMessage,
        userId: options?.userId,
        notificationId: options?.notificationId,
        status: 'failed',
        error: error.message,
      });

      return { success: false, error: error.message };
    }
  }

  /**
   * Send SMS to multiple numbers
   */
  async sendBulk(
    phoneNumbers: string[],
    message: string,
  ): Promise<{ sent: number; failed: number; cost: number }> {
    const formattedNumbers = phoneNumbers
      .map((n) => this.formatPhoneNumber(n))
      .filter((n): n is string => n !== null);

    if (formattedNumbers.length === 0) {
      return { sent: 0, failed: phoneNumbers.length, cost: 0 };
    }

    try {
      const response = await fetch(this.baseUrl, {
        method: 'POST',
        headers: {
          'apiKey': this.apiKey,
          'Content-Type': 'application/x-www-form-urlencoded',
          'Accept': 'application/json',
        },
        body: new URLSearchParams({
          username: this.username,
          to: formattedNumbers.join(','),
          message,
          from: this.senderId,
        }),
      });

      const data = await response.json();
      const recipients = data.SMSMessageData?.Recipients || [];

      let sent = 0;
      let failed = 0;
      let totalCost = 0;

      for (const recipient of recipients) {
        if (recipient.status === 'Success') {
          sent++;
          totalCost += parseFloat(recipient.cost?.replace('KES ', '') || '0');
        } else {
          failed++;
        }
      }

      return { sent, failed: failed + (phoneNumbers.length - formattedNumbers.length), cost: totalCost };
    } catch (error: any) {
      this.logger.error(`Bulk SMS failed: ${error.message}`);
      return { sent: 0, failed: phoneNumbers.length, cost: 0 };
    }
  }

  /**
   * Send OTP SMS
   */
  async sendOTP(phoneNumber: string, otp: string): Promise<SMSResult> {
    const message = `Your HIVE verification code is: ${otp}. Valid for 5 minutes. Do not share this code.`;
    return this.send(phoneNumber, message);
  }

  /**
   * Send order notification
   */
  async sendOrderNotification(
    phoneNumber: string,
    orderNumber: string,
    status: string,
    amount?: number,
  ): Promise<SMSResult> {
    let message: string;

    switch (status) {
      case 'confirmed':
        message = `HIVE: Your order #${orderNumber} is confirmed! Total: KES ${amount?.toLocaleString()}. Track at hive.co.ke/orders`;
        break;
      case 'shipped':
        message = `HIVE: Your order #${orderNumber} is on the way! Track delivery at hive.co.ke/orders`;
        break;
      case 'delivered':
        message = `HIVE: Order #${orderNumber} delivered! Thank you for shopping with HIVE.`;
        break;
      default:
        message = `HIVE: Order #${orderNumber} update: ${status}`;
    }

    return this.send(phoneNumber, message);
  }

  // =====================================================
  // HELPERS
  // =====================================================

  private formatPhoneNumber(phone: string): string | null {
    let cleaned = phone.replace(/\D/g, '');

    if (cleaned.startsWith('0')) {
      cleaned = '254' + cleaned.slice(1);
    } else if (!cleaned.startsWith('254')) {
      cleaned = '254' + cleaned;
    }

    // Validate Kenyan number
    if (!/^254[17]\d{8}$/.test(cleaned)) {
      return null;
    }

    return '+' + cleaned;
  }

  private async logSMS(data: {
    phoneNumber: string;
    message: string;
    userId?: string;
    notificationId?: string;
    status: string;
    messageId?: string;
    cost?: number;
    error?: string;
  }): Promise<void> {
    await this.prisma.smsMessage.create({
      data: {
        id: uuidv4(),
        phoneNumber: data.phoneNumber,
        message: data.message,
        userId: data.userId,
        notificationId: data.notificationId,
        provider: 'africastalking',
        providerMessageId: data.messageId,
        status: data.status,
        cost: data.cost,
        errorMessage: data.error,
      },
    });
  }

  // =====================================================
  // DELIVERY REPORTS (Webhook)
  // =====================================================

  async handleDeliveryReport(report: {
    id: string;
    status: string;
    phoneNumber: string;
    failureReason?: string;
  }): Promise<void> {
    await this.prisma.smsMessage.updateMany({
      where: { providerMessageId: report.id },
      data: {
        status: this.mapDeliveryStatus(report.status),
        statusUpdatedAt: new Date(),
        errorMessage: report.failureReason,
      },
    });
  }

  private mapDeliveryStatus(atStatus: string): string {
    const statusMap: Record<string, string> = {
      'Success': 'delivered',
      'Sent': 'sent',
      'Buffered': 'pending',
      'Rejected': 'failed',
      'Failed': 'failed',
    };
    return statusMap[atStatus] || 'unknown';
  }
}
