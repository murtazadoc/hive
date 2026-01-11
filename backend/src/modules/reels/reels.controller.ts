import {
  Controller,
  Get,
  Post,
  Delete,
  Body,
  Param,
  Query,
  UseGuards,
  UseInterceptors,
  UploadedFile,
  HttpCode,
  HttpStatus,
} from '@nestjs/common';
import { FileInterceptor } from '@nestjs/platform-express';
import { ApiTags, ApiOperation, ApiConsumes, ApiBearerAuth } from '@nestjs/swagger';
import { JwtAuthGuard } from '../auth/guards/jwt-auth.guard';
import { Public, UserId } from '../auth/decorators/public.decorator';
import { VideoService } from './video.service';

// =====================================================
// REELS CONTROLLER
// =====================================================
@ApiTags('reels')
@Controller('reels')
export class ReelsController {
  constructor(private readonly videoService: VideoService) {}

  // =====================================================
  // FEED
  // =====================================================
  @Get('feed')
  @UseGuards(JwtAuthGuard)
  @ApiBearerAuth()
  @ApiOperation({ summary: 'Get personalized reels feed' })
  async getFeed(
    @UserId() userId: string,
    @Query('cursor') cursor?: string,
    @Query('limit') limit: number = 10,
  ) {
    return this.videoService.getReelsFeed(userId, cursor, limit);
  }

  @Get('trending')
  @Public()
  @ApiOperation({ summary: 'Get trending reels' })
  async getTrending(@Query('limit') limit: number = 20) {
    return this.videoService.getTrendingReels(limit);
  }

  @Get('business/:businessId')
  @Public()
  @ApiOperation({ summary: 'Get reels for a business' })
  async getBusinessReels(
    @Param('businessId') businessId: string,
    @Query('limit') limit: number = 20,
    @Query('cursor') cursor?: string,
  ) {
    return this.videoService.getBusinessReels(businessId, limit, cursor);
  }

  // =====================================================
  // SINGLE REEL
  // =====================================================
  @Get(':id')
  @Public()
  @ApiOperation({ summary: 'Get a single reel' })
  async getReel(
    @Param('id') id: string,
    @UserId() userId?: string,
  ) {
    return this.videoService.getReel(id, userId);
  }

  // =====================================================
  // UPLOAD
  // =====================================================
  @Post('upload')
  @UseGuards(JwtAuthGuard)
  @ApiBearerAuth()
  @ApiOperation({ summary: 'Upload a new reel' })
  @ApiConsumes('multipart/form-data')
  @UseInterceptors(FileInterceptor('video'))
  async uploadReel(
    @UserId() userId: string,
    @UploadedFile() file: Express.Multer.File,
    @Body() body: {
      businessId: string;
      caption?: string;
      hashtags?: string;
      taggedProductIds?: string;
      visibility?: 'public' | 'followers' | 'private';
    },
  ) {
    return this.videoService.uploadVideo(file, userId, {
      businessId: body.businessId,
      caption: body.caption,
      hashtags: body.hashtags ? JSON.parse(body.hashtags) : undefined,
      taggedProductIds: body.taggedProductIds ? JSON.parse(body.taggedProductIds) : undefined,
      visibility: body.visibility,
    });
  }

  // =====================================================
  // INTERACTIONS
  // =====================================================
  @Post(':id/like')
  @UseGuards(JwtAuthGuard)
  @ApiBearerAuth()
  @HttpCode(HttpStatus.OK)
  @ApiOperation({ summary: 'Like a reel' })
  async likeReel(@Param('id') id: string, @UserId() userId: string) {
    await this.videoService.likeReel(id, userId);
    return { success: true };
  }

  @Delete(':id/like')
  @UseGuards(JwtAuthGuard)
  @ApiBearerAuth()
  @HttpCode(HttpStatus.OK)
  @ApiOperation({ summary: 'Unlike a reel' })
  async unlikeReel(@Param('id') id: string, @UserId() userId: string) {
    await this.videoService.unlikeReel(id, userId);
    return { success: true };
  }

  @Post(':id/save')
  @UseGuards(JwtAuthGuard)
  @ApiBearerAuth()
  @HttpCode(HttpStatus.OK)
  @ApiOperation({ summary: 'Save a reel' })
  async saveReel(
    @Param('id') id: string,
    @UserId() userId: string,
    @Body() body: { collection?: string },
  ) {
    await this.videoService.saveReel(id, userId, body.collection);
    return { success: true };
  }

  @Delete(':id/save')
  @UseGuards(JwtAuthGuard)
  @ApiBearerAuth()
  @HttpCode(HttpStatus.OK)
  @ApiOperation({ summary: 'Unsave a reel' })
  async unsaveReel(@Param('id') id: string, @UserId() userId: string) {
    await this.videoService.unsaveReel(id, userId);
    return { success: true };
  }

  @Post(':id/view')
  @Public()
  @HttpCode(HttpStatus.OK)
  @ApiOperation({ summary: 'Log reel view' })
  async logView(
    @Param('id') id: string,
    @Body() body: {
      sessionId: string;
      watchDuration: number;
      source: string;
    },
    @UserId() userId?: string,
  ) {
    await this.videoService.logView(
      id,
      userId || null,
      body.sessionId,
      body.watchDuration,
      body.source,
    );
    return { success: true };
  }

  @Post(':id/share')
  @Public()
  @HttpCode(HttpStatus.OK)
  @ApiOperation({ summary: 'Log reel share' })
  async logShare(
    @Param('id') id: string,
    @Body() body: { shareType: string },
    @UserId() userId?: string,
  ) {
    await this.videoService.shareReel(id, userId || null, body.shareType);
    return { success: true };
  }

  // =====================================================
  // COMMENTS
  // =====================================================
  @Get(':id/comments')
  @Public()
  @ApiOperation({ summary: 'Get reel comments' })
  async getComments(
    @Param('id') id: string,
    @Query('limit') limit: number = 20,
    @Query('cursor') cursor?: string,
  ) {
    return this.videoService.getComments(id, limit, cursor);
  }

  @Post(':id/comments')
  @UseGuards(JwtAuthGuard)
  @ApiBearerAuth()
  @ApiOperation({ summary: 'Add a comment' })
  async addComment(
    @Param('id') id: string,
    @UserId() userId: string,
    @Body() body: { content: string; parentId?: string },
  ) {
    return this.videoService.addComment(id, userId, body.content, body.parentId);
  }

  // =====================================================
  // DELETE
  // =====================================================
  @Delete(':id')
  @UseGuards(JwtAuthGuard)
  @ApiBearerAuth()
  @HttpCode(HttpStatus.OK)
  @ApiOperation({ summary: 'Delete a reel' })
  async deleteReel(@Param('id') id: string, @UserId() userId: string) {
    await this.videoService.deleteReel(id, userId);
    return { success: true };
  }
}
