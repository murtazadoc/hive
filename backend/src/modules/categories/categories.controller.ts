import {
  Controller,
  Get,
  Post,
  Put,
  Delete,
  Body,
  Param,
  UseGuards,
  HttpCode,
  HttpStatus,
} from '@nestjs/common';
import {
  ApiTags,
  ApiOperation,
  ApiResponse,
  ApiBearerAuth,
} from '@nestjs/swagger';
import { CategoriesService } from './categories.service';
import { CreateCategoryDto, UpdateCategoryDto, CategoryResponseDto } from './dto/category.dto';
import { JwtAuthGuard } from '../auth/guards/jwt-auth.guard';
import { Public } from '../auth/decorators/public.decorator';

@ApiTags('categories')
@Controller('categories')
export class CategoriesController {
  constructor(private readonly categoriesService: CategoriesService) {}

  // =====================================================
  // PUBLIC ENDPOINTS
  // =====================================================
  @Get()
  @Public()
  @ApiOperation({ summary: 'Get all categories (hierarchical tree)' })
  @ApiResponse({ status: 200, description: 'Category tree', type: [CategoryResponseDto] })
  async getAllCategories() {
    return this.categoriesService.getAllCategories();
  }

  @Get('roots')
  @Public()
  @ApiOperation({ summary: 'Get root categories only' })
  @ApiResponse({ status: 200, description: 'Root categories' })
  async getRootCategories() {
    return this.categoriesService.getRootCategories();
  }

  @Get(':id')
  @Public()
  @ApiOperation({ summary: 'Get category by ID' })
  @ApiResponse({ status: 200, description: 'Category details' })
  async getCategoryById(@Param('id') id: string) {
    return this.categoriesService.getCategoryById(id);
  }

  @Get('slug/:slug')
  @Public()
  @ApiOperation({ summary: 'Get category by slug' })
  @ApiResponse({ status: 200, description: 'Category details' })
  async getCategoryBySlug(@Param('slug') slug: string) {
    return this.categoriesService.getCategoryBySlug(slug);
  }

  @Get(':id/subcategories')
  @Public()
  @ApiOperation({ summary: 'Get subcategories of a category' })
  @ApiResponse({ status: 200, description: 'Subcategories' })
  async getSubcategories(@Param('id') parentId: string) {
    return this.categoriesService.getSubcategories(parentId);
  }

  // =====================================================
  // ADMIN ENDPOINTS
  // =====================================================
  @Post()
  @UseGuards(JwtAuthGuard)
  @ApiBearerAuth()
  @ApiOperation({ summary: 'Create category (admin only)' })
  @ApiResponse({ status: 201, description: 'Category created' })
  async createCategory(@Body() dto: CreateCategoryDto) {
    // TODO: Add admin role check
    return this.categoriesService.createCategory(dto);
  }

  @Put(':id')
  @UseGuards(JwtAuthGuard)
  @ApiBearerAuth()
  @ApiOperation({ summary: 'Update category (admin only)' })
  @ApiResponse({ status: 200, description: 'Category updated' })
  async updateCategory(
    @Param('id') id: string,
    @Body() dto: UpdateCategoryDto,
  ) {
    // TODO: Add admin role check
    return this.categoriesService.updateCategory(id, dto);
  }

  @Delete(':id')
  @UseGuards(JwtAuthGuard)
  @ApiBearerAuth()
  @HttpCode(HttpStatus.OK)
  @ApiOperation({ summary: 'Delete category (admin only)' })
  @ApiResponse({ status: 200, description: 'Category deleted' })
  async deleteCategory(@Param('id') id: string) {
    // TODO: Add admin role check
    return this.categoriesService.deleteCategory(id);
  }
}
