import { ApiProperty, ApiPropertyOptional, PartialType } from '@nestjs/swagger';
import {
  IsString,
  IsEmail,
  IsOptional,
  IsUrl,
  IsPhoneNumber,
  IsEnum,
  IsUUID,
  IsNumber,
  IsBoolean,
  IsArray,
  MinLength,
  MaxLength,
  ValidateNested,
} from 'class-validator';
import { Type } from 'class-transformer';
import { BusinessType, BusinessStatus, BusinessRole } from '@prisma/client';

// =====================================================
// CREATE BUSINESS
// =====================================================
export class CreateBusinessDto {
  @ApiProperty({ example: 'Doe Hardware' })
  @IsString()
  @MinLength(2)
  @MaxLength(200)
  businessName: string;

  @ApiPropertyOptional({ example: 'Quality hardware for all your needs' })
  @IsOptional()
  @IsString()
  @MaxLength(300)
  tagline?: string;

  @ApiPropertyOptional({ example: 'We provide quality hardware products...' })
  @IsOptional()
  @IsString()
  description?: string;

  @ApiProperty({ enum: BusinessType, example: 'retail' })
  @IsEnum(BusinessType)
  businessType: BusinessType;

  @ApiPropertyOptional()
  @IsOptional()
  @IsUUID()
  categoryId?: string;

  @ApiProperty({ example: '+254712345678' })
  @IsPhoneNumber()
  whatsappNumber: string;

  @ApiPropertyOptional({ example: '+254712345678' })
  @IsOptional()
  @IsPhoneNumber()
  phoneNumber?: string;

  @ApiPropertyOptional({ example: 'contact@doehardware.com' })
  @IsOptional()
  @IsEmail()
  email?: string;

  @ApiPropertyOptional({ example: 'https://doehardware.com' })
  @IsOptional()
  @IsUrl()
  website?: string;

  @ApiPropertyOptional({ example: 'Shop 12, Saifee Park' })
  @IsOptional()
  @IsString()
  address?: string;

  @ApiPropertyOptional({ example: 'Nairobi' })
  @IsOptional()
  @IsString()
  city?: string;

  @ApiPropertyOptional({ example: 'Saifee Park' })
  @IsOptional()
  @IsString()
  area?: string;

  @ApiPropertyOptional({ example: -1.2921 })
  @IsOptional()
  @IsNumber()
  latitude?: number;

  @ApiPropertyOptional({ example: 36.8219 })
  @IsOptional()
  @IsNumber()
  longitude?: number;
}

export class UpdateBusinessDto extends PartialType(CreateBusinessDto) {}

// =====================================================
// PROFESSIONAL PROFILE
// =====================================================
export class CreateProfessionalProfileDto {
  @ApiPropertyOptional({ example: 'Certified Electrician' })
  @IsOptional()
  @IsString()
  title?: string;

  @ApiPropertyOptional({ example: 10 })
  @IsOptional()
  @IsNumber()
  yearsOfExperience?: number;

  @ApiPropertyOptional({ example: ['Electrical License', 'Safety Cert'] })
  @IsOptional()
  @IsArray()
  certifications?: string[];

  @ApiPropertyOptional({ example: ['Saifee Park', 'Parklands'] })
  @IsOptional()
  @IsArray()
  serviceAreas?: string[];

  @ApiPropertyOptional()
  @IsOptional()
  availability?: Record<string, any>;

  @ApiPropertyOptional({ example: 1500 })
  @IsOptional()
  @IsNumber()
  hourlyRate?: number;

  @ApiPropertyOptional({ example: 'KES' })
  @IsOptional()
  @IsString()
  currency?: string;
}

export class UpdateProfessionalProfileDto extends PartialType(CreateProfessionalProfileDto) {}

// =====================================================
// BUSINESS MEMBERS / RBAC
// =====================================================
export class InviteMemberDto {
  @ApiProperty({ example: '+254712345678' })
  @IsPhoneNumber()
  phoneNumber: string;

  @ApiProperty({ enum: BusinessRole, example: 'editor' })
  @IsEnum(BusinessRole)
  role: BusinessRole;

  @ApiPropertyOptional()
  @IsOptional()
  permissions?: Record<string, boolean>;
}

export class UpdateMemberDto {
  @ApiPropertyOptional({ enum: BusinessRole })
  @IsOptional()
  @IsEnum(BusinessRole)
  role?: BusinessRole;

  @ApiPropertyOptional()
  @IsOptional()
  permissions?: Record<string, boolean>;

  @ApiPropertyOptional()
  @IsOptional()
  @IsBoolean()
  isActive?: boolean;
}

// =====================================================
// KYC SUBMISSION
// =====================================================
export class SubmitKycDto {
  @ApiProperty({ example: ['https://storage.com/id.jpg', 'https://storage.com/cert.jpg'] })
  @IsArray()
  @IsUrl({}, { each: true })
  documentUrls: string[];
}

// =====================================================
// ADMIN APPROVAL
// =====================================================
export class AdminApprovalDto {
  @ApiProperty({ enum: ['approved', 'rejected'] })
  @IsEnum(['approved', 'rejected'])
  decision: 'approved' | 'rejected';

  @ApiPropertyOptional({ example: 'Documents verified successfully' })
  @IsOptional()
  @IsString()
  notes?: string;

  @ApiPropertyOptional({ example: 'Blurry document' })
  @IsOptional()
  @IsString()
  rejectionReason?: string;
}

// =====================================================
// RESPONSE DTOs
// =====================================================
export class BusinessResponseDto {
  @ApiProperty()
  id: string;

  @ApiProperty()
  businessName: string;

  @ApiProperty()
  slug: string;

  @ApiPropertyOptional()
  tagline?: string;

  @ApiPropertyOptional()
  description?: string;

  @ApiProperty({ enum: BusinessType })
  businessType: BusinessType;

  @ApiProperty({ enum: BusinessStatus })
  status: BusinessStatus;

  @ApiProperty()
  isVerified: boolean;

  @ApiProperty()
  whatsappNumber: string;

  @ApiPropertyOptional()
  logoUrl?: string;

  @ApiPropertyOptional()
  coverImageUrl?: string;

  @ApiProperty()
  createdAt: Date;
}

// =====================================================
// QUERY DTOs
// =====================================================
export class BusinessQueryDto {
  @ApiPropertyOptional({ example: 'retail' })
  @IsOptional()
  @IsEnum(BusinessType)
  type?: BusinessType;

  @ApiPropertyOptional()
  @IsOptional()
  @IsUUID()
  categoryId?: string;

  @ApiPropertyOptional({ example: 'Saifee Park' })
  @IsOptional()
  @IsString()
  area?: string;

  @ApiPropertyOptional({ example: true })
  @IsOptional()
  @IsBoolean()
  verified?: boolean;

  @ApiPropertyOptional({ default: 1 })
  @IsOptional()
  @IsNumber()
  page?: number;

  @ApiPropertyOptional({ default: 20 })
  @IsOptional()
  @IsNumber()
  limit?: number;
}
