import { Injectable, Logger, NestMiddleware } from '@nestjs/common';
import { Request, Response, NextFunction } from 'express';
import { CacheService } from '../cache/cache.service';

// =====================================================
// TYPES
// =====================================================
export interface RequestMetrics {
  path: string;
  method: string;
  statusCode: number;
  duration: number;
  timestamp: Date;
}

export interface PerformanceStats {
  requests: {
    total: number;
    perSecond: number;
    avgDuration: number;
    p95Duration: number;
    p99Duration: number;
  };
  errors: {
    total: number;
    rate: number;
  };
  slowRequests: Array<{
    path: string;
    method: string;
    avgDuration: number;
    count: number;
  }>;
  cache: {
    hitRate: number;
    keys: number;
    memory: string;
  };
}

// =====================================================
// PERFORMANCE SERVICE
// =====================================================
@Injectable()
export class PerformanceService {
  private readonly logger = new Logger(PerformanceService.name);
  
  // In-memory metrics (for quick access)
  private metrics: {
    requests: RequestMetrics[];
    durations: Map<string, number[]>;
  } = {
    requests: [],
    durations: new Map(),
  };

  private readonly MAX_METRICS = 10000;
  private readonly SLOW_THRESHOLD_MS = 1000;

  constructor(private cache: CacheService) {
    // Cleanup old metrics every minute
    setInterval(() => this.cleanupMetrics(), 60000);
  }

  // =====================================================
  // RECORD METRICS
  // =====================================================

  /**
   * Record request metrics
   */
  recordRequest(metrics: RequestMetrics): void {
    this.metrics.requests.push(metrics);

    // Track durations by path
    const key = `${metrics.method}:${metrics.path}`;
    const durations = this.metrics.durations.get(key) || [];
    durations.push(metrics.duration);
    this.metrics.durations.set(key, durations.slice(-100)); // Keep last 100

    // Log slow requests
    if (metrics.duration > this.SLOW_THRESHOLD_MS) {
      this.logger.warn(
        `Slow request: ${metrics.method} ${metrics.path} took ${metrics.duration}ms`,
      );
    }
  }

  /**
   * Record custom metric
   */
  async recordMetric(name: string, value: number): Promise<void> {
    const key = `metrics:${name}:${this.getBucket()}`;
    await this.cache.incr(key, Math.round(value));
  }

  // =====================================================
  // GET STATS
  // =====================================================

  /**
   * Get performance statistics
   */
  async getStats(windowMinutes: number = 5): Promise<PerformanceStats> {
    const windowStart = Date.now() - windowMinutes * 60 * 1000;
    const recentRequests = this.metrics.requests.filter(
      (r) => r.timestamp.getTime() > windowStart,
    );

    // Calculate request stats
    const durations = recentRequests.map((r) => r.duration).sort((a, b) => a - b);
    const total = recentRequests.length;
    const avgDuration = total > 0 
      ? durations.reduce((a, b) => a + b, 0) / total 
      : 0;
    const p95Index = Math.floor(total * 0.95);
    const p99Index = Math.floor(total * 0.99);

    // Calculate error stats
    const errors = recentRequests.filter((r) => r.statusCode >= 500);

    // Get slow requests
    const slowRequests = this.getSlowRequests(windowStart);

    // Get cache stats
    const cacheStats = await this.cache.getStats();

    return {
      requests: {
        total,
        perSecond: total / (windowMinutes * 60),
        avgDuration: Math.round(avgDuration),
        p95Duration: durations[p95Index] || 0,
        p99Duration: durations[p99Index] || 0,
      },
      errors: {
        total: errors.length,
        rate: total > 0 ? (errors.length / total) * 100 : 0,
      },
      slowRequests,
      cache: {
        hitRate: cacheStats.hitRate,
        keys: cacheStats.keys,
        memory: cacheStats.memory,
      },
    };
  }

  /**
   * Get slow requests summary
   */
  private getSlowRequests(since: number): Array<{
    path: string;
    method: string;
    avgDuration: number;
    count: number;
  }> {
    const slowByPath = new Map<string, { total: number; count: number }>();

    for (const req of this.metrics.requests) {
      if (req.timestamp.getTime() < since) continue;
      if (req.duration < this.SLOW_THRESHOLD_MS) continue;

      const key = `${req.method}:${req.path}`;
      const existing = slowByPath.get(key) || { total: 0, count: 0 };
      slowByPath.set(key, {
        total: existing.total + req.duration,
        count: existing.count + 1,
      });
    }

    return Array.from(slowByPath.entries())
      .map(([key, stats]) => {
        const [method, path] = key.split(':');
        return {
          method,
          path,
          avgDuration: Math.round(stats.total / stats.count),
          count: stats.count,
        };
      })
      .sort((a, b) => b.avgDuration - a.avgDuration)
      .slice(0, 10);
  }

  // =====================================================
  // HEALTH CHECK
  // =====================================================

  /**
   * Get system health
   */
  async getHealth(): Promise<{
    status: 'healthy' | 'degraded' | 'unhealthy';
    checks: Record<string, { status: string; latency?: number }>;
  }> {
    const checks: Record<string, { status: string; latency?: number }> = {};

    // Check Redis
    try {
      const start = Date.now();
      await this.cache.exists('health-check');
      checks.redis = { status: 'ok', latency: Date.now() - start };
    } catch (error) {
      checks.redis = { status: 'error' };
    }

    // Check database (via cache service ping)
    // In production, add actual DB health check

    // Determine overall status
    const hasError = Object.values(checks).some((c) => c.status === 'error');
    const status = hasError ? 'unhealthy' : 'healthy';

    return { status, checks };
  }

  // =====================================================
  // HELPERS
  // =====================================================

  private cleanupMetrics(): void {
    const cutoff = Date.now() - 10 * 60 * 1000; // 10 minutes
    this.metrics.requests = this.metrics.requests.filter(
      (r) => r.timestamp.getTime() > cutoff,
    );

    // Keep under max
    if (this.metrics.requests.length > this.MAX_METRICS) {
      this.metrics.requests = this.metrics.requests.slice(-this.MAX_METRICS);
    }
  }

  private getBucket(): string {
    // 1-minute buckets
    const now = new Date();
    return `${now.getFullYear()}${(now.getMonth() + 1).toString().padStart(2, '0')}${now.getDate().toString().padStart(2, '0')}${now.getHours().toString().padStart(2, '0')}${now.getMinutes().toString().padStart(2, '0')}`;
  }
}

// =====================================================
// REQUEST LOGGING MIDDLEWARE
// =====================================================
@Injectable()
export class RequestLoggingMiddleware implements NestMiddleware {
  constructor(private performanceService: PerformanceService) {}

  use(req: Request, res: Response, next: NextFunction): void {
    const startTime = Date.now();

    res.on('finish', () => {
      const duration = Date.now() - startTime;

      // Normalize path (remove IDs)
      const path = req.path
        .replace(/[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}/gi, ':id')
        .replace(/\/\d+/g, '/:id');

      this.performanceService.recordRequest({
        path,
        method: req.method,
        statusCode: res.statusCode,
        duration,
        timestamp: new Date(),
      });
    });

    next();
  }
}

// =====================================================
// RESPONSE TIME HEADER INTERCEPTOR
// =====================================================
import { CallHandler, ExecutionContext, NestInterceptor } from '@nestjs/common';
import { Observable, tap } from 'rxjs';

@Injectable()
export class ResponseTimeInterceptor implements NestInterceptor {
  intercept(context: ExecutionContext, next: CallHandler): Observable<any> {
    const startTime = Date.now();
    const response = context.switchToHttp().getResponse();

    return next.handle().pipe(
      tap(() => {
        const duration = Date.now() - startTime;
        response.setHeader('X-Response-Time', `${duration}ms`);
      }),
    );
  }
}
