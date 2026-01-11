import { Test, TestingModule } from '@nestjs/testing';
import { INestApplication, ValidationPipe } from '@nestjs/common';
import { PrismaService } from '../src/prisma/prisma.service';
import { CacheService } from '../src/modules/cache/cache.service';
import { ConfigModule } from '@nestjs/config';

// =====================================================
// MOCK SERVICES
// =====================================================

export const mockPrismaService = {
  user: {
    findUnique: jest.fn(),
    findMany: jest.fn(),
    create: jest.fn(),
    update: jest.fn(),
    delete: jest.fn(),
    count: jest.fn(),
  },
  product: {
    findUnique: jest.fn(),
    findMany: jest.fn(),
    create: jest.fn(),
    update: jest.fn(),
    delete: jest.fn(),
    count: jest.fn(),
  },
  businessProfile: {
    findUnique: jest.fn(),
    findMany: jest.fn(),
    create: jest.fn(),
    update: jest.fn(),
  },
  order: {
    findUnique: jest.fn(),
    findMany: jest.fn(),
    create: jest.fn(),
    update: jest.fn(),
    aggregate: jest.fn(),
  },
  transaction: {
    findUnique: jest.fn(),
    findMany: jest.fn(),
    create: jest.fn(),
    update: jest.fn(),
  },
  notification: {
    findMany: jest.fn(),
    create: jest.fn(),
    update: jest.fn(),
    updateMany: jest.fn(),
    count: jest.fn(),
  },
  $transaction: jest.fn((fn) => fn(mockPrismaService)),
  $queryRaw: jest.fn(),
};

export const mockCacheService = {
  get: jest.fn(),
  set: jest.fn(),
  del: jest.fn(),
  getOrSet: jest.fn(),
  mget: jest.fn(),
  mset: jest.fn(),
  invalidateTag: jest.fn(),
  checkRateLimit: jest.fn().mockResolvedValue({ allowed: true, remaining: 99 }),
  acquireLock: jest.fn().mockResolvedValue('lock-value'),
  releaseLock: jest.fn().mockResolvedValue(true),
};

export const mockConfigService = {
  get: jest.fn((key: string) => {
    const config: Record<string, string> = {
      JWT_SECRET: 'test-secret',
      JWT_EXPIRES_IN: '7d',
      MPESA_CONSUMER_KEY: 'test-key',
      MPESA_CONSUMER_SECRET: 'test-secret',
      MPESA_SHORTCODE: '174379',
      CLOUDINARY_CLOUD_NAME: 'test-cloud',
      REDIS_URL: 'redis://localhost:6379',
    };
    return config[key];
  }),
};

// =====================================================
// TEST UTILITIES
// =====================================================

export function createMockUser(overrides = {}) {
  return {
    id: 'user-123',
    email: 'test@example.com',
    phone: '+254712345678',
    fullName: 'Test User',
    role: 'customer',
    isEmailVerified: true,
    isPhoneVerified: true,
    createdAt: new Date(),
    updatedAt: new Date(),
    ...overrides,
  };
}

export function createMockProduct(overrides = {}) {
  return {
    id: 'product-123',
    name: 'Test Product',
    slug: 'test-product',
    description: 'A test product',
    price: 1500,
    compareAtPrice: 2000,
    sku: 'TEST-001',
    status: 'active',
    businessId: 'business-123',
    categoryId: 'category-123',
    stockQuantity: 100,
    trackInventory: true,
    createdAt: new Date(),
    updatedAt: new Date(),
    images: [{ id: 'img-1', url: 'https://example.com/image.jpg', isPrimary: true }],
    ...overrides,
  };
}

export function createMockBusiness(overrides = {}) {
  return {
    id: 'business-123',
    userId: 'user-123',
    businessName: 'Test Business',
    slug: 'test-business',
    description: 'A test business',
    status: 'approved',
    county: 'Nairobi',
    subCounty: 'Westlands',
    followersCount: 100,
    createdAt: new Date(),
    updatedAt: new Date(),
    ...overrides,
  };
}

export function createMockOrder(overrides = {}) {
  return {
    id: 'order-123',
    orderNumber: 'HV241225ABC123',
    buyerId: 'user-123',
    businessId: 'business-123',
    items: [{ productId: 'product-123', quantity: 2, price: 1500 }],
    itemCount: 1,
    subtotal: 3000,
    discountAmount: 0,
    deliveryFee: 150,
    serviceFee: 75,
    totalAmount: 3225,
    status: 'pending',
    paymentStatus: 'pending',
    deliveryType: 'delivery',
    buyerPhone: '+254712345678',
    buyerName: 'Test User',
    createdAt: new Date(),
    updatedAt: new Date(),
    ...overrides,
  };
}

// =====================================================
// TEST MODULE BUILDER
// =====================================================

export async function createTestingModule(
  imports: any[] = [],
  providers: any[] = [],
): Promise<TestingModule> {
  return Test.createTestingModule({
    imports: [
      ConfigModule.forRoot({ isGlobal: true }),
      ...imports,
    ],
    providers: [
      { provide: PrismaService, useValue: mockPrismaService },
      { provide: CacheService, useValue: mockCacheService },
      ...providers,
    ],
  }).compile();
}

// =====================================================
// E2E TEST UTILITIES
// =====================================================

export async function createE2EApp(module: TestingModule): Promise<INestApplication> {
  const app = module.createNestApplication();
  
  app.useGlobalPipes(
    new ValidationPipe({
      whitelist: true,
      transform: true,
      forbidNonWhitelisted: true,
    }),
  );

  await app.init();
  return app;
}

// =====================================================
// JEST EXTENSIONS
// =====================================================

expect.extend({
  toBeWithinRange(received: number, floor: number, ceiling: number) {
    const pass = received >= floor && received <= ceiling;
    return {
      pass,
      message: () =>
        `expected ${received} ${pass ? 'not ' : ''}to be within range ${floor} - ${ceiling}`,
    };
  },
});

// =====================================================
// CLEANUP
// =====================================================

export function resetAllMocks() {
  jest.clearAllMocks();
  Object.values(mockPrismaService).forEach((service) => {
    if (typeof service === 'object') {
      Object.values(service).forEach((method) => {
        if (typeof method === 'function' && method.mockReset) {
          method.mockReset();
        }
      });
    }
  });
}

// Global setup
beforeEach(() => {
  resetAllMocks();
});
