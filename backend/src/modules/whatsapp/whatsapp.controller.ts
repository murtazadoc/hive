import {
  Controller,
  Get,
  Post,
  Put,
  Body,
  Param,
  Query,
  Req,
  Res,
  UseGuards,
  HttpCode,
  HttpStatus,
} from '@nestjs/common';
import { Request, Response } from 'express';
import { ApiTags, ApiOperation, ApiBearerAuth } from '@nestjs/swagger';
import { JwtAuthGuard } from '../auth/guards/jwt-auth.guard';
import { Public, UserId } from '../auth/decorators/public.decorator';
import { WhatsAppService } from './whatsapp.service';
import { ConfigService } from '@nestjs/config';

// =====================================================
// SHARE LINKS CONTROLLER
// =====================================================
@ApiTags('share')
@Controller('share')
export class ShareController {
  constructor(private readonly whatsappService: WhatsAppService) {}

  /**
   * Create a share link
   */
  @Post()
  @UseGuards(JwtAuthGuard)
  @ApiBearerAuth()
  @ApiOperation({ summary: 'Create a shareable link' })
  async createShareLink(
    @UserId() userId: string,
    @Body() body: {
      targetType: 'product' | 'business' | 'reel' | 'collection';
      targetId: string;
      businessId?: string;
      utmSource?: string;
      utmMedium?: string;
      utmCampaign?: string;
    },
  ) {
    return this.whatsappService.createShareLink({
      ...body,
      createdBy: userId,
    });
  }

  /**
   * Resolve short link (redirect)
   */
  @Get(':code')
  @Public()
  @ApiOperation({ summary: 'Resolve share link and redirect' })
  async resolveShareLink(
    @Param('code') code: string,
    @Query('ref') referrer: string,
    @Req() req: Request,
    @Res() res: Response,
  ) {
    try {
      const result = await this.whatsappService.resolveShareLink(code, {
        referrer: referrer || 'direct',
        sessionId: req.cookies?.sessionId,
        deviceType: this.getDeviceType(req.headers['user-agent'] || ''),
        platform: this.getPlatform(req.headers['user-agent'] || ''),
      });

      // Redirect to target
      return res.redirect(302, result.redirectUrl);
    } catch (error) {
      // Redirect to home on error
      return res.redirect(302, '/');
    }
  }

  /**
   * Get share link info (for preview)
   */
  @Get(':code/info')
  @Public()
  @ApiOperation({ summary: 'Get share link metadata' })
  async getShareLinkInfo(@Param('code') code: string) {
    const result = await this.whatsappService.resolveShareLink(code);
    return {
      targetType: result.targetType,
      targetId: result.targetId,
    };
  }

  /**
   * Track conversion
   */
  @Post(':code/convert')
  @Public()
  @HttpCode(HttpStatus.OK)
  @ApiOperation({ summary: 'Track conversion from share link' })
  async trackConversion(
    @Param('code') code: string,
    @Body() body: { sessionId: string; conversionType: string },
  ) {
    await this.whatsappService.trackConversion(code, body.sessionId, body.conversionType);
    return { success: true };
  }

  private getDeviceType(userAgent: string): string {
    if (/mobile/i.test(userAgent)) return 'mobile';
    if (/tablet/i.test(userAgent)) return 'tablet';
    return 'desktop';
  }

  private getPlatform(userAgent: string): string {
    if (/android/i.test(userAgent)) return 'android';
    if (/iphone|ipad/i.test(userAgent)) return 'ios';
    if (/windows/i.test(userAgent)) return 'windows';
    if (/mac/i.test(userAgent)) return 'macos';
    return 'other';
  }
}

// =====================================================
// WHATSAPP CONTROLLER
// =====================================================
@ApiTags('whatsapp')
@Controller('whatsapp')
export class WhatsAppController {
  constructor(
    private readonly whatsappService: WhatsAppService,
    private readonly configService: ConfigService,
  ) {}

  /**
   * Get WhatsApp URL for a business
   */
  @Get('business/:businessId/url')
  @Public()
  @ApiOperation({ summary: 'Get WhatsApp click-to-chat URL' })
  async getBusinessWhatsAppUrl(
    @Param('businessId') businessId: string,
    @Query('productId') productId?: string,
    @Query('productName') productName?: string,
  ) {
    const url = await this.whatsappService.getBusinessWhatsAppUrl(businessId, {
      productId,
      productName,
    });
    return { url };
  }

  /**
   * Get WhatsApp URL for product inquiry
   */
  @Get('product/:productId/inquiry')
  @Public()
  @ApiOperation({ summary: 'Get WhatsApp URL for product inquiry' })
  async getProductInquiryUrl(@Param('productId') productId: string) {
    const url = await this.whatsappService.getProductInquiryUrl(productId);
    return { url };
  }

  /**
   * Webhook verification (GET)
   */
  @Get('webhook')
  @Public()
  @ApiOperation({ summary: 'WhatsApp webhook verification' })
  verifyWebhook(
    @Query('hub.mode') mode: string,
    @Query('hub.verify_token') token: string,
    @Query('hub.challenge') challenge: string,
    @Res() res: Response,
  ) {
    const verifyToken = this.configService.get('WHATSAPP_VERIFY_TOKEN');

    if (mode === 'subscribe' && token === verifyToken) {
      return res.status(200).send(challenge);
    }

    return res.status(403).send('Forbidden');
  }

  /**
   * Webhook handler (POST)
   */
  @Post('webhook')
  @Public()
  @HttpCode(HttpStatus.OK)
  @ApiOperation({ summary: 'WhatsApp webhook handler' })
  async handleWebhook(@Body() payload: any) {
    // Process asynchronously
    this.whatsappService.handleWebhook(payload).catch((error) => {
      console.error('Webhook processing error:', error);
    });

    return { status: 'ok' };
  }
}

// =====================================================
// BUSINESS WHATSAPP SETTINGS CONTROLLER
// =====================================================
@ApiTags('business-whatsapp')
@Controller('businesses/:businessId/whatsapp')
@UseGuards(JwtAuthGuard)
@ApiBearerAuth()
export class BusinessWhatsAppController {
  constructor(private readonly whatsappService: WhatsAppService) {}

  /**
   * Get WhatsApp settings
   */
  @Get('settings')
  @ApiOperation({ summary: 'Get WhatsApp settings' })
  async getSettings(@Param('businessId') businessId: string) {
    return this.whatsappService.getSettings(businessId);
  }

  /**
   * Update WhatsApp settings
   */
  @Put('settings')
  @ApiOperation({ summary: 'Update WhatsApp settings' })
  async updateSettings(
    @Param('businessId') businessId: string,
    @Body() body: {
      phoneNumber?: string;
      autoReplyEnabled?: boolean;
      workingHours?: any;
      greetingMessage?: string;
      awayMessage?: string;
    },
  ) {
    return this.whatsappService.updateSettings(businessId, body);
  }

  /**
   * Get message templates
   */
  @Get('templates')
  @ApiOperation({ summary: 'Get message templates' })
  async getTemplates(@Param('businessId') businessId: string) {
    return this.whatsappService.getTemplates(businessId);
  }

  /**
   * Create message template
   */
  @Post('templates')
  @ApiOperation({ summary: 'Create message template' })
  async createTemplate(
    @Param('businessId') businessId: string,
    @Body() body: {
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
    return this.whatsappService.createTemplate(businessId, body);
  }

  /**
   * Get conversations
   */
  @Get('conversations')
  @ApiOperation({ summary: 'Get WhatsApp conversations' })
  async getConversations(
    @Param('businessId') businessId: string,
    @Query('status') status?: string,
    @Query('limit') limit?: number,
    @Query('cursor') cursor?: string,
  ) {
    return this.whatsappService.getConversations(businessId, {
      status,
      limit,
      cursor,
    });
  }

  /**
   * Get messages for a conversation
   */
  @Get('conversations/:conversationId/messages')
  @ApiOperation({ summary: 'Get conversation messages' })
  async getMessages(
    @Param('conversationId') conversationId: string,
    @Query('limit') limit?: number,
    @Query('cursor') cursor?: string,
  ) {
    return this.whatsappService.getMessages(conversationId, limit, cursor);
  }
}
