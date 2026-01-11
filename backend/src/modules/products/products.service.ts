import {
  Injectable,
  NotFoundException,
  ForbiddenException,
  BadRequestException,
} from '@nestjs/common';
import { PrismaService } from '../../prisma/prisma.service';
import slugify from 'slugify';
import {
  CreateProductDto,
  UpdateProductDto,
  CreateProductCategoryDto,
  UpdateProductCategoryDto,
  UpdateInventoryDto,
  ProductQueryDto,
  InventoryAction,
  ProductStatus,
} from './dto/product.dto';

@Injectable()
export class ProductsService {
  constructor(private prisma: PrismaService) {}

  // =====================================================
  // PRODUCT CATEGORIES
  // =====================================================
  async createCategory(businessId: string, userId: string, dto: CreateProductCategoryDto) {
    await this.checkBusinessAccess(businessId, userId, 'editor');

    const slug = await this.generateCategorySlug(businessId, dto.name);

    let level = 0;
    if (dto.parentId) {
      const parent = await this.prisma.productCategory.findFirst({
        where: { id: dto.parentId, businessId },
      });
      if (!parent) throw new BadRequestException('Parent category not found');
      level = parent.level + 1;
    }

    return this.prisma.productCategory.create({
      data: {
        ...dto,
        businessId,
        slug,
        level,
      },
    });
  }

  async getCategories(businessId: string) {
    const categories = await this.prisma.productCategory.findMany({
      where: { businessId, isActive: true },
      orderBy: [{ level: 'asc' }, { sortOrder: 'asc' }],
      include: {
        _count: { select: { products: true } },
      },
    });

    return this.buildCategoryTree(categories);
  }

  async updateCategory(
    businessId: string,
    categoryId: string,
    userId: string,
    dto: UpdateProductCategoryDto,
  ) {
    await this.checkBusinessAccess(businessId, userId, 'editor');

    const category = await this.prisma.productCategory.findFirst({
      where: { id: categoryId, businessId },
    });

    if (!category) throw new NotFoundException('Category not found');

    let newSlug: string | undefined;
    if (dto.name && dto.name !== category.name) {
      newSlug = await this.generateCategorySlug(businessId, dto.name, categoryId);
    }

    return this.prisma.productCategory.update({
      where: { id: categoryId },
      data: {
        ...dto,
        ...(newSlug && { slug: newSlug }),
      },
    });
  }

  async deleteCategory(businessId: string, categoryId: string, userId: string) {
    await this.checkBusinessAccess(businessId, userId, 'admin');

    const category = await this.prisma.productCategory.findFirst({
      where: { id: categoryId, businessId },
      include: {
        _count: { select: { products: true, children: true } },
      },
    });

    if (!category) throw new NotFoundException('Category not found');

    if (category._count.products > 0) {
      throw new BadRequestException('Category has products. Move them first.');
    }

    if (category._count.children > 0) {
      throw new BadRequestException('Category has subcategories. Delete them first.');
    }

    return this.prisma.productCategory.update({
      where: { id: categoryId },
      data: { isActive: false },
    });
  }

  // =====================================================
  // PRODUCTS
  // =====================================================
  async createProduct(businessId: string, userId: string, dto: CreateProductDto) {
    await this.checkBusinessAccess(businessId, userId, 'editor');

    const slug = await this.generateProductSlug(businessId, dto.name);

    // Validate category
    if (dto.categoryId) {
      const category = await this.prisma.productCategory.findFirst({
        where: { id: dto.categoryId, businessId, isActive: true },
      });
      if (!category) throw new BadRequestException('Category not found');
    }

    // Validate SKU uniqueness
    if (dto.sku) {
      const existingSku = await this.prisma.product.findFirst({
        where: { businessId, sku: dto.sku },
      });
      if (existingSku) throw new BadRequestException('SKU already exists');
    }

    const { images, variants, ...productData } = dto;

    // Create product with images and variants
    const product = await this.prisma.product.create({
      data: {
        ...productData,
        businessId,
        slug,
        images: images?.length
          ? {
              create: images.map((img, index) => ({
                ...img,
                isPrimary: index === 0,
                sortOrder: img.sortOrder ?? index,
              })),
            }
          : undefined,
        variants: variants?.length
          ? {
              create: variants.map((v, index) => ({
                ...v,
                sortOrder: index,
              })),
            }
          : undefined,
      },
      include: {
        images: { orderBy: { sortOrder: 'asc' } },
        variants: { orderBy: { sortOrder: 'asc' } },
        category: true,
      },
    });

    // Log inventory if tracking
    if (dto.trackInventory !== false && (dto.quantity || 0) > 0) {
      await this.logInventoryChange(
        businessId,
        product.id,
        null,
        'set',
        dto.quantity || 0,
        0,
        dto.quantity || 0,
        'Initial stock',
        userId,
      );
    }

    await this.logActivity(userId, businessId, 'product_created', {
      productId: product.id,
      name: product.name,
    });

    return product;
  }

  async getProducts(businessId: string, query: ProductQueryDto) {
    const {
      categoryId,
      status,
      featured,
      inStock,
      search,
      minPrice,
      maxPrice,
      sort,
      page = 1,
      limit = 20,
    } = query;

    const where: any = { businessId };

    if (categoryId) where.categoryId = categoryId;
    if (status) where.status = status;
    if (featured !== undefined) where.isFeatured = featured;
    if (inStock === true) where.quantity = { gt: 0 };
    if (inStock === false) where.quantity = { lte: 0 };
    if (minPrice !== undefined) where.price = { ...where.price, gte: minPrice };
    if (maxPrice !== undefined) where.price = { ...where.price, lte: maxPrice };

    if (search) {
      where.OR = [
        { name: { contains: search, mode: 'insensitive' } },
        { description: { contains: search, mode: 'insensitive' } },
        { sku: { contains: search, mode: 'insensitive' } },
        { tags: { has: search.toLowerCase() } },
      ];
    }

    // Sorting
    let orderBy: any = { createdAt: 'desc' };
    switch (sort) {
      case 'price_asc':
        orderBy = { price: 'asc' };
        break;
      case 'price_desc':
        orderBy = { price: 'desc' };
        break;
      case 'name':
        orderBy = { name: 'asc' };
        break;
      case 'newest':
        orderBy = { createdAt: 'desc' };
        break;
      case 'popular':
        orderBy = { orderCount: 'desc' };
        break;
    }

    const [products, total] = await Promise.all([
      this.prisma.product.findMany({
        where,
        include: {
          images: {
            where: { isPrimary: true },
            take: 1,
          },
          category: { select: { id: true, name: true, slug: true } },
        },
        orderBy,
        skip: (page - 1) * limit,
        take: limit,
      }),
      this.prisma.product.count({ where }),
    ]);

    return {
      data: products,
      pagination: {
        page,
        limit,
        total,
        totalPages: Math.ceil(total / limit),
      },
    };
  }

  async getProductById(productId: string, businessId?: string) {
    const where: any = { id: productId };
    if (businessId) where.businessId = businessId;

    const product = await this.prisma.product.findFirst({
      where,
      include: {
        images: { orderBy: { sortOrder: 'asc' } },
        variants: {
          where: { isActive: true },
          orderBy: { sortOrder: 'asc' },
          include: { image: true },
        },
        category: true,
        business: {
          select: {
            id: true,
            businessName: true,
            slug: true,
            logoUrl: true,
            whatsappNumber: true,
          },
        },
      },
    });

    if (!product) throw new NotFoundException('Product not found');

    // Increment view count
    await this.prisma.product.update({
      where: { id: productId },
      data: { viewCount: { increment: 1 } },
    });

    return product;
  }

  async getProductBySlug(businessSlug: string, productSlug: string) {
    const business = await this.prisma.businessProfile.findUnique({
      where: { slug: businessSlug },
    });

    if (!business) throw new NotFoundException('Business not found');

    const product = await this.prisma.product.findFirst({
      where: {
        businessId: business.id,
        slug: productSlug,
        status: 'active',
      },
      include: {
        images: { orderBy: { sortOrder: 'asc' } },
        variants: {
          where: { isActive: true },
          orderBy: { sortOrder: 'asc' },
        },
        category: true,
        business: {
          select: {
            id: true,
            businessName: true,
            slug: true,
            logoUrl: true,
            whatsappNumber: true,
          },
        },
      },
    });

    if (!product) throw new NotFoundException('Product not found');

    // Increment view count
    await this.prisma.product.update({
      where: { id: product.id },
      data: { viewCount: { increment: 1 } },
    });

    return product;
  }

  async updateProduct(
    businessId: string,
    productId: string,
    userId: string,
    dto: UpdateProductDto,
  ) {
    await this.checkBusinessAccess(businessId, userId, 'editor');

    const product = await this.prisma.product.findFirst({
      where: { id: productId, businessId },
    });

    if (!product) throw new NotFoundException('Product not found');

    // Handle slug change
    let newSlug: string | undefined;
    if (dto.name && dto.name !== product.name) {
      newSlug = await this.generateProductSlug(businessId, dto.name, productId);
    }

    // Validate SKU uniqueness
    if (dto.sku && dto.sku !== product.sku) {
      const existingSku = await this.prisma.product.findFirst({
        where: { businessId, sku: dto.sku, id: { not: productId } },
      });
      if (existingSku) throw new BadRequestException('SKU already exists');
    }

    const { images, variants, ...productData } = dto;

    // Update product
    const updated = await this.prisma.product.update({
      where: { id: productId },
      data: {
        ...productData,
        ...(newSlug && { slug: newSlug }),
        lastSyncedAt: new Date(),
      },
      include: {
        images: { orderBy: { sortOrder: 'asc' } },
        variants: { orderBy: { sortOrder: 'asc' } },
        category: true,
      },
    });

    // Handle images if provided
    if (images) {
      // Delete existing images not in new list
      const existingImages = await this.prisma.productImage.findMany({
        where: { productId },
      });

      const newImageUrls = images.map((i) => i.url);
      const imagesToDelete = existingImages.filter(
        (i) => !newImageUrls.includes(i.url),
      );

      if (imagesToDelete.length > 0) {
        await this.prisma.productImage.deleteMany({
          where: { id: { in: imagesToDelete.map((i) => i.id) } },
        });
      }

      // Add new images
      const existingUrls = existingImages.map((i) => i.url);
      const newImages = images.filter((i) => !existingUrls.includes(i.url));

      if (newImages.length > 0) {
        await this.prisma.productImage.createMany({
          data: newImages.map((img, index) => ({
            ...img,
            productId,
            sortOrder: existingImages.length + index,
          })),
        });
      }
    }

    await this.logActivity(userId, businessId, 'product_updated', {
      productId,
      changes: Object.keys(productData),
    });

    return this.getProductById(productId, businessId);
  }

  async deleteProduct(businessId: string, productId: string, userId: string) {
    await this.checkBusinessAccess(businessId, userId, 'admin');

    const product = await this.prisma.product.findFirst({
      where: { id: productId, businessId },
    });

    if (!product) throw new NotFoundException('Product not found');

    await this.prisma.product.delete({ where: { id: productId } });

    await this.logActivity(userId, businessId, 'product_deleted', {
      productId,
      name: product.name,
    });

    return { message: 'Product deleted' };
  }

  // =====================================================
  // INVENTORY MANAGEMENT
  // =====================================================
  async updateInventory(
    businessId: string,
    productId: string,
    userId: string,
    dto: UpdateInventoryDto,
  ) {
    await this.checkBusinessAccess(businessId, userId, 'editor');

    const product = await this.prisma.product.findFirst({
      where: { id: productId, businessId },
    });

    if (!product) throw new NotFoundException('Product not found');

    let quantityBefore: number;
    let quantityAfter: number;

    if (dto.variantId) {
      // Update variant inventory
      const variant = await this.prisma.productVariant.findFirst({
        where: { id: dto.variantId, productId },
      });

      if (!variant) throw new NotFoundException('Variant not found');

      quantityBefore = variant.quantity;
      quantityAfter = this.calculateNewQuantity(
        quantityBefore,
        dto.quantity,
        dto.action,
      );

      await this.prisma.productVariant.update({
        where: { id: dto.variantId },
        data: { quantity: quantityAfter },
      });
    } else {
      // Update product inventory
      quantityBefore = product.quantity;
      quantityAfter = this.calculateNewQuantity(
        quantityBefore,
        dto.quantity,
        dto.action,
      );

      await this.prisma.product.update({
        where: { id: productId },
        data: {
          quantity: quantityAfter,
          status:
            quantityAfter <= 0 && product.status === 'active'
              ? 'out_of_stock'
              : product.status === 'out_of_stock' && quantityAfter > 0
              ? 'active'
              : undefined,
        },
      });
    }

    // Log change
    await this.logInventoryChange(
      businessId,
      productId,
      dto.variantId,
      dto.action,
      dto.quantity,
      quantityBefore,
      quantityAfter,
      dto.reason,
      userId,
    );

    return {
      productId,
      variantId: dto.variantId,
      quantityBefore,
      quantityAfter,
      change: quantityAfter - quantityBefore,
    };
  }

  async getInventoryLogs(businessId: string, productId: string, userId: string) {
    await this.checkBusinessAccess(businessId, userId, 'viewer');

    return this.prisma.inventoryLog.findMany({
      where: { businessId, productId },
      include: {
        performedBy: {
          select: { id: true, firstName: true, lastName: true },
        },
        variant: { select: { id: true, name: true } },
      },
      orderBy: { createdAt: 'desc' },
      take: 100,
    });
  }

  async getLowStockProducts(businessId: string, userId: string) {
    await this.checkBusinessAccess(businessId, userId, 'viewer');

    return this.prisma.product.findMany({
      where: {
        businessId,
        trackInventory: true,
        OR: [
          {
            quantity: { lte: this.prisma.product.fields.lowStockThreshold },
          },
          { quantity: { lte: 5 } },
        ],
      },
      include: {
        images: { where: { isPrimary: true }, take: 1 },
      },
      orderBy: { quantity: 'asc' },
    });
  }

  // =====================================================
  // PRODUCT IMAGES
  // =====================================================
  async addProductImage(
    businessId: string,
    productId: string,
    userId: string,
    dto: { url: string; altText?: string; isPrimary?: boolean },
  ) {
    await this.checkBusinessAccess(businessId, userId, 'editor');

    const product = await this.prisma.product.findFirst({
      where: { id: productId, businessId },
      include: { images: true },
    });

    if (!product) throw new NotFoundException('Product not found');

    // If setting as primary, unset other primary
    if (dto.isPrimary) {
      await this.prisma.productImage.updateMany({
        where: { productId, isPrimary: true },
        data: { isPrimary: false },
      });
    }

    return this.prisma.productImage.create({
      data: {
        productId,
        url: dto.url,
        altText: dto.altText,
        isPrimary: dto.isPrimary || product.images.length === 0,
        sortOrder: product.images.length,
      },
    });
  }

  async deleteProductImage(
    businessId: string,
    productId: string,
    imageId: string,
    userId: string,
  ) {
    await this.checkBusinessAccess(businessId, userId, 'editor');

    const image = await this.prisma.productImage.findFirst({
      where: { id: imageId, product: { businessId } },
    });

    if (!image) throw new NotFoundException('Image not found');

    await this.prisma.productImage.delete({ where: { id: imageId } });

    // If deleted primary, set first remaining as primary
    if (image.isPrimary) {
      const firstImage = await this.prisma.productImage.findFirst({
        where: { productId },
        orderBy: { sortOrder: 'asc' },
      });

      if (firstImage) {
        await this.prisma.productImage.update({
          where: { id: firstImage.id },
          data: { isPrimary: true },
        });
      }
    }

    return { message: 'Image deleted' };
  }

  async reorderProductImages(
    businessId: string,
    productId: string,
    userId: string,
    imageIds: string[],
  ) {
    await this.checkBusinessAccess(businessId, userId, 'editor');

    await Promise.all(
      imageIds.map((id, index) =>
        this.prisma.productImage.update({
          where: { id },
          data: { sortOrder: index },
        }),
      ),
    );

    return { message: 'Images reordered' };
  }

  // =====================================================
  // HELPERS
  // =====================================================
  private calculateNewQuantity(
    current: number,
    change: number,
    action: InventoryAction,
  ): number {
    switch (action) {
      case InventoryAction.SET:
        return change;
      case InventoryAction.ADD:
        return current + change;
      case InventoryAction.SUBTRACT:
        return Math.max(0, current - change);
      case InventoryAction.ADJUSTMENT:
        return Math.max(0, current + change);
      default:
        return current;
    }
  }

  private async logInventoryChange(
    businessId: string,
    productId: string,
    variantId: string | null | undefined,
    action: string,
    quantityChange: number,
    quantityBefore: number,
    quantityAfter: number,
    reason: string | undefined,
    userId: string,
  ) {
    await this.prisma.inventoryLog.create({
      data: {
        businessId,
        productId,
        variantId,
        action: action as any,
        quantityChange: quantityAfter - quantityBefore,
        quantityBefore,
        quantityAfter,
        reason,
        performedById: userId,
      },
    });
  }

  private async checkBusinessAccess(
    businessId: string,
    userId: string,
    requiredRole: 'owner' | 'admin' | 'editor' | 'viewer',
  ) {
    const roleHierarchy = { owner: 4, admin: 3, editor: 2, viewer: 1 };

    const member = await this.prisma.businessMember.findUnique({
      where: {
        businessId_userId: { businessId, userId },
      },
    });

    if (!member || !member.isActive) {
      throw new ForbiddenException('No access to this business');
    }

    if (roleHierarchy[member.role] < roleHierarchy[requiredRole]) {
      throw new ForbiddenException('Insufficient permissions');
    }
  }

  private async generateProductSlug(
    businessId: string,
    name: string,
    excludeId?: string,
  ): Promise<string> {
    const baseSlug = slugify(name, { lower: true, strict: true });
    let slug = baseSlug;
    let counter = 0;

    while (true) {
      const existing = await this.prisma.product.findFirst({
        where: {
          businessId,
          slug,
          ...(excludeId && { id: { not: excludeId } }),
        },
      });

      if (!existing) return slug;
      counter++;
      slug = `${baseSlug}-${counter}`;
    }
  }

  private async generateCategorySlug(
    businessId: string,
    name: string,
    excludeId?: string,
  ): Promise<string> {
    const baseSlug = slugify(name, { lower: true, strict: true });
    let slug = baseSlug;
    let counter = 0;

    while (true) {
      const existing = await this.prisma.productCategory.findFirst({
        where: {
          businessId,
          slug,
          ...(excludeId && { id: { not: excludeId } }),
        },
      });

      if (!existing) return slug;
      counter++;
      slug = `${baseSlug}-${counter}`;
    }
  }

  private buildCategoryTree(categories: any[]): any[] {
    const map = new Map<string, any>();
    const roots: any[] = [];

    categories.forEach((cat) => map.set(cat.id, { ...cat, children: [] }));

    categories.forEach((cat) => {
      const node = map.get(cat.id);
      if (cat.parentId) {
        const parent = map.get(cat.parentId);
        if (parent) parent.children.push(node);
      } else {
        roots.push(node);
      }
    });

    return roots;
  }

  private async logActivity(
    userId: string,
    businessId: string,
    action: string,
    details: Record<string, any>,
  ) {
    await this.prisma.activityLog.create({
      data: { userId, businessId, action, details },
    });
  }
}
