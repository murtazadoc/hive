import { Injectable, Logger } from '@nestjs/common';
import { PrismaService } from '../../prisma/prisma.service';
import { CacheService } from '../cache/cache.service';

// =====================================================
// TYPES
// =====================================================
export interface ProductListOptions {
  businessId?: string;
  categoryId?: string;
  status?: string;
  minPrice?: number;
  maxPrice?: number;
  sortBy?: 'price' | 'createdAt' | 'popularity';
  sortOrder?: 'asc' | 'desc';
  limit?: number;
  cursor?: string;
}

export interface ProductWithDetails {
  id: string;
  name: string;
  slug: string;
  description: string;
  price: number;
  compareAtPrice?: number;
  sku?: string;
  status: string;
  images: Array<{ id: string; url: string; isPrimary: boolean }>;
  category?: { id: string; name: string; slug: string };
  business: { id: string; businessName: string; slug: string; logoUrl?: string };
  stockQuantity?: number;
  trackInventory: boolean;
  createdAt: Date;
}

// =====================================================
// CACHED PRODUCTS SERVICE
// =====================================================
@Injectable()
export class CachedProductsService {
  private readonly logger = new Logger(CachedProductsService.name);

  constructor(
    private prisma: PrismaService,
    private cache: CacheService,
  ) {}

  // =====================================================
  // SINGLE PRODUCT
  // =====================================================

  /**
   * Get product by ID with caching
   */
  async getById(productId: string): Promise<ProductWithDetails | null> {
    const cacheKey = `${CacheService.PREFIX.PRODUCT}${productId}`;

    return this.cache.getOrSet(
      cacheKey,
      async () => {
        const product = await this.prisma.product.findUnique({
          where: { id: productId },
          include: {
            images: { orderBy: { sortOrder: 'asc' } },
            category: { select: { id: true, name: true, slug: true } },
            business: {
              select: { id: true, businessName: true, slug: true, logoUrl: true },
            },
          },
        });

        return product as ProductWithDetails | null;
      },
      {
        ttl: CacheService.TTL.MEDIUM,
        tags: [`product:${productId}`, `business:${productId}`],
      },
    );
  }

  /**
   * Get product by slug with caching
   */
  async getBySlug(slug: string): Promise<ProductWithDetails | null> {
    const cacheKey = `${CacheService.PREFIX.PRODUCT}slug:${slug}`;

    return this.cache.getOrSet(
      cacheKey,
      async () => {
        const product = await this.prisma.product.findUnique({
          where: { slug },
          include: {
            images: { orderBy: { sortOrder: 'asc' } },
            category: { select: { id: true, name: true, slug: true } },
            business: {
              select: { id: true, businessName: true, slug: true, logoUrl: true },
            },
          },
        });

        return product as ProductWithDetails | null;
      },
      { ttl: CacheService.TTL.MEDIUM },
    );
  }

  // =====================================================
  // PRODUCT LISTS
  // =====================================================

  /**
   * Get products with caching
   */
  async getProducts(options: ProductListOptions): Promise<ProductWithDetails[]> {
    // Build cache key from options
    const cacheKey = this.buildListCacheKey(options);

    return this.cache.getOrSet(
      cacheKey,
      async () => {
        const where: any = {
          status: options.status || 'active',
        };

        if (options.businessId) where.businessId = options.businessId;
        if (options.categoryId) where.categoryId = options.categoryId;
        if (options.minPrice || options.maxPrice) {
          where.price = {};
          if (options.minPrice) where.price.gte = options.minPrice;
          if (options.maxPrice) where.price.lte = options.maxPrice;
        }

        const orderBy: any = {};
        const sortField = options.sortBy || 'createdAt';
        orderBy[sortField] = options.sortOrder || 'desc';

        const products = await this.prisma.product.findMany({
          where,
          include: {
            images: { where: { isPrimary: true }, take: 1 },
            business: {
              select: { id: true, businessName: true, slug: true },
            },
          },
          orderBy,
          take: options.limit || 20,
          ...(options.cursor && {
            skip: 1,
            cursor: { id: options.cursor },
          }),
        });

        return products as ProductWithDetails[];
      },
      {
        ttl: CacheService.TTL.SHORT,
        tags: options.businessId ? [`business:${options.businessId}:products`] : ['products:list'],
      },
    );
  }

  /**
   * Get featured products
   */
  async getFeatured(limit: number = 10): Promise<ProductWithDetails[]> {
    const cacheKey = `${CacheService.PREFIX.PRODUCTS}featured:${limit}`;

    return this.cache.getOrSet(
      cacheKey,
      async () => {
        const products = await this.prisma.product.findMany({
          where: {
            status: 'active',
            isFeatured: true,
          },
          include: {
            images: { where: { isPrimary: true }, take: 1 },
            business: {
              select: { id: true, businessName: true, slug: true },
            },
          },
          orderBy: { createdAt: 'desc' },
          take: limit,
        });

        return products as ProductWithDetails[];
      },
      {
        ttl: CacheService.TTL.MEDIUM,
        tags: ['products:featured'],
      },
    );
  }

  /**
   * Get trending products
   */
  async getTrending(limit: number = 10): Promise<ProductWithDetails[]> {
    const cacheKey = `${CacheService.PREFIX.PRODUCTS}trending:${limit}`;

    return this.cache.getOrSet(
      cacheKey,
      async () => {
        // Get trending from analytics
        const trending = await this.prisma.$queryRaw<{ product_id: string }[]>`
          SELECT product_id FROM get_trending_products(7, ${limit})
        `;

        if (trending.length === 0) {
          // Fallback to recent products
          return this.prisma.product.findMany({
            where: { status: 'active' },
            include: {
              images: { where: { isPrimary: true }, take: 1 },
              business: {
                select: { id: true, businessName: true, slug: true },
              },
            },
            orderBy: { createdAt: 'desc' },
            take: limit,
          }) as unknown as ProductWithDetails[];
        }

        const productIds = trending.map((t) => t.product_id);

        const products = await this.prisma.product.findMany({
          where: { id: { in: productIds }, status: 'active' },
          include: {
            images: { where: { isPrimary: true }, take: 1 },
            business: {
              select: { id: true, businessName: true, slug: true },
            },
          },
        });

        // Sort by trending order
        return productIds
          .map((id) => products.find((p) => p.id === id))
          .filter(Boolean) as ProductWithDetails[];
      },
      {
        ttl: CacheService.TTL.MEDIUM,
        tags: ['products:trending'],
      },
    );
  }

  /**
   * Get related products
   */
  async getRelated(productId: string, limit: number = 6): Promise<ProductWithDetails[]> {
    const cacheKey = `${CacheService.PREFIX.PRODUCT}${productId}:related`;

    return this.cache.getOrSet(
      cacheKey,
      async () => {
        const product = await this.prisma.product.findUnique({
          where: { id: productId },
          select: { categoryId: true, businessId: true, price: true },
        });

        if (!product) return [];

        // Get products from same category in similar price range
        const priceRange = product.price * 0.3;

        const related = await this.prisma.product.findMany({
          where: {
            id: { not: productId },
            status: 'active',
            OR: [
              { categoryId: product.categoryId },
              { businessId: product.businessId },
              {
                price: {
                  gte: product.price - priceRange,
                  lte: product.price + priceRange,
                },
              },
            ],
          },
          include: {
            images: { where: { isPrimary: true }, take: 1 },
            business: {
              select: { id: true, businessName: true, slug: true },
            },
          },
          orderBy: { createdAt: 'desc' },
          take: limit,
        });

        return related as ProductWithDetails[];
      },
      {
        ttl: CacheService.TTL.LONG,
        tags: [`product:${productId}:related`],
      },
    );
  }

  // =====================================================
  // CACHE INVALIDATION
  // =====================================================

  /**
   * Invalidate product cache
   */
  async invalidateProduct(productId: string): Promise<void> {
    // Delete specific product cache
    await this.cache.del(`${CacheService.PREFIX.PRODUCT}${productId}`);

    // Invalidate related caches
    await this.cache.invalidateTag(`product:${productId}`);
    await this.cache.invalidateTag(`product:${productId}:related`);

    // Invalidate list caches
    await this.cache.invalidateTag('products:list');
    await this.cache.invalidateTag('products:featured');
    await this.cache.invalidateTag('products:trending');

    this.logger.debug(`Invalidated cache for product ${productId}`);
  }

  /**
   * Invalidate business products cache
   */
  async invalidateBusinessProducts(businessId: string): Promise<void> {
    await this.cache.invalidateTag(`business:${businessId}:products`);
    await this.cache.invalidateTag('products:list');
  }

  // =====================================================
  // HELPERS
  // =====================================================

  private buildListCacheKey(options: ProductListOptions): string {
    const parts = [CacheService.PREFIX.PRODUCTS, 'list'];

    if (options.businessId) parts.push(`b:${options.businessId}`);
    if (options.categoryId) parts.push(`c:${options.categoryId}`);
    if (options.status) parts.push(`s:${options.status}`);
    if (options.minPrice) parts.push(`min:${options.minPrice}`);
    if (options.maxPrice) parts.push(`max:${options.maxPrice}`);
    if (options.sortBy) parts.push(`sort:${options.sortBy}:${options.sortOrder}`);
    if (options.limit) parts.push(`l:${options.limit}`);
    if (options.cursor) parts.push(`cur:${options.cursor}`);

    return parts.join(':');
  }
}
