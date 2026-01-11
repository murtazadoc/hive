import {
  Injectable,
  BadRequestException,
  InternalServerErrorException,
} from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { v2 as cloudinary, UploadApiResponse } from 'cloudinary';
import * as sharp from 'sharp';
import { Readable } from 'stream';

// =====================================================
// TYPES
// =====================================================
export interface UploadResult {
  publicId: string;
  url: string;
  secureUrl: string;
  thumbnailUrl: string;
  width: number;
  height: number;
  format: string;
  bytes: number;
  resourceType: string;
}

export interface UploadOptions {
  folder?: string;
  publicId?: string;
  transformation?: any;
  tags?: string[];
  eager?: any[];
  resourceType?: 'image' | 'video' | 'raw' | 'auto';
}

// =====================================================
// CLOUDINARY SERVICE
// =====================================================
@Injectable()
export class CloudinaryService {
  private readonly maxFileSize = 10 * 1024 * 1024; // 10MB
  private readonly allowedImageTypes = ['image/jpeg', 'image/png', 'image/webp', 'image/gif'];
  private readonly allowedVideoTypes = ['video/mp4', 'video/quicktime', 'video/webm'];

  constructor(private configService: ConfigService) {
    // Configure Cloudinary
    cloudinary.config({
      cloud_name: this.configService.get('CLOUDINARY_CLOUD_NAME'),
      api_key: this.configService.get('CLOUDINARY_API_KEY'),
      api_secret: this.configService.get('CLOUDINARY_API_SECRET'),
      secure: true,
    });
  }

  // =====================================================
  // UPLOAD IMAGE
  // =====================================================
  async uploadImage(
    file: Express.Multer.File,
    options: UploadOptions = {},
  ): Promise<UploadResult> {
    // Validate file
    this.validateFile(file, 'image');

    // Optimize image before upload
    const optimizedBuffer = await this.optimizeImage(file.buffer);

    // Upload to Cloudinary
    const result = await this.uploadToCloudinary(optimizedBuffer, {
      folder: options.folder || 'hive/products',
      resourceType: 'image',
      transformation: [
        { quality: 'auto:good' },
        { fetch_format: 'auto' },
      ],
      eager: [
        // Generate thumbnail
        { width: 200, height: 200, crop: 'fill', quality: 'auto:low' },
        // Medium size for listings
        { width: 400, height: 400, crop: 'fill', quality: 'auto:good' },
        // Large size for detail view
        { width: 800, height: 800, crop: 'limit', quality: 'auto:good' },
      ],
      eager_async: true,
      ...options,
    });

    return this.formatUploadResult(result);
  }

  // =====================================================
  // UPLOAD MULTIPLE IMAGES
  // =====================================================
  async uploadImages(
    files: Express.Multer.File[],
    options: UploadOptions = {},
  ): Promise<UploadResult[]> {
    const uploadPromises = files.map((file) => this.uploadImage(file, options));
    return Promise.all(uploadPromises);
  }

  // =====================================================
  // UPLOAD VIDEO
  // =====================================================
  async uploadVideo(
    file: Express.Multer.File,
    options: UploadOptions = {},
  ): Promise<UploadResult> {
    // Validate file
    this.validateFile(file, 'video');

    const result = await this.uploadToCloudinary(file.buffer, {
      folder: options.folder || 'hive/videos',
      resourceType: 'video',
      eager: [
        // Generate thumbnail from video
        { format: 'jpg', transformation: [{ width: 400, height: 400, crop: 'fill' }] },
        // HLS streaming format
        { streaming_profile: 'hd', format: 'm3u8' },
      ],
      eager_async: true,
      ...options,
    });

    return this.formatUploadResult(result);
  }

  // =====================================================
  // UPLOAD FROM URL
  // =====================================================
  async uploadFromUrl(
    url: string,
    options: UploadOptions = {},
  ): Promise<UploadResult> {
    try {
      const result = await cloudinary.uploader.upload(url, {
        folder: options.folder || 'hive/products',
        resource_type: options.resourceType || 'auto',
        transformation: [
          { quality: 'auto:good' },
          { fetch_format: 'auto' },
        ],
        ...options,
      });

      return this.formatUploadResult(result);
    } catch (error: any) {
      throw new InternalServerErrorException(`Failed to upload from URL: ${error.message}`);
    }
  }

  // =====================================================
  // UPLOAD BASE64
  // =====================================================
  async uploadBase64(
    base64Data: string,
    options: UploadOptions = {},
  ): Promise<UploadResult> {
    try {
      // Ensure proper data URI format
      const dataUri = base64Data.startsWith('data:')
        ? base64Data
        : `data:image/jpeg;base64,${base64Data}`;

      const result = await cloudinary.uploader.upload(dataUri, {
        folder: options.folder || 'hive/products',
        resource_type: 'auto',
        transformation: [
          { quality: 'auto:good' },
          { fetch_format: 'auto' },
        ],
        eager: [
          { width: 200, height: 200, crop: 'fill', quality: 'auto:low' },
        ],
        ...options,
      });

      return this.formatUploadResult(result);
    } catch (error: any) {
      throw new InternalServerErrorException(`Failed to upload base64: ${error.message}`);
    }
  }

  // =====================================================
  // DELETE IMAGE
  // =====================================================
  async deleteImage(publicId: string): Promise<{ success: boolean }> {
    try {
      const result = await cloudinary.uploader.destroy(publicId);
      return { success: result.result === 'ok' };
    } catch (error: any) {
      throw new InternalServerErrorException(`Failed to delete image: ${error.message}`);
    }
  }

  // =====================================================
  // DELETE MULTIPLE IMAGES
  // =====================================================
  async deleteImages(publicIds: string[]): Promise<{ deleted: string[]; failed: string[] }> {
    const deleted: string[] = [];
    const failed: string[] = [];

    await Promise.all(
      publicIds.map(async (publicId) => {
        try {
          const result = await cloudinary.uploader.destroy(publicId);
          if (result.result === 'ok') {
            deleted.push(publicId);
          } else {
            failed.push(publicId);
          }
        } catch {
          failed.push(publicId);
        }
      }),
    );

    return { deleted, failed };
  }

  // =====================================================
  // GENERATE SIGNED URL (for private assets)
  // =====================================================
  generateSignedUrl(publicId: string, options: any = {}): string {
    return cloudinary.url(publicId, {
      sign_url: true,
      type: 'authenticated',
      ...options,
    });
  }

  // =====================================================
  // GENERATE TRANSFORMATION URL
  // =====================================================
  generateTransformUrl(
    publicId: string,
    transformations: any[],
  ): string {
    return cloudinary.url(publicId, {
      transformation: transformations,
      secure: true,
    });
  }

  // =====================================================
  // GET THUMBNAIL URL
  // =====================================================
  getThumbnailUrl(publicId: string, width = 200, height = 200): string {
    return cloudinary.url(publicId, {
      transformation: [
        { width, height, crop: 'fill' },
        { quality: 'auto:low' },
        { fetch_format: 'auto' },
      ],
      secure: true,
    });
  }

  // =====================================================
  // GET OPTIMIZED URL
  // =====================================================
  getOptimizedUrl(publicId: string, width?: number): string {
    const transformation: any[] = [
      { quality: 'auto:good' },
      { fetch_format: 'auto' },
    ];

    if (width) {
      transformation.unshift({ width, crop: 'limit' });
    }

    return cloudinary.url(publicId, {
      transformation,
      secure: true,
    });
  }

  // =====================================================
  // PRIVATE HELPERS
  // =====================================================
  private validateFile(file: Express.Multer.File, type: 'image' | 'video') {
    if (!file) {
      throw new BadRequestException('No file provided');
    }

    if (file.size > this.maxFileSize) {
      throw new BadRequestException(`File too large. Max size is ${this.maxFileSize / 1024 / 1024}MB`);
    }

    const allowedTypes = type === 'image' ? this.allowedImageTypes : this.allowedVideoTypes;
    if (!allowedTypes.includes(file.mimetype)) {
      throw new BadRequestException(
        `Invalid file type. Allowed types: ${allowedTypes.join(', ')}`,
      );
    }
  }

  private async optimizeImage(buffer: Buffer): Promise<Buffer> {
    try {
      // Use sharp to optimize before upload
      const image = sharp(buffer);
      const metadata = await image.metadata();

      // Resize if too large (max 2000px)
      const maxDimension = 2000;
      let optimized = image;

      if (metadata.width && metadata.width > maxDimension) {
        optimized = optimized.resize(maxDimension, null, {
          withoutEnlargement: true,
          fit: 'inside',
        });
      }

      // Convert to WebP for better compression, but keep original format info
      return optimized
        .jpeg({ quality: 85, progressive: true })
        .toBuffer();
    } catch (error) {
      // If optimization fails, return original buffer
      console.error('Image optimization failed:', error);
      return buffer;
    }
  }

  private uploadToCloudinary(
    buffer: Buffer,
    options: any,
  ): Promise<UploadApiResponse> {
    return new Promise((resolve, reject) => {
      const uploadStream = cloudinary.uploader.upload_stream(
        options,
        (error, result) => {
          if (error) {
            reject(new InternalServerErrorException(`Upload failed: ${error.message}`));
          } else if (result) {
            resolve(result);
          } else {
            reject(new InternalServerErrorException('Upload failed: No result'));
          }
        },
      );

      // Convert buffer to stream and pipe to upload
      const readableStream = new Readable();
      readableStream.push(buffer);
      readableStream.push(null);
      readableStream.pipe(uploadStream);
    });
  }

  private formatUploadResult(result: UploadApiResponse): UploadResult {
    // Generate thumbnail URL
    const thumbnailUrl = this.getThumbnailUrl(result.public_id);

    return {
      publicId: result.public_id,
      url: result.url,
      secureUrl: result.secure_url,
      thumbnailUrl,
      width: result.width,
      height: result.height,
      format: result.format,
      bytes: result.bytes,
      resourceType: result.resource_type,
    };
  }
}
