import { Test, TestingModule } from '@nestjs/testing';
import { BadRequestException, NotFoundException } from '@nestjs/common';
import { PaymentsService } from './payments.service';
import { MpesaService } from './mpesa.service';
import { PrismaService } from '../../prisma/prisma.service';
import {
  mockPrismaService,
  createMockOrder,
  createMockProduct,
  createMockBusiness,
  createMockUser,
  resetAllMocks,
} from '../../../test/setup';

const mockMpesaService = {
  initiateSTKPush: jest.fn(),
  querySTKPushStatus: jest.fn(),
  processSTKCallback: jest.fn(),
};

describe('PaymentsService', () => {
  let service: PaymentsService;
  let prisma: typeof mockPrismaService;
  let mpesa: typeof mockMpesaService;

  beforeEach(async () => {
    resetAllMocks();

    const module: TestingModule = await Test.createTestingModule({
      providers: [
        PaymentsService,
        { provide: PrismaService, useValue: mockPrismaService },
        { provide: MpesaService, useValue: mockMpesaService },
      ],
    }).compile();

    service = module.get<PaymentsService>(PaymentsService);
    prisma = module.get(PrismaService);
    mpesa = module.get(MpesaService);
  });

  describe('createOrder', () => {
    const createOrderDto = {
      businessId: 'business-123',
      items: [{ productId: 'product-123', quantity: 2 }],
      deliveryType: 'delivery' as const,
      deliveryAddress: {
        address: '123 Test St',
        city: 'Nairobi',
        county: 'Nairobi',
      },
      buyerPhone: '+254712345678',
      buyerName: 'Test Buyer',
    };

    it('should create an order successfully', async () => {
      const mockBusiness = createMockBusiness();
      const mockProduct = createMockProduct({ price: 1500, stockQuantity: 100 });
      const mockOrder = createMockOrder();

      prisma.businessProfile.findUnique.mockResolvedValue(mockBusiness);
      prisma.product.findMany.mockResolvedValue([mockProduct]);
      prisma.$transaction.mockImplementation(async (fn) => {
        return mockOrder;
      });

      const result = await service.createOrder('user-123', createOrderDto);

      expect(result).toHaveProperty('orderId');
      expect(result).toHaveProperty('orderNumber');
      expect(result).toHaveProperty('total');
    });

    it('should throw if business not found', async () => {
      prisma.businessProfile.findUnique.mockResolvedValue(null);

      await expect(
        service.createOrder('user-123', createOrderDto),
      ).rejects.toThrow(NotFoundException);
    });

    it('should throw if product not found', async () => {
      prisma.businessProfile.findUnique.mockResolvedValue(createMockBusiness());
      prisma.product.findMany.mockResolvedValue([]);

      await expect(
        service.createOrder('user-123', createOrderDto),
      ).rejects.toThrow(BadRequestException);
    });

    it('should throw if insufficient stock', async () => {
      const mockProduct = createMockProduct({ 
        stockQuantity: 1, 
        trackInventory: true,
      });
      
      prisma.businessProfile.findUnique.mockResolvedValue(createMockBusiness());
      prisma.product.findMany.mockResolvedValue([mockProduct]);

      await expect(
        service.createOrder('user-123', createOrderDto),
      ).rejects.toThrow(BadRequestException);
    });

    it('should calculate service fee correctly', async () => {
      const mockProduct = createMockProduct({ price: 1000 });
      prisma.businessProfile.findUnique.mockResolvedValue(createMockBusiness());
      prisma.product.findMany.mockResolvedValue([mockProduct]);
      
      let capturedOrder: any;
      prisma.$transaction.mockImplementation(async (fn) => {
        capturedOrder = await fn(prisma);
        return capturedOrder;
      });

      const result = await service.createOrder('user-123', {
        ...createOrderDto,
        items: [{ productId: 'product-123', quantity: 1 }],
      });

      // Service fee should be 2.5% of subtotal
      expect(result.serviceFee).toBe(25); // 2.5% of 1000
    });
  });

  describe('payOrder', () => {
    const payOrderDto = {
      orderId: 'order-123',
      paymentMethod: 'mpesa' as const,
      phoneNumber: '+254712345678',
    };

    it('should initiate M-Pesa payment', async () => {
      const mockOrder = createMockOrder();
      prisma.order.findUnique.mockResolvedValue(mockOrder);
      mockMpesaService.initiateSTKPush.mockResolvedValue({
        success: true,
        checkoutRequestId: 'checkout-123',
      });

      const result = await service.payOrder('user-123', payOrderDto);

      expect(result.success).toBe(true);
      expect(result.checkoutRequestId).toBe('checkout-123');
      expect(mockMpesaService.initiateSTKPush).toHaveBeenCalledWith(
        expect.objectContaining({
          phoneNumber: payOrderDto.phoneNumber,
          amount: mockOrder.totalAmount,
        }),
      );
    });

    it('should throw if order not found', async () => {
      prisma.order.findUnique.mockResolvedValue(null);

      await expect(
        service.payOrder('user-123', payOrderDto),
      ).rejects.toThrow(NotFoundException);
    });

    it('should throw if order already paid', async () => {
      const paidOrder = createMockOrder({ paymentStatus: 'paid' });
      prisma.order.findUnique.mockResolvedValue(paidOrder);

      await expect(
        service.payOrder('user-123', payOrderDto),
      ).rejects.toThrow(BadRequestException);
    });

    it('should throw if user does not own order', async () => {
      const otherUserOrder = createMockOrder({ buyerId: 'other-user' });
      prisma.order.findUnique.mockResolvedValue(otherUserOrder);

      await expect(
        service.payOrder('user-123', payOrderDto),
      ).rejects.toThrow(BadRequestException);
    });
  });

  describe('validateDiscountCode', () => {
    it('should validate a valid discount code', async () => {
      const mockDiscount = {
        id: 'discount-123',
        code: 'SAVE10',
        discountType: 'percentage',
        discountValue: 10,
        isActive: true,
        startsAt: new Date(Date.now() - 86400000),
        expiresAt: new Date(Date.now() + 86400000),
        usageCount: 0,
        usageLimit: 100,
        minOrderAmount: 500,
      };

      prisma.$queryRaw.mockResolvedValue([mockDiscount]);
      prisma.$queryRaw.mockResolvedValueOnce([mockDiscount]);
      prisma.$queryRaw.mockResolvedValueOnce([{ count: 0 }]); // Usage count

      const result = await service.validateDiscountCode(
        'SAVE10',
        'user-123',
        null,
        1000,
      );

      expect(result).toHaveProperty('discountId');
      expect(result).toHaveProperty('discountAmount');
      expect(result?.discountAmount).toBe(100); // 10% of 1000
    });

    it('should return null for invalid code', async () => {
      prisma.$queryRaw.mockResolvedValue([]);

      const result = await service.validateDiscountCode(
        'INVALID',
        'user-123',
        null,
        1000,
      );

      expect(result).toBeNull();
    });

    it('should enforce minimum order amount', async () => {
      const mockDiscount = {
        id: 'discount-123',
        code: 'SAVE10',
        discountType: 'percentage',
        discountValue: 10,
        isActive: true,
        minOrderAmount: 2000,
      };

      prisma.$queryRaw.mockResolvedValue([mockDiscount]);

      const result = await service.validateDiscountCode(
        'SAVE10',
        'user-123',
        null,
        1000, // Below minimum
      );

      expect(result).toBeNull();
    });
  });

  describe('getWallet', () => {
    it('should return existing wallet', async () => {
      const mockWallet = {
        id: 'wallet-123',
        userId: 'user-123',
        balance: 5000,
        currency: 'KES',
      };

      prisma.wallet.findUnique.mockResolvedValue(mockWallet);

      const result = await service.getWallet('user-123');

      expect(result).toEqual(mockWallet);
    });

    it('should create wallet if not exists', async () => {
      const newWallet = {
        id: 'wallet-new',
        userId: 'user-123',
        balance: 0,
        currency: 'KES',
      };

      prisma.wallet.findUnique.mockResolvedValue(null);
      prisma.wallet.create.mockResolvedValue(newWallet);

      const result = await service.getWallet('user-123');

      expect(result.balance).toBe(0);
      expect(prisma.wallet.create).toHaveBeenCalled();
    });
  });

  describe('checkPaymentStatus', () => {
    it('should return status from database if completed', async () => {
      const mockTransaction = {
        status: 'completed',
        mpesaReceipt: 'ABC123',
      };

      prisma.transaction.findFirst.mockResolvedValue(mockTransaction);

      const result = await service.checkPaymentStatus('checkout-123');

      expect(result.status).toBe('completed');
      expect(result.mpesaReceipt).toBe('ABC123');
      expect(mockMpesaService.querySTKPushStatus).not.toHaveBeenCalled();
    });

    it('should query M-Pesa if status is pending', async () => {
      prisma.transaction.findFirst.mockResolvedValue({
        status: 'pending',
      });
      mockMpesaService.querySTKPushStatus.mockResolvedValue({
        completed: true,
        success: true,
        resultCode: 0,
      });

      const result = await service.checkPaymentStatus('checkout-123');

      expect(mockMpesaService.querySTKPushStatus).toHaveBeenCalled();
    });
  });
});
