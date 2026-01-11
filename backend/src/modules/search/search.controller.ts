import {
  Controller,
  Get,
  Post,
  Body,
  Query,
  Param,
  UseGuards,
  HttpCode,
  HttpStatus,
} from '@nestjs/common';
import { ApiTags, ApiOperation, ApiBearerAuth, ApiQuery } from '@nestjs/swagger';
import { SearchService, SearchFilters } from './search.service';
import { EmbeddingService } from './embedding.service';
import { JwtAuthGuard } from '../auth/guards/jwt-auth.guard';
import { Public, UserId } from '../auth/decorators/public.decorator';

// =====================================================
// SEARCH CONTROLLER
// =====================================================
@ApiTags('search')
@Controller('search')
export class SearchController {
  constructor(
    private readonly searchService: SearchService,
    private readonly embeddingService: EmbeddingService,
  ) {}

  // =====================================================
  // UNIFIED SEARCH
  // =====================================================
  @Get()
  @Public()
  @ApiOperation({ summary: 'Search products and businesses' })
  @ApiQuery({ name: 'q', description: 'Search query', required: true })
  @ApiQuery({ name: 'city', required: false })
  @ApiQuery({ name: 'county', required: false })
  @ApiQuery({ name: 'categoryId', required: false })
  @ApiQuery({ name: 'priceMin', type: Number, required: false })
  @ApiQuery({ name: 'priceMax', type: Number, required: false })
  @ApiQuery({ name: 'inStock', type: Boolean, required: false })
  @ApiQuery({ name: 'businessType', required: false })
  @ApiQuery({ name: 'page', type: Number, required: false })
  @ApiQuery({ name: 'limit', type: Number, required: false })
  @ApiQuery({ name: 'mode', enum: ['hybrid', 'semantic', 'keyword'], required: false })
  async search(
    @Query('q') query: string,
    @Query('city') city?: string,
    @Query('county') county?: string,
    @Query('categoryId') categoryId?: string,
    @Query('priceMin') priceMin?: number,
    @Query('priceMax') priceMax?: number,
    @Query('inStock') inStock?: boolean,
    @Query('businessType') businessType?: 'retail' | 'professional' | 'both',
    @Query('page') page?: number,
    @Query('limit') limit?: number,
    @Query('mode') searchMode?: 'hybrid' | 'semantic' | 'keyword',
  ) {
    const filters: SearchFilters = {
      city,
      county,
      categoryId,
      priceMin: priceMin ? Number(priceMin) : undefined,
      priceMax: priceMax ? Number(priceMax) : undefined,
      inStock: inStock === true || inStock === 'true' as any,
      businessType,
      page: page ? Number(page) : 1,
      limit: limit ? Number(limit) : 20,
      searchMode: searchMode || 'hybrid',
    };

    return this.searchService.search(query, filters);
  }

  // =====================================================
  // SEARCH PRODUCTS ONLY
  // =====================================================
  @Get('products')
  @Public()
  @ApiOperation({ summary: 'Search products' })
  async searchProducts(
    @Query('q') query: string,
    @Query('city') city?: string,
    @Query('categoryId') categoryId?: string,
    @Query('priceMin') priceMin?: number,
    @Query('priceMax') priceMax?: number,
    @Query('inStock') inStock?: boolean,
    @Query('page') page?: number,
    @Query('limit') limit?: number,
    @Query('mode') searchMode?: 'hybrid' | 'semantic' | 'keyword',
  ) {
    const filters: SearchFilters = {
      city,
      categoryId,
      priceMin: priceMin ? Number(priceMin) : undefined,
      priceMax: priceMax ? Number(priceMax) : undefined,
      inStock: inStock === true || inStock === 'true' as any,
      page: page ? Number(page) : 1,
      limit: limit ? Number(limit) : 20,
      searchMode: searchMode || 'hybrid',
    };

    return this.searchService.searchProducts(query, filters);
  }

  // =====================================================
  // SEARCH BUSINESSES ONLY
  // =====================================================
  @Get('businesses')
  @Public()
  @ApiOperation({ summary: 'Search businesses' })
  async searchBusinesses(
    @Query('q') query: string,
    @Query('city') city?: string,
    @Query('county') county?: string,
    @Query('businessType') businessType?: 'retail' | 'professional' | 'both',
    @Query('isVerified') isVerified?: boolean,
    @Query('page') page?: number,
    @Query('limit') limit?: number,
    @Query('mode') searchMode?: 'hybrid' | 'semantic' | 'keyword',
  ) {
    const filters: SearchFilters = {
      city,
      county,
      businessType,
      isVerified: isVerified === true || isVerified === 'true' as any,
      page: page ? Number(page) : 1,
      limit: limit ? Number(limit) : 20,
      searchMode: searchMode || 'hybrid',
    };

    return this.searchService.searchBusinesses(query, filters);
  }

  // =====================================================
  // AUTOCOMPLETE / SUGGESTIONS
  // =====================================================
  @Get('suggestions')
  @Public()
  @ApiOperation({ summary: 'Get search suggestions' })
  async getSuggestions(
    @Query('q') query: string,
    @Query('limit') limit?: number,
  ) {
    return this.searchService.getSuggestions(query, limit ? Number(limit) : 5);
  }

  // =====================================================
  // TRENDING SEARCHES
  // =====================================================
  @Get('trending')
  @Public()
  @ApiOperation({ summary: 'Get trending searches' })
  async getTrending(
    @Query('city') city?: string,
    @Query('limit') limit?: number,
  ) {
    return this.searchService.getTrendingSearches(city, limit ? Number(limit) : 10);
  }

  // =====================================================
  // SIMILAR PRODUCTS
  // =====================================================
  @Get('products/:productId/similar')
  @Public()
  @ApiOperation({ summary: 'Get similar products' })
  async getSimilarProducts(
    @Param('productId') productId: string,
    @Query('limit') limit?: number,
  ) {
    return this.searchService.getSimilarProducts(productId, limit ? Number(limit) : 10);
  }
}

// =====================================================
// EMBEDDING MANAGEMENT CONTROLLER (Admin)
// =====================================================
@ApiTags('embeddings')
@Controller('admin/embeddings')
@UseGuards(JwtAuthGuard)
@ApiBearerAuth()
export class EmbeddingController {
  constructor(private readonly embeddingService: EmbeddingService) {}

  // =====================================================
  // EMBED SINGLE PRODUCT
  // =====================================================
  @Post('products/:productId')
  @HttpCode(HttpStatus.OK)
  @ApiOperation({ summary: 'Generate embedding for a product' })
  async embedProduct(@Param('productId') productId: string) {
    return this.embeddingService.embedProduct(productId);
  }

  // =====================================================
  // EMBED SINGLE BUSINESS
  // =====================================================
  @Post('businesses/:businessId')
  @HttpCode(HttpStatus.OK)
  @ApiOperation({ summary: 'Generate embedding for a business' })
  async embedBusiness(@Param('businessId') businessId: string) {
    return this.embeddingService.embedBusiness(businessId);
  }

  // =====================================================
  // BATCH EMBED ALL PRODUCTS
  // =====================================================
  @Post('products/batch')
  @HttpCode(HttpStatus.OK)
  @ApiOperation({ summary: 'Generate embeddings for all products' })
  async embedAllProducts(@Query('batchSize') batchSize?: number) {
    return this.embeddingService.embedAllProducts(batchSize ? Number(batchSize) : 100);
  }

  // =====================================================
  // BATCH EMBED ALL BUSINESSES
  // =====================================================
  @Post('businesses/batch')
  @HttpCode(HttpStatus.OK)
  @ApiOperation({ summary: 'Generate embeddings for all businesses' })
  async embedAllBusinesses(@Query('batchSize') batchSize?: number) {
    return this.embeddingService.embedAllBusinesses(batchSize ? Number(batchSize) : 50);
  }

  // =====================================================
  // GET EMBEDDING STATS
  // =====================================================
  @Get('stats')
  @ApiOperation({ summary: 'Get embedding statistics' })
  async getStats() {
    // Would query the embeddings table for stats
    return {
      totalEmbeddings: 0,
      productEmbeddings: 0,
      businessEmbeddings: 0,
      categoryEmbeddings: 0,
      lastUpdated: new Date(),
    };
  }
}
