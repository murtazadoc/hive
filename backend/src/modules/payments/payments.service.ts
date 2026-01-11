import {
  Injectable,
  Logger,
  BadRequestException,
  NotFoundException,
} from '@nestjs/common';
import { PrismaService } from '../../prisma/prisma.service';
import { MpesaService } from './mpesa.service';
import { v4 as uuidv4 } from 'uuid';

// =====================================================
// TYPES
// =====================================================
export interface CreateOrderDto {
  businessId: string;
  items: Array<{
    productId: string;
    quantity: number;
    variantId?: string;
  }>;
  deliveryType: 'pickup' | 'delivery';
  deliveryAddress?: {
    address: string;
    city: string;
    county: string;
    postalCode?: string;
    instructions?: string;
  };
  buyerPhone: string;
  buyerName: string;
  discountCode?: string;
}

export interface PayOrderDto {
  orderId: string;
  paymentMethod: 'mpesa' | 'wallet';
  phoneNumber?: string;
}

export interface OrderSummary {
  orderId: string;
  orderNumber: string;
  items: any[];
  subtotal: number;
  discount: number;
  deliveryFee: number;
  serviceFee: number;
  total: number;
  status: string;
  paymentStatus: string;
}

// =====================================================
// PAYMENTS SERVICE
// =====================================================
@Injectable()
export class PaymentsService {
  private readonly logger = new Logger(PaymentsService.name);
  private readonly serviceFeePercent = 0.025; // 2.5% platform fee
  private readonly maxDeliveryFee = 500;

  constructor(
    private prisma: PrismaService,
    private mpesaService: MpesaService,
  ) {}

  // =====================================================
  // WALLET
  // =====================================================

  /**
   * Get or create wallet for user
   */
  async getWallet(userId: string) {
    let wallet = await this.prisma.wallet.findUnique({
      where: { userId },
    });

    if (!wallet) {
      wallet = await this.prisma.wallet.create({
        data: {
          id: uuidv4(),
          userId,
          balance: 0,
          currency: 'KES',
        },
      });
    }

    return wallet;
  }

  /**
   * Get wallet balance
   */
  async getBalance(userId: string): Promise<number> {
    const wallet = await this.getWallet(userId);
    return wallet.balance;
  }

  /**
   * Deposit to wallet via M-Pesa
   */
  async depositToWallet(
    userId: string,
    amount: number,
    phoneNumber: string,
  ): Promise<{ success: boolean; checkoutRequestId?: string; error?: string }> {
    if (amount < 10) {
      return { success: false, error: 'Minimum deposit is KES 10' };
    }

    if (amount > 70000) {
      return { success: false, error: 'Maximum single deposit is KES 70,000' };
    }

    const wallet = await this.getWallet(userId);

    const result = await this.mpesaService.initiateSTKPush({
      phoneNumber,
      amount,
      accountReference: `HIVE${wallet.id.slice(0, 6)}`,
      description: 'Wallet Deposit',
      userId,
    });

    return {
      success: result.success,
      checkoutRequestId: result.checkoutRequestId,
      error: result.error,
    };
  }

  // =====================================================
  // ORDERS
  // =====================================================

  /**
   * Create a new order
   */
  async createOrder(userId: string, dto: CreateOrderDto): Promise<OrderSummary> {
    // Validate business
    const business = await this.prisma.businessProfile.findUnique({
      where: { id: dto.businessId },
      select: { id: true, status: true, businessName: true },
    });

    if (!business || business.status !== 'approved') {
      throw new BadRequestException('Business not found or not active');
    }

    // Fetch products and validate
    const productIds = dto.items.map((i) => i.productId);
    const products = await this.prisma.product.findMany({
      where: {
        id: { in: productIds },
        businessId: dto.businessId,
        status: 'active',
      },
      include: {
        images: { where: { isPrimary: true }, take: 1 },
      },
    });

    if (products.length !== productIds.length) {
      throw new BadRequestException('Some products are not available');
    }

    // Build order items
    const orderItems: any[] = [];
    let subtotal = 0;

    for (const item of dto.items) {
      const product = products.find((p) => p.id === item.productId);
      if (!product) continue;

      // Check stock
      if (product.trackInventory && product.stockQuantity < item.quantity) {
        throw new BadRequestException(`${product.name} is out of stock`);
      }

      const totalPrice = product.price * item.quantity;
      subtotal += totalPrice;

      orderItems.push({
        id: uuidv4(),
        productId: product.id,
        productName: product.name,
        productSku: product.sku,
        productImage: product.images[0]?.url,
        unitPrice: product.price,
        quantity: item.quantity,
        totalPrice,
        variantId: item.variantId,
      });
    }

    // Calculate discount
    let discountAmount = 0;
    let discountId: string | undefined;

    if (dto.discountCode) {
      const discount = await this.validateDiscountCode(
        dto.discountCode,
        userId,
        dto.businessId,
        subtotal,
      );

      if (discount) {
        discountAmount = discount.discountAmount;
        discountId = discount.discountId;
      }
    }

    // Calculate fees
    const deliveryFee = dto.deliveryType === 'delivery' ? this.calculateDeliveryFee(dto.deliveryAddress) : 0;
    const serviceFee = Math.round((subtotal - discountAmount) * this.serviceFeePercent);
    const totalAmount = subtotal - discountAmount + deliveryFee + serviceFee;

    // Create order
    const order = await this.prisma.$transaction(async (tx) => {
      const newOrder = await tx.order.create({
        data: {
          id: uuidv4(),
          buyerId: userId,
          businessId: dto.businessId,
          items: orderItems,
          itemCount: orderItems.length,
          subtotal,
          discountAmount,
          discountCode: dto.discountCode,
          discountId,
          deliveryFee,
          serviceFee,
          totalAmount,
          deliveryType: dto.deliveryType,
          deliveryAddress: dto.deliveryAddress,
          buyerPhone: dto.buyerPhone,
          buyerName: dto.buyerName,
          status: 'pending',
          paymentStatus: 'pending',
        },
      });

      // Create order items
      for (const item of orderItems) {
        await tx.orderItem.create({
          data: {
            ...item,
            orderId: newOrder.id,
          },
        });
      }

      // Decrement stock
      for (const item of dto.items) {
        const product = products.find((p) => p.id === item.productId);
        if (product?.trackInventory) {
          await tx.product.update({
            where: { id: item.productId },
            data: { stockQuantity: { decrement: item.quantity } },
          });
        }
      }

      // Record discount usage
      if (discountId) {
        await tx.discountUsage.create({
          data: {
            id: uuidv4(),
            discountId,
            userId,
            orderId: newOrder.id,
            discountAmount,
          },
        });

        await tx.discountCode.update({
          where: { id: discountId },
          data: { usageCount: { increment: 1 } },
        });
      }

      return newOrder;
    });

    return {
      orderId: order.id,
      orderNumber: order.orderNumber,
      items: orderItems,
      subtotal,
      discount: discountAmount,
      deliveryFee,
      serviceFee,
      total: totalAmount,
      status: order.status,
      paymentStatus: order.paymentStatus,
    };
  }

  /**
   * Pay for an order
   */
  async payOrder(
    userId: string,
    dto: PayOrderDto,
  ): Promise<{ success: boolean; checkoutRequestId?: string; error?: string }> {
    const order = await this.prisma.order.findUnique({
      where: { id: dto.orderId },
    });

    if (!order) {
      throw new NotFoundException('Order not found');
    }

    if (order.buyerId !== userId) {
      throw new BadRequestException('Not authorized to pay this order');
    }

    if (order.paymentStatus === 'paid') {
      return { success: false, error: 'Order already paid' };
    }

    if (dto.paymentMethod === 'mpesa') {
      if (!dto.phoneNumber) {
        return { success: false, error: 'Phone number required for M-Pesa' };
      }

      const result = await this.mpesaService.initiateSTKPush({
        phoneNumber: dto.phoneNumber,
        amount: order.totalAmount,
        accountReference: order.orderNumber,
        description: 'Order Payment',
        orderId: order.id,
        userId,
        businessId: order.businessId,
      });

      return {
        success: result.success,
        checkoutRequestId: result.checkoutRequestId,
        error: result.error,
      };
    }

    if (dto.paymentMethod === 'wallet') {
      return this.payWithWallet(userId, order);
    }

    return { success: false, error: 'Invalid payment method' };
  }

  /**
   * Pay order with wallet balance
   */
  private async payWithWallet(
    userId: string,
    order: any,
  ): Promise<{ success: boolean; error?: string }> {
    const wallet = await this.getWallet(userId);

    if (wallet.balance < order.totalAmount) {
      return { success: false, error: 'Insufficient wallet balance' };
    }

    await this.prisma.$transaction(async (tx) => {
      // Debit wallet
      await tx.wallet.update({
        where: { id: wallet.id },
        data: { balance: { decrement: order.totalAmount } },
      });

      // Create transaction
      await tx.transaction.create({
        data: {
          id: uuidv4(),
          reference: `TXN${Date.now()}`,
          type: 'payment',
          userId,
          walletId: wallet.id,
          orderId: order.id,
          businessId: order.businessId,
          amount: order.totalAmount,
          currency: 'KES',
          paymentMethod: 'wallet',
          status: 'completed',
          completedAt: new Date(),
        },
      });

      // Update order
      await tx.order.update({
        where: { id: order.id },
        data: {
          paymentStatus: 'paid',
          status: 'paid',
          paidAt: new Date(),
        },
      });

      // Credit business (minus service fee)
      const businessWallet = await tx.wallet.findFirst({
        where: { userId: order.businessId },
      });

      if (businessWallet) {
        const netAmount = order.totalAmount - order.serviceFee;
        await tx.wallet.update({
          where: { id: businessWallet.id },
          data: { balance: { increment: netAmount } },
        });
      }
    });

    return { success: true };
  }

  /**
   * Get order by ID
   */
  async getOrder(orderId: string, userId?: string) {
    const order = await this.prisma.order.findUnique({
      where: { id: orderId },
      include: {
        items: true,
        business: {
          select: { id: true, businessName: true, slug: true, logoUrl: true },
        },
      },
    });

    if (!order) {
      throw new NotFoundException('Order not found');
    }

    // Only allow buyer or business to view
    if (userId && order.buyerId !== userId && order.businessId !== userId) {
      throw new BadRequestException('Not authorized to view this order');
    }

    return order;
  }

  /**
   * Get user's orders
   */
  async getUserOrders(userId: string, status?: string, limit: number = 20, cursor?: string) {
    return this.prisma.order.findMany({
      where: {
        buyerId: userId,
        ...(status && { status }),
      },
      include: {
        business: {
          select: { id: true, businessName: true, logoUrl: true },
        },
        items: true,
      },
      orderBy: { createdAt: 'desc' },
      take: limit,
      ...(cursor && { skip: 1, cursor: { id: cursor } }),
    });
  }

  /**
   * Get business orders
   */
  async getBusinessOrders(businessId: string, status?: string, limit: number = 20, cursor?: string) {
    return this.prisma.order.findMany({
      where: {
        businessId,
        ...(status && { status }),
      },
      include: {
        items: true,
      },
      orderBy: { createdAt: 'desc' },
      take: limit,
      ...(cursor && { skip: 1, cursor: { id: cursor } }),
    });
  }

  /**
   * Update order status (by business)
   */
  async updateOrderStatus(
    orderId: string,
    businessId: string,
    status: string,
    notes?: string,
  ) {
    const order = await this.prisma.order.findUnique({
      where: { id: orderId },
    });

    if (!order || order.businessId !== businessId) {
      throw new NotFoundException('Order not found');
    }

    const updateData: any = { status };

    switch (status) {
      case 'confirmed':
        updateData.confirmedAt = new Date();
        break;
      case 'shipped':
        updateData.shippedAt = new Date();
        break;
      case 'delivered':
        updateData.deliveredAt = new Date();
        break;
      case 'cancelled':
        updateData.cancelledAt = new Date();
        updateData.cancellationReason = notes;
        break;
    }

    return this.prisma.order.update({
      where: { id: orderId },
      data: updateData,
    });
  }

  // =====================================================
  // TRANSACTIONS
  // =====================================================

  /**
   * Get user transactions
   */
  async getUserTransactions(userId: string, limit: number = 20, cursor?: string) {
    return this.prisma.transaction.findMany({
      where: { userId },
      orderBy: { createdAt: 'desc' },
      take: limit,
      ...(cursor && { skip: 1, cursor: { id: cursor } }),
    });
  }

  /**
   * Get transaction by reference
   */
  async getTransaction(reference: string) {
    return this.prisma.transaction.findUnique({
      where: { reference },
    });
  }

  /**
   * Check payment status
   */
  async checkPaymentStatus(checkoutRequestId: string): Promise<{
    status: string;
    mpesaReceipt?: string;
  }> {
    // First check our database
    const transaction = await this.prisma.transaction.findFirst({
      where: {
        metadata: {
          path: ['checkoutRequestId'],
          equals: checkoutRequestId,
        },
      },
    });

    if (transaction?.status === 'completed') {
      return { status: 'completed', mpesaReceipt: transaction.mpesaReceipt || undefined };
    }

    if (transaction?.status === 'failed') {
      return { status: 'failed' };
    }

    // Query M-Pesa
    const result = await this.mpesaService.querySTKPushStatus(checkoutRequestId);

    if (result.completed) {
      return { status: result.success ? 'completed' : 'failed' };
    }

    return { status: 'pending' };
  }

  // =====================================================
  // DISCOUNTS
  // =====================================================

  /**
   * Validate discount code
   */
  async validateDiscountCode(
    code: string,
    userId: string,
    businessId: string,
    subtotal: number,
  ): Promise<{ discountId: string; discountAmount: number } | null> {
    const discount = await this.prisma.discountCode.findFirst({
      where: {
        code: code.toUpperCase(),
        isActive: true,
        OR: [
          { businessId },
          { businessId: null }, // Platform-wide
        ],
        startsAt: { lte: new Date() },
        OR: [
          { expiresAt: null },
          { expiresAt: { gt: new Date() } },
        ],
      },
    });

    if (!discount) {
      return null;
    }

    // Check usage limit
    if (discount.usageLimit && discount.usageCount >= discount.usageLimit) {
      return null;
    }

    // Check per-user limit
    if (discount.perUserLimit) {
      const userUsage = await this.prisma.discountUsage.count({
        where: { discountId: discount.id, userId },
      });
      if (userUsage >= discount.perUserLimit) {
        return null;
      }
    }

    // Check minimum order
    if (discount.minOrderAmount && subtotal < discount.minOrderAmount) {
      return null;
    }

    // Check first order only
    if (discount.firstOrderOnly) {
      const existingOrders = await this.prisma.order.count({
        where: { buyerId: userId, paymentStatus: 'paid' },
      });
      if (existingOrders > 0) {
        return null;
      }
    }

    // Calculate discount
    let discountAmount: number;

    if (discount.discountType === 'percentage') {
      discountAmount = Math.round(subtotal * (discount.discountValue / 100));
      if (discount.maxDiscount) {
        discountAmount = Math.min(discountAmount, discount.maxDiscount);
      }
    } else {
      discountAmount = Math.min(discount.discountValue, subtotal);
    }

    return { discountId: discount.id, discountAmount };
  }

  // =====================================================
  // HELPERS
  // =====================================================

  private calculateDeliveryFee(address?: any): number {
    // Simple flat fee for now
    // In production, integrate with delivery API
    if (!address) return 0;
    
    const baseFee = 150;
    
    // Add extra for certain counties
    const premiumCounties = ['Mombasa', 'Kisumu', 'Nakuru'];
    if (premiumCounties.includes(address.county)) {
      return Math.min(baseFee + 100, this.maxDeliveryFee);
    }

    return baseFee;
  }
}
