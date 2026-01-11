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
import { BusinessService } from './business.service';
import {
  CreateBusinessDto,
  UpdateBusinessDto,
  CreateProfessionalProfileDto,
  InviteMemberDto,
  UpdateMemberDto,
  SubmitKycDto,
  AdminApprovalDto,
  BusinessQueryDto,
  BusinessResponseDto,
} from './dto/business.dto';
import { JwtAuthGuard } from '../auth/guards/jwt-auth.guard';
import { Public, UserId } from '../auth/decorators/public.decorator';

@ApiTags('businesses')
@Controller('businesses')
export class BusinessController {
  constructor(private readonly businessService: BusinessService) {}

  // =====================================================
  // PUBLIC ENDPOINTS
  // =====================================================
  @Get()
  @Public()
  @ApiOperation({ summary: 'List approved businesses (public)' })
  @ApiResponse({ status: 200, description: 'List of businesses' })
  async listBusinesses(@Query() query: BusinessQueryDto) {
    return this.businessService.listBusinesses(query);
  }

  @Get('slug/:slug')
  @Public()
  @ApiOperation({ summary: 'Get business by slug (public)' })
  @ApiParam({ name: 'slug', example: 'doe-hardware' })
  @ApiResponse({ status: 200, description: 'Business details' })
  async getBySlug(@Param('slug') slug: string) {
    return this.businessService.getBusinessBySlug(slug);
  }

  // =====================================================
  // AUTHENTICATED ENDPOINTS
  // =====================================================
  @Post()
  @UseGuards(JwtAuthGuard)
  @ApiBearerAuth()
  @ApiOperation({ summary: 'Create a new business' })
  @ApiResponse({ status: 201, description: 'Business created', type: BusinessResponseDto })
  async createBusiness(
    @UserId() userId: string,
    @Body() dto: CreateBusinessDto,
  ) {
    return this.businessService.createBusiness(userId, dto);
  }

  @Get(':id')
  @UseGuards(JwtAuthGuard)
  @ApiBearerAuth()
  @ApiOperation({ summary: 'Get business by ID' })
  @ApiParam({ name: 'id', description: 'Business UUID' })
  @ApiResponse({ status: 200, description: 'Business details' })
  async getById(
    @Param('id') businessId: string,
    @UserId() userId: string,
  ) {
    return this.businessService.getBusinessById(businessId, userId);
  }

  @Put(':id')
  @UseGuards(JwtAuthGuard)
  @ApiBearerAuth()
  @ApiOperation({ summary: 'Update business' })
  @ApiResponse({ status: 200, description: 'Business updated' })
  async updateBusiness(
    @Param('id') businessId: string,
    @UserId() userId: string,
    @Body() dto: UpdateBusinessDto,
  ) {
    return this.businessService.updateBusiness(businessId, userId, dto);
  }

  @Delete(':id')
  @UseGuards(JwtAuthGuard)
  @ApiBearerAuth()
  @HttpCode(HttpStatus.OK)
  @ApiOperation({ summary: 'Delete business (owner only)' })
  @ApiResponse({ status: 200, description: 'Business deleted' })
  async deleteBusiness(
    @Param('id') businessId: string,
    @UserId() userId: string,
  ) {
    return this.businessService.deleteBusiness(businessId, userId);
  }

  // =====================================================
  // PROFESSIONAL PROFILE
  // =====================================================
  @Put(':id/professional')
  @UseGuards(JwtAuthGuard)
  @ApiBearerAuth()
  @ApiOperation({ summary: 'Update professional profile' })
  @ApiResponse({ status: 200, description: 'Professional profile updated' })
  async updateProfessionalProfile(
    @Param('id') businessId: string,
    @UserId() userId: string,
    @Body() dto: CreateProfessionalProfileDto,
  ) {
    return this.businessService.updateProfessionalProfile(businessId, userId, dto);
  }

  // =====================================================
  // MEMBER MANAGEMENT
  // =====================================================
  @Get(':id/members')
  @UseGuards(JwtAuthGuard)
  @ApiBearerAuth()
  @ApiOperation({ summary: 'Get business members' })
  @ApiResponse({ status: 200, description: 'List of members' })
  async getMembers(
    @Param('id') businessId: string,
    @UserId() userId: string,
  ) {
    return this.businessService.getMembers(businessId, userId);
  }

  @Post(':id/members')
  @UseGuards(JwtAuthGuard)
  @ApiBearerAuth()
  @ApiOperation({ summary: 'Invite a member to business' })
  @ApiResponse({ status: 201, description: 'Member invited' })
  async inviteMember(
    @Param('id') businessId: string,
    @UserId() userId: string,
    @Body() dto: InviteMemberDto,
  ) {
    return this.businessService.inviteMember(businessId, userId, dto);
  }

  @Put(':id/members/:memberId')
  @UseGuards(JwtAuthGuard)
  @ApiBearerAuth()
  @ApiOperation({ summary: 'Update member role/permissions' })
  @ApiResponse({ status: 200, description: 'Member updated' })
  async updateMember(
    @Param('id') businessId: string,
    @Param('memberId') memberId: string,
    @UserId() userId: string,
    @Body() dto: UpdateMemberDto,
  ) {
    return this.businessService.updateMember(businessId, memberId, userId, dto);
  }

  @Delete(':id/members/:memberId')
  @UseGuards(JwtAuthGuard)
  @ApiBearerAuth()
  @HttpCode(HttpStatus.OK)
  @ApiOperation({ summary: 'Remove member from business' })
  @ApiResponse({ status: 200, description: 'Member removed' })
  async removeMember(
    @Param('id') businessId: string,
    @Param('memberId') memberId: string,
    @UserId() userId: string,
  ) {
    return this.businessService.removeMember(businessId, memberId, userId);
  }

  // =====================================================
  // KYC SUBMISSION
  // =====================================================
  @Post(':id/kyc')
  @UseGuards(JwtAuthGuard)
  @ApiBearerAuth()
  @ApiOperation({ summary: 'Submit KYC documents for verification' })
  @ApiResponse({ status: 200, description: 'KYC submitted' })
  async submitKyc(
    @Param('id') businessId: string,
    @UserId() userId: string,
    @Body() dto: SubmitKycDto,
  ) {
    return this.businessService.submitKyc(businessId, userId, dto);
  }

  // =====================================================
  // ADMIN APPROVAL (Requires admin middleware)
  // =====================================================
  @Post(':id/approve')
  @UseGuards(JwtAuthGuard)
  @ApiBearerAuth()
  @ApiOperation({ summary: 'Approve or reject business (admin only)' })
  @ApiResponse({ status: 200, description: 'Business processed' })
  async processApproval(
    @Param('id') businessId: string,
    @UserId() adminId: string,
    @Body() dto: AdminApprovalDto,
  ) {
    // TODO: Add admin role check
    return this.businessService.processApproval(businessId, adminId, dto);
  }
}
