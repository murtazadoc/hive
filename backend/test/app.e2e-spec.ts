import { Test, TestingModule } from '@nestjs/testing';
import { INestApplication, ValidationPipe } from '@nestjs/common';
import * as request from 'supertest';
import { AppModule } from '../src/app.module';
import { PrismaService } from '../src/prisma/prisma.service';
import { CacheService } from '../src/modules/cache/cache.service';
import { JwtService } from '@nestjs/jwt';

describe('HIVE API (e2e)', () => {
  let app: INestApplication;
  let prisma: PrismaService;
  let jwtService: JwtService;
  let authToken: string;
  let testUserId: string;
  let testBusinessId: string;
  let testProductId: string;

  beforeAll(async () => {
    const moduleFixture: TestingModule = await Test.createTestingModule({
      imports: [AppModule],
    })
      .overrideProvider(CacheService)
      .useValue({
        get: jest.fn(),
        set: jest.fn(),
        del: jest.fn(),
        getOrSet: jest.fn((_, factory) => factory()),
        invalidateTag: jest.fn(),
        checkRateLimit: jest.fn().mockResolvedValue({ allowed: true }),
      })
      .compile();

    app = moduleFixture.createNestApplication();
    app.useGlobalPipes(
      new ValidationPipe({
        whitelist: true,
        transform: true,
        forbidNonWhitelisted: true,
      }),
    );

    await app.init();

    prisma = app.get(PrismaService);
    jwtService = app.get(JwtService);

    // Setup test data
    await setupTestData();
  });

  afterAll(async () => {
    await cleanupTestData();
    await app.close();
  });

  async function setupTestData() {
    // Create test user
    const user = await prisma.user.create({
      data: {
        email: 'e2e-test@example.com',
        phone: '+254700000001',
        fullName: 'E2E Test User',
        password: '$2a$12$test',
        role: 'customer',
        isEmailVerified: true,
      },
    });
    testUserId = user.id;

    // Generate auth token
    authToken = await jwtService.signAsync({ sub: user.id, role: user.role });

    // Create test business
    const business = await prisma.businessProfile.create({
      data: {
        userId: user.id,
        businessName: 'E2E Test Business',
        slug: 'e2e-test-business',
        description: 'Test business for E2E',
        county: 'Nairobi',
        status: 'approved',
      },
    });
    testBusinessId = business.id;

    // Create test category
    const category = await prisma.category.create({
      data: {
        name: 'E2E Test Category',
        slug: 'e2e-test-category',
      },
    });

    // Create test product
    const product = await prisma.product.create({
      data: {
        businessId: business.id,
        categoryId: category.id,
        name: 'E2E Test Product',
        slug: 'e2e-test-product',
        description: 'Test product for E2E',
        price: 1500,
        status: 'active',
        stockQuantity: 100,
      },
    });
    testProductId = product.id;
  }

  async function cleanupTestData() {
    // Clean up in reverse order
    await prisma.product.deleteMany({ where: { slug: { startsWith: 'e2e-' } } });
    await prisma.category.deleteMany({ where: { slug: { startsWith: 'e2e-' } } });
    await prisma.businessProfile.deleteMany({ where: { slug: { startsWith: 'e2e-' } } });
    await prisma.user.deleteMany({ where: { email: { startsWith: 'e2e-' } } });
  }

  // =====================================================
  // HEALTH CHECK
  // =====================================================
  describe('Health Check', () => {
    it('/health (GET) should return healthy status', () => {
      return request(app.getHttpServer())
        .get('/health')
        .expect(200)
        .expect((res) => {
          expect(res.body.status).toBeDefined();
        });
    });

    it('/health/live (GET) should return ok', () => {
      return request(app.getHttpServer())
        .get('/health/live')
        .expect(200)
        .expect((res) => {
          expect(res.body.status).toBe('ok');
        });
    });
  });

  // =====================================================
  // AUTHENTICATION
  // =====================================================
  describe('Authentication', () => {
    it('/auth/register (POST) should create new user', () => {
      return request(app.getHttpServer())
        .post('/auth/register')
        .send({
          email: 'e2e-new@example.com',
          phone: '+254700000002',
          fullName: 'New E2E User',
          password: 'Password123!',
        })
        .expect(201)
        .expect((res) => {
          expect(res.body.accessToken).toBeDefined();
          expect(res.body.user.email).toBe('e2e-new@example.com');
        });
    });

    it('/auth/register (POST) should reject duplicate email', () => {
      return request(app.getHttpServer())
        .post('/auth/register')
        .send({
          email: 'e2e-test@example.com',
          phone: '+254700000003',
          fullName: 'Duplicate User',
          password: 'Password123!',
        })
        .expect(400);
    });

    it('/auth/login (POST) should return token', () => {
      return request(app.getHttpServer())
        .post('/auth/login')
        .send({
          email: 'e2e-test@example.com',
          password: 'Password123!',
        })
        .expect(200)
        .expect((res) => {
          expect(res.body.accessToken).toBeDefined();
        });
    });

    it('/auth/me (GET) should return current user', () => {
      return request(app.getHttpServer())
        .get('/auth/me')
        .set('Authorization', `Bearer ${authToken}`)
        .expect(200)
        .expect((res) => {
          expect(res.body.id).toBe(testUserId);
        });
    });

    it('/auth/me (GET) should reject without token', () => {
      return request(app.getHttpServer())
        .get('/auth/me')
        .expect(401);
    });
  });

  // =====================================================
  // PRODUCTS
  // =====================================================
  describe('Products', () => {
    it('/products (GET) should return products list', () => {
      return request(app.getHttpServer())
        .get('/products')
        .expect(200)
        .expect((res) => {
          expect(Array.isArray(res.body)).toBe(true);
        });
    });

    it('/products/:id (GET) should return product details', () => {
      return request(app.getHttpServer())
        .get(`/products/${testProductId}`)
        .expect(200)
        .expect((res) => {
          expect(res.body.id).toBe(testProductId);
          expect(res.body.name).toBe('E2E Test Product');
        });
    });

    it('/products/:id (GET) should return 404 for non-existent', () => {
      return request(app.getHttpServer())
        .get('/products/00000000-0000-0000-0000-000000000000')
        .expect(404);
    });

    it('/products (POST) should create product (authenticated)', () => {
      return request(app.getHttpServer())
        .post('/products')
        .set('Authorization', `Bearer ${authToken}`)
        .send({
          name: 'E2E New Product',
          description: 'New test product',
          price: 2000,
          businessId: testBusinessId,
        })
        .expect(201)
        .expect((res) => {
          expect(res.body.name).toBe('E2E New Product');
        });
    });

    it('/products (POST) should reject without auth', () => {
      return request(app.getHttpServer())
        .post('/products')
        .send({
          name: 'Unauthorized Product',
          price: 1000,
        })
        .expect(401);
    });
  });

  // =====================================================
  // BUSINESSES
  // =====================================================
  describe('Businesses', () => {
    it('/businesses (GET) should return businesses list', () => {
      return request(app.getHttpServer())
        .get('/businesses')
        .expect(200)
        .expect((res) => {
          expect(Array.isArray(res.body)).toBe(true);
        });
    });

    it('/businesses/:id (GET) should return business details', () => {
      return request(app.getHttpServer())
        .get(`/businesses/${testBusinessId}`)
        .expect(200)
        .expect((res) => {
          expect(res.body.id).toBe(testBusinessId);
        });
    });

    it('/businesses/:id/products (GET) should return business products', () => {
      return request(app.getHttpServer())
        .get(`/businesses/${testBusinessId}/products`)
        .expect(200)
        .expect((res) => {
          expect(Array.isArray(res.body)).toBe(true);
        });
    });
  });

  // =====================================================
  // ORDERS
  // =====================================================
  describe('Orders', () => {
    let testOrderId: string;

    it('/orders (POST) should create order', async () => {
      const response = await request(app.getHttpServer())
        .post('/orders')
        .set('Authorization', `Bearer ${authToken}`)
        .send({
          businessId: testBusinessId,
          items: [{ productId: testProductId, quantity: 1 }],
          deliveryType: 'pickup',
          buyerPhone: '+254700000001',
          buyerName: 'Test Buyer',
        })
        .expect(201);

      expect(response.body.orderId).toBeDefined();
      expect(response.body.orderNumber).toBeDefined();
      testOrderId = response.body.orderId;
    });

    it('/orders (GET) should return user orders', () => {
      return request(app.getHttpServer())
        .get('/orders')
        .set('Authorization', `Bearer ${authToken}`)
        .expect(200)
        .expect((res) => {
          expect(Array.isArray(res.body)).toBe(true);
        });
    });

    it('/orders/:id (GET) should return order details', async () => {
      if (!testOrderId) return;

      return request(app.getHttpServer())
        .get(`/orders/${testOrderId}`)
        .set('Authorization', `Bearer ${authToken}`)
        .expect(200)
        .expect((res) => {
          expect(res.body.id).toBe(testOrderId);
        });
    });
  });

  // =====================================================
  // NOTIFICATIONS
  // =====================================================
  describe('Notifications', () => {
    it('/notifications (GET) should return notifications', () => {
      return request(app.getHttpServer())
        .get('/notifications')
        .set('Authorization', `Bearer ${authToken}`)
        .expect(200)
        .expect((res) => {
          expect(Array.isArray(res.body)).toBe(true);
        });
    });

    it('/notifications/unread-count (GET) should return count', () => {
      return request(app.getHttpServer())
        .get('/notifications/unread-count')
        .set('Authorization', `Bearer ${authToken}`)
        .expect(200)
        .expect((res) => {
          expect(typeof res.body.count).toBe('number');
        });
    });
  });

  // =====================================================
  // SEARCH
  // =====================================================
  describe('Search', () => {
    it('/search (GET) should return search results', () => {
      return request(app.getHttpServer())
        .get('/search')
        .query({ q: 'test' })
        .expect(200)
        .expect((res) => {
          expect(res.body.products).toBeDefined();
        });
    });

    it('/search/autocomplete (GET) should return suggestions', () => {
      return request(app.getHttpServer())
        .get('/search/autocomplete')
        .query({ q: 'test' })
        .expect(200)
        .expect((res) => {
          expect(res.body.suggestions).toBeDefined();
        });
    });
  });

  // =====================================================
  // ANALYTICS (Tracking)
  // =====================================================
  describe('Analytics Tracking', () => {
    it('/track/event (POST) should track event', () => {
      return request(app.getHttpServer())
        .post('/track/event')
        .send({
          eventName: 'test_event',
          properties: { test: true },
        })
        .expect(200);
    });

    it('/track/pageview (POST) should track page view', () => {
      return request(app.getHttpServer())
        .post('/track/pageview')
        .send({
          pagePath: '/test-page',
          sessionId: 'test-session-123',
        })
        .expect(200);
    });
  });
});
