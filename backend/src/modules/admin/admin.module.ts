import { Module } from '@nestjs/common';
import {
  AdminDashboardController,
  AdminUsersController,
  AdminBusinessesController,
  AdminProductsController,
  AdminCategoriesController,
} from './admin.controller';

@Module({
  controllers: [
    AdminDashboardController,
    AdminUsersController,
    AdminBusinessesController,
    AdminProductsController,
    AdminCategoriesController,
  ],
})
export class AdminModule {}
