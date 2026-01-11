import {
  Injectable,
  Logger,
  NotFoundException,
  BadRequestException,
} from '@nestjs/common';
import { PrismaService } from '../../prisma/prisma.service';
import { ContentDetectionService, DetectionResult } from './detection.service';
import { v4 as uuidv4 } from 'uuid';

// =====================================================
// TYPES
// =====================================================
export interface ModerationQueueItem {
  id: string;
  contentType: string;
  contentId: string;
  businessId?: string;
  status: string;
  priority: number;
  autoFlags: Record<string, number>;
  detectionLabels: string[];
  confidenceScore: number;
  detectionSource: string;
  reporterId?: string;
  reportReason?: string;
  createdAt: Date;
  content?: any;
  business?: any;
}

export interface ModerationFilters {
  status?: string;
  contentType?: string;
  priority?: 'high' | 'medium' | 'low';
  hasLabel?: string;
  page?: number;
  limit?: number;
}

export interface ModerationAction {
  action: 'approve' | 'reject' | 'warn' | 'suspend' | 'escalate';
  notes?: string;
  violationType?: string;
  severity?: string;
}

// =====================================================
// MODERATION SERVICE
// =====================================================
@Injectable()
export class ModerationService {
  private readonly logger = new Logger(ModerationService.name);

  constructor(
    private prisma: PrismaService,
    private detectionService: ContentDetectionService,
  ) {}

  // =====================================================
  // QUEUE MANAGEMENT
  // =====================================================
  
  /**
   * Add item to moderation queue
   */
  async addToQueue(
    contentType: string,
    contentId: string,
    options: {
      businessId?: string;
      autoFlags?: Record<string, number>;
      labels?: string[];
      confidence?: number;
      source?: 'auto' | 'user_report' | 'admin';
      reporterId?: string;
      reportReason?: string;
      priority?: number;
      contentSnapshot?: any;
    } = {},
  ): Promise<string> {
    // Calculate priority based on labels and confidence
    let priority = options.priority || 50;
    
    if (options.labels?.includes('nsfw') || options.labels?.includes('violence')) {
      priority = 90;
    } else if (options.labels?.includes('alcohol') || options.labels?.includes('tobacco')) {
      priority = 70;
    } else if (options.source === 'user_report') {
      priority = 60;
    }

    const item = await this.prisma.moderationQueue.create({
      data: {
        id: uuidv4(),
        contentType,
        contentId,
        businessId: options.businessId,
        autoFlags: options.autoFlags || {},
        detectionLabels: options.labels || [],
        confidenceScore: options.confidence || 0,
        detectionSource: options.source || 'auto',
        reporterId: options.reporterId,
        reportReason: options.reportReason,
        priority,
        contentSnapshot: options.contentSnapshot,
        status: 'pending',
      },
    });

    this.logger.log(`Added to moderation queue: ${contentType}/${contentId} (priority: ${priority})`);
    return item.id;
  }

  /**
   * Get moderation queue
   */
  async getQueue(filters: ModerationFilters = {}): Promise<{
    items: ModerationQueueItem[];
    total: number;
    stats: Record<string, number>;
  }> {
    const { status, contentType, priority, hasLabel, page = 1, limit = 20 } = filters;

    const where: any = {};
    
    if (status) where.status = status;
    if (contentType) where.contentType = contentType;
    if (hasLabel) where.detectionLabels = { has: hasLabel };
    
    if (priority === 'high') where.priority = { gte: 70 };
    else if (priority === 'medium') where.priority = { gte: 40, lt: 70 };
    else if (priority === 'low') where.priority = { lt: 40 };

    const [items, total] = await Promise.all([
      this.prisma.moderationQueue.findMany({
        where,
        orderBy: [{ priority: 'desc' }, { createdAt: 'asc' }],
        skip: (page - 1) * limit,
        take: limit,
        include: {
          business: {
            select: { id: true, businessName: true, slug: true },
          },
        },
      }),
      this.prisma.moderationQueue.count({ where }),
    ]);

    // Get stats
    const stats = await this.getQueueStats();

    // Fetch content for each item
    const itemsWithContent = await Promise.all(
      items.map(async (item) => ({
        ...item,
        content: await this.fetchContent(item.contentType, item.contentId),
      })),
    );

    return { items: itemsWithContent, total, stats };
  }

  /**
   * Get queue statistics
   */
  async getQueueStats(): Promise<Record<string, number>> {
    const counts = await this.prisma.moderationQueue.groupBy({
      by: ['status'],
      _count: true,
    });

    const stats: Record<string, number> = {
      total: 0,
      pending: 0,
      in_review: 0,
      approved: 0,
      rejected: 0,
      escalated: 0,
    };

    for (const count of counts) {
      stats[count.status] = count._count;
      stats.total += count._count;
    }

    // High priority count
    stats.high_priority = await this.prisma.moderationQueue.count({
      where: { status: 'pending', priority: { gte: 70 } },
    });

    return stats;
  }

  /**
   * Get single queue item
   */
  async getQueueItem(id: string): Promise<ModerationQueueItem | null> {
    const item = await this.prisma.moderationQueue.findUnique({
      where: { id },
      include: {
        business: true,
        reviewer: { select: { id: true, firstName: true, lastName: true } },
        reporter: { select: { id: true, firstName: true, lastName: true } },
      },
    });

    if (!item) return null;

    return {
      ...item,
      content: await this.fetchContent(item.contentType, item.contentId),
    };
  }

  // =====================================================
  // MODERATION ACTIONS
  // =====================================================

  /**
   * Take moderation action
   */
  async takeAction(
    queueItemId: string,
    moderatorId: string,
    action: ModerationAction,
  ): Promise<void> {
    const item = await this.prisma.moderationQueue.findUnique({
      where: { id: queueItemId },
    });

    if (!item) {
      throw new NotFoundException('Queue item not found');
    }

    // Start transaction
    await this.prisma.$transaction(async (tx) => {
      // Update queue item
      const newStatus = action.action === 'escalate' ? 'escalated' :
                        action.action === 'approve' ? 'approved' : 'rejected';

      await tx.moderationQueue.update({
        where: { id: queueItemId },
        data: {
          status: newStatus,
          reviewedBy: moderatorId,
          reviewedAt: new Date(),
          reviewNotes: action.notes,
          actionTaken: action.action,
        },
      });

      // Apply action to content
      switch (action.action) {
        case 'approve':
          await this.approveContent(tx, item);
          break;
        case 'reject':
          await this.rejectContent(tx, item, action);
          break;
        case 'warn':
          await this.warnBusiness(tx, item, action, moderatorId);
          break;
        case 'suspend':
          await this.suspendBusiness(tx, item, action, moderatorId);
          break;
        case 'escalate':
          // Just update status, handled above
          break;
      }

      // Log action
      await tx.moderationAction.create({
        data: {
          id: uuidv4(),
          moderatorId,
          targetType: item.contentType,
          targetId: item.contentId,
          action: action.action,
          reason: action.notes,
          moderationQueueId: queueItemId,
        },
      });
    });

    this.logger.log(`Moderation action: ${action.action} on ${item.contentType}/${item.contentId}`);
  }

  /**
   * Bulk approve
   */
  async bulkApprove(queueItemIds: string[], moderatorId: string): Promise<number> {
    let approved = 0;

    for (const id of queueItemIds) {
      try {
        await this.takeAction(id, moderatorId, { action: 'approve' });
        approved++;
      } catch (error) {
        this.logger.error(`Failed to approve ${id}: ${error.message}`);
      }
    }

    return approved;
  }

  // =====================================================
  // USER REPORTS
  // =====================================================

  /**
   * Submit user report
   */
  async submitReport(
    reporterId: string,
    contentType: string,
    contentId: string,
    reason: string,
    description?: string,
  ): Promise<string> {
    // Check for duplicate report
    const existing = await this.prisma.userReport.findFirst({
      where: {
        reporterId,
        contentType,
        contentId,
        status: { in: ['pending', 'investigating'] },
      },
    });

    if (existing) {
      throw new BadRequestException('You have already reported this content');
    }

    // Create report
    const report = await this.prisma.userReport.create({
      data: {
        id: uuidv4(),
        reporterId,
        contentType,
        contentId,
        reason,
        description,
        status: 'pending',
      },
    });

    // Add to moderation queue
    const content = await this.fetchContent(contentType, contentId);
    
    await this.addToQueue(contentType, contentId, {
      businessId: content?.businessId,
      source: 'user_report',
      reporterId,
      reportReason: reason,
      contentSnapshot: content,
      priority: 60,
    });

    return report.id;
  }

  /**
   * Get user's reports
   */
  async getUserReports(userId: string): Promise<any[]> {
    return this.prisma.userReport.findMany({
      where: { reporterId: userId },
      orderBy: { createdAt: 'desc' },
      take: 50,
    });
  }

  // =====================================================
  // AUTO-MODERATION
  // =====================================================

  /**
   * Auto-moderate product
   */
  async moderateProduct(productId: string): Promise<{
    approved: boolean;
    requiresReview: boolean;
    requiresLicense: string | null;
    flags: string[];
  }> {
    const product = await this.prisma.product.findUnique({
      where: { id: productId },
      include: {
        images: { select: { url: true } },
        business: { select: { id: true } },
      },
    });

    if (!product) {
      throw new NotFoundException('Product not found');
    }

    const result = await this.detectionService.analyzeProduct({
      name: product.name,
      description: product.description || undefined,
      categoryId: product.categoryId || undefined,
      imageUrls: product.images.map((i) => i.url),
    });

    if (result.requiresReview || result.requiresLicense) {
      // Add to queue
      await this.addToQueue('product', productId, {
        businessId: product.businessId,
        autoFlags: result.details.textAnalysis?.scores || {},
        labels: result.flags,
        confidence: result.details.textAnalysis?.confidence || 0,
        source: 'auto',
        priority: result.requiresLicense ? 70 : 50,
      });

      // If requires license, check if business has it
      if (result.requiresLicense) {
        const hasLicense = await this.checkBusinessLicense(
          product.businessId,
          result.requiresLicense,
        );
        
        if (!hasLicense) {
          result.approved = false;
          result.flags.push('missing_license');
        }
      }
    }

    return {
      approved: result.isAllowed && !result.requiresLicense,
      requiresReview: result.requiresReview,
      requiresLicense: result.requiresLicense,
      flags: result.flags,
    };
  }

  /**
   * Auto-moderate reel
   */
  async moderateReel(reelId: string): Promise<{
    approved: boolean;
    requiresReview: boolean;
    flags: string[];
  }> {
    const reel = await this.prisma.reel.findUnique({
      where: { id: reelId },
      select: {
        id: true,
        businessId: true,
        thumbnailUrl: true,
        caption: true,
        hashtags: true,
      },
    });

    if (!reel) {
      throw new NotFoundException('Reel not found');
    }

    const result = await this.detectionService.analyzeReel({
      thumbnailUrl: reel.thumbnailUrl || undefined,
      caption: reel.caption || undefined,
      hashtags: reel.hashtags || undefined,
    });

    if (result.requiresReview) {
      await this.addToQueue('reel', reelId, {
        businessId: reel.businessId,
        autoFlags: result.scores,
        labels: result.labels,
        confidence: result.confidence,
        source: 'auto',
      });
    }

    // Update reel moderation status
    await this.prisma.reel.update({
      where: { id: reelId },
      data: {
        moderationStatus: result.isAllowed ? 
          (result.requiresReview ? 'pending' : 'approved') : 
          'rejected',
      },
    });

    return {
      approved: result.isAllowed && !result.requiresReview,
      requiresReview: result.requiresReview,
      flags: result.labels,
    };
  }

  // =====================================================
  // LICENSE MANAGEMENT
  // =====================================================

  /**
   * Check if business has valid license
   */
  async checkBusinessLicense(businessId: string, licenseType: string): Promise<boolean> {
    const result = await this.prisma.$queryRaw<{ result: boolean }[]>`
      SELECT has_valid_license(${businessId}::uuid, ${licenseType}) as result
    `;
    return result[0]?.result || false;
  }

  /**
   * Submit license for verification
   */
  async submitLicense(
    businessId: string,
    licenseType: string,
    data: {
      licenseNumber?: string;
      issuingAuthority?: string;
      issuedDate?: Date;
      expiryDate?: Date;
      documentUrls?: string[];
    },
  ): Promise<string> {
    const license = await this.prisma.businessLicense.upsert({
      where: { businessId_licenseType: { businessId, licenseType } },
      create: {
        id: uuidv4(),
        businessId,
        licenseType,
        ...data,
        verificationStatus: 'pending',
      },
      update: {
        ...data,
        verificationStatus: 'pending',
      },
    });

    return license.id;
  }

  /**
   * Verify license
   */
  async verifyLicense(
    licenseId: string,
    moderatorId: string,
    approved: boolean,
    notes?: string,
  ): Promise<void> {
    await this.prisma.businessLicense.update({
      where: { id: licenseId },
      data: {
        verificationStatus: approved ? 'verified' : 'rejected',
        verifiedBy: moderatorId,
        verifiedAt: new Date(),
        verificationNotes: notes,
      },
    });
  }

  // =====================================================
  // VIOLATION MANAGEMENT
  // =====================================================

  /**
   * Get business violations
   */
  async getBusinessViolations(businessId: string): Promise<any[]> {
    return this.prisma.contentViolation.findMany({
      where: { businessId },
      orderBy: { createdAt: 'desc' },
      take: 50,
    });
  }

  /**
   * Count violations
   */
  async countViolations(businessId: string, daysBack: number = 90): Promise<number> {
    const result = await this.prisma.$queryRaw<{ count: number }[]>`
      SELECT count_business_violations(${businessId}::uuid, NULL, ${daysBack}) as count
    `;
    return result[0]?.count || 0;
  }

  // =====================================================
  // PRIVATE HELPERS
  // =====================================================

  private async fetchContent(contentType: string, contentId: string): Promise<any> {
    switch (contentType) {
      case 'product':
        return this.prisma.product.findUnique({
          where: { id: contentId },
          include: {
            images: { take: 5 },
            business: { select: { id: true, businessName: true } },
          },
        });
      case 'reel':
        return this.prisma.reel.findUnique({
          where: { id: contentId },
          include: {
            business: { select: { id: true, businessName: true } },
          },
        });
      case 'business':
        return this.prisma.businessProfile.findUnique({
          where: { id: contentId },
        });
      case 'comment':
        return this.prisma.reelComment.findUnique({
          where: { id: contentId },
        });
      default:
        return null;
    }
  }

  private async approveContent(tx: any, item: any): Promise<void> {
    switch (item.contentType) {
      case 'product':
        await tx.product.update({
          where: { id: item.contentId },
          data: { status: 'active' },
        });
        break;
      case 'reel':
        await tx.reel.update({
          where: { id: item.contentId },
          data: { moderationStatus: 'approved' },
        });
        break;
      case 'business':
        await tx.businessProfile.update({
          where: { id: item.contentId },
          data: { status: 'approved' },
        });
        break;
    }
  }

  private async rejectContent(tx: any, item: any, action: ModerationAction): Promise<void> {
    switch (item.contentType) {
      case 'product':
        await tx.product.update({
          where: { id: item.contentId },
          data: { status: 'rejected' },
        });
        break;
      case 'reel':
        await tx.reel.update({
          where: { id: item.contentId },
          data: { 
            moderationStatus: 'rejected',
            moderationNotes: action.notes,
          },
        });
        break;
    }

    // Create violation record
    if (action.violationType) {
      await tx.contentViolation.create({
        data: {
          id: uuidv4(),
          businessId: item.businessId,
          violationType: action.violationType,
          severity: action.severity || 'minor',
          contentType: item.contentType,
          contentId: item.contentId,
          moderationQueueId: item.id,
          actionTaken: 'content_removed',
        },
      });
    }
  }

  private async warnBusiness(
    tx: any,
    item: any,
    action: ModerationAction,
    moderatorId: string,
  ): Promise<void> {
    if (!item.businessId) return;

    await tx.contentViolation.create({
      data: {
        id: uuidv4(),
        businessId: item.businessId,
        violationType: action.violationType || 'policy_violation',
        severity: 'minor',
        contentType: item.contentType,
        contentId: item.contentId,
        moderationQueueId: item.id,
        actionTaken: 'warning',
        createdBy: moderatorId,
      },
    });

    // Check if should auto-suspend
    const warningCount = await this.countViolations(item.businessId, 90);
    const maxWarnings = 3; // Get from settings in production

    if (warningCount >= maxWarnings) {
      await this.suspendBusiness(tx, item, action, moderatorId);
    }
  }

  private async suspendBusiness(
    tx: any,
    item: any,
    action: ModerationAction,
    moderatorId: string,
  ): Promise<void> {
    if (!item.businessId) return;

    const suspensionDays = 7; // Get from settings

    await tx.businessProfile.update({
      where: { id: item.businessId },
      data: {
        status: 'suspended',
        suspensionReason: action.notes,
        suspendedAt: new Date(),
      },
    });

    await tx.contentViolation.create({
      data: {
        id: uuidv4(),
        businessId: item.businessId,
        violationType: action.violationType || 'policy_violation',
        severity: 'major',
        contentType: item.contentType,
        contentId: item.contentId,
        moderationQueueId: item.id,
        actionTaken: 'suspended',
        actionDetails: { suspensionDays },
        createdBy: moderatorId,
      },
    });
  }
}
