import {
  Controller,
  Get,
  Post,
  Put,
  Body,
  Param,
  Query,
  UseGuards,
  HttpCode,
  HttpStatus,
  Req,
} from '@nestjs/common';
import { Request } from 'express';
import { ApiTags, ApiOperation, ApiBearerAuth } from '@nestjs/swagger';
import { JwtAuthGuard } from '../auth/guards/jwt-auth.guard';
import { Public, UserId } from '../auth/decorators/public.decorator';
import { PaymentsService, CreateOrderDto, PayOrderDto } from './payments.service';
import { MpesaService } from './mpesa.service';

// =====================================================
// WALLET CONTROLLER
// =====================================================
@ApiTags('wallet')
@Controller('wallet')
@UseGuards(JwtAuthGuard)
@ApiBearerAuth()
export class WalletController {
  constructor(private readonly paymentsService: PaymentsService) {}

  @Get()
  @ApiOperation({ summary: 'Get wallet details' })
  async getWallet(@UserId() userId: string) {
    return this.paymentsService.getWallet(userId);
  }

  @Get('balance')
  @ApiOperation({ summary: 'Get wallet balance' })
  async getBalance(@UserId() userId: string) {
    const balance = await this.paymentsService.getBalance(userId);
    return { balance, currency: 'KES' };
  }

  @Post('deposit')
  @ApiOperation({ summary: 'Deposit to wallet via M-Pesa' })
  async deposit(
    @UserId() userId: string,
    @Body() body: { amount: number; phoneNumber: string },
  ) {
    return this.paymentsService.depositToWallet(userId, body.amount, body.phoneNumber);
  }

  @Get('transactions')
  @ApiOperation({ summary: 'Get wallet transactions' })
  async getTransactions(
    @UserId() userId: string,
    @Query('limit') limit?: number,
    @Query('cursor') cursor?: string,
  ) {
    return this.paymentsService.getUserTransactions(userId, limit, cursor);
  }
}

// =====================================================
// ORDERS CONTROLLER
// =====================================================
@ApiTags('orders')
@Controller('orders')
@UseGuards(JwtAuthGuard)
@ApiBearerAuth()
export class OrdersController {
  constructor(private readonly paymentsService: PaymentsService) {}

  @Post()
  @ApiOperation({ summary: 'Create a new order' })
  async createOrder(@UserId() userId: string, @Body() dto: CreateOrderDto) {
    return this.paymentsService.createOrder(userId, dto);
  }

  @Post(':orderId/pay')
  @HttpCode(HttpStatus.OK)
  @ApiOperation({ summary: 'Pay for an order' })
  async payOrder(@UserId() userId: string, @Param('orderId') orderId: string, @Body() body: Omit<PayOrderDto, 'orderId'>) {
    return this.paymentsService.payOrder(userId, { orderId, ...body });
  }

  @Get()
  @ApiOperation({ summary: 'Get my orders' })
  async getMyOrders(
    @UserId() userId: string,
    @Query('status') status?: string,
    @Query('limit') limit?: number,
    @Query('cursor') cursor?: string,
  ) {
    return this.paymentsService.getUserOrders(userId, status, limit, cursor);
  }

  @Get(':orderId')
  @ApiOperation({ summary: 'Get order details' })
  async getOrder(@UserId() userId: string, @Param('orderId') orderId: string) {
    return this.paymentsService.getOrder(orderId, userId);
  }

  @Get(':orderId/status')
  @ApiOperation({ summary: 'Get order payment status' })
  async getOrderStatus(@Param('orderId') orderId: string) {
    const order = await this.paymentsService.getOrder(orderId);
    return {
      status: order.status,
      paymentStatus: order.paymentStatus,
    };
  }
}

// =====================================================
// BUSINESS ORDERS CONTROLLER
// =====================================================
@ApiTags('business-orders')
@Controller('businesses/:businessId/orders')
@UseGuards(JwtAuthGuard)
@ApiBearerAuth()
export class BusinessOrdersController {
  constructor(private readonly paymentsService: PaymentsService) {}

  @Get()
  @ApiOperation({ summary: 'Get business orders' })
  async getOrders(
    @Param('businessId') businessId: string,
    @Query('status') status?: string,
    @Query('limit') limit?: number,
    @Query('cursor') cursor?: string,
  ) {
    return this.paymentsService.getBusinessOrders(businessId, status, limit, cursor);
  }

  @Put(':orderId/status')
  @ApiOperation({ summary: 'Update order status' })
  async updateStatus(
    @Param('businessId') businessId: string,
    @Param('orderId') orderId: string,
    @Body() body: { status: string; notes?: string },
  ) {
    return this.paymentsService.updateOrderStatus(orderId, businessId, body.status, body.notes);
  }
}

// =====================================================
// PAYMENTS CONTROLLER
// =====================================================
@ApiTags('payments')
@Controller('payments')
export class PaymentsController {
  constructor(
    private readonly paymentsService: PaymentsService,
    private readonly mpesaService: MpesaService,
  ) {}

  @Get('status/:checkoutRequestId')
  @UseGuards(JwtAuthGuard)
  @ApiBearerAuth()
  @ApiOperation({ summary: 'Check payment status' })
  async checkStatus(@Param('checkoutRequestId') checkoutRequestId: string) {
    return this.paymentsService.checkPaymentStatus(checkoutRequestId);
  }

  @Get('transaction/:reference')
  @UseGuards(JwtAuthGuard)
  @ApiBearerAuth()
  @ApiOperation({ summary: 'Get transaction by reference' })
  async getTransaction(@Param('reference') reference: string) {
    return this.paymentsService.getTransaction(reference);
  }

  // =====================================================
  // M-PESA CALLBACKS
  // =====================================================
  @Post('mpesa/callback')
  @Public()
  @HttpCode(HttpStatus.OK)
  @ApiOperation({ summary: 'M-Pesa STK Push callback' })
  async mpesaCallback(@Body() body: any) {
    const callback = body.Body?.stkCallback;
    if (callback) {
      // Process async to respond quickly
      this.mpesaService.processSTKCallback(callback).catch((error) => {
        console.error('Callback processing error:', error);
      });
    }
    return { ResultCode: 0, ResultDesc: 'Success' };
  }

  @Post('mpesa/b2c/result')
  @Public()
  @HttpCode(HttpStatus.OK)
  @ApiOperation({ summary: 'M-Pesa B2C result callback' })
  async mpesaB2CResult(@Body() body: any) {
    console.log('B2C Result:', body);
    return { ResultCode: 0, ResultDesc: 'Success' };
  }

  @Post('mpesa/b2c/timeout')
  @Public()
  @HttpCode(HttpStatus.OK)
  @ApiOperation({ summary: 'M-Pesa B2C timeout callback' })
  async mpesaB2CTimeout(@Body() body: any) {
    console.log('B2C Timeout:', body);
    return { ResultCode: 0, ResultDesc: 'Success' };
  }
}

// =====================================================
// DISCOUNTS CONTROLLER
// =====================================================
@ApiTags('discounts')
@Controller('discounts')
export class DiscountsController {
  constructor(private readonly paymentsService: PaymentsService) {}

  @Post('validate')
  @UseGuards(JwtAuthGuard)
  @ApiBearerAuth()
  @HttpCode(HttpStatus.OK)
  @ApiOperation({ summary: 'Validate a discount code' })
  async validateCode(
    @UserId() userId: string,
    @Body() body: { code: string; businessId: string; subtotal: number },
  ) {
    const result = await this.paymentsService.validateDiscountCode(
      body.code,
      userId,
      body.businessId,
      body.subtotal,
    );

    if (!result) {
      return { valid: false };
    }

    return { valid: true, ...result };
  }
}
