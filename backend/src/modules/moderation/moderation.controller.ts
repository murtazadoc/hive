import {
  Controller,
  Get,
  Post,
  Body,
  Param,
  Query,
  UseGuards,
  HttpCode,
  HttpStatus,
} from '@nestjs/common';
import { ApiTags, ApiOperation, ApiBearerAuth } from '@nestjs/swagger';
import { JwtAuthGuard } from '../auth/guards/jwt-auth.guard';
import { UserId } from '../auth/decorators/public.decorator';
import { ModerationService } from './moderation.service';

// =====================================================
// ADMIN MODERATION CONTROLLER
// =====================================================
@ApiTags('admin-moderation')
@Controller('admin/moderation')
@UseGuards(JwtAuthGuard)
@ApiBearerAuth()
export class AdminModerationController {
  constructor(private readonly moderationService: ModerationService) {}

  // =====================================================
  // QUEUE
  // =====================================================
  @Get('queue')
  @ApiOperation({ summary: 'Get moderation queue' })
  async getQueue(
    @Query('status') status?: string,
    @Query('contentType') contentType?: string,
    @Query('priority') priority?: 'high' | 'medium' | 'low',
    @Query('label') hasLabel?: string,
    @Query('page') page: number = 1,
    @Query('limit') limit: number = 20,
  ) {
    return this.moderationService.getQueue({
      status,
      contentType,
      priority,
      hasLabel,
      page,
      limit,
    });
  }

  @Get('queue/stats')
  @ApiOperation({ summary: 'Get queue statistics' })
  async getQueueStats() {
    return this.moderationService.getQueueStats();
  }

  @Get('queue/:id')
  @ApiOperation({ summary: 'Get queue item details' })
  async getQueueItem(@Param('id') id: string) {
    return this.moderationService.getQueueItem(id);
  }

  // =====================================================
  // ACTIONS
  // =====================================================
  @Post('queue/:id/action')
  @HttpCode(HttpStatus.OK)
  @ApiOperation({ summary: 'Take moderation action' })
  async takeAction(
    @Param('id') id: string,
    @UserId() moderatorId: string,
    @Body() body: {
      action: 'approve' | 'reject' | 'warn' | 'suspend' | 'escalate';
      notes?: string;
      violationType?: string;
      severity?: string;
    },
  ) {
    await this.moderationService.takeAction(id, moderatorId, body);
    return { success: true };
  }

  @Post('queue/bulk-approve')
  @HttpCode(HttpStatus.OK)
  @ApiOperation({ summary: 'Bulk approve items' })
  async bulkApprove(
    @UserId() moderatorId: string,
    @Body() body: { ids: string[] },
  ) {
    const approved = await this.moderationService.bulkApprove(body.ids, moderatorId);
    return { approved };
  }

  // =====================================================
  // LICENSES
  // =====================================================
  @Get('licenses')
  @ApiOperation({ summary: 'Get pending license verifications' })
  async getPendingLicenses(
    @Query('status') status: string = 'pending',
    @Query('page') page: number = 1,
    @Query('limit') limit: number = 20,
  ) {
    // This would be implemented in the service
    return { items: [], total: 0 };
  }

  @Post('licenses/:id/verify')
  @HttpCode(HttpStatus.OK)
  @ApiOperation({ summary: 'Verify a business license' })
  async verifyLicense(
    @Param('id') id: string,
    @UserId() moderatorId: string,
    @Body() body: { approved: boolean; notes?: string },
  ) {
    await this.moderationService.verifyLicense(id, moderatorId, body.approved, body.notes);
    return { success: true };
  }

  // =====================================================
  // VIOLATIONS
  // =====================================================
  @Get('violations')
  @ApiOperation({ summary: 'Get violation history' })
  async getViolations(
    @Query('businessId') businessId?: string,
    @Query('type') violationType?: string,
    @Query('page') page: number = 1,
    @Query('limit') limit: number = 20,
  ) {
    // This would query content_violations table
    return { items: [], total: 0 };
  }

  @Get('violations/business/:businessId')
  @ApiOperation({ summary: 'Get business violations' })
  async getBusinessViolations(@Param('businessId') businessId: string) {
    return this.moderationService.getBusinessViolations(businessId);
  }

  // =====================================================
  // BANNED PATTERNS
  // =====================================================
  @Get('patterns')
  @ApiOperation({ summary: 'Get banned patterns' })
  async getBannedPatterns() {
    // Query banned_patterns table
    return { items: [] };
  }

  @Post('patterns')
  @ApiOperation({ summary: 'Add banned pattern' })
  async addBannedPattern(
    @UserId() userId: string,
    @Body() body: {
      patternType: string;
      patternValue: string;
      matchMode: string;
      category: string;
      action: string;
      severity: string;
    },
  ) {
    // Insert into banned_patterns
    return { success: true };
  }
}

// =====================================================
// USER REPORTING CONTROLLER
// =====================================================
@ApiTags('reports')
@Controller('reports')
@UseGuards(JwtAuthGuard)
@ApiBearerAuth()
export class UserReportController {
  constructor(private readonly moderationService: ModerationService) {}

  @Post()
  @ApiOperation({ summary: 'Submit a report' })
  async submitReport(
    @UserId() userId: string,
    @Body() body: {
      contentType: string;
      contentId: string;
      reason: string;
      description?: string;
    },
  ) {
    const reportId = await this.moderationService.submitReport(
      userId,
      body.contentType,
      body.contentId,
      body.reason,
      body.description,
    );
    return { reportId };
  }

  @Get('my-reports')
  @ApiOperation({ summary: 'Get my submitted reports' })
  async getMyReports(@UserId() userId: string) {
    return this.moderationService.getUserReports(userId);
  }
}

// =====================================================
// BUSINESS LICENSE CONTROLLER
// =====================================================
@ApiTags('licenses')
@Controller('businesses/:businessId/licenses')
@UseGuards(JwtAuthGuard)
@ApiBearerAuth()
export class BusinessLicenseController {
  constructor(private readonly moderationService: ModerationService) {}

  @Post()
  @ApiOperation({ summary: 'Submit license for verification' })
  async submitLicense(
    @Param('businessId') businessId: string,
    @Body() body: {
      licenseType: string;
      licenseNumber?: string;
      issuingAuthority?: string;
      issuedDate?: string;
      expiryDate?: string;
      documentUrls?: string[];
    },
  ) {
    const licenseId = await this.moderationService.submitLicense(businessId, body.licenseType, {
      licenseNumber: body.licenseNumber,
      issuingAuthority: body.issuingAuthority,
      issuedDate: body.issuedDate ? new Date(body.issuedDate) : undefined,
      expiryDate: body.expiryDate ? new Date(body.expiryDate) : undefined,
      documentUrls: body.documentUrls,
    });
    return { licenseId };
  }

  @Get('check/:licenseType')
  @ApiOperation({ summary: 'Check if business has valid license' })
  async checkLicense(
    @Param('businessId') businessId: string,
    @Param('licenseType') licenseType: string,
  ) {
    const hasLicense = await this.moderationService.checkBusinessLicense(businessId, licenseType);
    return { hasLicense };
  }
}
