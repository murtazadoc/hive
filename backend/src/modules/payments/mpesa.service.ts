import { Injectable, Logger, BadRequestException } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { PrismaService } from '../../prisma/prisma.service';
import { v4 as uuidv4 } from 'uuid';

// =====================================================
// TYPES
// =====================================================
export interface STKPushRequest {
  phoneNumber: string;
  amount: number;
  accountReference: string;
  description: string;
  orderId?: string;
  userId?: string;
  businessId?: string;
}

export interface STKPushResponse {
  success: boolean;
  checkoutRequestId?: string;
  merchantRequestId?: string;
  responseCode?: string;
  responseDescription?: string;
  customerMessage?: string;
  error?: string;
}

export interface STKCallback {
  MerchantRequestID: string;
  CheckoutRequestID: string;
  ResultCode: number;
  ResultDesc: string;
  CallbackMetadata?: {
    Item: Array<{ Name: string; Value: string | number }>;
  };
}

export interface B2CRequest {
  phoneNumber: string;
  amount: number;
  remarks: string;
  occasion?: string;
}

// =====================================================
// MPESA SERVICE
// =====================================================
@Injectable()
export class MpesaService {
  private readonly logger = new Logger(MpesaService.name);
  
  // M-Pesa API URLs
  private readonly sandboxUrl = 'https://sandbox.safaricom.co.ke';
  private readonly productionUrl = 'https://api.safaricom.co.ke';
  
  // Credentials
  private readonly consumerKey: string;
  private readonly consumerSecret: string;
  private readonly passKey: string;
  private readonly shortCode: string;
  private readonly initiatorName: string;
  private readonly initiatorPassword: string;
  private readonly callbackUrl: string;
  private readonly isProduction: boolean;

  constructor(
    private configService: ConfigService,
    private prisma: PrismaService,
  ) {
    this.consumerKey = this.configService.get('MPESA_CONSUMER_KEY') || '';
    this.consumerSecret = this.configService.get('MPESA_CONSUMER_SECRET') || '';
    this.passKey = this.configService.get('MPESA_PASSKEY') || '';
    this.shortCode = this.configService.get('MPESA_SHORTCODE') || '';
    this.initiatorName = this.configService.get('MPESA_INITIATOR_NAME') || '';
    this.initiatorPassword = this.configService.get('MPESA_INITIATOR_PASSWORD') || '';
    this.callbackUrl = this.configService.get('MPESA_CALLBACK_URL') || '';
    this.isProduction = this.configService.get('MPESA_ENVIRONMENT') === 'production';
  }

  private get baseUrl(): string {
    return this.isProduction ? this.productionUrl : this.sandboxUrl;
  }

  // =====================================================
  // AUTHENTICATION
  // =====================================================
  
  /**
   * Get OAuth access token from M-Pesa
   */
  async getAccessToken(): Promise<string> {
    const auth = Buffer.from(`${this.consumerKey}:${this.consumerSecret}`).toString('base64');

    const response = await fetch(
      `${this.baseUrl}/oauth/v1/generate?grant_type=client_credentials`,
      {
        method: 'GET',
        headers: {
          Authorization: `Basic ${auth}`,
        },
      },
    );

    if (!response.ok) {
      throw new Error(`Failed to get access token: ${response.statusText}`);
    }

    const data = await response.json();
    return data.access_token;
  }

  // =====================================================
  // STK PUSH (Lipa Na M-Pesa Online)
  // =====================================================
  
  /**
   * Initiate STK Push to customer's phone
   */
  async initiateSTKPush(request: STKPushRequest): Promise<STKPushResponse> {
    try {
      // Validate phone number
      const phone = this.formatPhoneNumber(request.phoneNumber);
      if (!phone) {
        return {
          success: false,
          error: 'Invalid phone number format',
        };
      }

      // Validate amount
      if (request.amount < 1 || request.amount > 150000) {
        return {
          success: false,
          error: 'Amount must be between KES 1 and KES 150,000',
        };
      }

      const accessToken = await this.getAccessToken();
      const timestamp = this.getTimestamp();
      const password = this.generatePassword(timestamp);

      const payload = {
        BusinessShortCode: this.shortCode,
        Password: password,
        Timestamp: timestamp,
        TransactionType: 'CustomerPayBillOnline',
        Amount: Math.round(request.amount),
        PartyA: phone,
        PartyB: this.shortCode,
        PhoneNumber: phone,
        CallBackURL: `${this.callbackUrl}/payments/mpesa/callback`,
        AccountReference: request.accountReference.slice(0, 12),
        TransactionDesc: request.description.slice(0, 13),
      };

      const response = await fetch(`${this.baseUrl}/mpesa/stkpush/v1/processrequest`, {
        method: 'POST',
        headers: {
          Authorization: `Bearer ${accessToken}`,
          'Content-Type': 'application/json',
        },
        body: JSON.stringify(payload),
      });

      const data = await response.json();

      if (data.ResponseCode === '0') {
        // Create pending transaction
        await this.createPendingTransaction({
          checkoutRequestId: data.CheckoutRequestID,
          merchantRequestId: data.MerchantRequestID,
          phoneNumber: phone,
          amount: request.amount,
          orderId: request.orderId,
          userId: request.userId,
          businessId: request.businessId,
          accountReference: request.accountReference,
        });

        return {
          success: true,
          checkoutRequestId: data.CheckoutRequestID,
          merchantRequestId: data.MerchantRequestID,
          responseCode: data.ResponseCode,
          responseDescription: data.ResponseDescription,
          customerMessage: data.CustomerMessage,
        };
      }

      return {
        success: false,
        responseCode: data.ResponseCode,
        responseDescription: data.ResponseDescription,
        error: data.errorMessage || data.ResponseDescription,
      };
    } catch (error: any) {
      this.logger.error(`STK Push failed: ${error.message}`);
      return {
        success: false,
        error: error.message || 'Failed to initiate payment',
      };
    }
  }

  /**
   * Check STK Push status
   */
  async querySTKPushStatus(checkoutRequestId: string): Promise<{
    completed: boolean;
    success?: boolean;
    resultCode?: number;
    resultDesc?: string;
  }> {
    try {
      const accessToken = await this.getAccessToken();
      const timestamp = this.getTimestamp();
      const password = this.generatePassword(timestamp);

      const response = await fetch(`${this.baseUrl}/mpesa/stkpushquery/v1/query`, {
        method: 'POST',
        headers: {
          Authorization: `Bearer ${accessToken}`,
          'Content-Type': 'application/json',
        },
        body: JSON.stringify({
          BusinessShortCode: this.shortCode,
          Password: password,
          Timestamp: timestamp,
          CheckoutRequestID: checkoutRequestId,
        }),
      });

      const data = await response.json();

      return {
        completed: data.ResultCode !== undefined,
        success: data.ResultCode === 0,
        resultCode: data.ResultCode,
        resultDesc: data.ResultDesc,
      };
    } catch (error: any) {
      this.logger.error(`STK Query failed: ${error.message}`);
      return { completed: false };
    }
  }

  /**
   * Process STK Push callback
   */
  async processSTKCallback(callback: STKCallback): Promise<void> {
    this.logger.log(`Processing STK callback: ${callback.CheckoutRequestID}`);

    // Store raw callback
    await this.prisma.mpesaCallback.create({
      data: {
        id: uuidv4(),
        checkoutRequestId: callback.CheckoutRequestID,
        merchantRequestId: callback.MerchantRequestID,
        resultCode: callback.ResultCode,
        resultDesc: callback.ResultDesc,
        rawCallback: callback as any,
      },
    });

    // Find pending transaction
    const transaction = await this.prisma.transaction.findFirst({
      where: {
        metadata: {
          path: ['checkoutRequestId'],
          equals: callback.CheckoutRequestID,
        },
        status: 'pending',
      },
    });

    if (!transaction) {
      this.logger.warn(`No pending transaction found for: ${callback.CheckoutRequestID}`);
      return;
    }

    if (callback.ResultCode === 0) {
      // Payment successful
      const metadata = callback.CallbackMetadata?.Item || [];
      const mpesaReceipt = metadata.find((i) => i.Name === 'MpesaReceiptNumber')?.Value as string;
      const amount = metadata.find((i) => i.Name === 'Amount')?.Value as number;
      const transactionDate = metadata.find((i) => i.Name === 'TransactionDate')?.Value as string;
      const phoneNumber = metadata.find((i) => i.Name === 'PhoneNumber')?.Value as string;

      await this.prisma.$transaction(async (tx) => {
        // Update transaction
        await tx.transaction.update({
          where: { id: transaction.id },
          data: {
            status: 'completed',
            mpesaReceipt,
            completedAt: new Date(),
            externalReference: mpesaReceipt,
          },
        });

        // Update order if applicable
        if (transaction.orderId) {
          await tx.order.update({
            where: { id: transaction.orderId },
            data: {
              paymentStatus: 'paid',
              status: 'paid',
              paidAt: new Date(),
            },
          });
        }

        // Credit business wallet if business payment
        if (transaction.businessId) {
          const wallet = await tx.wallet.findFirst({
            where: { userId: transaction.businessId }, // Assuming business owner's wallet
          });

          if (wallet) {
            const fee = transaction.fee || 0;
            const netAmount = transaction.amount - fee;
            
            await tx.wallet.update({
              where: { id: wallet.id },
              data: { balance: { increment: netAmount } },
            });
          }
        }

        // Mark callback as processed
        await tx.mpesaCallback.updateMany({
          where: { checkoutRequestId: callback.CheckoutRequestID },
          data: { processed: true, processedAt: new Date(), transactionId: transaction.id },
        });
      });

      this.logger.log(`Payment successful: ${mpesaReceipt}`);
    } else {
      // Payment failed
      await this.prisma.transaction.update({
        where: { id: transaction.id },
        data: {
          status: 'failed',
          failureReason: callback.ResultDesc,
        },
      });

      this.logger.log(`Payment failed: ${callback.ResultDesc}`);
    }
  }

  // =====================================================
  // B2C (Business to Customer - Payouts)
  // =====================================================

  /**
   * Send money to customer (B2C)
   */
  async sendToMobile(request: B2CRequest): Promise<{
    success: boolean;
    conversationId?: string;
    originatorConversationId?: string;
    error?: string;
  }> {
    try {
      const phone = this.formatPhoneNumber(request.phoneNumber);
      if (!phone) {
        return { success: false, error: 'Invalid phone number' };
      }

      const accessToken = await this.getAccessToken();

      const payload = {
        InitiatorName: this.initiatorName,
        SecurityCredential: this.getSecurityCredential(),
        CommandID: 'BusinessPayment',
        Amount: Math.round(request.amount),
        PartyA: this.shortCode,
        PartyB: phone,
        Remarks: request.remarks.slice(0, 100),
        QueueTimeOutURL: `${this.callbackUrl}/payments/mpesa/b2c/timeout`,
        ResultURL: `${this.callbackUrl}/payments/mpesa/b2c/result`,
        Occasion: request.occasion?.slice(0, 100) || '',
      };

      const response = await fetch(`${this.baseUrl}/mpesa/b2c/v1/paymentrequest`, {
        method: 'POST',
        headers: {
          Authorization: `Bearer ${accessToken}`,
          'Content-Type': 'application/json',
        },
        body: JSON.stringify(payload),
      });

      const data = await response.json();

      if (data.ResponseCode === '0') {
        return {
          success: true,
          conversationId: data.ConversationID,
          originatorConversationId: data.OriginatorConversationID,
        };
      }

      return {
        success: false,
        error: data.errorMessage || data.ResponseDescription,
      };
    } catch (error: any) {
      this.logger.error(`B2C failed: ${error.message}`);
      return { success: false, error: error.message };
    }
  }

  // =====================================================
  // HELPERS
  // =====================================================

  private formatPhoneNumber(phone: string): string | null {
    // Remove non-digits
    let cleaned = phone.replace(/\D/g, '');

    // Handle different formats
    if (cleaned.startsWith('0')) {
      cleaned = '254' + cleaned.slice(1);
    } else if (cleaned.startsWith('+')) {
      cleaned = cleaned.slice(1);
    } else if (!cleaned.startsWith('254')) {
      cleaned = '254' + cleaned;
    }

    // Validate Kenyan number
    if (!/^254[17]\d{8}$/.test(cleaned)) {
      return null;
    }

    return cleaned;
  }

  private getTimestamp(): string {
    const now = new Date();
    return now.toISOString().replace(/[-:T.Z]/g, '').slice(0, 14);
  }

  private generatePassword(timestamp: string): string {
    const data = `${this.shortCode}${this.passKey}${timestamp}`;
    return Buffer.from(data).toString('base64');
  }

  private getSecurityCredential(): string {
    // In production, encrypt initiator password with M-Pesa certificate
    // For sandbox, return base64 encoded password
    return Buffer.from(this.initiatorPassword).toString('base64');
  }

  private async createPendingTransaction(data: {
    checkoutRequestId: string;
    merchantRequestId: string;
    phoneNumber: string;
    amount: number;
    orderId?: string;
    userId?: string;
    businessId?: string;
    accountReference: string;
  }): Promise<void> {
    await this.prisma.transaction.create({
      data: {
        id: uuidv4(),
        reference: `TXN${Date.now()}`,
        type: data.orderId ? 'payment' : 'deposit',
        userId: data.userId,
        orderId: data.orderId,
        businessId: data.businessId,
        amount: data.amount,
        currency: 'KES',
        paymentMethod: 'mpesa',
        paymentChannel: 'stk_push',
        phoneNumber: data.phoneNumber,
        status: 'pending',
        metadata: {
          checkoutRequestId: data.checkoutRequestId,
          merchantRequestId: data.merchantRequestId,
          accountReference: data.accountReference,
        },
      },
    });
  }
}
