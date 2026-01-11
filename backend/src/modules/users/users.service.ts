import {
  Injectable,
  NotFoundException,
  ConflictException,
} from '@nestjs/common';
import { PrismaService } from '../../prisma/prisma.service';
import { UpdateUserDto } from './dto/user.dto';

@Injectable()
export class UsersService {
  constructor(private prisma: PrismaService) {}

  // =====================================================
  // GET USER PROFILE
  // =====================================================
  async getProfile(userId: string) {
    const user = await this.prisma.user.findUnique({
      where: { id: userId },
      select: {
        id: true,
        phoneNumber: true,
        email: true,
        firstName: true,
        lastName: true,
        avatarUrl: true,
        phoneVerified: true,
        emailVerified: true,
        createdAt: true,
        _count: {
          select: {
            ownedBusinesses: true,
            businessMembers: true,
          },
        },
      },
    });

    if (!user) {
      throw new NotFoundException('User not found');
    }

    return {
      ...user,
      businessCount: user._count.ownedBusinesses,
      membershipCount: user._count.businessMembers,
      _count: undefined,
    };
  }

  // =====================================================
  // UPDATE USER PROFILE
  // =====================================================
  async updateProfile(userId: string, dto: UpdateUserDto) {
    // Check email uniqueness if being updated
    if (dto.email) {
      const existing = await this.prisma.user.findFirst({
        where: {
          email: dto.email,
          id: { not: userId },
        },
      });

      if (existing) {
        throw new ConflictException('Email already in use');
      }
    }

    const user = await this.prisma.user.update({
      where: { id: userId },
      data: {
        ...dto,
        // If email changed, mark as unverified
        ...(dto.email && { emailVerified: false }),
      },
      select: {
        id: true,
        phoneNumber: true,
        email: true,
        firstName: true,
        lastName: true,
        avatarUrl: true,
        phoneVerified: true,
        emailVerified: true,
        updatedAt: true,
      },
    });

    return user;
  }

  // =====================================================
  // GET USER'S BUSINESSES
  // =====================================================
  async getUserBusinesses(userId: string) {
    // Get businesses user owns
    const ownedBusinesses = await this.prisma.businessProfile.findMany({
      where: { ownerId: userId },
      select: {
        id: true,
        businessName: true,
        slug: true,
        logoUrl: true,
        businessType: true,
        status: true,
        isVerified: true,
        createdAt: true,
        category: {
          select: {
            id: true,
            name: true,
            slug: true,
          },
        },
      },
      orderBy: { createdAt: 'desc' },
    });

    // Get businesses user is a member of (but doesn't own)
    const memberBusinesses = await this.prisma.businessMember.findMany({
      where: {
        userId,
        isActive: true,
        business: {
          ownerId: { not: userId },
        },
      },
      select: {
        role: true,
        business: {
          select: {
            id: true,
            businessName: true,
            slug: true,
            logoUrl: true,
            businessType: true,
            status: true,
            isVerified: true,
            createdAt: true,
            category: {
              select: {
                id: true,
                name: true,
                slug: true,
              },
            },
          },
        },
      },
    });

    return {
      owned: ownedBusinesses.map((b) => ({ ...b, role: 'owner' })),
      memberships: memberBusinesses.map((m) => ({
        ...m.business,
        role: m.role,
      })),
    };
  }

  // =====================================================
  // CONTEXT SWITCHER - Get available business contexts
  // =====================================================
  async getAvailableContexts(userId: string) {
    // Personal context
    const user = await this.prisma.user.findUnique({
      where: { id: userId },
      select: {
        id: true,
        firstName: true,
        lastName: true,
        avatarUrl: true,
      },
    });

    // Business contexts (owned + member)
    const memberships = await this.prisma.businessMember.findMany({
      where: {
        userId,
        isActive: true,
      },
      select: {
        role: true,
        permissions: true,
        business: {
          select: {
            id: true,
            businessName: true,
            slug: true,
            logoUrl: true,
            status: true,
            isVerified: true,
          },
        },
      },
      orderBy: {
        business: {
          businessName: 'asc',
        },
      },
    });

    return {
      personal: {
        type: 'personal',
        id: user?.id,
        name: `${user?.firstName} ${user?.lastName}`,
        avatar: user?.avatarUrl,
      },
      businesses: memberships.map((m) => ({
        type: 'business',
        id: m.business.id,
        name: m.business.businessName,
        slug: m.business.slug,
        avatar: m.business.logoUrl,
        role: m.role,
        permissions: m.permissions,
        status: m.business.status,
        isVerified: m.business.isVerified,
      })),
    };
  }

  // =====================================================
  // DELETE ACCOUNT
  // =====================================================
  async deleteAccount(userId: string) {
    // Check if user owns any businesses with other members
    const ownedBusinesses = await this.prisma.businessProfile.findMany({
      where: { ownerId: userId },
      include: {
        _count: {
          select: { members: true },
        },
      },
    });

    const businessesWithMembers = ownedBusinesses.filter(
      (b) => b._count.members > 1,
    );

    if (businessesWithMembers.length > 0) {
      throw new ConflictException(
        'Please transfer ownership or remove members from your businesses before deleting your account',
      );
    }

    // Soft delete user (keeps data but marks as inactive)
    await this.prisma.user.update({
      where: { id: userId },
      data: {
        isActive: false,
        phoneNumber: `deleted_${Date.now()}_${userId.slice(0, 8)}`,
        email: null,
      },
    });

    // Revoke all tokens
    await this.prisma.refreshToken.updateMany({
      where: { userId },
      data: { revokedAt: new Date() },
    });

    return { message: 'Account deleted successfully' };
  }

  // =====================================================
  // ACTIVITY LOG
  // =====================================================
  async getActivityLog(userId: string, limit = 50) {
    return this.prisma.activityLog.findMany({
      where: { userId },
      orderBy: { createdAt: 'desc' },
      take: limit,
      select: {
        id: true,
        action: true,
        entityType: true,
        details: true,
        createdAt: true,
      },
    });
  }
}
