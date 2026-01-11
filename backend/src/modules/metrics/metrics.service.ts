import { Injectable, OnModuleInit } from '@nestjs/common';
import { collectDefaultMetrics, Counter, Histogram, Gauge, Registry } from 'prom-client';

// =====================================================
// PROMETHEUS METRICS SERVICE
// =====================================================
@Injectable()
export class MetricsService implements OnModuleInit {
  private readonly registry: Registry;

  // HTTP Metrics
  public readonly httpRequestsTotal: Counter;
  public readonly httpRequestDuration: Histogram;
  public readonly httpRequestsInProgress: Gauge;

  // Business Metrics
  public readonly ordersTotal: Counter;
  public readonly orderValue: Histogram;
  public readonly activeUsers: Gauge;
  public readonly activeSessions: Gauge;

  // Cache Metrics
  public readonly cacheHits: Counter;
  public readonly cacheMisses: Counter;

  // Database Metrics
  public readonly dbQueryDuration: Histogram;
  public readonly dbConnectionsActive: Gauge;

  // External Service Metrics
  public readonly externalRequestDuration: Histogram;
  public readonly mpesaTransactions: Counter;

  constructor() {
    this.registry = new Registry();

    // =====================================================
    // HTTP METRICS
    // =====================================================
    this.httpRequestsTotal = new Counter({
      name: 'http_requests_total',
      help: 'Total number of HTTP requests',
      labelNames: ['method', 'path', 'status'],
      registers: [this.registry],
    });

    this.httpRequestDuration = new Histogram({
      name: 'http_request_duration_seconds',
      help: 'HTTP request duration in seconds',
      labelNames: ['method', 'path', 'status'],
      buckets: [0.01, 0.05, 0.1, 0.25, 0.5, 1, 2.5, 5, 10],
      registers: [this.registry],
    });

    this.httpRequestsInProgress = new Gauge({
      name: 'http_requests_in_progress',
      help: 'Number of HTTP requests in progress',
      labelNames: ['method'],
      registers: [this.registry],
    });

    // =====================================================
    // BUSINESS METRICS
    // =====================================================
    this.ordersTotal = new Counter({
      name: 'hive_orders_total',
      help: 'Total number of orders',
      labelNames: ['status', 'payment_method'],
      registers: [this.registry],
    });

    this.orderValue = new Histogram({
      name: 'hive_order_value_kes',
      help: 'Order value in KES',
      buckets: [100, 500, 1000, 2500, 5000, 10000, 25000, 50000],
      registers: [this.registry],
    });

    this.activeUsers = new Gauge({
      name: 'hive_active_users',
      help: 'Number of active users (last 5 minutes)',
      registers: [this.registry],
    });

    this.activeSessions = new Gauge({
      name: 'hive_active_sessions',
      help: 'Number of active sessions',
      registers: [this.registry],
    });

    // =====================================================
    // CACHE METRICS
    // =====================================================
    this.cacheHits = new Counter({
      name: 'hive_cache_hits_total',
      help: 'Total cache hits',
      labelNames: ['cache_type'],
      registers: [this.registry],
    });

    this.cacheMisses = new Counter({
      name: 'hive_cache_misses_total',
      help: 'Total cache misses',
      labelNames: ['cache_type'],
      registers: [this.registry],
    });

    // =====================================================
    // DATABASE METRICS
    // =====================================================
    this.dbQueryDuration = new Histogram({
      name: 'hive_db_query_duration_seconds',
      help: 'Database query duration in seconds',
      labelNames: ['operation', 'table'],
      buckets: [0.001, 0.005, 0.01, 0.025, 0.05, 0.1, 0.25, 0.5, 1],
      registers: [this.registry],
    });

    this.dbConnectionsActive = new Gauge({
      name: 'hive_db_connections_active',
      help: 'Number of active database connections',
      registers: [this.registry],
    });

    // =====================================================
    // EXTERNAL SERVICE METRICS
    // =====================================================
    this.externalRequestDuration = new Histogram({
      name: 'hive_external_request_duration_seconds',
      help: 'External API request duration',
      labelNames: ['service', 'endpoint', 'status'],
      buckets: [0.1, 0.25, 0.5, 1, 2.5, 5, 10],
      registers: [this.registry],
    });

    this.mpesaTransactions = new Counter({
      name: 'hive_mpesa_transactions_total',
      help: 'Total M-Pesa transactions',
      labelNames: ['type', 'status'],
      registers: [this.registry],
    });
  }

  onModuleInit() {
    // Collect default Node.js metrics
    collectDefaultMetrics({ register: this.registry });
  }

  // =====================================================
  // GET METRICS
  // =====================================================
  async getMetrics(): Promise<string> {
    return this.registry.metrics();
  }

  getContentType(): string {
    return this.registry.contentType;
  }

  // =====================================================
  // HELPER METHODS
  // =====================================================

  /**
   * Record HTTP request metrics
   */
  recordHttpRequest(
    method: string,
    path: string,
    status: number,
    duration: number,
  ): void {
    const labels = { method, path: this.normalizePath(path), status: String(status) };
    this.httpRequestsTotal.inc(labels);
    this.httpRequestDuration.observe(labels, duration / 1000);
  }

  /**
   * Record order metrics
   */
  recordOrder(status: string, paymentMethod: string, value: number): void {
    this.ordersTotal.inc({ status, payment_method: paymentMethod });
    this.orderValue.observe(value);
  }

  /**
   * Record cache metrics
   */
  recordCacheHit(cacheType: string): void {
    this.cacheHits.inc({ cache_type: cacheType });
  }

  recordCacheMiss(cacheType: string): void {
    this.cacheMisses.inc({ cache_type: cacheType });
  }

  /**
   * Record database query metrics
   */
  recordDbQuery(operation: string, table: string, duration: number): void {
    this.dbQueryDuration.observe({ operation, table }, duration / 1000);
  }

  /**
   * Record external service metrics
   */
  recordExternalRequest(
    service: string,
    endpoint: string,
    status: number,
    duration: number,
  ): void {
    this.externalRequestDuration.observe(
      { service, endpoint, status: String(status) },
      duration / 1000,
    );
  }

  /**
   * Record M-Pesa transaction
   */
  recordMpesaTransaction(type: string, status: string): void {
    this.mpesaTransactions.inc({ type, status });
  }

  /**
   * Update active users gauge
   */
  setActiveUsers(count: number): void {
    this.activeUsers.set(count);
  }

  /**
   * Update active sessions gauge
   */
  setActiveSessions(count: number): void {
    this.activeSessions.set(count);
  }

  /**
   * Normalize path for metrics (remove IDs)
   */
  private normalizePath(path: string): string {
    return path
      .replace(/[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}/gi, ':id')
      .replace(/\/\d+/g, '/:id');
  }
}

// =====================================================
// METRICS CONTROLLER
// =====================================================
import { Controller, Get, Header } from '@nestjs/common';

@Controller('metrics')
export class MetricsController {
  constructor(private readonly metricsService: MetricsService) {}

  @Get()
  @Header('Content-Type', 'text/plain')
  async getMetrics(): Promise<string> {
    return this.metricsService.getMetrics();
  }
}

// =====================================================
// METRICS INTERCEPTOR
// =====================================================
import {
  Injectable as InterceptorInjectable,
  NestInterceptor,
  ExecutionContext,
  CallHandler,
} from '@nestjs/common';
import { Observable, tap } from 'rxjs';
import { Request, Response } from 'express';

@InterceptorInjectable()
export class MetricsInterceptor implements NestInterceptor {
  constructor(private readonly metricsService: MetricsService) {}

  intercept(context: ExecutionContext, next: CallHandler): Observable<any> {
    const startTime = Date.now();
    const request = context.switchToHttp().getRequest<Request>();
    
    this.metricsService.httpRequestsInProgress.inc({ method: request.method });

    return next.handle().pipe(
      tap({
        next: () => {
          const response = context.switchToHttp().getResponse<Response>();
          const duration = Date.now() - startTime;
          
          this.metricsService.recordHttpRequest(
            request.method,
            request.path,
            response.statusCode,
            duration,
          );
          this.metricsService.httpRequestsInProgress.dec({ method: request.method });
        },
        error: () => {
          this.metricsService.httpRequestsInProgress.dec({ method: request.method });
        },
      }),
    );
  }
}

// =====================================================
// METRICS MODULE
// =====================================================
import { Module, Global } from '@nestjs/common';

@Global()
@Module({
  controllers: [MetricsController],
  providers: [MetricsService, MetricsInterceptor],
  exports: [MetricsService, MetricsInterceptor],
})
export class MetricsModule {}
