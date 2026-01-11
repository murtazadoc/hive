import {
  Controller,
  Get,
  Post,
  Body,
  Query,
  Param,
  UseGuards,
  HttpCode,
  HttpStatus,
} from '@nestjs/common';
import { ApiTags, ApiOperation, ApiBearerAuth } from '@nestjs/swagger';
import { JwtAuthGuard } from '../auth/guards/jwt-auth.guard';
import { Public, UserId } from '../auth/decorators/public.decorator';
import { AnalyticsService, TrackEventDto, PageViewDto } from './analytics.service';

// =====================================================
// EVENT TRACKING CONTROLLER (Public)
// =====================================================
@ApiTags('tracking')
@Controller('track')
export class TrackingController {
  constructor(private readonly analyticsService: AnalyticsService) {}

  @Post('event')
  @Public()
  @HttpCode(HttpStatus.OK)
  @ApiOperation({ summary: 'Track an event' })
  async trackEvent(@Body() event: TrackEventDto) {
    await this.analyticsService.track(event);
    return { success: true };
  }

  @Post('events')
  @Public()
  @HttpCode(HttpStatus.OK)
  @ApiOperation({ summary: 'Track batch events' })
  async trackBatch(@Body() body: { events: TrackEventDto[] }) {
    await this.analyticsService.trackBatch(body.events);
    return { success: true, count: body.events.length };
  }

  @Post('pageview')
  @Public()
  @HttpCode(HttpStatus.OK)
  @ApiOperation({ summary: 'Track page view' })
  async trackPageView(@Body() pageView: PageViewDto) {
    await this.analyticsService.trackPageView(pageView);
    return { success: true };
  }

  @Post('session/start')
  @Public()
  @HttpCode(HttpStatus.OK)
  @ApiOperation({ summary: 'Start a session' })
  async startSession(
    @Body() body: {
      sessionId: string;
      userId?: string;
      anonymousId?: string;
      entryPage?: string;
      utmSource?: string;
      utmMedium?: string;
      utmCampaign?: string;
      referrer?: string;
      deviceType?: string;
      platform?: string;
      browser?: string;
      country?: string;
      city?: string;
    },
  ) {
    await this.analyticsService.startSession(body);
    return { success: true };
  }

  @Post('session/end')
  @Public()
  @HttpCode(HttpStatus.OK)
  @ApiOperation({ summary: 'End a session' })
  async endSession(@Body() body: { sessionId: string }) {
    await this.analyticsService.endSession(body.sessionId);
    return { success: true };
  }
}

// =====================================================
// ADMIN ANALYTICS CONTROLLER
// =====================================================
@ApiTags('admin-analytics')
@Controller('admin/analytics')
@UseGuards(JwtAuthGuard)
@ApiBearerAuth()
export class AdminAnalyticsController {
  constructor(private readonly analyticsService: AnalyticsService) {}

  @Get('overview')
  @ApiOperation({ summary: 'Get platform overview stats' })
  async getOverview(
    @Query('startDate') startDate: string,
    @Query('endDate') endDate: string,
  ) {
    return this.analyticsService.getPlatformStats({
      startDate: new Date(startDate),
      endDate: new Date(endDate),
    });
  }

  @Get('daily')
  @ApiOperation({ summary: 'Get daily stats for charts' })
  async getDailyStats(
    @Query('startDate') startDate: string,
    @Query('endDate') endDate: string,
    @Query('metrics') metrics?: string,
  ) {
    return this.analyticsService.getDailyStats(
      {
        startDate: new Date(startDate),
        endDate: new Date(endDate),
      },
      metrics?.split(','),
    );
  }

  @Get('top-pages')
  @ApiOperation({ summary: 'Get top pages' })
  async getTopPages(
    @Query('startDate') startDate: string,
    @Query('endDate') endDate: string,
    @Query('limit') limit?: number,
  ) {
    return this.analyticsService.getTopPages(
      {
        startDate: new Date(startDate),
        endDate: new Date(endDate),
      },
      limit,
    );
  }

  @Get('traffic-sources')
  @ApiOperation({ summary: 'Get traffic sources' })
  async getTrafficSources(
    @Query('startDate') startDate: string,
    @Query('endDate') endDate: string,
  ) {
    return this.analyticsService.getTrafficSources({
      startDate: new Date(startDate),
      endDate: new Date(endDate),
    });
  }

  @Get('top-searches')
  @ApiOperation({ summary: 'Get top searches' })
  async getTopSearches(
    @Query('startDate') startDate: string,
    @Query('endDate') endDate: string,
    @Query('limit') limit?: number,
  ) {
    return this.analyticsService.getTopSearches(
      {
        startDate: new Date(startDate),
        endDate: new Date(endDate),
      },
      limit,
    );
  }

  @Get('zero-results')
  @ApiOperation({ summary: 'Get zero result searches' })
  async getZeroResultSearches(
    @Query('startDate') startDate: string,
    @Query('endDate') endDate: string,
    @Query('limit') limit?: number,
  ) {
    return this.analyticsService.getZeroResultSearches(
      {
        startDate: new Date(startDate),
        endDate: new Date(endDate),
      },
      limit,
    );
  }

  @Get('funnel/:funnelName')
  @ApiOperation({ summary: 'Get funnel conversion' })
  async getFunnelConversion(
    @Param('funnelName') funnelName: string,
    @Query('startDate') startDate: string,
    @Query('endDate') endDate: string,
  ) {
    return this.analyticsService.getFunnelConversion(funnelName, {
      startDate: new Date(startDate),
      endDate: new Date(endDate),
    });
  }
}

// =====================================================
// BUSINESS ANALYTICS CONTROLLER
// =====================================================
@ApiTags('business-analytics')
@Controller('businesses/:businessId/analytics')
@UseGuards(JwtAuthGuard)
@ApiBearerAuth()
export class BusinessAnalyticsController {
  constructor(private readonly analyticsService: AnalyticsService) {}

  @Get('overview')
  @ApiOperation({ summary: 'Get business overview stats' })
  async getOverview(
    @Param('businessId') businessId: string,
    @Query('startDate') startDate: string,
    @Query('endDate') endDate: string,
  ) {
    return this.analyticsService.getBusinessStats(businessId, {
      startDate: new Date(startDate),
      endDate: new Date(endDate),
    });
  }

  @Get('daily')
  @ApiOperation({ summary: 'Get business daily stats' })
  async getDailyStats(
    @Param('businessId') businessId: string,
    @Query('startDate') startDate: string,
    @Query('endDate') endDate: string,
  ) {
    return this.analyticsService.getBusinessDailyStats(businessId, {
      startDate: new Date(startDate),
      endDate: new Date(endDate),
    });
  }

  @Get('top-products')
  @ApiOperation({ summary: 'Get top products' })
  async getTopProducts(
    @Param('businessId') businessId: string,
    @Query('startDate') startDate: string,
    @Query('endDate') endDate: string,
    @Query('limit') limit?: number,
  ) {
    return this.analyticsService.getBusinessTopProducts(
      businessId,
      {
        startDate: new Date(startDate),
        endDate: new Date(endDate),
      },
      limit,
    );
  }
}

// =====================================================
// PRODUCT ANALYTICS CONTROLLER
// =====================================================
@ApiTags('product-analytics')
@Controller('products/:productId/analytics')
@UseGuards(JwtAuthGuard)
@ApiBearerAuth()
export class ProductAnalyticsController {
  constructor(private readonly analyticsService: AnalyticsService) {}

  @Get()
  @ApiOperation({ summary: 'Get product stats' })
  async getStats(
    @Param('productId') productId: string,
    @Query('startDate') startDate: string,
    @Query('endDate') endDate: string,
  ) {
    return this.analyticsService.getProductStats(productId, {
      startDate: new Date(startDate),
      endDate: new Date(endDate),
    });
  }
}
