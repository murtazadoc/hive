import { Injectable, NotFoundException, BadRequestException } from '@nestjs/common';
import { PrismaService } from '../../prisma/prisma.service';
import slugify from 'slugify';
import { CreateCategoryDto, UpdateCategoryDto } from './dto/category.dto';

@Injectable()
export class CategoriesService {
  constructor(private prisma: PrismaService) {}

  // =====================================================
  // GET ALL CATEGORIES (Hierarchical)
  // =====================================================
  async getAllCategories() {
    const categories = await this.prisma.businessCategory.findMany({
      where: { isActive: true },
      orderBy: [{ level: 'asc' }, { sortOrder: 'asc' }, { name: 'asc' }],
    });

    // Build tree structure
    return this.buildCategoryTree(categories);
  }

  // =====================================================
  // GET ROOT CATEGORIES
  // =====================================================
  async getRootCategories() {
    return this.prisma.businessCategory.findMany({
      where: {
        parentId: null,
        isActive: true,
      },
      orderBy: [{ sortOrder: 'asc' }, { name: 'asc' }],
      include: {
        _count: {
          select: { businesses: true },
        },
      },
    });
  }

  // =====================================================
  // GET CATEGORY BY ID
  // =====================================================
  async getCategoryById(id: string) {
    const category = await this.prisma.businessCategory.findUnique({
      where: { id },
      include: {
        parent: true,
        children: {
          where: { isActive: true },
          orderBy: [{ sortOrder: 'asc' }, { name: 'asc' }],
        },
        _count: {
          select: { businesses: true },
        },
      },
    });

    if (!category) {
      throw new NotFoundException('Category not found');
    }

    return category;
  }

  // =====================================================
  // GET CATEGORY BY SLUG
  // =====================================================
  async getCategoryBySlug(slug: string) {
    const category = await this.prisma.businessCategory.findUnique({
      where: { slug },
      include: {
        parent: true,
        children: {
          where: { isActive: true },
          orderBy: [{ sortOrder: 'asc' }, { name: 'asc' }],
        },
        _count: {
          select: { businesses: true },
        },
      },
    });

    if (!category) {
      throw new NotFoundException('Category not found');
    }

    return category;
  }

  // =====================================================
  // GET SUBCATEGORIES
  // =====================================================
  async getSubcategories(parentId: string) {
    return this.prisma.businessCategory.findMany({
      where: {
        parentId,
        isActive: true,
      },
      orderBy: [{ sortOrder: 'asc' }, { name: 'asc' }],
      include: {
        _count: {
          select: { businesses: true },
        },
      },
    });
  }

  // =====================================================
  // CREATE CATEGORY (Admin)
  // =====================================================
  async createCategory(dto: CreateCategoryDto) {
    // Generate slug
    const slug = await this.generateUniqueSlug(dto.name);

    // Determine level based on parent
    let level = 0;
    if (dto.parentId) {
      const parent = await this.prisma.businessCategory.findUnique({
        where: { id: dto.parentId },
      });
      if (!parent) {
        throw new BadRequestException('Parent category not found');
      }
      level = parent.level + 1;
    }

    return this.prisma.businessCategory.create({
      data: {
        ...dto,
        slug,
        level,
      },
    });
  }

  // =====================================================
  // UPDATE CATEGORY (Admin)
  // =====================================================
  async updateCategory(id: string, dto: UpdateCategoryDto) {
    const category = await this.prisma.businessCategory.findUnique({
      where: { id },
    });

    if (!category) {
      throw new NotFoundException('Category not found');
    }

    // If name changed, update slug
    let newSlug: string | undefined;
    if (dto.name && dto.name !== category.name) {
      newSlug = await this.generateUniqueSlug(dto.name, id);
    }

    return this.prisma.businessCategory.update({
      where: { id },
      data: {
        ...dto,
        ...(newSlug && { slug: newSlug }),
      },
    });
  }

  // =====================================================
  // DELETE CATEGORY (Admin) - Soft delete
  // =====================================================
  async deleteCategory(id: string) {
    const category = await this.prisma.businessCategory.findUnique({
      where: { id },
      include: {
        _count: {
          select: { businesses: true, children: true },
        },
      },
    });

    if (!category) {
      throw new NotFoundException('Category not found');
    }

    if (category._count.businesses > 0) {
      throw new BadRequestException(
        'Cannot delete category with associated businesses',
      );
    }

    if (category._count.children > 0) {
      throw new BadRequestException(
        'Cannot delete category with subcategories',
      );
    }

    // Soft delete
    return this.prisma.businessCategory.update({
      where: { id },
      data: { isActive: false },
    });
  }

  // =====================================================
  // HELPERS
  // =====================================================
  private buildCategoryTree(categories: any[]): any[] {
    const categoryMap = new Map<string, any>();
    const roots: any[] = [];

    // First pass: create map
    categories.forEach((cat) => {
      categoryMap.set(cat.id, { ...cat, children: [] });
    });

    // Second pass: build tree
    categories.forEach((cat) => {
      const node = categoryMap.get(cat.id);
      if (cat.parentId) {
        const parent = categoryMap.get(cat.parentId);
        if (parent) {
          parent.children.push(node);
        }
      } else {
        roots.push(node);
      }
    });

    return roots;
  }

  private async generateUniqueSlug(name: string, excludeId?: string): Promise<string> {
    const baseSlug = slugify(name, { lower: true, strict: true });
    let slug = baseSlug;
    let counter = 0;

    while (true) {
      const existing = await this.prisma.businessCategory.findFirst({
        where: {
          slug,
          ...(excludeId && { id: { not: excludeId } }),
        },
      });

      if (!existing) {
        return slug;
      }

      counter++;
      slug = `${baseSlug}-${counter}`;
    }
  }
}
