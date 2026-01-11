import { Injectable, Logger } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';

// =====================================================
// TYPES
// =====================================================
export interface ImageTransformOptions {
  width?: number;
  height?: number;
  quality?: number;
  format?: 'auto' | 'webp' | 'avif' | 'jpeg' | 'png';
  fit?: 'cover' | 'contain' | 'fill' | 'scale-down';
  gravity?: 'auto' | 'center' | 'face' | 'north' | 'south' | 'east' | 'west';
  blur?: number;
  sharpen?: boolean;
  background?: string;
}

export interface ResponsiveImageSet {
  src: string;
  srcSet: string;
  sizes: string;
  placeholder?: string;
}

// =====================================================
// IMAGE OPTIMIZATION SERVICE
// =====================================================
@Injectable()
export class ImageOptimizationService {
  private readonly logger = new Logger(ImageOptimizationService.name);
  
  private readonly cloudinaryCloud: string;
  private readonly cdnBaseUrl: string;

  // Common image sizes
  static readonly SIZES = {
    THUMBNAIL: { width: 150, height: 150 },
    SMALL: { width: 320, height: 320 },
    MEDIUM: { width: 640, height: 640 },
    LARGE: { width: 1024, height: 1024 },
    FULL: { width: 1920, height: 1920 },
  };

  // Breakpoints for responsive images
  static readonly BREAKPOINTS = [320, 480, 640, 768, 1024, 1280, 1536];

  constructor(private configService: ConfigService) {
    this.cloudinaryCloud = this.configService.get('CLOUDINARY_CLOUD_NAME') || '';
    this.cdnBaseUrl = `https://res.cloudinary.com/${this.cloudinaryCloud}/image/upload`;
  }

  // =====================================================
  // URL GENERATION
  // =====================================================

  /**
   * Generate optimized image URL
   */
  getOptimizedUrl(
    originalUrl: string,
    options: ImageTransformOptions = {},
  ): string {
    if (!originalUrl) return '';

    // If already a Cloudinary URL, transform it
    if (originalUrl.includes('cloudinary.com')) {
      return this.transformCloudinaryUrl(originalUrl, options);
    }

    // If external URL, use Cloudinary fetch
    return this.fetchExternalImage(originalUrl, options);
  }

  /**
   * Transform Cloudinary URL with optimizations
   */
  private transformCloudinaryUrl(
    url: string,
    options: ImageTransformOptions,
  ): string {
    const transforms: string[] = [];

    // Quality (default to auto for best compression)
    transforms.push(`q_${options.quality || 'auto'}`);

    // Format (auto for best browser support)
    transforms.push(`f_${options.format || 'auto'}`);

    // Dimensions
    if (options.width) transforms.push(`w_${options.width}`);
    if (options.height) transforms.push(`h_${options.height}`);

    // Fit mode
    if (options.fit) {
      const fitMap: Record<string, string> = {
        cover: 'c_fill',
        contain: 'c_fit',
        fill: 'c_scale',
        'scale-down': 'c_limit',
      };
      transforms.push(fitMap[options.fit] || 'c_fill');
    }

    // Gravity (for cropping)
    if (options.gravity) {
      const gravityMap: Record<string, string> = {
        auto: 'g_auto',
        center: 'g_center',
        face: 'g_face',
        north: 'g_north',
        south: 'g_south',
        east: 'g_east',
        west: 'g_west',
      };
      transforms.push(gravityMap[options.gravity] || 'g_auto');
    }

    // Effects
    if (options.blur) transforms.push(`e_blur:${options.blur}`);
    if (options.sharpen) transforms.push('e_sharpen');
    if (options.background) transforms.push(`b_${options.background}`);

    // Build transformation string
    const transformation = transforms.join(',');

    // Insert transformation into URL
    const uploadIndex = url.indexOf('/upload/');
    if (uploadIndex === -1) return url;

    return (
      url.slice(0, uploadIndex + 8) +
      transformation +
      '/' +
      url.slice(uploadIndex + 8)
    );
  }

  /**
   * Fetch and transform external image via Cloudinary
   */
  private fetchExternalImage(
    url: string,
    options: ImageTransformOptions,
  ): string {
    const transforms: string[] = [];

    transforms.push(`q_${options.quality || 'auto'}`);
    transforms.push(`f_${options.format || 'auto'}`);

    if (options.width) transforms.push(`w_${options.width}`);
    if (options.height) transforms.push(`h_${options.height}`);
    if (options.fit === 'cover') transforms.push('c_fill');

    const transformation = transforms.join(',');
    const encodedUrl = encodeURIComponent(url);

    return `${this.cdnBaseUrl}/${transformation}/fetch/${encodedUrl}`;
  }

  // =====================================================
  // RESPONSIVE IMAGES
  // =====================================================

  /**
   * Generate responsive image set
   */
  getResponsiveImageSet(
    originalUrl: string,
    options: {
      sizes?: string;
      maxWidth?: number;
      aspectRatio?: number;
    } = {},
  ): ResponsiveImageSet {
    const maxWidth = options.maxWidth || 1536;
    const breakpoints = ImageOptimizationService.BREAKPOINTS.filter(
      (bp) => bp <= maxWidth,
    );

    // Generate srcSet
    const srcSet = breakpoints
      .map((width) => {
        const height = options.aspectRatio 
          ? Math.round(width / options.aspectRatio) 
          : undefined;
        
        const url = this.getOptimizedUrl(originalUrl, {
          width,
          height,
          fit: 'cover',
        });
        
        return `${url} ${width}w`;
      })
      .join(', ');

    // Default sizes attribute
    const sizes = options.sizes || '(max-width: 768px) 100vw, 50vw';

    // Generate placeholder (tiny blurred version)
    const placeholder = this.getOptimizedUrl(originalUrl, {
      width: 20,
      quality: 30,
      blur: 50,
    });

    // Default src (medium size)
    const src = this.getOptimizedUrl(originalUrl, {
      width: 640,
      fit: 'cover',
    });

    return { src, srcSet, sizes, placeholder };
  }

  /**
   * Get product image variants
   */
  getProductImageVariants(originalUrl: string): {
    thumbnail: string;
    small: string;
    medium: string;
    large: string;
    full: string;
    placeholder: string;
  } {
    return {
      thumbnail: this.getOptimizedUrl(originalUrl, {
        ...ImageOptimizationService.SIZES.THUMBNAIL,
        fit: 'cover',
      }),
      small: this.getOptimizedUrl(originalUrl, {
        ...ImageOptimizationService.SIZES.SMALL,
        fit: 'cover',
      }),
      medium: this.getOptimizedUrl(originalUrl, {
        ...ImageOptimizationService.SIZES.MEDIUM,
        fit: 'cover',
      }),
      large: this.getOptimizedUrl(originalUrl, {
        ...ImageOptimizationService.SIZES.LARGE,
        fit: 'cover',
      }),
      full: this.getOptimizedUrl(originalUrl, {
        ...ImageOptimizationService.SIZES.FULL,
        fit: 'contain',
      }),
      placeholder: this.getOptimizedUrl(originalUrl, {
        width: 20,
        quality: 30,
        blur: 50,
      }),
    };
  }

  /**
   * Get avatar variants
   */
  getAvatarVariants(originalUrl: string): {
    small: string;
    medium: string;
    large: string;
  } {
    return {
      small: this.getOptimizedUrl(originalUrl, {
        width: 40,
        height: 40,
        fit: 'cover',
        gravity: 'face',
      }),
      medium: this.getOptimizedUrl(originalUrl, {
        width: 80,
        height: 80,
        fit: 'cover',
        gravity: 'face',
      }),
      large: this.getOptimizedUrl(originalUrl, {
        width: 200,
        height: 200,
        fit: 'cover',
        gravity: 'face',
      }),
    };
  }

  // =====================================================
  // VIDEO THUMBNAILS
  // =====================================================

  /**
   * Get video thumbnail URL
   */
  getVideoThumbnail(videoUrl: string, options: ImageTransformOptions = {}): string {
    if (!videoUrl.includes('cloudinary.com')) return '';

    // Replace /video/ with /image/ and add thumbnail transform
    const thumbnailUrl = videoUrl
      .replace('/video/', '/image/')
      .replace(/\.[^/.]+$/, '.jpg');

    return this.getOptimizedUrl(thumbnailUrl, {
      width: options.width || 640,
      height: options.height || 360,
      fit: 'cover',
      ...options,
    });
  }

  // =====================================================
  // BLURHASH / PLACEHOLDER
  // =====================================================

  /**
   * Generate low-quality placeholder URL
   */
  getPlaceholder(originalUrl: string): string {
    return this.getOptimizedUrl(originalUrl, {
      width: 20,
      quality: 30,
      blur: 100,
      format: 'webp',
    });
  }

  /**
   * Get data URL for inline placeholder (tiny)
   */
  async getInlinePlaceholder(originalUrl: string): Promise<string> {
    const placeholderUrl = this.getPlaceholder(originalUrl);
    
    try {
      const response = await fetch(placeholderUrl);
      const buffer = await response.arrayBuffer();
      const base64 = Buffer.from(buffer).toString('base64');
      const contentType = response.headers.get('content-type') || 'image/webp';
      return `data:${contentType};base64,${base64}`;
    } catch (error) {
      this.logger.error(`Failed to generate inline placeholder: ${error}`);
      return '';
    }
  }
}
