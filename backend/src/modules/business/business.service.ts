import {
  Injectable,
  NotFoundException,
  ForbiddenException,
  ConflictException,
  BadRequestException,
} from '@nestjs/common';
import { PrismaService } from '../../prisma/prisma.service';
import slugify from 'slugify';
import {
  CreateBusinessDto,
  UpdateBusinessDto,
  CreateProfessionalProfileDto,
  UpdateProfessionalProfileDto,
  InviteMemberDto,
  UpdateMemberDto,
  SubmitKycDto,
  AdminApprovalDto,
  BusinessQueryDto,
} from './dto/business.dto';
import { BusinessRole, BusinessStatus } from '@prisma/client';

@Injectable()
export class BusinessService {
  constructor(private prisma: PrismaService) {}

  // =====================================================
  // CREATE BUSINESS
  // =====================================================
  async createBusiness(userId: string, dto: CreateBusinessDto) {
    // Generate unique slug
    const baseSlug = slugify(dto.businessName, { lower: true, strict: true });
    const slug = await this.generateUniqueSlug(baseSlug);

    // Validate category if provided
    if (dto.categoryId) {
      const category = await this.prisma.businessCategory.findUnique({
        where: { id: dto.categoryId },
      });
      if (!category) {
        throw new BadRequestException('Invalid category');
      }
    }

    // Create business
    const business = await this.prisma.businessProfile.create({
      data: {
        ...dto,
        slug,
        ownerId: userId,
        status: 'draft',
      },
      include: {
        category: true,
        owner: {
          select: {
            id: true,
            firstName: true,
            lastName: true,
          },
        },
      },
    });

    // The trigger will auto-create owner membership
    // But let's ensure it exists
    await this.prisma.businessMember.upsert({
      where: {
        businessId_userId: {
          businessId: business.id,
          userId,
        },
      },
      create: {
        businessId: business.id,
        userId,
        role: 'owner',
        acceptedAt: new Date(),
      },
      update: {},
    });

    // Create professional profile if type is professional or both
    if (dto.businessType === 'professional' || dto.businessType === 'both') {
      await this.prisma.professionalProfile.create({
        data: {
          businessId: business.id,
        },
      });
    }

    // Log activity
    await this.logActivity(userId, business.id, 'business_created', {
      businessName: dto.businessName,
    });

    return business;
  }

  // =====================================================
  // GET BUSINESS
  // =====================================================
  async getBusinessById(businessId: string, userId?: string) {
    const business = await this.prisma.businessProfile.findUnique({
      where: { id: businessId },
      include: {
        category: true,
        owner: {
          select: {
            id: true,
            firstName: true,
            lastName: true,
            avatarUrl: true,
          },
        },
        professionalProfile: true,
        members: {
          where: { isActive: true },
          select: {
            id: true,
            role: true,
            user: {
              select: {
                id: true,
                firstName: true,
                lastName: true,
                avatarUrl: true,
              },
            },
          },
        },
      },
    });

    if (!business) {
      throw new NotFoundException('Business not found');
    }

    // Check if user has access (for non-approved businesses)
    if (business.status !== 'approved' && userId) {
      const hasAccess = await this.checkAccess(businessId, userId, 'viewer');
      if (!hasAccess) {
        throw new ForbiddenException('Business not available');
      }
    }

    return business;
  }

  async getBusinessBySlug(slug: string) {
    const business = await this.prisma.businessProfile.findUnique({
      where: { slug },
      include: {
        category: true,
        owner: {
          select: {
            id: true,
            firstName: true,
            lastName: true,
            avatarUrl: true,
          },
        },
        professionalProfile: true,
      },
    });

    if (!business) {
      throw new NotFoundException('Business not found');
    }

    // Only return approved businesses via public slug
    if (business.status !== 'approved') {
      throw new NotFoundException('Business not available');
    }

    return business;
  }

  // =====================================================
  // UPDATE BUSINESS
  // =====================================================
  async updateBusiness(businessId: string, userId: string, dto: UpdateBusinessDto) {
    // Check permission
    const hasAccess = await this.checkAccess(businessId, userId, 'editor');
    if (!hasAccess) {
      throw new ForbiddenException('You do not have permission to edit this business');
    }

    // If name changed, update slug
    let newSlug: string | undefined;
    if (dto.businessName) {
      const business = await this.prisma.businessProfile.findUnique({
        where: { id: businessId },
      });
      if (business && business.businessName !== dto.businessName) {
        const baseSlug = slugify(dto.businessName, { lower: true, strict: true });
        newSlug = await this.generateUniqueSlug(baseSlug, businessId);
      }
    }

    const updated = await this.prisma.businessProfile.update({
      where: { id: businessId },
      data: {
        ...dto,
        ...(newSlug && { slug: newSlug }),
      },
      include: {
        category: true,
      },
    });

    await this.logActivity(userId, businessId, 'business_updated', dto);

    return updated;
  }

  // =====================================================
  // DELETE BUSINESS
  // =====================================================
  async deleteBusiness(businessId: string, userId: string) {
    // Only owner can delete
    const hasAccess = await this.checkAccess(businessId, userId, 'owner');
    if (!hasAccess) {
      throw new ForbiddenException('Only the owner can delete this business');
    }

    await this.prisma.businessProfile.delete({
      where: { id: businessId },
    });

    await this.logActivity(userId, null, 'business_deleted', { businessId });

    return { message: 'Business deleted successfully' };
  }

  // =====================================================
  // LIST BUSINESSES (Public)
  // =====================================================
  async listBusinesses(query: BusinessQueryDto) {
    const { type, categoryId, area, verified, page = 1, limit = 20 } = query;

    const where: any = {
      status: 'approved',
    };

    if (type) where.businessType = type;
    if (categoryId) where.categoryId = categoryId;
    if (area) where.area = { contains: area, mode: 'insensitive' };
    if (verified !== undefined) where.isVerified = verified;

    const [businesses, total] = await Promise.all([
      this.prisma.businessProfile.findMany({
        where,
        include: {
          category: {
            select: { id: true, name: true, slug: true },
          },
        },
        orderBy: [
          { isVerified: 'desc' },
          { ratingAverage: 'desc' },
          { createdAt: 'desc' },
        ],
        skip: (page - 1) * limit,
        take: limit,
      }),
      this.prisma.businessProfile.count({ where }),
    ]);

    return {
      data: businesses,
      pagination: {
        page,
        limit,
        total,
        totalPages: Math.ceil(total / limit),
      },
    };
  }

  // =====================================================
  // PROFESSIONAL PROFILE
  // =====================================================
  async updateProfessionalProfile(
    businessId: string,
    userId: string,
    dto: CreateProfessionalProfileDto | UpdateProfessionalProfileDto,
  ) {
    const hasAccess = await this.checkAccess(businessId, userId, 'editor');
    if (!hasAccess) {
      throw new ForbiddenException('No permission');
    }

    const profile = await this.prisma.professionalProfile.upsert({
      where: { businessId },
      create: {
        businessId,
        ...dto,
      },
      update: dto,
    });

    return profile;
  }

  // =====================================================
  // MEMBER MANAGEMENT (RBAC)
  // =====================================================
  async inviteMember(businessId: string, userId: string, dto: InviteMemberDto) {
    // Check if inviter has admin access
    const hasAccess = await this.checkAccess(businessId, userId, 'admin');
    if (!hasAccess) {
      throw new ForbiddenException('Only admins can invite members');
    }

    // Can't invite as owner
    if (dto.role === 'owner') {
      throw new BadRequestException('Cannot invite as owner');
    }

    // Find user by phone
    const invitee = await this.prisma.user.findUnique({
      where: { phoneNumber: dto.phoneNumber },
    });

    if (!invitee) {
      throw new NotFoundException('User not found. They must register first.');
    }

    // Check if already a member
    const existing = await this.prisma.businessMember.findUnique({
      where: {
        businessId_userId: {
          businessId,
          userId: invitee.id,
        },
      },
    });

    if (existing) {
      throw new ConflictException('User is already a member');
    }

    const member = await this.prisma.businessMember.create({
      data: {
        businessId,
        userId: invitee.id,
        role: dto.role,
        permissions: dto.permissions || {},
        invitedById: userId,
      },
      include: {
        user: {
          select: {
            id: true,
            firstName: true,
            lastName: true,
            phoneNumber: true,
          },
        },
      },
    });

    await this.logActivity(userId, businessId, 'member_invited', {
      inviteeId: invitee.id,
      role: dto.role,
    });

    return member;
  }

  async updateMember(
    businessId: string,
    memberId: string,
    userId: string,
    dto: UpdateMemberDto,
  ) {
    const hasAccess = await this.checkAccess(businessId, userId, 'admin');
    if (!hasAccess) {
      throw new ForbiddenException('Only admins can update members');
    }

    const member = await this.prisma.businessMember.findFirst({
      where: { id: memberId, businessId },
    });

    if (!member) {
      throw new NotFoundException('Member not found');
    }

    // Can't change owner role
    if (member.role === 'owner') {
      throw new BadRequestException('Cannot modify owner');
    }

    // Can't promote to owner
    if (dto.role === 'owner') {
      throw new BadRequestException('Use transfer ownership instead');
    }

    return this.prisma.businessMember.update({
      where: { id: memberId },
      data: dto,
    });
  }

  async removeMember(businessId: string, memberId: string, userId: string) {
    const hasAccess = await this.checkAccess(businessId, userId, 'admin');
    if (!hasAccess) {
      throw new ForbiddenException('Only admins can remove members');
    }

    const member = await this.prisma.businessMember.findFirst({
      where: { id: memberId, businessId },
    });

    if (!member) {
      throw new NotFoundException('Member not found');
    }

    if (member.role === 'owner') {
      throw new BadRequestException('Cannot remove owner');
    }

    await this.prisma.businessMember.delete({
      where: { id: memberId },
    });

    return { message: 'Member removed' };
  }

  async getMembers(businessId: string, userId: string) {
    const hasAccess = await this.checkAccess(businessId, userId, 'viewer');
    if (!hasAccess) {
      throw new ForbiddenException('No access');
    }

    return this.prisma.businessMember.findMany({
      where: { businessId },
      include: {
        user: {
          select: {
            id: true,
            firstName: true,
            lastName: true,
            avatarUrl: true,
            phoneNumber: true,
          },
        },
      },
      orderBy: [
        { role: 'asc' },
        { createdAt: 'asc' },
      ],
    });
  }

  // =====================================================
  // KYC & VERIFICATION
  // =====================================================
  async submitKyc(businessId: string, userId: string, dto: SubmitKycDto) {
    const hasAccess = await this.checkAccess(businessId, userId, 'admin');
    if (!hasAccess) {
      throw new ForbiddenException('No permission');
    }

    const business = await this.prisma.businessProfile.update({
      where: { id: businessId },
      data: {
        kycSubmitted: true,
        kycDocumentUrls: dto.documentUrls,
        status: 'pending',
      },
    });

    await this.logActivity(userId, businessId, 'kyc_submitted', {
      documentCount: dto.documentUrls.length,
    });

    return {
      message: 'KYC documents submitted. Pending admin review.',
      status: business.status,
    };
  }

  // Admin approval
  async processApproval(
    businessId: string,
    adminId: string,
    dto: AdminApprovalDto,
  ) {
    const business = await this.prisma.businessProfile.findUnique({
      where: { id: businessId },
    });

    if (!business) {
      throw new NotFoundException('Business not found');
    }

    if (business.status !== 'pending') {
      throw new BadRequestException('Business is not pending approval');
    }

    const updateData: any = {
      verificationNotes: dto.notes,
      approvedById: adminId,
      approvedAt: new Date(),
    };

    if (dto.decision === 'approved') {
      updateData.status = 'approved';
      updateData.isVerified = true;
      updateData.verifiedAt = new Date();
    } else {
      updateData.status = 'rejected';
      updateData.rejectionReason = dto.rejectionReason;
    }

    const updated = await this.prisma.businessProfile.update({
      where: { id: businessId },
      data: updateData,
    });

    await this.logActivity(adminId, businessId, 'business_review', {
      decision: dto.decision,
      reason: dto.rejectionReason,
    });

    return updated;
  }

  // =====================================================
  // HELPERS
  // =====================================================
  async checkAccess(
    businessId: string,
    userId: string,
    requiredRole: 'owner' | 'admin' | 'editor' | 'viewer',
  ): Promise<boolean> {
    const roleHierarchy: Record<BusinessRole, number> = {
      owner: 4,
      admin: 3,
      editor: 2,
      viewer: 1,
    };

    const member = await this.prisma.businessMember.findUnique({
      where: {
        businessId_userId: {
          businessId,
          userId,
        },
      },
    });

    if (!member || !member.isActive) {
      return false;
    }

    return roleHierarchy[member.role] >= roleHierarchy[requiredRole];
  }

  private async generateUniqueSlug(baseSlug: string, excludeId?: string): Promise<string> {
    let slug = baseSlug;
    let counter = 0;

    while (true) {
      const existing = await this.prisma.businessProfile.findFirst({
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

  private async logActivity(
    userId: string,
    businessId: string | null,
    action: string,
    details: Record<string, any> = {},
  ) {
    await this.prisma.activityLog.create({
      data: {
        userId,
        businessId,
        action,
        details,
      },
    });
  }
}
