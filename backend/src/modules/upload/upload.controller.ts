import {
  Controller,
  Post,
  Delete,
  Body,
  Param,
  Query,
  UseGuards,
  UseInterceptors,
  UploadedFile,
  UploadedFiles,
  HttpCode,
  HttpStatus,
  BadRequestException,
} from '@nestjs/common';
import {
  ApiTags,
  ApiOperation,
  ApiConsumes,
  ApiBearerAuth,
  ApiBody,
} from '@nestjs/swagger';
import { FileInterceptor, FilesInterceptor } from '@nestjs/platform-express';
import { CloudinaryService, UploadResult } from './cloudinary.service';
import { JwtAuthGuard } from '../auth/guards/jwt-auth.guard';
import { UserId } from '../auth/decorators/public.decorator';
import { PrismaService } from '../../prisma/prisma.service';

// =====================================================
// UPLOAD CONTROLLER
// =====================================================
@ApiTags('upload')
@Controller('upload')
@UseGuards(JwtAuthGuard)
@ApiBearerAuth()
export class UploadController {
  constructor(
    private readonly cloudinaryService: CloudinaryService,
    private readonly prisma: PrismaService,
  ) {}

  // =====================================================
  // UPLOAD SINGLE IMAGE
  // =====================================================
  @Post('image')
  @ApiOperation({ summary: 'Upload a single image' })
  @ApiConsumes('multipart/form-data')
  @ApiBody({
    schema: {
      type: 'object',
      properties: {
        file: { type: 'string', format: 'binary' },
        folder: { type: 'string', example: 'products' },
      },
    },
  })
  @UseInterceptors(FileInterceptor('file'))
  async uploadImage(
    @UploadedFile() file: Express.Multer.File,
    @Query('folder') folder?: string,
  ): Promise<UploadResult> {
    if (!file) {
      throw new BadRequestException('No file provided');
    }

    return this.cloudinaryService.uploadImage(file, {
      folder: folder ? `hive/${folder}` : 'hive/uploads',
    });
  }

  // =====================================================
  // UPLOAD MULTIPLE IMAGES
  // =====================================================
  @Post('images')
  @ApiOperation({ summary: 'Upload multiple images (max 10)' })
  @ApiConsumes('multipart/form-data')
  @ApiBody({
    schema: {
      type: 'object',
      properties: {
        files: {
          type: 'array',
          items: { type: 'string', format: 'binary' },
        },
        folder: { type: 'string' },
      },
    },
  })
  @UseInterceptors(FilesInterceptor('files', 10))
  async uploadImages(
    @UploadedFiles() files: Express.Multer.File[],
    @Query('folder') folder?: string,
  ): Promise<UploadResult[]> {
    if (!files || files.length === 0) {
      throw new BadRequestException('No files provided');
    }

    return this.cloudinaryService.uploadImages(files, {
      folder: folder ? `hive/${folder}` : 'hive/uploads',
    });
  }

  // =====================================================
  // UPLOAD FROM URL
  // =====================================================
  @Post('from-url')
  @ApiOperation({ summary: 'Upload image from URL' })
  async uploadFromUrl(
    @Body() body: { url: string; folder?: string },
  ): Promise<UploadResult> {
    if (!body.url) {
      throw new BadRequestException('URL is required');
    }

    return this.cloudinaryService.uploadFromUrl(body.url, {
      folder: body.folder ? `hive/${body.folder}` : 'hive/uploads',
    });
  }

  // =====================================================
  // UPLOAD BASE64
  // =====================================================
  @Post('base64')
  @ApiOperation({ summary: 'Upload image from base64 string' })
  async uploadBase64(
    @Body() body: { data: string; folder?: string },
  ): Promise<UploadResult> {
    if (!body.data) {
      throw new BadRequestException('Base64 data is required');
    }

    return this.cloudinaryService.uploadBase64(body.data, {
      folder: body.folder ? `hive/${body.folder}` : 'hive/uploads',
    });
  }

  // =====================================================
  // DELETE IMAGE
  // =====================================================
  @Delete(':publicId')
  @HttpCode(HttpStatus.OK)
  @ApiOperation({ summary: 'Delete an image by public ID' })
  async deleteImage(
    @Param('publicId') publicId: string,
  ): Promise<{ success: boolean }> {
    return this.cloudinaryService.deleteImage(publicId);
  }
}

// =====================================================
// PRODUCT IMAGE UPLOAD CONTROLLER
// =====================================================
@ApiTags('product-images')
@Controller('businesses/:businessId/products/:productId/upload')
@UseGuards(JwtAuthGuard)
@ApiBearerAuth()
export class ProductImageUploadController {
  constructor(
    private readonly cloudinaryService: CloudinaryService,
    private readonly prisma: PrismaService,
  ) {}

  // =====================================================
  // UPLOAD PRODUCT IMAGE
  // =====================================================
  @Post()
  @ApiOperation({ summary: 'Upload and attach image to product' })
  @ApiConsumes('multipart/form-data')
  @UseInterceptors(FileInterceptor('file'))
  async uploadProductImage(
    @Param('businessId') businessId: string,
    @Param('productId') productId: string,
    @UserId() userId: string,
    @UploadedFile() file: Express.Multer.File,
    @Body() body: { isPrimary?: string; altText?: string },
  ) {
    // Verify access
    await this.verifyAccess(businessId, userId);

    // Verify product exists
    const product = await this.prisma.product.findFirst({
      where: { id: productId, businessId },
      include: { images: true },
    });

    if (!product) {
      throw new BadRequestException('Product not found');
    }

    // Upload to Cloudinary
    const uploadResult = await this.cloudinaryService.uploadImage(file, {
      folder: `hive/businesses/${businessId}/products`,
      tags: [businessId, productId],
    });

    // Determine if primary
    const isPrimary = body.isPrimary === 'true' || product.images.length === 0;

    // If setting as primary, unset others
    if (isPrimary && product.images.length > 0) {
      await this.prisma.productImage.updateMany({
        where: { productId, isPrimary: true },
        data: { isPrimary: false },
      });
    }

    // Save to database
    const productImage = await this.prisma.productImage.create({
      data: {
        productId,
        url: uploadResult.secureUrl,
        thumbnailUrl: uploadResult.thumbnailUrl,
        altText: body.altText,
        isPrimary,
        width: uploadResult.width,
        height: uploadResult.height,
        fileSize: uploadResult.bytes,
        mimeType: `image/${uploadResult.format}`,
        sortOrder: product.images.length,
        // Store public ID for future deletion
        localPath: uploadResult.publicId,
        uploadStatus: 'completed',
      },
    });

    return productImage;
  }

  // =====================================================
  // UPLOAD MULTIPLE PRODUCT IMAGES
  // =====================================================
  @Post('batch')
  @ApiOperation({ summary: 'Upload multiple images to product' })
  @ApiConsumes('multipart/form-data')
  @UseInterceptors(FilesInterceptor('files', 10))
  async uploadProductImages(
    @Param('businessId') businessId: string,
    @Param('productId') productId: string,
    @UserId() userId: string,
    @UploadedFiles() files: Express.Multer.File[],
  ) {
    await this.verifyAccess(businessId, userId);

    const product = await this.prisma.product.findFirst({
      where: { id: productId, businessId },
      include: { images: true },
    });

    if (!product) {
      throw new BadRequestException('Product not found');
    }

    // Upload all files
    const uploadResults = await this.cloudinaryService.uploadImages(files, {
      folder: `hive/businesses/${businessId}/products`,
      tags: [businessId, productId],
    });

    // Create database records
    const images = await Promise.all(
      uploadResults.map((result, index) =>
        this.prisma.productImage.create({
          data: {
            productId,
            url: result.secureUrl,
            thumbnailUrl: result.thumbnailUrl,
            isPrimary: product.images.length === 0 && index === 0,
            width: result.width,
            height: result.height,
            fileSize: result.bytes,
            mimeType: `image/${result.format}`,
            sortOrder: product.images.length + index,
            localPath: result.publicId,
            uploadStatus: 'completed',
          },
        }),
      ),
    );

    return images;
  }

  // =====================================================
  // DELETE PRODUCT IMAGE
  // =====================================================
  @Delete(':imageId')
  @HttpCode(HttpStatus.OK)
  @ApiOperation({ summary: 'Delete product image' })
  async deleteProductImage(
    @Param('businessId') businessId: string,
    @Param('productId') productId: string,
    @Param('imageId') imageId: string,
    @UserId() userId: string,
  ) {
    await this.verifyAccess(businessId, userId);

    const image = await this.prisma.productImage.findFirst({
      where: {
        id: imageId,
        product: { id: productId, businessId },
      },
    });

    if (!image) {
      throw new BadRequestException('Image not found');
    }

    // Delete from Cloudinary if we have the public ID
    if (image.localPath) {
      await this.cloudinaryService.deleteImage(image.localPath);
    }

    // Delete from database
    await this.prisma.productImage.delete({ where: { id: imageId } });

    // If was primary, set first remaining as primary
    if (image.isPrimary) {
      const firstImage = await this.prisma.productImage.findFirst({
        where: { productId },
        orderBy: { sortOrder: 'asc' },
      });

      if (firstImage) {
        await this.prisma.productImage.update({
          where: { id: firstImage.id },
          data: { isPrimary: true },
        });
      }
    }

    return { success: true };
  }

  // =====================================================
  // SET PRIMARY IMAGE
  // =====================================================
  @Post(':imageId/primary')
  @HttpCode(HttpStatus.OK)
  @ApiOperation({ summary: 'Set image as primary' })
  async setPrimaryImage(
    @Param('businessId') businessId: string,
    @Param('productId') productId: string,
    @Param('imageId') imageId: string,
    @UserId() userId: string,
  ) {
    await this.verifyAccess(businessId, userId);

    const image = await this.prisma.productImage.findFirst({
      where: {
        id: imageId,
        product: { id: productId, businessId },
      },
    });

    if (!image) {
      throw new BadRequestException('Image not found');
    }

    // Unset current primary
    await this.prisma.productImage.updateMany({
      where: { productId, isPrimary: true },
      data: { isPrimary: false },
    });

    // Set new primary
    await this.prisma.productImage.update({
      where: { id: imageId },
      data: { isPrimary: true },
    });

    return { success: true };
  }

  // =====================================================
  // HELPER
  // =====================================================
  private async verifyAccess(businessId: string, userId: string) {
    const member = await this.prisma.businessMember.findUnique({
      where: {
        businessId_userId: { businessId, userId },
      },
    });

    if (!member || !member.isActive) {
      throw new BadRequestException('No access to this business');
    }

    if (!['owner', 'admin', 'editor'].includes(member.role)) {
      throw new BadRequestException('Insufficient permissions');
    }
  }
}

// =====================================================
// BUSINESS PROFILE IMAGE CONTROLLER
// =====================================================
@ApiTags('business-images')
@Controller('businesses/:businessId/upload')
@UseGuards(JwtAuthGuard)
@ApiBearerAuth()
export class BusinessImageUploadController {
  constructor(
    private readonly cloudinaryService: CloudinaryService,
    private readonly prisma: PrismaService,
  ) {}

  // =====================================================
  // UPLOAD LOGO
  // =====================================================
  @Post('logo')
  @ApiOperation({ summary: 'Upload business logo' })
  @ApiConsumes('multipart/form-data')
  @UseInterceptors(FileInterceptor('file'))
  async uploadLogo(
    @Param('businessId') businessId: string,
    @UserId() userId: string,
    @UploadedFile() file: Express.Multer.File,
  ) {
    await this.verifyAccess(businessId, userId);

    const uploadResult = await this.cloudinaryService.uploadImage(file, {
      folder: `hive/businesses/${businessId}`,
      transformation: [
        { width: 400, height: 400, crop: 'fill' },
        { quality: 'auto:good' },
      ],
    });

    // Update business profile
    const business = await this.prisma.businessProfile.update({
      where: { id: businessId },
      data: { logoUrl: uploadResult.secureUrl },
    });

    return {
      logoUrl: business.logoUrl,
      ...uploadResult,
    };
  }

  // =====================================================
  // UPLOAD COVER IMAGE
  // =====================================================
  @Post('cover')
  @ApiOperation({ summary: 'Upload business cover image' })
  @ApiConsumes('multipart/form-data')
  @UseInterceptors(FileInterceptor('file'))
  async uploadCover(
    @Param('businessId') businessId: string,
    @UserId() userId: string,
    @UploadedFile() file: Express.Multer.File,
  ) {
    await this.verifyAccess(businessId, userId);

    const uploadResult = await this.cloudinaryService.uploadImage(file, {
      folder: `hive/businesses/${businessId}`,
      transformation: [
        { width: 1200, height: 400, crop: 'fill', gravity: 'auto' },
        { quality: 'auto:good' },
      ],
    });

    // Update business profile
    const business = await this.prisma.businessProfile.update({
      where: { id: businessId },
      data: { coverImageUrl: uploadResult.secureUrl },
    });

    return {
      coverImageUrl: business.coverImageUrl,
      ...uploadResult,
    };
  }

  private async verifyAccess(businessId: string, userId: string) {
    const member = await this.prisma.businessMember.findUnique({
      where: {
        businessId_userId: { businessId, userId },
      },
    });

    if (!member || !member.isActive) {
      throw new BadRequestException('No access to this business');
    }

    if (!['owner', 'admin'].includes(member.role)) {
      throw new BadRequestException('Insufficient permissions');
    }
  }
}
