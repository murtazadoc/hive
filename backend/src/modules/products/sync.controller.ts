import {
  Controller,
  Get,
  Post,
  Body,
  Param,
  Query,
  UseGuards,
} from '@nestjs/common';
import {
  ApiTags,
  ApiOperation,
  ApiBearerAuth,
} from '@nestjs/swagger';
import { SyncService } from './sync.service';
import { SyncPushDto, SyncPullDto } from './dto/product.dto';
import { JwtAuthGuard } from '../auth/guards/jwt-auth.guard';
import { UserId } from '../auth/decorators/public.decorator';

@ApiTags('sync')
@Controller('businesses/:businessId/sync')
@UseGuards(JwtAuthGuard)
@ApiBearerAuth()
export class SyncController {
  constructor(private readonly syncService: SyncService) {}

  // =====================================================
  // PUSH CHANGES TO SERVER
  // =====================================================
  @Post('push')
  @ApiOperation({ summary: 'Push local changes to server' })
  async pushChanges(
    @Param('businessId') businessId: string,
    @UserId() userId: string,
    @Body() dto: SyncPushDto,
  ) {
    return this.syncService.pushChanges(userId, businessId, dto);
  }

  // =====================================================
  // PULL CHANGES FROM SERVER
  // =====================================================
  @Post('pull')
  @ApiOperation({ summary: 'Pull changes from server since last sync' })
  async pullChanges(
    @Param('businessId') businessId: string,
    @UserId() userId: string,
    @Body() dto: SyncPullDto,
  ) {
    return this.syncService.pullChanges(userId, businessId, dto);
  }

  // =====================================================
  // FULL SYNC (Initial)
  // =====================================================
  @Get('full')
  @ApiOperation({ summary: 'Get all data for initial sync' })
  async fullSync(
    @Param('businessId') businessId: string,
    @UserId() userId: string,
    @Query('deviceId') deviceId: string,
  ) {
    return this.syncService.fullSync(userId, businessId, deviceId);
  }

  // =====================================================
  // CHECKPOINT
  // =====================================================
  @Get('checkpoint')
  @ApiOperation({ summary: 'Get last sync checkpoint' })
  async getCheckpoint(
    @Param('businessId') businessId: string,
    @UserId() userId: string,
    @Query('deviceId') deviceId: string,
  ) {
    return this.syncService.getCheckpoint(userId, businessId, deviceId);
  }

  // =====================================================
  // CONFLICTS
  // =====================================================
  @Get('conflicts')
  @ApiOperation({ summary: 'Get unresolved sync conflicts' })
  async getConflicts(
    @Param('businessId') businessId: string,
    @UserId() userId: string,
  ) {
    return this.syncService.getConflicts(userId, businessId);
  }

  @Post('conflicts/:conflictId/resolve')
  @ApiOperation({ summary: 'Resolve a sync conflict' })
  async resolveConflict(
    @Param('conflictId') conflictId: string,
    @Body() dto: {
      resolution: 'keep_server' | 'keep_client' | 'merge';
      mergedData?: any;
    },
  ) {
    return this.syncService.resolveConflict(
      conflictId,
      dto.resolution,
      dto.mergedData,
    );
  }
}
