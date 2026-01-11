import {
  Injectable,
  Logger,
  NotFoundException,
  BadRequestException,
} from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { PrismaService } from '../../prisma/prisma.service';
import { v4 as uuidv4 } from 'uuid';

// =====================================================
// TYPES
// =====================================================
export interface ShareLinkData {
  targetType: 'product' | 'business' | 'reel' | 'collection';
  targetId: string;
  businessId?: string;
  createdBy?: string;
  utmSource?: string;
  utmMedium?: string;
  utmCampaign?: string;
  expiresAt?: Date;
}

export interface WhatsAppMessage {
  to: string;
  type: 'text' | 'template' | 'interactive' | 'image';
  text?: string;
  templateName?: string;
  templateVariables?: Record<string, string>;
  imageUrl?: string;
  buttons?: Array<{ id: string; title: string }>;
}

export interface ShareCardData {
  title: string;
  description: string;
  imageUrl?: string;
  price?: number;
  businessName: string;
  shareUrl: string;
}

// =====================================================
// WHATSAPP SERVICE
// =====================================================
@Injectable()
export class WhatsAppService {
  private readonly logger = new Logger(WhatsAppService.name);
  private readonly baseUrl: string;
  private readonly metaApiUrl = 'https://graph.facebook.com/v18.0';

  constructor(
    private configService: ConfigService,
    private prisma: PrismaService,
  ) {
    this.baseUrl = this.configService.get('APP_URL') || 'https://hive.co.ke';
  }

  // =====================================================
  // SHARE LINKS (Deep Linking)
  // =====================================================

  /**
   * Create a shareable short link
   */
  async createShareLink(data: ShareLinkData): Promise<{
    code: string;
    shortUrl: string;
    whatsappUrl: string;
    shareCard: ShareCardData;
  }> {
    // Generate unique code
    let code: string;
    let attempts = 0;
    
    do {
      code = this.generateCode();
      const existing = await this.prisma.shareLink.findUnique({ where: { code } });
      if (!existing) break;
      attempts++;
    } while (attempts < 10);

    if (attempts >= 10) {
      throw new BadRequestException('Failed to generate unique code');
    }

    // Create share link
    await this.prisma.shareLink.create({
      data: {
        id: uuidv4(),
        code,
        targetType: data.targetType,
        targetId: data.targetId,
        businessId: data.businessId,
        createdBy: data.createdBy,
        utmSource: data.utmSource,
        utmMedium: data.utmMedium,
        utmCampaign: data.utmCampaign,
        expiresAt: data.expiresAt,
      },
    });

    // Build URLs
    const shortUrl = `${this.baseUrl}/s/${code}`;
    
    // Get share card data
    const shareCard = await this.buildShareCard(data.targetType, data.targetId, shortUrl);
    
    // Build WhatsApp share URL
    const whatsappMessage = this.formatWhatsAppMessage(shareCard);
    const whatsappUrl = `https://wa.me/?text=${encodeURIComponent(whatsappMessage)}`;

    return {
      code,
      shortUrl,
      whatsappUrl,
      shareCard,
    };
  }

  /**
   * Resolve short link and track click
   */
  async resolveShareLink(
    code: string,
    trackingData?: {
      referrer?: string;
      userId?: string;
      sessionId?: string;
      deviceType?: string;
      platform?: string;
      country?: string;
    },
  ): Promise<{
    targetType: string;
    targetId: string;
    redirectUrl: string;
  }> {
    const link = await this.prisma.shareLink.findUnique({
      where: { code },
    });

    if (!link) {
      throw new NotFoundException('Link not found');
    }

    if (link.expiresAt && link.expiresAt < new Date()) {
      throw new BadRequestException('Link has expired');
    }

    // Track click
    await this.prisma.shareClick.create({
      data: {
        id: uuidv4(),
        shareLinkId: link.id,
        referrer: trackingData?.referrer,
        userId: trackingData?.userId,
        sessionId: trackingData?.sessionId,
        deviceType: trackingData?.deviceType,
        platform: trackingData?.platform,
        country: trackingData?.country,
      },
    });

    // Increment click count
    await this.prisma.shareLink.update({
      where: { id: link.id },
      data: { clickCount: { increment: 1 } },
    });

    // Build redirect URL
    const redirectUrl = this.buildRedirectUrl(link.targetType, link.targetId, link);

    return {
      targetType: link.targetType,
      targetId: link.targetId,
      redirectUrl,
    };
  }

  /**
   * Track conversion from share link
   */
  async trackConversion(
    code: string,
    sessionId: string,
    conversionType: string,
  ): Promise<void> {
    const link = await this.prisma.shareLink.findUnique({
      where: { code },
    });

    if (!link) return;

    await this.prisma.shareClick.updateMany({
      where: {
        shareLinkId: link.id,
        sessionId,
        converted: false,
      },
      data: {
        converted: true,
        conversionType,
        conversionAt: new Date(),
      },
    });
  }

  // =====================================================
  // WHATSAPP CLICK-TO-CHAT
  // =====================================================

  /**
   * Generate WhatsApp click-to-chat URL for a business
   */
  async getBusinessWhatsAppUrl(
    businessId: string,
    context?: {
      productId?: string;
      productName?: string;
      message?: string;
    },
  ): Promise<string> {
    const settings = await this.prisma.whatsAppSettings.findUnique({
      where: { businessId },
    });

    if (!settings) {
      // Fallback to business phone
      const business = await this.prisma.businessProfile.findUnique({
        where: { id: businessId },
        select: { whatsappNumber: true, phone: true },
      });

      if (!business?.whatsappNumber && !business?.phone) {
        throw new NotFoundException('No WhatsApp number configured');
      }

      const phone = (business.whatsappNumber || business.phone).replace(/\D/g, '');
      return this.buildWhatsAppUrl(phone, context);
    }

    const phone = `${settings.countryCode}${settings.phoneNumber}`.replace(/\D/g, '');
    return this.buildWhatsAppUrl(phone, context);
  }

  /**
   * Generate pre-filled message for product inquiry
   */
  async getProductInquiryUrl(productId: string): Promise<string> {
    const product = await this.prisma.product.findUnique({
      where: { id: productId },
      include: {
        business: {
          select: { id: true, whatsappNumber: true, phone: true },
        },
      },
    });

    if (!product) {
      throw new NotFoundException('Product not found');
    }

    const phone = (product.business.whatsappNumber || product.business.phone || '').replace(/\D/g, '');
    
    if (!phone) {
      throw new NotFoundException('No WhatsApp number for this business');
    }

    const message = `Hi! I'm interested in:\n\n*${product.name}*\nPrice: KES ${product.price?.toLocaleString()}\n\nIs this still available?`;

    return `https://wa.me/${phone}?text=${encodeURIComponent(message)}`;
  }

  // =====================================================
  // BUSINESS WHATSAPP SETTINGS
  // =====================================================

  /**
   * Get or create WhatsApp settings for a business
   */
  async getSettings(businessId: string) {
    let settings = await this.prisma.whatsAppSettings.findUnique({
      where: { businessId },
    });

    if (!settings) {
      // Return default structure
      return {
        businessId,
        phoneNumber: null,
        isVerified: false,
        autoReplyEnabled: true,
        workingHours: this.getDefaultWorkingHours(),
        greetingMessage: 'Hello! Thanks for contacting us. How can we help you today?',
        awayMessage: "Thanks for your message! We're currently away but will respond as soon as we're back.",
      };
    }

    return settings;
  }

  /**
   * Update WhatsApp settings
   */
  async updateSettings(
    businessId: string,
    updates: {
      phoneNumber?: string;
      autoReplyEnabled?: boolean;
      workingHours?: any;
      greetingMessage?: string;
      awayMessage?: string;
    },
  ) {
    return this.prisma.whatsAppSettings.upsert({
      where: { businessId },
      create: {
        id: uuidv4(),
        businessId,
        phoneNumber: updates.phoneNumber || '',
        ...updates,
      },
      update: updates,
    });
  }

  // =====================================================
  // MESSAGE TEMPLATES
  // =====================================================

  /**
   * Create a message template
   */
  async createTemplate(
    businessId: string,
    data: {
      name: string;
      category: string;
      bodyText: string;
      headerType?: string;
      headerContent?: string;
      footerText?: string;
      buttons?: any[];
      variables?: string[];
    },
  ) {
    return this.prisma.whatsAppTemplate.create({
      data: {
        id: uuidv4(),
        businessId,
        ...data,
      },
    });
  }

  /**
   * Get templates for a business
   */
  async getTemplates(businessId: string) {
    return this.prisma.whatsAppTemplate.findMany({
      where: { businessId, isActive: true },
      orderBy: { createdAt: 'desc' },
    });
  }

  /**
   * Render template with variables
   */
  renderTemplate(template: any, variables: Record<string, string>): string {
    let text = template.bodyText;
    
    for (const [key, value] of Object.entries(variables)) {
      text = text.replace(new RegExp(`{{${key}}}`, 'g'), value);
    }

    return text;
  }

  // =====================================================
  // CONVERSATIONS (for Business API)
  // =====================================================

  /**
   * Get or create conversation
   */
  async getOrCreateConversation(
    businessId: string,
    customerPhone: string,
    context?: { type?: string; id?: string; source?: string },
  ) {
    let conversation = await this.prisma.whatsAppConversation.findUnique({
      where: { businessId_customerPhone: { businessId, customerPhone } },
    });

    if (!conversation) {
      conversation = await this.prisma.whatsAppConversation.create({
        data: {
          id: uuidv4(),
          businessId,
          customerPhone,
          contextType: context?.type,
          contextId: context?.id,
          source: context?.source,
        },
      });
    }

    return conversation;
  }

  /**
   * Get conversations for a business
   */
  async getConversations(
    businessId: string,
    filters?: {
      status?: string;
      assignedTo?: string;
      limit?: number;
      cursor?: string;
    },
  ) {
    return this.prisma.whatsAppConversation.findMany({
      where: {
        businessId,
        ...(filters?.status && { status: filters.status }),
        ...(filters?.assignedTo && { assignedTo: filters.assignedTo }),
      },
      orderBy: { lastMessageAt: 'desc' },
      take: filters?.limit || 20,
      ...(filters?.cursor && {
        skip: 1,
        cursor: { id: filters.cursor },
      }),
    });
  }

  /**
   * Get messages for a conversation
   */
  async getMessages(conversationId: string, limit: number = 50, cursor?: string) {
    return this.prisma.whatsAppMessage.findMany({
      where: { conversationId },
      orderBy: { createdAt: 'desc' },
      take: limit,
      ...(cursor && {
        skip: 1,
        cursor: { id: cursor },
      }),
    });
  }

  // =====================================================
  // WEBHOOK HANDLING (for Business API)
  // =====================================================

  /**
   * Handle incoming webhook from Meta
   */
  async handleWebhook(payload: any): Promise<void> {
    const entry = payload.entry?.[0];
    if (!entry) return;

    const changes = entry.changes?.[0];
    if (!changes) return;

    const value = changes.value;

    // Handle message
    if (value.messages) {
      for (const message of value.messages) {
        await this.handleIncomingMessage(value.metadata.phone_number_id, message);
      }
    }

    // Handle status updates
    if (value.statuses) {
      for (const status of value.statuses) {
        await this.handleStatusUpdate(status);
      }
    }
  }

  /**
   * Handle incoming message
   */
  private async handleIncomingMessage(phoneNumberId: string, message: any): Promise<void> {
    // Find business by phone number ID
    const settings = await this.prisma.whatsAppSettings.findFirst({
      where: { phoneNumberId },
    });

    if (!settings) {
      this.logger.warn(`No business found for phone number ID: ${phoneNumberId}`);
      return;
    }

    // Get or create conversation
    const conversation = await this.getOrCreateConversation(
      settings.businessId,
      message.from,
    );

    // Store message
    await this.prisma.whatsAppMessage.create({
      data: {
        id: uuidv4(),
        conversationId: conversation.id,
        waMessageId: message.id,
        direction: 'inbound',
        messageType: message.type,
        content: message.text?.body || message.caption || null,
        mediaUrl: this.extractMediaUrl(message),
      },
    });

    // Send auto-reply if enabled
    if (settings.autoReplyEnabled) {
      const isWithinHours = this.isWithinWorkingHours(settings.workingHours);
      const replyMessage = isWithinHours ? settings.greetingMessage : settings.awayMessage;

      if (conversation.messageCount === 0) {
        // Only auto-reply on first message
        await this.sendTextMessage(settings, message.from, replyMessage || '');
      }
    }
  }

  /**
   * Handle message status update
   */
  private async handleStatusUpdate(status: any): Promise<void> {
    const updateData: any = { status: status.status };

    if (status.status === 'delivered') {
      updateData.deliveredAt = new Date(parseInt(status.timestamp) * 1000);
    } else if (status.status === 'read') {
      updateData.readAt = new Date(parseInt(status.timestamp) * 1000);
    }

    await this.prisma.whatsAppMessage.updateMany({
      where: { waMessageId: status.id },
      data: updateData,
    });
  }

  // =====================================================
  // SEND MESSAGES (Business API)
  // =====================================================

  /**
   * Send text message
   */
  async sendTextMessage(
    settings: any,
    to: string,
    text: string,
    conversationId?: string,
  ): Promise<string | null> {
    if (!settings.phoneNumberId || !settings.accessTokenEncrypted) {
      this.logger.warn('Business API not configured');
      return null;
    }

    try {
      const response = await fetch(
        `${this.metaApiUrl}/${settings.phoneNumberId}/messages`,
        {
          method: 'POST',
          headers: {
            'Authorization': `Bearer ${this.decryptToken(settings.accessTokenEncrypted)}`,
            'Content-Type': 'application/json',
          },
          body: JSON.stringify({
            messaging_product: 'whatsapp',
            recipient_type: 'individual',
            to,
            type: 'text',
            text: { body: text },
          }),
        },
      );

      const data = await response.json();

      if (data.messages?.[0]?.id) {
        // Store outbound message
        if (conversationId) {
          await this.prisma.whatsAppMessage.create({
            data: {
              id: uuidv4(),
              conversationId,
              waMessageId: data.messages[0].id,
              direction: 'outbound',
              messageType: 'text',
              content: text,
            },
          });
        }
        return data.messages[0].id;
      }

      return null;
    } catch (error: any) {
      this.logger.error(`Failed to send WhatsApp message: ${error.message}`);
      return null;
    }
  }

  // =====================================================
  // HELPERS
  // =====================================================

  private generateCode(): string {
    const chars = 'abcdefghijklmnopqrstuvwxyzABCDEFGHIJKLMNOPQRSTUVWXYZ0123456789';
    let code = '';
    for (let i = 0; i < 8; i++) {
      code += chars.charAt(Math.floor(Math.random() * chars.length));
    }
    return code;
  }

  private async buildShareCard(
    targetType: string,
    targetId: string,
    shareUrl: string,
  ): Promise<ShareCardData> {
    switch (targetType) {
      case 'product': {
        const product = await this.prisma.product.findUnique({
          where: { id: targetId },
          include: {
            business: { select: { businessName: true } },
            images: { where: { isPrimary: true }, take: 1 },
          },
        });

        return {
          title: product?.name || 'Product',
          description: product?.shortDescription || product?.description?.slice(0, 100) || '',
          imageUrl: product?.images[0]?.url,
          price: product?.price,
          businessName: product?.business.businessName || '',
          shareUrl,
        };
      }

      case 'business': {
        const business = await this.prisma.businessProfile.findUnique({
          where: { id: targetId },
        });

        return {
          title: business?.businessName || 'Business',
          description: business?.description?.slice(0, 100) || business?.tagline || '',
          imageUrl: business?.logoUrl || undefined,
          businessName: business?.businessName || '',
          shareUrl,
        };
      }

      case 'reel': {
        const reel = await this.prisma.reel.findUnique({
          where: { id: targetId },
          include: { business: { select: { businessName: true } } },
        });

        return {
          title: reel?.caption?.slice(0, 50) || 'Check out this video!',
          description: reel?.caption || '',
          imageUrl: reel?.thumbnailUrl || undefined,
          businessName: reel?.business.businessName || '',
          shareUrl,
        };
      }

      default:
        return {
          title: 'Check this out on Hive!',
          description: 'Discover great products and services',
          businessName: 'Hive',
          shareUrl,
        };
    }
  }

  private formatWhatsAppMessage(card: ShareCardData): string {
    let message = `🐝 *${card.title}*\n\n`;
    
    if (card.description) {
      message += `${card.description}\n\n`;
    }

    if (card.price) {
      message += `💰 KES ${card.price.toLocaleString()}\n\n`;
    }

    message += `🏪 ${card.businessName}\n\n`;
    message += `👉 ${card.shareUrl}`;

    return message;
  }

  private buildWhatsAppUrl(
    phone: string,
    context?: { productId?: string; productName?: string; message?: string },
  ): string {
    let message = context?.message || '';

    if (!message && context?.productName) {
      message = `Hi! I'm interested in: ${context.productName}`;
    }

    if (message) {
      return `https://wa.me/${phone}?text=${encodeURIComponent(message)}`;
    }

    return `https://wa.me/${phone}`;
  }

  private buildRedirectUrl(targetType: string, targetId: string, link: any): string {
    const utmParams = [];
    if (link.utmSource) utmParams.push(`utm_source=${link.utmSource}`);
    if (link.utmMedium) utmParams.push(`utm_medium=${link.utmMedium}`);
    if (link.utmCampaign) utmParams.push(`utm_campaign=${link.utmCampaign}`);
    
    const utm = utmParams.length ? `?${utmParams.join('&')}` : '';

    switch (targetType) {
      case 'product':
        return `${this.baseUrl}/products/${targetId}${utm}`;
      case 'business':
        return `${this.baseUrl}/businesses/${targetId}${utm}`;
      case 'reel':
        return `${this.baseUrl}/reels/${targetId}${utm}`;
      default:
        return `${this.baseUrl}${utm}`;
    }
  }

  private getDefaultWorkingHours() {
    return {
      monday: { start: '08:00', end: '18:00', enabled: true },
      tuesday: { start: '08:00', end: '18:00', enabled: true },
      wednesday: { start: '08:00', end: '18:00', enabled: true },
      thursday: { start: '08:00', end: '18:00', enabled: true },
      friday: { start: '08:00', end: '18:00', enabled: true },
      saturday: { start: '09:00', end: '14:00', enabled: true },
      sunday: { start: null, end: null, enabled: false },
    };
  }

  private isWithinWorkingHours(workingHours: any): boolean {
    const now = new Date();
    const days = ['sunday', 'monday', 'tuesday', 'wednesday', 'thursday', 'friday', 'saturday'];
    const today = days[now.getDay()];
    const hours = workingHours?.[today];

    if (!hours?.enabled || !hours.start || !hours.end) {
      return false;
    }

    const currentTime = `${now.getHours().toString().padStart(2, '0')}:${now.getMinutes().toString().padStart(2, '0')}`;
    return currentTime >= hours.start && currentTime <= hours.end;
  }

  private extractMediaUrl(message: any): string | null {
    if (message.image) return message.image.url || null;
    if (message.video) return message.video.url || null;
    if (message.audio) return message.audio.url || null;
    if (message.document) return message.document.url || null;
    return null;
  }

  private decryptToken(encrypted: string): string {
    // In production, use proper encryption/decryption
    // For now, return as-is (assume stored in plain text for development)
    return encrypted;
  }
}
