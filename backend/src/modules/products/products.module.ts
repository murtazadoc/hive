import { Module } from '@nestjs/common';
import {
  ProductsController,
  PublicProductsController,
  InventoryController,
} from './products.controller';
import { ProductsService } from './products.service';
import { SyncService } from './sync.service';
import { SyncController } from './sync.controller';

@Module({
  controllers: [
    ProductsController,
    PublicProductsController,
    InventoryController,
    SyncController,
  ],
  providers: [ProductsService, SyncService],
  exports: [ProductsService, SyncService],
})
export class ProductsModule {}
