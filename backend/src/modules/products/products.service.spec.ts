import { Test, TestingModule } from '@nestjs/testing';
import { NotFoundException, BadRequestException } from '@nestjs/common';
import { ProductsService } from './products.service';
import { PrismaService } from '../../prisma/prisma.service';
import { CacheService } from '../cache/cache.service';
import {
  mockPrismaService,
  mockCacheService,
  createMockProduct,
  createMockBusiness,
  resetAllMocks,
} from '../../../test/setup';

describe('ProductsService', () => {
  let service: ProductsService;
  let prisma: typeof mockPrismaService;
  let cache: typeof mockCacheService;

  beforeEach(async () => {
    resetAllMocks();

    const module: TestingModule = await Test.createTestingModule({
      providers: [
        ProductsService,
        { provide: PrismaService, useValue: mockPrismaService },
        { provide: CacheService, useValue: mockCacheService },
      ],
    }).compile();

    service = module.get<ProductsService>(ProductsService);
    prisma = module.get(PrismaService);
    cache = module.get(CacheService);
  });

  describe('findById', () => {
    it('should return a product by id', async () => {
      const mockProduct = createMockProduct();
      cache.getOrSet.mockImplementation((_, factory) => factory());
      prisma.product.findUnique.mockResolvedValue(mockProduct);

      const result = await service.findById('product-123');

      expect(result).toEqual(mockProduct);
      expect(prisma.product.findUnique).toHaveBeenCalledWith({
        where: { id: 'product-123' },
        include: expect.any(Object),
      });
    });

    it('should throw NotFoundException if product not found', async () => {
      cache.getOrSet.mockImplementation((_, factory) => factory());
      prisma.product.findUnique.mockResolvedValue(null);

      await expect(service.findById('nonexistent')).rejects.toThrow(
        NotFoundException,
      );
    });
  });

  describe('create', () => {
    const createDto = {
      name: 'New Product',
      description: 'A new product',
      price: 1500,
      categoryId: 'category-123',
      businessId: 'business-123',
    };

    it('should create a product successfully', async () => {
      const mockBusiness = createMockBusiness();
      const mockProduct = createMockProduct(createDto);
      
      prisma.businessProfile.findUnique.mockResolvedValue(mockBusiness);
      prisma.product.create.mockResolvedValue(mockProduct);

      const result = await service.create('user-123', createDto);

      expect(result).toEqual(mockProduct);
      expect(prisma.product.create).toHaveBeenCalled();
      expect(cache.invalidateTag).toHaveBeenCalled();
    });

    it('should generate unique slug', async () => {
      const mockBusiness = createMockBusiness();
      prisma.businessProfile.findUnique.mockResolvedValue(mockBusiness);
      prisma.product.findFirst.mockResolvedValue(null); // No existing slug
      prisma.product.create.mockResolvedValue(createMockProduct());

      await service.create('user-123', createDto);

      expect(prisma.product.create).toHaveBeenCalledWith(
        expect.objectContaining({
          data: expect.objectContaining({
            slug: expect.stringMatching(/^new-product/),
          }),
        }),
      );
    });

    it('should throw if business not found', async () => {
      prisma.businessProfile.findUnique.mockResolvedValue(null);

      await expect(service.create('user-123', createDto)).rejects.toThrow(
        NotFoundException,
      );
    });
  });

  describe('update', () => {
    const updateDto = {
      name: 'Updated Product',
      price: 2000,
    };

    it('should update a product successfully', async () => {
      const existingProduct = createMockProduct();
      const updatedProduct = createMockProduct(updateDto);
      
      prisma.product.findUnique.mockResolvedValue(existingProduct);
      prisma.product.update.mockResolvedValue(updatedProduct);

      const result = await service.update('product-123', updateDto);

      expect(result.name).toBe('Updated Product');
      expect(result.price).toBe(2000);
      expect(cache.invalidateTag).toHaveBeenCalled();
    });

    it('should throw if product not found', async () => {
      prisma.product.findUnique.mockResolvedValue(null);

      await expect(
        service.update('nonexistent', updateDto),
      ).rejects.toThrow(NotFoundException);
    });
  });

  describe('delete', () => {
    it('should soft delete a product', async () => {
      const mockProduct = createMockProduct();
      prisma.product.findUnique.mockResolvedValue(mockProduct);
      prisma.product.update.mockResolvedValue({ ...mockProduct, deletedAt: new Date() });

      await service.delete('product-123');

      expect(prisma.product.update).toHaveBeenCalledWith({
        where: { id: 'product-123' },
        data: { deletedAt: expect.any(Date), status: 'deleted' },
      });
      expect(cache.invalidateTag).toHaveBeenCalled();
    });
  });

  describe('findByBusiness', () => {
    it('should return products for a business', async () => {
      const mockProducts = [createMockProduct(), createMockProduct({ id: 'product-456' })];
      prisma.product.findMany.mockResolvedValue(mockProducts);

      const result = await service.findByBusiness('business-123', {
        status: 'active',
        limit: 20,
      });

      expect(result).toEqual(mockProducts);
      expect(prisma.product.findMany).toHaveBeenCalledWith(
        expect.objectContaining({
          where: expect.objectContaining({
            businessId: 'business-123',
            status: 'active',
          }),
        }),
      );
    });
  });

  describe('updateStock', () => {
    it('should update product stock', async () => {
      const mockProduct = createMockProduct({ stockQuantity: 100 });
      prisma.product.findUnique.mockResolvedValue(mockProduct);
      prisma.product.update.mockResolvedValue({ ...mockProduct, stockQuantity: 90 });

      const result = await service.updateStock('product-123', -10);

      expect(result.stockQuantity).toBe(90);
    });

    it('should throw if insufficient stock', async () => {
      const mockProduct = createMockProduct({ stockQuantity: 5, trackInventory: true });
      prisma.product.findUnique.mockResolvedValue(mockProduct);

      await expect(
        service.updateStock('product-123', -10),
      ).rejects.toThrow(BadRequestException);
    });
  });
});
