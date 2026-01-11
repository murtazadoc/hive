import {
  Injectable,
  Logger,
  BadRequestException,
  NotFoundException,
} from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { PrismaService } from '../../prisma/prisma.service';
import { CloudinaryService } from '../upload/cloudinary.service';
import { v4 as uuidv4 } from 'uuid';

// =====================================================
// TYPES
// =====================================================
export interface VideoUploadResult {
  id: string;
  originalUrl: string;
  processedUrl?: string;
  hlsUrl?: string;
  thumbnailUrl?: string;
  duration: number;
  width: number;
  height: number;
  aspectRatio: string;
}

export interface ReelCreateDto {
  businessId: string;
  caption?: string;
  hashtags?: string[];
  taggedProductIds?: string[];
  visibility?: 'public' | 'followers' | 'private';
}

export interface ReelFilters {
  businessId?: string;
  hashtag?: string;
  featured?: boolean;
  limit?: number;
  cursor?: string;
}

// =====================================================
// VIDEO SERVICE
// =====================================================
@Injectable()
export class VideoService {
  private readonly logger = new Logger(VideoService.name);
  private readonly maxVideoDuration = 60; // 60 seconds max
  private readonly maxFileSize = 100 * 1024 * 1024; // 100MB

  constructor(
    private configService: ConfigService,
    private prisma: PrismaService,
    private cloudinaryService: CloudinaryService,
  ) {}

  // =====================================================
  // UPLOAD VIDEO
  // =====================================================
  async uploadVideo(
    file: Express.Multer.File,
    userId: string,
    dto: ReelCreateDto,
  ): Promise<{ reelId: string; status: string }> {
    // Validate file
    this.validateVideoFile(file);

    // Verify business access
    await this.verifyBusinessAccess(dto.businessId, userId);

    // Upload to Cloudinary with video processing
    const uploadResult = await this.uploadToCloudinary(file, dto.businessId);

    // Create reel record
    const reel = await this.prisma.reel.create({
      data: {
        id: uuidv4(),
        businessId: dto.businessId,
        createdBy: userId,
        caption: dto.caption,
        hashtags: this.parseHashtags(dto.caption, dto.hashtags),
        taggedProductIds: dto.taggedProductIds || [],
        visibility: dto.visibility || 'public',
        originalUrl: uploadResult.originalUrl,
        processingStatus: 'processing',
      },
    });

    // Trigger async processing
    this.processVideoAsync(reel.id, uploadResult.publicId);

    return {
      reelId: reel.id,
      status: 'processing',
    };
  }

  // =====================================================
  // PROCESS VIDEO (async)
  // =====================================================
  private async processVideoAsync(reelId: string, publicId: string): Promise<void> {
    try {
      await this.prisma.reel.update({
        where: { id: reelId },
        data: { processingStartedAt: new Date() },
      });

      // Get video info from Cloudinary
      const videoInfo = await this.getVideoInfo(publicId);

      // Validate duration
      if (videoInfo.duration > this.maxVideoDuration) {
        throw new Error(`Video too long: ${videoInfo.duration}s (max ${this.maxVideoDuration}s)`);
      }

      // Generate HLS stream
      const hlsUrl = await this.generateHlsStream(publicId);

      // Generate thumbnail
      const thumbnailUrl = await this.generateThumbnail(publicId);

      // Get processed video URL
      const processedUrl = this.getOptimizedVideoUrl(publicId);

      // Update reel with processed data
      await this.prisma.reel.update({
        where: { id: reelId },
        data: {
          processedUrl,
          hlsUrl,
          thumbnailUrl,
          durationSeconds: Math.round(videoInfo.duration),
          width: videoInfo.width,
          height: videoInfo.height,
          aspectRatio: this.calculateAspectRatio(videoInfo.width, videoInfo.height),
          fileSizeBytes: videoInfo.bytes,
          processingStatus: 'completed',
          processingCompletedAt: new Date(),
          publishedAt: new Date(), // Auto-publish on completion
          moderationStatus: 'pending', // Queue for moderation
        },
      });

      this.logger.log(`Video processed successfully: ${reelId}`);
    } catch (error: any) {
      this.logger.error(`Video processing failed: ${reelId} - ${error.message}`);

      await this.prisma.reel.update({
        where: { id: reelId },
        data: {
          processingStatus: 'failed',
          processingError: error.message,
        },
      });
    }
  }

  // =====================================================
  // CLOUDINARY VIDEO OPERATIONS
  // =====================================================
  private async uploadToCloudinary(
    file: Express.Multer.File,
    businessId: string,
  ): Promise<{ originalUrl: string; publicId: string }> {
    // Cloudinary video upload with eager transformations
    const result = await this.cloudinaryService.uploadVideo(file, {
      folder: `hive/reels/${businessId}`,
      resourceType: 'video',
      eager: [
        // HLS streaming
        { streaming_profile: 'hd', format: 'm3u8' },
        // Optimized MP4
        { quality: 'auto:good', format: 'mp4' },
        // Thumbnail
        { format: 'jpg', transformation: [{ width: 400, crop: 'fill' }] },
      ],
      eager_async: true,
    });

    return {
      originalUrl: result.secureUrl,
      publicId: result.publicId,
    };
  }

  private async getVideoInfo(publicId: string): Promise<{
    duration: number;
    width: number;
    height: number;
    bytes: number;
  }> {
    // In production, use Cloudinary Admin API to get video details
    // For now, return mock data
    return {
      duration: 30,
      width: 1080,
      height: 1920,
      bytes: 5000000,
    };
  }

  private async generateHlsStream(publicId: string): Promise<string> {
    // Cloudinary generates HLS automatically with streaming_profile
    // Return the m3u8 URL
    return `https://res.cloudinary.com/${this.configService.get('CLOUDINARY_CLOUD_NAME')}/video/upload/sp_hd/${publicId}.m3u8`;
  }

  private async generateThumbnail(publicId: string): Promise<string> {
    // Cloudinary auto-generates thumbnail
    return `https://res.cloudinary.com/${this.configService.get('CLOUDINARY_CLOUD_NAME')}/video/upload/w_400,h_712,c_fill,so_1/${publicId}.jpg`;
  }

  private getOptimizedVideoUrl(publicId: string): string {
    return `https://res.cloudinary.com/${this.configService.get('CLOUDINARY_CLOUD_NAME')}/video/upload/q_auto,f_auto/${publicId}.mp4`;
  }

  // =====================================================
  // GET REELS
  // =====================================================
  async getReel(reelId: string, userId?: string) {
    const reel = await this.prisma.reel.findUnique({
      where: { id: reelId },
      include: {
        business: {
          select: {
            id: true,
            businessName: true,
            slug: true,
            logoUrl: true,
          },
        },
        creator: {
          select: {
            id: true,
            firstName: true,
            lastName: true,
          },
        },
      },
    });

    if (!reel || reel.deletedAt) {
      throw new NotFoundException('Reel not found');
    }

    // Check if user liked/saved
    let isLiked = false;
    let isSaved = false;

    if (userId) {
      const [like, save] = await Promise.all([
        this.prisma.reelLike.findUnique({
          where: { reelId_userId: { reelId, userId } },
        }),
        this.prisma.reelSave.findUnique({
          where: { reelId_userId: { reelId, userId } },
        }),
      ]);
      isLiked = !!like;
      isSaved = !!save;
    }

    return {
      ...reel,
      isLiked,
      isSaved,
    };
  }

  async getReelsFeed(
    userId: string,
    cursor?: string,
    limit: number = 10,
  ) {
    // Simple feed: mix of trending + following + new
    // In production, use more sophisticated recommendation

    const reels = await this.prisma.reel.findMany({
      where: {
        processingStatus: 'completed',
        moderationStatus: 'approved',
        visibility: 'public',
        deletedAt: null,
      },
      include: {
        business: {
          select: {
            id: true,
            businessName: true,
            slug: true,
            logoUrl: true,
          },
        },
      },
      orderBy: [
        { publishedAt: 'desc' },
      ],
      take: limit,
      ...(cursor && {
        skip: 1,
        cursor: { id: cursor },
      }),
    });

    // Get user interactions
    const reelIds = reels.map((r) => r.id);
    const [likes, saves] = await Promise.all([
      this.prisma.reelLike.findMany({
        where: { reelId: { in: reelIds }, userId },
        select: { reelId: true },
      }),
      this.prisma.reelSave.findMany({
        where: { reelId: { in: reelIds }, userId },
        select: { reelId: true },
      }),
    ]);

    const likedIds = new Set(likes.map((l) => l.reelId));
    const savedIds = new Set(saves.map((s) => s.reelId));

    return reels.map((reel) => ({
      ...reel,
      isLiked: likedIds.has(reel.id),
      isSaved: savedIds.has(reel.id),
    }));
  }

  async getTrendingReels(limit: number = 20) {
    // Use trending function from DB
    const trending = await this.prisma.$queryRaw<{ reel_id: string; score: number }[]>`
      SELECT * FROM get_trending_reels('24 hours', ${limit})
    `;

    const reelIds = trending.map((t) => t.reel_id);

    const reels = await this.prisma.reel.findMany({
      where: { id: { in: reelIds } },
      include: {
        business: {
          select: {
            id: true,
            businessName: true,
            slug: true,
            logoUrl: true,
          },
        },
      },
    });

    // Sort by trending score
    const reelMap = new Map(reels.map((r) => [r.id, r]));
    return trending
      .map((t) => reelMap.get(t.reel_id))
      .filter(Boolean);
  }

  async getBusinessReels(businessId: string, limit: number = 20, cursor?: string) {
    return this.prisma.reel.findMany({
      where: {
        businessId,
        processingStatus: 'completed',
        moderationStatus: 'approved',
        deletedAt: null,
      },
      orderBy: { publishedAt: 'desc' },
      take: limit,
      ...(cursor && {
        skip: 1,
        cursor: { id: cursor },
      }),
    });
  }

  // =====================================================
  // INTERACTIONS
  // =====================================================
  async likeReel(reelId: string, userId: string): Promise<void> {
    await this.prisma.reelLike.upsert({
      where: { reelId_userId: { reelId, userId } },
      create: { reelId, userId },
      update: {},
    });
  }

  async unlikeReel(reelId: string, userId: string): Promise<void> {
    await this.prisma.reelLike.deleteMany({
      where: { reelId, userId },
    });
  }

  async saveReel(reelId: string, userId: string, collection?: string): Promise<void> {
    await this.prisma.reelSave.upsert({
      where: { reelId_userId: { reelId, userId } },
      create: { reelId, userId, collectionName: collection },
      update: { collectionName: collection },
    });
  }

  async unsaveReel(reelId: string, userId: string): Promise<void> {
    await this.prisma.reelSave.deleteMany({
      where: { reelId, userId },
    });
  }

  async addComment(
    reelId: string,
    userId: string,
    content: string,
    parentId?: string,
  ) {
    const comment = await this.prisma.reelComment.create({
      data: {
        reelId,
        userId,
        content,
        parentId,
        mentionedUserIds: this.extractMentions(content),
      },
      include: {
        user: {
          select: {
            id: true,
            firstName: true,
            lastName: true,
          },
        },
      },
    });

    // Update reply count if it's a reply
    if (parentId) {
      await this.prisma.reelComment.update({
        where: { id: parentId },
        data: { replyCount: { increment: 1 } },
      });
    }

    return comment;
  }

  async getComments(reelId: string, limit: number = 20, cursor?: string) {
    return this.prisma.reelComment.findMany({
      where: {
        reelId,
        parentId: null, // Top-level only
        isHidden: false,
        deletedAt: null,
      },
      include: {
        user: {
          select: {
            id: true,
            firstName: true,
            lastName: true,
          },
        },
        _count: {
          select: { replies: true },
        },
      },
      orderBy: { createdAt: 'desc' },
      take: limit,
      ...(cursor && {
        skip: 1,
        cursor: { id: cursor },
      }),
    });
  }

  async logView(
    reelId: string,
    userId: string | null,
    sessionId: string,
    watchDuration: number,
    source: string,
  ): Promise<void> {
    const reel = await this.prisma.reel.findUnique({
      where: { id: reelId },
      select: { durationSeconds: true },
    });

    if (!reel) return;

    const watchPercentage = reel.durationSeconds
      ? Math.min(100, (watchDuration / reel.durationSeconds) * 100)
      : 0;

    await this.prisma.reelView.create({
      data: {
        reelId,
        userId,
        sessionId,
        watchDurationSeconds: watchDuration,
        watchPercentage,
        completed: watchPercentage >= 95,
        source,
      },
    });

    // Increment view count
    await this.prisma.$executeRaw`SELECT increment_reel_views(${reelId}::uuid)`;
  }

  async shareReel(reelId: string, userId: string | null, shareType: string): Promise<void> {
    await this.prisma.reelShare.create({
      data: { reelId, userId, shareType },
    });

    await this.prisma.reel.update({
      where: { id: reelId },
      data: { shareCount: { increment: 1 } },
    });
  }

  // =====================================================
  // DELETE
  // =====================================================
  async deleteReel(reelId: string, userId: string): Promise<void> {
    const reel = await this.prisma.reel.findUnique({
      where: { id: reelId },
      select: { createdBy: true, businessId: true },
    });

    if (!reel) {
      throw new NotFoundException('Reel not found');
    }

    // Check ownership
    if (reel.createdBy !== userId) {
      await this.verifyBusinessAccess(reel.businessId, userId);
    }

    await this.prisma.reel.update({
      where: { id: reelId },
      data: { deletedAt: new Date() },
    });
  }

  // =====================================================
  // HELPERS
  // =====================================================
  private validateVideoFile(file: Express.Multer.File): void {
    if (!file) {
      throw new BadRequestException('No video file provided');
    }

    if (file.size > this.maxFileSize) {
      throw new BadRequestException(`Video too large. Max size is ${this.maxFileSize / 1024 / 1024}MB`);
    }

    const allowedTypes = ['video/mp4', 'video/quicktime', 'video/webm'];
    if (!allowedTypes.includes(file.mimetype)) {
      throw new BadRequestException('Invalid video format. Allowed: MP4, MOV, WebM');
    }
  }

  private async verifyBusinessAccess(businessId: string, userId: string): Promise<void> {
    const member = await this.prisma.businessMember.findUnique({
      where: { businessId_userId: { businessId, userId } },
    });

    if (!member || !member.isActive) {
      throw new BadRequestException('No access to this business');
    }

    if (!['owner', 'admin', 'editor'].includes(member.role)) {
      throw new BadRequestException('Insufficient permissions');
    }
  }

  private parseHashtags(caption?: string, explicit?: string[]): string[] {
    const hashtags = new Set<string>(explicit || []);

    if (caption) {
      const matches = caption.match(/#\w+/g);
      if (matches) {
        matches.forEach((tag) => hashtags.add(tag.toLowerCase().replace('#', '')));
      }
    }

    return Array.from(hashtags);
  }

  private extractMentions(content: string): string[] {
    const matches = content.match(/@\w+/g);
    return matches ? matches.map((m) => m.replace('@', '')) : [];
  }

  private calculateAspectRatio(width: number, height: number): string {
    const ratio = width / height;
    if (ratio > 1.7) return '16:9';
    if (ratio > 0.9 && ratio < 1.1) return '1:1';
    if (ratio < 0.6) return '9:16';
    return '4:5';
  }
}
