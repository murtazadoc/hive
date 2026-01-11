import { Module } from '@nestjs/common';
import {
  WalletController,
  OrdersController,
  BusinessOrdersController,
  PaymentsController,
  DiscountsController,
} from './payments.controller';
import { PaymentsService } from './payments.service';
import { MpesaService } from './mpesa.service';

@Module({
  controllers: [
    WalletController,
    OrdersController,
    BusinessOrdersController,
    PaymentsController,
    DiscountsController,
  ],
  providers: [PaymentsService, MpesaService],
  exports: [PaymentsService, MpesaService],
})
export class PaymentsModule {}
