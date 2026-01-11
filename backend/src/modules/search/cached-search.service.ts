import { Injectable, Logger } from '@nestjs/common';
import { PrismaService } from '../../prisma/prisma.service';
import { CacheService } from '../cache/cache.service';
import { SearchService } from '../search/search.service';

// =====================================================
// TYPES
// =====================================================
export interface SearchOptions {
  query: string;
  categoryId?: string;
  businessId?: string;
  minPrice?: number;
  maxPrice?: number;
  sortBy?: string;
  limit?: number;
  offset?: number;
}

export interface SearchResult {
  products: any[];
  total: number;
  took: number;
  cached: boolean;
}

export interface AutocompleteResult {
  suggestions: string[];
  products: Array<{ id: string; name: string; image?: string; price: number }>;
  businesses: Array<{ id: string; name: string; logo?: string }>;
  cached: boolean;
}

// =====================================================
// CACHED SEARCH SERVICE
// =====================================================
@Injectable()
export class CachedSearchService {
  private readonly logger = new Logger(CachedSearchService.name);

  constructor(
    private prisma: PrismaService,
    private cache: CacheService,
    private searchService: SearchService,
  ) {}

  // =====================================================
  // SEARCH
  // =====================================================

  /**
   * Search products with caching
   */
  async search(options: SearchOptions): Promise<SearchResult> {
    const startTime = Date.now();
    const cacheKey = this.buildSearchCacheKey(options);

    // Try cache first
    const cached = await this.cache.get<{ products: any[]; total: number }>(cacheKey);
    
    if (cached) {
      return {
        ...cached,
        took: Date.now() - startTime,
        cached: true,
      };
    }

    // Perform search
    const result = await this.searchService.searchProducts({
      query: options.query,
      filters: {
        categoryId: options.categoryId,
        businessId: options.businessId,
        minPrice: options.minPrice,
        maxPrice: options.maxPrice,
      },
      sort: options.sortBy,
      limit: options.limit || 20,
      offset: options.offset || 0,
    });

    // Cache results
    await this.cache.set(
      cacheKey,
      { products: result.products, total: result.total },
      {
        ttl: CacheService.TTL.SHORT, // Short TTL for search results
        tags: ['search:results'],
      },
    );

    return {
      products: result.products,
      total: result.total,
      took: Date.now() - startTime,
      cached: false,
    };
  }

  /**
   * Autocomplete with caching
   */
  async autocomplete(query: string, limit: number = 5): Promise<AutocompleteResult> {
    const startTime = Date.now();
    const normalizedQuery = query.toLowerCase().trim();
    const cacheKey = `${CacheService.PREFIX.SEARCH}autocomplete:${normalizedQuery}:${limit}`;

    // Try cache
    const cached = await this.cache.get<Omit<AutocompleteResult, 'cached'>>(cacheKey);
    
    if (cached) {
      return { ...cached, cached: true };
    }

    // Get suggestions from recent searches
    const recentSearches = await this.prisma.searchAnalytics.findMany({
      where: {
        normalizedQuery: { startsWith: normalizedQuery },
        resultsCount: { gt: 0 },
      },
      distinct: ['normalizedQuery'],
      orderBy: { createdAt: 'desc' },
      take: limit,
      select: { normalizedQuery: true },
    });

    const suggestions = recentSearches.map((s) => s.normalizedQuery);

    // Get matching products
    const products = await this.prisma.product.findMany({
      where: {
        status: 'active',
        name: { contains: query, mode: 'insensitive' },
      },
      select: {
        id: true,
        name: true,
        price: true,
        images: { where: { isPrimary: true }, take: 1, select: { url: true } },
      },
      take: limit,
    });

    // Get matching businesses
    const businesses = await this.prisma.businessProfile.findMany({
      where: {
        status: 'approved',
        businessName: { contains: query, mode: 'insensitive' },
      },
      select: { id: true, businessName: true, logoUrl: true },
      take: 3,
    });

    const result = {
      suggestions,
      products: products.map((p) => ({
        id: p.id,
        name: p.name,
        price: p.price,
        image: p.images[0]?.url,
      })),
      businesses: businesses.map((b) => ({
        id: b.id,
        name: b.businessName,
        logo: b.logoUrl,
      })),
    };

    // Cache for longer (autocomplete is less dynamic)
    await this.cache.set(cacheKey, result, {
      ttl: CacheService.TTL.MEDIUM,
      tags: ['search:autocomplete'],
    });

    return { ...result, cached: false };
  }

  /**
   * Get popular searches
   */
  async getPopularSearches(limit: number = 10): Promise<string[]> {
    const cacheKey = `${CacheService.PREFIX.SEARCH}popular:${limit}`;

    return this.cache.getOrSet(
      cacheKey,
      async () => {
        const popular = await this.prisma.$queryRaw<{ query: string }[]>`
          SELECT normalized_query as query
          FROM search_analytics
          WHERE created_at >= NOW() - INTERVAL '7 days'
            AND results_count > 0
          GROUP BY normalized_query
          ORDER BY COUNT(*) DESC
          LIMIT ${limit}
        `;

        return popular.map((p) => p.query);
      },
      {
        ttl: CacheService.TTL.LONG,
        tags: ['search:popular'],
      },
    );
  }

  // =====================================================
  // CACHE INVALIDATION
  // =====================================================

  /**
   * Invalidate search cache
   */
  async invalidateSearchCache(): Promise<void> {
    await this.cache.invalidateTag('search:results');
    await this.cache.invalidateTag('search:autocomplete');
    this.logger.debug('Search cache invalidated');
  }

  /**
   * Invalidate popular searches cache
   */
  async invalidatePopularSearches(): Promise<void> {
    await this.cache.invalidateTag('search:popular');
  }

  // =====================================================
  // HELPERS
  // =====================================================

  private buildSearchCacheKey(options: SearchOptions): string {
    const parts = [
      CacheService.PREFIX.SEARCH,
      'q',
      this.hashQuery(options.query),
    ];

    if (options.categoryId) parts.push(`c:${options.categoryId}`);
    if (options.businessId) parts.push(`b:${options.businessId}`);
    if (options.minPrice) parts.push(`min:${options.minPrice}`);
    if (options.maxPrice) parts.push(`max:${options.maxPrice}`);
    if (options.sortBy) parts.push(`s:${options.sortBy}`);
    if (options.limit) parts.push(`l:${options.limit}`);
    if (options.offset) parts.push(`o:${options.offset}`);

    return parts.join(':');
  }

  private hashQuery(query: string): string {
    // Simple hash for cache key
    const normalized = query.toLowerCase().trim();
    let hash = 0;
    for (let i = 0; i < normalized.length; i++) {
      const char = normalized.charCodeAt(i);
      hash = (hash << 5) - hash + char;
      hash = hash & hash;
    }
    return Math.abs(hash).toString(36);
  }
}
