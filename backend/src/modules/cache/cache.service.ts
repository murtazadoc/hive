import { Injectable, Logger, OnModuleInit, OnModuleDestroy } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import Redis from 'ioredis';

// =====================================================
// TYPES
// =====================================================
export interface CacheOptions {
  ttl?: number;           // Time to live in seconds
  tags?: string[];        // Cache tags for invalidation
}

export interface CacheStats {
  hits: number;
  misses: number;
  hitRate: number;
  keys: number;
  memory: string;
}

// =====================================================
// REDIS CACHE SERVICE
// =====================================================
@Injectable()
export class CacheService implements OnModuleInit, OnModuleDestroy {
  private readonly logger = new Logger(CacheService.name);
  private client: Redis;
  private subscriber: Redis;
  
  // Default TTLs (seconds)
  static readonly TTL = {
    SHORT: 60,              // 1 minute
    MEDIUM: 300,            // 5 minutes
    LONG: 3600,             // 1 hour
    DAY: 86400,             // 24 hours
    WEEK: 604800,           // 7 days
  };

  // Cache key prefixes
  static readonly PREFIX = {
    PRODUCT: 'product:',
    PRODUCTS: 'products:',
    BUSINESS: 'business:',
    USER: 'user:',
    SEARCH: 'search:',
    FEED: 'feed:',
    REEL: 'reel:',
    SESSION: 'session:',
    RATE_LIMIT: 'rate:',
    LOCK: 'lock:',
  };

  constructor(private configService: ConfigService) {}

  async onModuleInit() {
    const redisUrl = this.configService.get('REDIS_URL') || 'redis://localhost:6379';
    
    this.client = new Redis(redisUrl, {
      maxRetriesPerRequest: 3,
      retryStrategy: (times) => Math.min(times * 50, 2000),
    });

    this.subscriber = new Redis(redisUrl);

    this.client.on('connect', () => {
      this.logger.log('Redis connected');
    });

    this.client.on('error', (error) => {
      this.logger.error(`Redis error: ${error.message}`);
    });

    // Subscribe to cache invalidation events
    this.subscriber.subscribe('cache:invalidate');
    this.subscriber.on('message', (channel, message) => {
      if (channel === 'cache:invalidate') {
        this.handleInvalidation(message);
      }
    });
  }

  async onModuleDestroy() {
    await this.client.quit();
    await this.subscriber.quit();
  }

  // =====================================================
  // BASIC OPERATIONS
  // =====================================================

  /**
   * Get value from cache
   */
  async get<T>(key: string): Promise<T | null> {
    try {
      const value = await this.client.get(key);
      if (!value) return null;
      return JSON.parse(value) as T;
    } catch (error) {
      this.logger.error(`Cache get error: ${error}`);
      return null;
    }
  }

  /**
   * Set value in cache
   */
  async set(key: string, value: any, options?: CacheOptions): Promise<void> {
    try {
      const serialized = JSON.stringify(value);
      const ttl = options?.ttl || CacheService.TTL.MEDIUM;

      await this.client.setex(key, ttl, serialized);

      // Store tag associations
      if (options?.tags) {
        for (const tag of options.tags) {
          await this.client.sadd(`tag:${tag}`, key);
        }
      }
    } catch (error) {
      this.logger.error(`Cache set error: ${error}`);
    }
  }

  /**
   * Delete from cache
   */
  async del(key: string): Promise<void> {
    try {
      await this.client.del(key);
    } catch (error) {
      this.logger.error(`Cache del error: ${error}`);
    }
  }

  /**
   * Check if key exists
   */
  async exists(key: string): Promise<boolean> {
    try {
      return (await this.client.exists(key)) === 1;
    } catch (error) {
      return false;
    }
  }

  /**
   * Get or set (cache-aside pattern)
   */
  async getOrSet<T>(
    key: string,
    factory: () => Promise<T>,
    options?: CacheOptions,
  ): Promise<T> {
    // Try cache first
    const cached = await this.get<T>(key);
    if (cached !== null) {
      return cached;
    }

    // Fetch from source
    const value = await factory();

    // Cache the result
    await this.set(key, value, options);

    return value;
  }

  // =====================================================
  // BATCH OPERATIONS
  // =====================================================

  /**
   * Get multiple values
   */
  async mget<T>(keys: string[]): Promise<(T | null)[]> {
    try {
      const values = await this.client.mget(keys);
      return values.map((v) => (v ? JSON.parse(v) : null));
    } catch (error) {
      this.logger.error(`Cache mget error: ${error}`);
      return keys.map(() => null);
    }
  }

  /**
   * Set multiple values
   */
  async mset(entries: Array<{ key: string; value: any; ttl?: number }>): Promise<void> {
    try {
      const pipeline = this.client.pipeline();
      
      for (const entry of entries) {
        const ttl = entry.ttl || CacheService.TTL.MEDIUM;
        pipeline.setex(entry.key, ttl, JSON.stringify(entry.value));
      }

      await pipeline.exec();
    } catch (error) {
      this.logger.error(`Cache mset error: ${error}`);
    }
  }

  /**
   * Delete multiple keys by pattern
   */
  async delByPattern(pattern: string): Promise<number> {
    try {
      let cursor = '0';
      let deletedCount = 0;

      do {
        const [nextCursor, keys] = await this.client.scan(
          cursor,
          'MATCH',
          pattern,
          'COUNT',
          100,
        );
        cursor = nextCursor;

        if (keys.length > 0) {
          await this.client.del(...keys);
          deletedCount += keys.length;
        }
      } while (cursor !== '0');

      return deletedCount;
    } catch (error) {
      this.logger.error(`Cache delByPattern error: ${error}`);
      return 0;
    }
  }

  // =====================================================
  // TAG-BASED INVALIDATION
  // =====================================================

  /**
   * Invalidate all keys with a specific tag
   */
  async invalidateTag(tag: string): Promise<number> {
    try {
      const keys = await this.client.smembers(`tag:${tag}`);
      
      if (keys.length === 0) return 0;

      await this.client.del(...keys);
      await this.client.del(`tag:${tag}`);

      // Publish invalidation event for distributed cache
      await this.client.publish('cache:invalidate', JSON.stringify({ tag }));

      return keys.length;
    } catch (error) {
      this.logger.error(`Cache invalidateTag error: ${error}`);
      return 0;
    }
  }

  /**
   * Handle invalidation from pub/sub
   */
  private async handleInvalidation(message: string): Promise<void> {
    try {
      const { tag, key, pattern } = JSON.parse(message);
      
      if (key) {
        await this.del(key);
      } else if (pattern) {
        await this.delByPattern(pattern);
      }
      // Tag invalidation already handled by publisher
    } catch (error) {
      this.logger.error(`Invalidation handler error: ${error}`);
    }
  }

  // =====================================================
  // RATE LIMITING
  // =====================================================

  /**
   * Check and increment rate limit
   */
  async checkRateLimit(
    key: string,
    limit: number,
    windowSeconds: number,
  ): Promise<{ allowed: boolean; remaining: number; resetAt: number }> {
    const rateLimitKey = `${CacheService.PREFIX.RATE_LIMIT}${key}`;
    
    try {
      const now = Date.now();
      const windowStart = now - windowSeconds * 1000;

      // Remove old entries
      await this.client.zremrangebyscore(rateLimitKey, 0, windowStart);

      // Count current requests
      const count = await this.client.zcard(rateLimitKey);

      if (count >= limit) {
        const oldestEntry = await this.client.zrange(rateLimitKey, 0, 0, 'WITHSCORES');
        const resetAt = oldestEntry.length > 1 
          ? parseInt(oldestEntry[1]) + windowSeconds * 1000 
          : now + windowSeconds * 1000;

        return { allowed: false, remaining: 0, resetAt };
      }

      // Add current request
      await this.client.zadd(rateLimitKey, now, `${now}-${Math.random()}`);
      await this.client.expire(rateLimitKey, windowSeconds);

      return {
        allowed: true,
        remaining: limit - count - 1,
        resetAt: now + windowSeconds * 1000,
      };
    } catch (error) {
      this.logger.error(`Rate limit error: ${error}`);
      return { allowed: true, remaining: limit, resetAt: Date.now() };
    }
  }

  // =====================================================
  // DISTRIBUTED LOCKING
  // =====================================================

  /**
   * Acquire a distributed lock
   */
  async acquireLock(
    resource: string,
    ttlMs: number = 10000,
  ): Promise<string | null> {
    const lockKey = `${CacheService.PREFIX.LOCK}${resource}`;
    const lockValue = `${Date.now()}-${Math.random()}`;

    try {
      const acquired = await this.client.set(
        lockKey,
        lockValue,
        'PX',
        ttlMs,
        'NX',
      );

      return acquired ? lockValue : null;
    } catch (error) {
      this.logger.error(`Lock acquire error: ${error}`);
      return null;
    }
  }

  /**
   * Release a distributed lock
   */
  async releaseLock(resource: string, lockValue: string): Promise<boolean> {
    const lockKey = `${CacheService.PREFIX.LOCK}${resource}`;

    // Lua script for atomic check-and-delete
    const script = `
      if redis.call("get", KEYS[1]) == ARGV[1] then
        return redis.call("del", KEYS[1])
      else
        return 0
      end
    `;

    try {
      const result = await this.client.eval(script, 1, lockKey, lockValue);
      return result === 1;
    } catch (error) {
      this.logger.error(`Lock release error: ${error}`);
      return false;
    }
  }

  // =====================================================
  // COUNTERS & LEADERBOARDS
  // =====================================================

  /**
   * Increment a counter
   */
  async incr(key: string, by: number = 1): Promise<number> {
    try {
      if (by === 1) {
        return await this.client.incr(key);
      }
      return await this.client.incrby(key, by);
    } catch (error) {
      this.logger.error(`Counter incr error: ${error}`);
      return 0;
    }
  }

  /**
   * Add to sorted set (leaderboard)
   */
  async zadd(key: string, score: number, member: string): Promise<void> {
    try {
      await this.client.zadd(key, score, member);
    } catch (error) {
      this.logger.error(`Sorted set add error: ${error}`);
    }
  }

  /**
   * Get top N from sorted set
   */
  async zrevrange(key: string, start: number, stop: number): Promise<string[]> {
    try {
      return await this.client.zrevrange(key, start, stop);
    } catch (error) {
      this.logger.error(`Sorted set range error: ${error}`);
      return [];
    }
  }

  // =====================================================
  // STATS
  // =====================================================

  /**
   * Get cache statistics
   */
  async getStats(): Promise<CacheStats> {
    try {
      const info = await this.client.info('stats');
      const memory = await this.client.info('memory');
      const dbSize = await this.client.dbsize();

      const hits = parseInt(info.match(/keyspace_hits:(\d+)/)?.[1] || '0');
      const misses = parseInt(info.match(/keyspace_misses:(\d+)/)?.[1] || '0');
      const usedMemory = memory.match(/used_memory_human:(\S+)/)?.[1] || '0B';

      return {
        hits,
        misses,
        hitRate: hits + misses > 0 ? (hits / (hits + misses)) * 100 : 0,
        keys: dbSize,
        memory: usedMemory,
      };
    } catch (error) {
      this.logger.error(`Stats error: ${error}`);
      return { hits: 0, misses: 0, hitRate: 0, keys: 0, memory: '0B' };
    }
  }

  /**
   * Flush all keys (use with caution!)
   */
  async flushAll(): Promise<void> {
    try {
      await this.client.flushall();
      this.logger.warn('Cache flushed');
    } catch (error) {
      this.logger.error(`Flush error: ${error}`);
    }
  }
}
