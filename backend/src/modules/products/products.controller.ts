import {
  Controller,
  Get,
  Post,
  Put,
  Delete,
  Body,
  Param,
  Query,
  UseGuards,
  HttpCode,
  HttpStatus,
} from '@nestjs/common';
import {
  ApiTags,
  ApiOperation,
  ApiResponse,
  ApiBearerAuth,
  ApiParam,
} from '@nestjs/swagger';
import { ProductsService } from './products.service';
import {
  CreateProductDto,
  UpdateProductDto,
  CreateProductCategoryDto,
  UpdateProductCategoryDto,
  UpdateInventoryDto,
  ProductQueryDto,
  ProductResponseDto,
  ProductListResponseDto,
} from './dto/product.dto';
import { JwtAuthGuard } from '../auth/guards/jwt-auth.guard';
import { Public, UserId } from '../auth/decorators/public.decorator';

@ApiTags('products')
@Controller('businesses/:businessId/products')
export class ProductsController {
  constructor(private readonly productsService: ProductsService) {}

  // =====================================================
  // PRODUCT CATEGORIES
  // =====================================================
  @Get('categories')
  @Public()
  @ApiOperation({ summary: 'Get product categories for a business' })
  async getCategories(@Param('businessId') businessId: string) {
    return this.productsService.getCategories(businessId);
  }

  @Post('categories')
  @UseGuards(JwtAuthGuard)
  @ApiBearerAuth()
  @ApiOperation({ summary: 'Create product category' })
  async createCategory(
    @Param('businessId') businessId: string,
    @UserId() userId: string,
    @Body() dto: CreateProductCategoryDto,
  ) {
    return this.productsService.createCategory(businessId, userId, dto);
  }

  @Put('categories/:categoryId')
  @UseGuards(JwtAuthGuard)
  @ApiBearerAuth()
  @ApiOperation({ summary: 'Update product category' })
  async updateCategory(
    @Param('businessId') businessId: string,
    @Param('categoryId') categoryId: string,
    @UserId() userId: string,
    @Body() dto: UpdateProductCategoryDto,
  ) {
    return this.productsService.updateCategory(businessId, categoryId, userId, dto);
  }

  @Delete('categories/:categoryId')
  @UseGuards(JwtAuthGuard)
  @ApiBearerAuth()
  @HttpCode(HttpStatus.OK)
  @ApiOperation({ summary: 'Delete product category' })
  async deleteCategory(
    @Param('businessId') businessId: string,
    @Param('categoryId') categoryId: string,
    @UserId() userId: string,
  ) {
    return this.productsService.deleteCategory(businessId, categoryId, userId);
  }

  // =====================================================
  // PRODUCTS
  // =====================================================
  @Get()
  @Public()
  @ApiOperation({ summary: 'List products for a business' })
  @ApiResponse({ status: 200, type: ProductListResponseDto })
  async getProducts(
    @Param('businessId') businessId: string,
    @Query() query: ProductQueryDto,
  ) {
    return this.productsService.getProducts(businessId, query);
  }

  @Post()
  @UseGuards(JwtAuthGuard)
  @ApiBearerAuth()
  @ApiOperation({ summary: 'Create a new product' })
  @ApiResponse({ status: 201, type: ProductResponseDto })
  async createProduct(
    @Param('businessId') businessId: string,
    @UserId() userId: string,
    @Body() dto: CreateProductDto,
  ) {
    return this.productsService.createProduct(businessId, userId, dto);
  }

  @Get(':productId')
  @Public()
  @ApiOperation({ summary: 'Get product by ID' })
  @ApiResponse({ status: 200, type: ProductResponseDto })
  async getProduct(
    @Param('businessId') businessId: string,
    @Param('productId') productId: string,
  ) {
    return this.productsService.getProductById(productId, businessId);
  }

  @Put(':productId')
  @UseGuards(JwtAuthGuard)
  @ApiBearerAuth()
  @ApiOperation({ summary: 'Update product' })
  async updateProduct(
    @Param('businessId') businessId: string,
    @Param('productId') productId: string,
    @UserId() userId: string,
    @Body() dto: UpdateProductDto,
  ) {
    return this.productsService.updateProduct(businessId, productId, userId, dto);
  }

  @Delete(':productId')
  @UseGuards(JwtAuthGuard)
  @ApiBearerAuth()
  @HttpCode(HttpStatus.OK)
  @ApiOperation({ summary: 'Delete product' })
  async deleteProduct(
    @Param('businessId') businessId: string,
    @Param('productId') productId: string,
    @UserId() userId: string,
  ) {
    return this.productsService.deleteProduct(businessId, productId, userId);
  }

  // =====================================================
  // INVENTORY
  // =====================================================
  @Put(':productId/inventory')
  @UseGuards(JwtAuthGuard)
  @ApiBearerAuth()
  @ApiOperation({ summary: 'Update product inventory' })
  async updateInventory(
    @Param('businessId') businessId: string,
    @Param('productId') productId: string,
    @UserId() userId: string,
    @Body() dto: UpdateInventoryDto,
  ) {
    return this.productsService.updateInventory(businessId, productId, userId, dto);
  }

  @Get(':productId/inventory/logs')
  @UseGuards(JwtAuthGuard)
  @ApiBearerAuth()
  @ApiOperation({ summary: 'Get inventory change logs' })
  async getInventoryLogs(
    @Param('businessId') businessId: string,
    @Param('productId') productId: string,
    @UserId() userId: string,
  ) {
    return this.productsService.getInventoryLogs(businessId, productId, userId);
  }

  // =====================================================
  // IMAGES
  // =====================================================
  @Post(':productId/images')
  @UseGuards(JwtAuthGuard)
  @ApiBearerAuth()
  @ApiOperation({ summary: 'Add image to product' })
  async addImage(
    @Param('businessId') businessId: string,
    @Param('productId') productId: string,
    @UserId() userId: string,
    @Body() dto: { url: string; altText?: string; isPrimary?: boolean },
  ) {
    return this.productsService.addProductImage(businessId, productId, userId, dto);
  }

  @Delete(':productId/images/:imageId')
  @UseGuards(JwtAuthGuard)
  @ApiBearerAuth()
  @HttpCode(HttpStatus.OK)
  @ApiOperation({ summary: 'Delete product image' })
  async deleteImage(
    @Param('businessId') businessId: string,
    @Param('productId') productId: string,
    @Param('imageId') imageId: string,
    @UserId() userId: string,
  ) {
    return this.productsService.deleteProductImage(
      businessId,
      productId,
      imageId,
      userId,
    );
  }

  @Put(':productId/images/reorder')
  @UseGuards(JwtAuthGuard)
  @ApiBearerAuth()
  @ApiOperation({ summary: 'Reorder product images' })
  async reorderImages(
    @Param('businessId') businessId: string,
    @Param('productId') productId: string,
    @UserId() userId: string,
    @Body() dto: { imageIds: string[] },
  ) {
    return this.productsService.reorderProductImages(
      businessId,
      productId,
      userId,
      dto.imageIds,
    );
  }
}

// =====================================================
// PUBLIC PRODUCT ROUTES (by slug)
// =====================================================
@ApiTags('products-public')
@Controller('products')
export class PublicProductsController {
  constructor(private readonly productsService: ProductsService) {}

  @Get(':businessSlug/:productSlug')
  @Public()
  @ApiOperation({ summary: 'Get product by business and product slug' })
  async getProductBySlug(
    @Param('businessSlug') businessSlug: string,
    @Param('productSlug') productSlug: string,
  ) {
    return this.productsService.getProductBySlug(businessSlug, productSlug);
  }
}

// =====================================================
// INVENTORY DASHBOARD
// =====================================================
@ApiTags('inventory')
@Controller('businesses/:businessId/inventory')
@UseGuards(JwtAuthGuard)
@ApiBearerAuth()
export class InventoryController {
  constructor(private readonly productsService: ProductsService) {}

  @Get('low-stock')
  @ApiOperation({ summary: 'Get products with low stock' })
  async getLowStock(
    @Param('businessId') businessId: string,
    @UserId() userId: string,
  ) {
    return this.productsService.getLowStockProducts(businessId, userId);
  }
}
