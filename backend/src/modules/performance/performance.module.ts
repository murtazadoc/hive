import { Module, Global, MiddlewareConsumer, NestModule } from '@nestjs/common';
import { CacheService } from './cache/cache.service';
import { CachedProductsService } from './products/cached-products.service';
import { CachedSearchService } from './search/cached-search.service';
import {
  PerformanceService,
  RequestLoggingMiddleware,
  ResponseTimeInterceptor,
} from './performance/performance.service';
import { ImageOptimizationService } from './media/image-optimization.service';
import { Controller, Get, UseGuards } from '@nestjs/common';
import { JwtAuthGuard } from './auth/guards/jwt-auth.guard';
import { ApiTags, ApiBearerAuth, ApiOperation } from '@nestjs/swagger';

// =====================================================
// CACHE MODULE
// =====================================================
@Global()
@Module({
  providers: [CacheService],
  exports: [CacheService],
})
export class CacheModule {}

// =====================================================
// PERFORMANCE MODULE
// =====================================================
@Module({
  providers: [
    PerformanceService,
    RequestLoggingMiddleware,
    ResponseTimeInterceptor,
  ],
  exports: [PerformanceService, ResponseTimeInterceptor],
})
export class PerformanceModule implements NestModule {
  configure(consumer: MiddlewareConsumer) {
    consumer.apply(RequestLoggingMiddleware).forRoutes('*');
  }
}

// =====================================================
// IMAGE OPTIMIZATION MODULE
// =====================================================
@Module({
  providers: [ImageOptimizationService],
  exports: [ImageOptimizationService],
})
export class ImageOptimizationModule {}

// =====================================================
// HEALTH & METRICS CONTROLLER
// =====================================================
@ApiTags('health')
@Controller()
export class HealthController {
  constructor(
    private performanceService: PerformanceService,
    private cacheService: CacheService,
  ) {}

  @Get('health')
  @ApiOperation({ summary: 'Health check' })
  async health() {
    return this.performanceService.getHealth();
  }

  @Get('health/live')
  @ApiOperation({ summary: 'Liveness probe' })
  live() {
    return { status: 'ok', timestamp: new Date().toISOString() };
  }

  @Get('health/ready')
  @ApiOperation({ summary: 'Readiness probe' })
  async ready() {
    const health = await this.performanceService.getHealth();
    if (health.status === 'unhealthy') {
      throw new Error('Service not ready');
    }
    return { status: 'ready', timestamp: new Date().toISOString() };
  }
}

@ApiTags('admin-metrics')
@Controller('admin/metrics')
@UseGuards(JwtAuthGuard)
@ApiBearerAuth()
export class MetricsController {
  constructor(
    private performanceService: PerformanceService,
    private cacheService: CacheService,
  ) {}

  @Get()
  @ApiOperation({ summary: 'Get performance metrics' })
  async getMetrics() {
    return this.performanceService.getStats(5);
  }

  @Get('cache')
  @ApiOperation({ summary: 'Get cache stats' })
  async getCacheStats() {
    return this.cacheService.getStats();
  }
}

// =====================================================
// OPTIMIZED PRODUCTS MODULE
// =====================================================
@Module({
  imports: [CacheModule],
  providers: [CachedProductsService],
  exports: [CachedProductsService],
})
export class OptimizedProductsModule {}

// =====================================================
// OPTIMIZED SEARCH MODULE
// =====================================================
@Module({
  imports: [CacheModule],
  providers: [CachedSearchService],
  exports: [CachedSearchService],
})
export class OptimizedSearchModule {}
