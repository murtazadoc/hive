import { Injectable, Logger } from '@nestjs/common';
import { PrismaService } from '../../prisma/prisma.service';
import { EmbeddingService, EntityType, SimilarityResult } from './embedding.service';

// =====================================================
// TYPES
// =====================================================
export interface SearchFilters {
  // Location
  city?: string;
  county?: string;
  latitude?: number;
  longitude?: number;
  radiusKm?: number;

  // Product specific
  categoryId?: string;
  priceMin?: number;
  priceMax?: number;
  inStock?: boolean;
  
  // Business specific
  businessType?: 'retail' | 'professional' | 'both';
  isVerified?: boolean;
  
  // Pagination
  page?: number;
  limit?: number;
  
  // Search mode
  searchMode?: 'hybrid' | 'semantic' | 'keyword';
}

export interface SearchResult<T> {
  data: T[];
  total: number;
  page: number;
  limit: number;
  query: string;
  filters: SearchFilters;
  searchMode: string;
  took: number; // milliseconds
}

export interface ProductSearchResult {
  id: string;
  name: string;
  slug: string;
  description?: string;
  price: number;
  compareAtPrice?: number;
  currency: string;
  quantity: number;
  status: string;
  thumbnailUrl?: string;
  businessName: string;
  businessSlug: string;
  businessLogo?: string;
  city?: string;
  similarity?: number;
  matchType: 'semantic' | 'keyword' | 'hybrid';
}

export interface BusinessSearchResult {
  id: string;
  businessName: string;
  slug: string;
  description?: string;
  logoUrl?: string;
  coverImageUrl?: string;
  businessType: string;
  city?: string;
  county?: string;
  isVerified: boolean;
  productCount: number;
  similarity?: number;
  matchType: 'semantic' | 'keyword' | 'hybrid';
}

// =====================================================
// SEARCH SERVICE
// =====================================================
@Injectable()
export class SearchService {
  private readonly logger = new Logger(SearchService.name);

  constructor(
    private prisma: PrismaService,
    private embeddingService: EmbeddingService,
  ) {}

  // =====================================================
  // UNIFIED SEARCH (Products + Businesses)
  // =====================================================
  async search(
    query: string,
    filters: SearchFilters = {},
  ): Promise<{
    products: SearchResult<ProductSearchResult>;
    businesses: SearchResult<BusinessSearchResult>;
  }> {
    const startTime = Date.now();

    const [products, businesses] = await Promise.all([
      this.searchProducts(query, { ...filters, limit: filters.limit || 10 }),
      this.searchBusinesses(query, { ...filters, limit: filters.limit || 5 }),
    ]);

    return { products, businesses };
  }

  // =====================================================
  // SEARCH PRODUCTS
  // =====================================================
  async searchProducts(
    query: string,
    filters: SearchFilters = {},
  ): Promise<SearchResult<ProductSearchResult>> {
    const startTime = Date.now();
    const page = filters.page || 1;
    const limit = filters.limit || 20;
    const searchMode = filters.searchMode || 'hybrid';

    let results: ProductSearchResult[] = [];
    let total = 0;

    if (searchMode === 'semantic' || searchMode === 'hybrid') {
      // Get semantic results
      const semanticResults = await this.semanticSearchProducts(query, filters, limit * 2);
      results = semanticResults;
    }

    if (searchMode === 'keyword' || searchMode === 'hybrid') {
      // Get keyword results
      const keywordResults = await this.keywordSearchProducts(query, filters, limit * 2);
      
      if (searchMode === 'hybrid') {
        // Merge and deduplicate
        results = this.mergeResults(results, keywordResults);
      } else {
        results = keywordResults;
      }
    }

    // Apply additional filters and pagination
    const filtered = this.applyProductFilters(results, filters);
    total = filtered.length;
    const paginated = filtered.slice((page - 1) * limit, page * limit);

    return {
      data: paginated,
      total,
      page,
      limit,
      query,
      filters,
      searchMode,
      took: Date.now() - startTime,
    };
  }

  // =====================================================
  // SEARCH BUSINESSES
  // =====================================================
  async searchBusinesses(
    query: string,
    filters: SearchFilters = {},
  ): Promise<SearchResult<BusinessSearchResult>> {
    const startTime = Date.now();
    const page = filters.page || 1;
    const limit = filters.limit || 20;
    const searchMode = filters.searchMode || 'hybrid';

    let results: BusinessSearchResult[] = [];
    let total = 0;

    if (searchMode === 'semantic' || searchMode === 'hybrid') {
      const semanticResults = await this.semanticSearchBusinesses(query, filters, limit * 2);
      results = semanticResults;
    }

    if (searchMode === 'keyword' || searchMode === 'hybrid') {
      const keywordResults = await this.keywordSearchBusinesses(query, filters, limit * 2);
      
      if (searchMode === 'hybrid') {
        results = this.mergeBusinessResults(results, keywordResults);
      } else {
        results = keywordResults;
      }
    }

    const filtered = this.applyBusinessFilters(results, filters);
    total = filtered.length;
    const paginated = filtered.slice((page - 1) * limit, page * limit);

    return {
      data: paginated,
      total,
      page,
      limit,
      query,
      filters,
      searchMode,
      took: Date.now() - startTime,
    };
  }

  // =====================================================
  // SEMANTIC SEARCH (Vector-based)
  // =====================================================
  private async semanticSearchProducts(
    query: string,
    filters: SearchFilters,
    limit: number,
  ): Promise<ProductSearchResult[]> {
    try {
      // Generate query embedding
      const queryEmbedding = await this.embeddingService.generateEmbedding(query);

      // Search by vector similarity
      const similarities = await this.embeddingService.searchByVector(
        queryEmbedding,
        ['product'],
        limit,
        0.6, // Lower threshold for more results
      );

      if (similarities.length === 0) return [];

      // Fetch full product data
      const productIds = similarities.map((s) => s.entityId);
      const products = await this.prisma.product.findMany({
        where: {
          id: { in: productIds },
          status: 'active',
        },
        include: {
          images: { take: 1, where: { isPrimary: true } },
          business: {
            select: {
              businessName: true,
              slug: true,
              logoUrl: true,
              city: true,
            },
          },
        },
      });

      // Map to results with similarity scores
      const similarityMap = new Map(similarities.map((s) => [s.entityId, s.similarity]));

      return products.map((p) => ({
        id: p.id,
        name: p.name,
        slug: p.slug,
        description: p.shortDescription || p.description?.slice(0, 200),
        price: p.price.toNumber(),
        compareAtPrice: p.compareAtPrice?.toNumber(),
        currency: p.currency,
        quantity: p.quantity,
        status: p.status,
        thumbnailUrl: p.images[0]?.thumbnailUrl || p.images[0]?.url,
        businessName: p.business.businessName,
        businessSlug: p.business.slug,
        businessLogo: p.business.logoUrl,
        city: p.business.city,
        similarity: similarityMap.get(p.id),
        matchType: 'semantic' as const,
      }));
    } catch (error: any) {
      this.logger.error(`Semantic search failed: ${error.message}`);
      return [];
    }
  }

  private async semanticSearchBusinesses(
    query: string,
    filters: SearchFilters,
    limit: number,
  ): Promise<BusinessSearchResult[]> {
    try {
      const queryEmbedding = await this.embeddingService.generateEmbedding(query);

      const similarities = await this.embeddingService.searchByVector(
        queryEmbedding,
        ['business'],
        limit,
        0.6,
      );

      if (similarities.length === 0) return [];

      const businessIds = similarities.map((s) => s.entityId);
      const businesses = await this.prisma.businessProfile.findMany({
        where: {
          id: { in: businessIds },
          status: 'approved',
        },
        include: {
          _count: { select: { products: true } },
        },
      });

      const similarityMap = new Map(similarities.map((s) => [s.entityId, s.similarity]));

      return businesses.map((b) => ({
        id: b.id,
        businessName: b.businessName,
        slug: b.slug,
        description: b.description?.slice(0, 200),
        logoUrl: b.logoUrl,
        coverImageUrl: b.coverImageUrl,
        businessType: b.businessType,
        city: b.city,
        county: b.county,
        isVerified: b.isVerified,
        productCount: b._count.products,
        similarity: similarityMap.get(b.id),
        matchType: 'semantic' as const,
      }));
    } catch (error: any) {
      this.logger.error(`Semantic business search failed: ${error.message}`);
      return [];
    }
  }

  // =====================================================
  // KEYWORD SEARCH (Full-text)
  // =====================================================
  private async keywordSearchProducts(
    query: string,
    filters: SearchFilters,
    limit: number,
  ): Promise<ProductSearchResult[]> {
    // Expand query with synonyms
    const expandedQuery = await this.expandQueryWithSynonyms(query);
    
    const products = await this.prisma.product.findMany({
      where: {
        status: 'active',
        OR: [
          { name: { contains: query, mode: 'insensitive' } },
          { description: { contains: query, mode: 'insensitive' } },
          { tags: { hasSome: query.toLowerCase().split(' ') } },
          // Also search expanded terms
          ...expandedQuery.map((term) => ({
            name: { contains: term, mode: 'insensitive' as const },
          })),
        ],
      },
      include: {
        images: { take: 1, where: { isPrimary: true } },
        business: {
          select: {
            businessName: true,
            slug: true,
            logoUrl: true,
            city: true,
          },
        },
      },
      take: limit,
    });

    return products.map((p) => ({
      id: p.id,
      name: p.name,
      slug: p.slug,
      description: p.shortDescription || p.description?.slice(0, 200),
      price: p.price.toNumber(),
      compareAtPrice: p.compareAtPrice?.toNumber(),
      currency: p.currency,
      quantity: p.quantity,
      status: p.status,
      thumbnailUrl: p.images[0]?.thumbnailUrl || p.images[0]?.url,
      businessName: p.business.businessName,
      businessSlug: p.business.slug,
      businessLogo: p.business.logoUrl,
      city: p.business.city,
      matchType: 'keyword' as const,
    }));
  }

  private async keywordSearchBusinesses(
    query: string,
    filters: SearchFilters,
    limit: number,
  ): Promise<BusinessSearchResult[]> {
    const businesses = await this.prisma.businessProfile.findMany({
      where: {
        status: 'approved',
        OR: [
          { businessName: { contains: query, mode: 'insensitive' } },
          { description: { contains: query, mode: 'insensitive' } },
          { tagline: { contains: query, mode: 'insensitive' } },
        ],
      },
      include: {
        _count: { select: { products: true } },
      },
      take: limit,
    });

    return businesses.map((b) => ({
      id: b.id,
      businessName: b.businessName,
      slug: b.slug,
      description: b.description?.slice(0, 200),
      logoUrl: b.logoUrl,
      coverImageUrl: b.coverImageUrl,
      businessType: b.businessType,
      city: b.city,
      county: b.county,
      isVerified: b.isVerified,
      productCount: b._count.products,
      matchType: 'keyword' as const,
    }));
  }

  // =====================================================
  // AUTOCOMPLETE / SUGGESTIONS
  // =====================================================
  async getSuggestions(query: string, limit = 5): Promise<string[]> {
    if (query.length < 2) return [];

    // Get from products
    const products = await this.prisma.product.findMany({
      where: {
        status: 'active',
        name: { startsWith: query, mode: 'insensitive' },
      },
      select: { name: true },
      distinct: ['name'],
      take: limit,
    });

    // Get from businesses
    const businesses = await this.prisma.businessProfile.findMany({
      where: {
        status: 'approved',
        businessName: { startsWith: query, mode: 'insensitive' },
      },
      select: { businessName: true },
      distinct: ['businessName'],
      take: limit,
    });

    const suggestions = [
      ...products.map((p) => p.name),
      ...businesses.map((b) => b.businessName),
    ];

    // Deduplicate and limit
    return [...new Set(suggestions)].slice(0, limit);
  }

  // =====================================================
  // TRENDING / POPULAR SEARCHES
  // =====================================================
  async getTrendingSearches(city?: string, limit = 10): Promise<string[]> {
    // In production, this would query the popular_searches table
    // For now, return mock data
    return [
      'iPhone 15',
      'Samsung Galaxy',
      'Laptop',
      'Sneakers',
      'Electronics',
      'Beauty products',
      'Furniture',
      'Car parts',
      'Fashion',
      'Home appliances',
    ].slice(0, limit);
  }

  // =====================================================
  // SIMILAR PRODUCTS
  // =====================================================
  async getSimilarProducts(productId: string, limit = 10): Promise<ProductSearchResult[]> {
    const similarities = await this.embeddingService.findSimilar('product', productId, limit);

    if (similarities.length === 0) return [];

    const productIds = similarities.map((s) => s.entityId);
    const products = await this.prisma.product.findMany({
      where: {
        id: { in: productIds },
        status: 'active',
      },
      include: {
        images: { take: 1, where: { isPrimary: true } },
        business: {
          select: { businessName: true, slug: true, logoUrl: true, city: true },
        },
      },
    });

    const similarityMap = new Map(similarities.map((s) => [s.entityId, s.similarity]));

    return products.map((p) => ({
      id: p.id,
      name: p.name,
      slug: p.slug,
      description: p.shortDescription,
      price: p.price.toNumber(),
      compareAtPrice: p.compareAtPrice?.toNumber(),
      currency: p.currency,
      quantity: p.quantity,
      status: p.status,
      thumbnailUrl: p.images[0]?.thumbnailUrl || p.images[0]?.url,
      businessName: p.business.businessName,
      businessSlug: p.business.slug,
      businessLogo: p.business.logoUrl,
      city: p.business.city,
      similarity: similarityMap.get(p.id),
      matchType: 'semantic' as const,
    }));
  }

  // =====================================================
  // LOG SEARCH
  // =====================================================
  async logSearch(
    userId: string | null,
    query: string,
    filters: SearchFilters,
    resultCount: number,
    sessionId?: string,
  ): Promise<void> {
    try {
      await this.prisma.$executeRaw`
        INSERT INTO search_history (user_id, query, filters, result_count, session_id)
        VALUES (${userId}::uuid, ${query}, ${JSON.stringify(filters)}::jsonb, ${resultCount}, ${sessionId})
      `;
    } catch (error) {
      this.logger.error('Failed to log search');
    }
  }

  // =====================================================
  // PRIVATE HELPERS
  // =====================================================
  private async expandQueryWithSynonyms(query: string): Promise<string[]> {
    const words = query.toLowerCase().split(' ');
    const expanded: string[] = [];

    for (const word of words) {
      const synonym = await this.prisma.$queryRaw<{ synonyms: string[] }[]>`
        SELECT synonyms FROM search_synonyms 
        WHERE term = ${word} AND is_active = true
        LIMIT 1
      `;

      if (synonym.length > 0) {
        expanded.push(...synonym[0].synonyms);
      }
    }

    return expanded;
  }

  private mergeResults(
    semantic: ProductSearchResult[],
    keyword: ProductSearchResult[],
  ): ProductSearchResult[] {
    const merged = new Map<string, ProductSearchResult>();

    // Add semantic results with higher priority
    semantic.forEach((r) => {
      merged.set(r.id, { ...r, matchType: 'hybrid' });
    });

    // Add keyword results, boosting if already present
    keyword.forEach((r) => {
      if (merged.has(r.id)) {
        const existing = merged.get(r.id)!;
        existing.similarity = (existing.similarity || 0) + 0.2; // Boost
      } else {
        merged.set(r.id, r);
      }
    });

    // Sort by similarity
    return Array.from(merged.values()).sort(
      (a, b) => (b.similarity || 0) - (a.similarity || 0),
    );
  }

  private mergeBusinessResults(
    semantic: BusinessSearchResult[],
    keyword: BusinessSearchResult[],
  ): BusinessSearchResult[] {
    const merged = new Map<string, BusinessSearchResult>();

    semantic.forEach((r) => merged.set(r.id, { ...r, matchType: 'hybrid' }));
    keyword.forEach((r) => {
      if (merged.has(r.id)) {
        const existing = merged.get(r.id)!;
        existing.similarity = (existing.similarity || 0) + 0.2;
      } else {
        merged.set(r.id, r);
      }
    });

    return Array.from(merged.values()).sort(
      (a, b) => (b.similarity || 0) - (a.similarity || 0),
    );
  }

  private applyProductFilters(
    results: ProductSearchResult[],
    filters: SearchFilters,
  ): ProductSearchResult[] {
    return results.filter((r) => {
      if (filters.priceMin && r.price < filters.priceMin) return false;
      if (filters.priceMax && r.price > filters.priceMax) return false;
      if (filters.inStock && r.quantity <= 0) return false;
      if (filters.city && r.city?.toLowerCase() !== filters.city.toLowerCase()) return false;
      return true;
    });
  }

  private applyBusinessFilters(
    results: BusinessSearchResult[],
    filters: SearchFilters,
  ): BusinessSearchResult[] {
    return results.filter((r) => {
      if (filters.businessType && r.businessType !== filters.businessType) return false;
      if (filters.isVerified && !r.isVerified) return false;
      if (filters.city && r.city?.toLowerCase() !== filters.city.toLowerCase()) return false;
      if (filters.county && r.county?.toLowerCase() !== filters.county.toLowerCase()) return false;
      return true;
    });
  }
}
