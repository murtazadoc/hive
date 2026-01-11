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
  ForbiddenException,
} from '@nestjs/common';
import { ApiTags, ApiOperation, ApiBearerAuth } from '@nestjs/swagger';
import { PrismaService } from '../../prisma/prisma.service';
import { JwtAuthGuard } from '../auth/guards/jwt-auth.guard';
import { UserId } from '../auth/decorators/public.decorator';

// Admin Guard - only allows admin users
class AdminGuard {
  constructor(private prisma: PrismaService) {}

  async canActivate(userId: string): Promise<boolean> {
    const user = await this.prisma.user.findUnique({
      where: { id: userId },
      select: { role: true },
    });
    return user?.role === 'admin' || user?.role === 'super_admin';
  }
}

// =====================================================
// ADMIN DASHBOARD CONTROLLER
// =====================================================
@ApiTags('admin-dashboard')
@Controller('admin/dashboard')
@UseGuards(JwtAuthGuard)
@ApiBearerAuth()
export class AdminDashboardController {
  constructor(private prisma: PrismaService) {}

  @Get('stats')
  @ApiOperation({ summary: 'Get dashboard statistics' })
  async getStats() {
    const [users, businesses, products, pendingBusinesses] = await Promise.all([
      this.prisma.user.count(),
      this.prisma.businessProfile.count({ where: { status: 'approved' } }),
      this.prisma.product.count(),
      this.prisma.businessProfile.count({ where: { status: 'pending' } }),
    ]);

    // Get last month counts for comparison
    const lastMonth = new Date();
    lastMonth.setMonth(lastMonth.getMonth() - 1);

    const [lastMonthUsers, lastMonthBusinesses] = await Promise.all([
      this.prisma.user.count({ where: { createdAt: { lt: lastMonth } } }),
      this.prisma.businessProfile.count({ where: { createdAt: { lt: lastMonth } } }),
    ]);

    return {
      totalUsers: users,
      usersChange: lastMonthUsers > 0 ? ((users - lastMonthUsers) / lastMonthUsers * 100).toFixed(1) : 0,
      totalBusinesses: businesses,
      businessesChange: lastMonthBusinesses > 0 ? ((businesses - lastMonthBusinesses) / lastMonthBusinesses * 100).toFixed(1) : 0,
      totalProducts: products,
      pendingApprovals: pendingBusinesses,
    };
  }

  @Get('activity')
  @ApiOperation({ summary: 'Get recent activity' })
  async getRecentActivity() {
    const activities = await this.prisma.activityLog.findMany({
      take: 20,
      orderBy: { createdAt: 'desc' },
      include: {
        user: { select: { firstName: true, lastName: true } },
        business: { select: { businessName: true } },
      },
    });

    return activities.map((a) => ({
      id: a.id,
      action: a.action,
      user: `${a.user?.firstName || ''} ${a.user?.lastName || ''}`.trim(),
      business: a.business?.businessName,
      details: a.details,
      createdAt: a.createdAt,
    }));
  }
}

// =====================================================
// ADMIN USERS CONTROLLER
// =====================================================
@ApiTags('admin-users')
@Controller('admin/users')
@UseGuards(JwtAuthGuard)
@ApiBearerAuth()
export class AdminUsersController {
  constructor(private prisma: PrismaService) {}

  @Get()
  @ApiOperation({ summary: 'List all users' })
  async listUsers(
    @Query('search') search?: string,
    @Query('verified') verified?: string,
    @Query('banned') banned?: string,
    @Query('page') page: number = 1,
    @Query('limit') limit: number = 20,
  ) {
    const where: any = {};

    if (search) {
      where.OR = [
        { phoneNumber: { contains: search } },
        { email: { contains: search, mode: 'insensitive' } },
        { firstName: { contains: search, mode: 'insensitive' } },
        { lastName: { contains: search, mode: 'insensitive' } },
      ];
    }

    if (verified !== undefined) {
      where.isVerified = verified === 'true';
    }

    if (banned !== undefined) {
      where.isBanned = banned === 'true';
    }

    const [users, total] = await Promise.all([
      this.prisma.user.findMany({
        where,
        select: {
          id: true,
          phoneNumber: true,
          email: true,
          firstName: true,
          lastName: true,
          isVerified: true,
          isBanned: true,
          createdAt: true,
          _count: { select: { businessProfiles: true } },
        },
        orderBy: { createdAt: 'desc' },
        skip: (page - 1) * limit,
        take: limit,
      }),
      this.prisma.user.count({ where }),
    ]);

    return {
      data: users.map((u) => ({
        ...u,
        _count: { businesses: u._count.businessProfiles },
      })),
      pagination: {
        page,
        limit,
        total,
        totalPages: Math.ceil(total / limit),
      },
    };
  }

  @Get(':id')
  @ApiOperation({ summary: 'Get user by ID' })
  async getUserById(@Param('id') id: string) {
    const user = await this.prisma.user.findUnique({
      where: { id },
      include: {
        businessProfiles: {
          select: {
            id: true,
            businessName: true,
            status: true,
          },
        },
        _count: { select: { businessProfiles: true } },
      },
    });

    if (!user) {
      throw new ForbiddenException('User not found');
    }

    return {
      ...user,
      _count: { businesses: user._count.businessProfiles },
    };
  }

  @Post(':id/ban')
  @HttpCode(HttpStatus.OK)
  @ApiOperation({ summary: 'Ban a user' })
  async banUser(@Param('id') id: string, @Body() body: { reason: string }) {
    await this.prisma.user.update({
      where: { id },
      data: {
        isBanned: true,
        banReason: body.reason,
        bannedAt: new Date(),
      },
    });

    return { message: 'User banned' };
  }

  @Post(':id/unban')
  @HttpCode(HttpStatus.OK)
  @ApiOperation({ summary: 'Unban a user' })
  async unbanUser(@Param('id') id: string) {
    await this.prisma.user.update({
      where: { id },
      data: {
        isBanned: false,
        banReason: null,
        bannedAt: null,
      },
    });

    return { message: 'User unbanned' };
  }
}

// =====================================================
// ADMIN BUSINESSES CONTROLLER
// =====================================================
@ApiTags('admin-businesses')
@Controller('admin/businesses')
@UseGuards(JwtAuthGuard)
@ApiBearerAuth()
export class AdminBusinessesController {
  constructor(private prisma: PrismaService) {}

  @Get()
  @ApiOperation({ summary: 'List all businesses' })
  async listBusinesses(
    @Query('search') search?: string,
    @Query('status') status?: string,
    @Query('type') type?: string,
    @Query('categoryId') categoryId?: string,
    @Query('page') page: number = 1,
    @Query('limit') limit: number = 20,
  ) {
    const where: any = {};

    if (search) {
      where.OR = [
        { businessName: { contains: search, mode: 'insensitive' } },
        { slug: { contains: search, mode: 'insensitive' } },
        { phoneNumber: { contains: search } },
      ];
    }

    if (status) where.status = status;
    if (type) where.businessType = type;
    if (categoryId) where.categoryId = categoryId;

    const [businesses, total, pendingCount] = await Promise.all([
      this.prisma.businessProfile.findMany({
        where,
        include: {
          owner: { select: { firstName: true, lastName: true, phoneNumber: true } },
          category: { select: { name: true } },
          _count: { select: { products: true, members: true } },
        },
        orderBy: { createdAt: 'desc' },
        skip: (page - 1) * limit,
        take: limit,
      }),
      this.prisma.businessProfile.count({ where }),
      this.prisma.businessProfile.count({ where: { status: 'pending' } }),
    ]);

    return {
      data: businesses,
      pendingCount,
      pagination: {
        page,
        limit,
        total,
        totalPages: Math.ceil(total / limit),
      },
    };
  }

  @Get('pending/count')
  @ApiOperation({ summary: 'Get pending businesses count' })
  async getPendingCount() {
    const count = await this.prisma.businessProfile.count({
      where: { status: 'pending' },
    });
    return { count };
  }

  @Get(':id')
  @ApiOperation({ summary: 'Get business by ID' })
  async getBusinessById(@Param('id') id: string) {
    return this.prisma.businessProfile.findUnique({
      where: { id },
      include: {
        owner: { select: { id: true, firstName: true, lastName: true, phoneNumber: true, email: true } },
        category: true,
        _count: { select: { products: true, members: true } },
      },
    });
  }

  @Post(':id/approve')
  @HttpCode(HttpStatus.OK)
  @ApiOperation({ summary: 'Approve a business' })
  async approveBusiness(
    @Param('id') id: string,
    @UserId() adminId: string,
    @Body() body: { notes?: string },
  ) {
    await this.prisma.businessProfile.update({
      where: { id },
      data: {
        status: 'approved',
        approvedAt: new Date(),
        approvedBy: adminId,
        approvalNotes: body.notes,
      },
    });

    return { message: 'Business approved' };
  }

  @Post(':id/reject')
  @HttpCode(HttpStatus.OK)
  @ApiOperation({ summary: 'Reject a business' })
  async rejectBusiness(
    @Param('id') id: string,
    @UserId() adminId: string,
    @Body() body: { reason: string },
  ) {
    await this.prisma.businessProfile.update({
      where: { id },
      data: {
        status: 'rejected',
        rejectionReason: body.reason,
        rejectedAt: new Date(),
        rejectedBy: adminId,
      },
    });

    return { message: 'Business rejected' };
  }

  @Post(':id/suspend')
  @HttpCode(HttpStatus.OK)
  @ApiOperation({ summary: 'Suspend a business' })
  async suspendBusiness(
    @Param('id') id: string,
    @Body() body: { reason: string },
  ) {
    await this.prisma.businessProfile.update({
      where: { id },
      data: {
        status: 'suspended',
        suspensionReason: body.reason,
        suspendedAt: new Date(),
      },
    });

    return { message: 'Business suspended' };
  }

  @Post(':id/unsuspend')
  @HttpCode(HttpStatus.OK)
  @ApiOperation({ summary: 'Unsuspend a business' })
  async unsuspendBusiness(@Param('id') id: string) {
    await this.prisma.businessProfile.update({
      where: { id },
      data: {
        status: 'approved',
        suspensionReason: null,
        suspendedAt: null,
      },
    });

    return { message: 'Business unsuspended' };
  }
}

// =====================================================
// ADMIN PRODUCTS CONTROLLER
// =====================================================
@ApiTags('admin-products')
@Controller('admin/products')
@UseGuards(JwtAuthGuard)
@ApiBearerAuth()
export class AdminProductsController {
  constructor(private prisma: PrismaService) {}

  @Get()
  @ApiOperation({ summary: 'List all products' })
  async listProducts(
    @Query('search') search?: string,
    @Query('status') status?: string,
    @Query('businessId') businessId?: string,
    @Query('featured') featured?: string,
    @Query('page') page: number = 1,
    @Query('limit') limit: number = 20,
  ) {
    const where: any = {};

    if (search) {
      where.OR = [
        { name: { contains: search, mode: 'insensitive' } },
        { sku: { contains: search, mode: 'insensitive' } },
      ];
    }

    if (status) where.status = status;
    if (businessId) where.businessId = businessId;
    if (featured !== undefined) where.isFeatured = featured === 'true';

    const [products, total] = await Promise.all([
      this.prisma.product.findMany({
        where,
        include: {
          business: { select: { id: true, businessName: true, slug: true } },
          images: { take: 1, orderBy: { sortOrder: 'asc' } },
        },
        orderBy: { createdAt: 'desc' },
        skip: (page - 1) * limit,
        take: limit,
      }),
      this.prisma.product.count({ where }),
    ]);

    return {
      data: products,
      pagination: {
        page,
        limit,
        total,
        totalPages: Math.ceil(total / limit),
      },
    };
  }

  @Post(':id/feature')
  @HttpCode(HttpStatus.OK)
  @ApiOperation({ summary: 'Feature a product' })
  async featureProduct(@Param('id') id: string) {
    await this.prisma.product.update({
      where: { id },
      data: { isFeatured: true },
    });
    return { message: 'Product featured' };
  }

  @Post(':id/unfeature')
  @HttpCode(HttpStatus.OK)
  @ApiOperation({ summary: 'Unfeature a product' })
  async unfeatureProduct(@Param('id') id: string) {
    await this.prisma.product.update({
      where: { id },
      data: { isFeatured: false },
    });
    return { message: 'Product unfeatured' };
  }

  @Delete(':id')
  @HttpCode(HttpStatus.OK)
  @ApiOperation({ summary: 'Delete a product' })
  async deleteProduct(@Param('id') id: string) {
    await this.prisma.product.delete({ where: { id } });
    return { message: 'Product deleted' };
  }
}

// =====================================================
// ADMIN CATEGORIES CONTROLLER
// =====================================================
@ApiTags('admin-categories')
@Controller('admin/categories')
@UseGuards(JwtAuthGuard)
@ApiBearerAuth()
export class AdminCategoriesController {
  constructor(private prisma: PrismaService) {}

  @Get()
  @ApiOperation({ summary: 'List all categories' })
  async listCategories() {
    return this.prisma.businessCategory.findMany({
      include: {
        _count: { select: { businesses: true, children: true } },
      },
      orderBy: [{ level: 'asc' }, { sortOrder: 'asc' }],
    });
  }

  @Post()
  @ApiOperation({ summary: 'Create category' })
  async createCategory(@Body() body: any) {
    const slug = body.name.toLowerCase().replace(/\s+/g, '-');
    
    let level = 0;
    if (body.parentId) {
      const parent = await this.prisma.businessCategory.findUnique({
        where: { id: body.parentId },
      });
      if (parent) level = parent.level + 1;
    }

    return this.prisma.businessCategory.create({
      data: {
        name: body.name,
        slug,
        description: body.description,
        icon: body.icon,
        parentId: body.parentId,
        level,
      },
    });
  }

  @Put(':id')
  @ApiOperation({ summary: 'Update category' })
  async updateCategory(@Param('id') id: string, @Body() body: any) {
    return this.prisma.businessCategory.update({
      where: { id },
      data: {
        name: body.name,
        description: body.description,
        icon: body.icon,
        isActive: body.isActive,
      },
    });
  }

  @Delete(':id')
  @HttpCode(HttpStatus.OK)
  @ApiOperation({ summary: 'Delete category' })
  async deleteCategory(@Param('id') id: string) {
    await this.prisma.businessCategory.update({
      where: { id },
      data: { isActive: false },
    });
    return { message: 'Category deleted' };
  }

  @Post('reorder')
  @HttpCode(HttpStatus.OK)
  @ApiOperation({ summary: 'Reorder categories' })
  async reorderCategories(@Body() body: { items: { id: string; sortOrder: number }[] }) {
    await Promise.all(
      body.items.map((item) =>
        this.prisma.businessCategory.update({
          where: { id: item.id },
          data: { sortOrder: item.sortOrder },
        }),
      ),
    );
    return { message: 'Categories reordered' };
  }
}
