/**
 * HIVE Image Optimization Utilities
 * 
 * Cloudinary URL transformations for optimized images
 */

// =====================================================
// TYPES
// =====================================================
export interface ImageOptions {
  width?: number;
  height?: number;
  quality?: number | 'auto';
  format?: 'auto' | 'webp' | 'jpg' | 'png';
  fit?: 'cover' | 'contain' | 'fill';
  gravity?: 'auto' | 'face' | 'center';
}

export interface ResponsiveImage {
  uri: string;
  placeholder?: string;
  width: number;
  height: number;
}

// =====================================================
// CONSTANTS
// =====================================================
const CLOUDINARY_CLOUD = 'your-cloud-name'; // Replace with actual

const SIZES = {
  THUMBNAIL: { width: 100, height: 100 },
  SMALL: { width: 200, height: 200 },
  MEDIUM: { width: 400, height: 400 },
  LARGE: { width: 800, height: 800 },
  FULL: { width: 1200, height: 1200 },
};

// =====================================================
// URL GENERATION
// =====================================================

/**
 * Get optimized image URL
 */
export function getOptimizedImageUrl(
  originalUrl: string | undefined | null,
  options: ImageOptions = {},
): string {
  if (!originalUrl) return '';

  // If not Cloudinary, return as-is
  if (!originalUrl.includes('cloudinary.com')) {
    return originalUrl;
  }

  const transforms: string[] = [];

  // Quality (auto for best compression)
  transforms.push(`q_${options.quality || 'auto'}`);

  // Format (auto for WebP/AVIF support)
  transforms.push(`f_${options.format || 'auto'}`);

  // Dimensions
  if (options.width) transforms.push(`w_${options.width}`);
  if (options.height) transforms.push(`h_${options.height}`);

  // Fit mode
  const fitMap: Record<string, string> = {
    cover: 'c_fill',
    contain: 'c_fit',
    fill: 'c_scale',
  };
  if (options.fit) {
    transforms.push(fitMap[options.fit] || 'c_fill');
  }

  // Gravity
  if (options.gravity) {
    transforms.push(`g_${options.gravity}`);
  }

  // Build transformation string
  const transformation = transforms.join(',');

  // Insert into URL
  const uploadIndex = originalUrl.indexOf('/upload/');
  if (uploadIndex === -1) return originalUrl;

  return (
    originalUrl.slice(0, uploadIndex + 8) +
    transformation +
    '/' +
    originalUrl.slice(uploadIndex + 8)
  );
}

/**
 * Get thumbnail URL
 */
export function getThumbnail(url: string): string {
  return getOptimizedImageUrl(url, {
    ...SIZES.THUMBNAIL,
    fit: 'cover',
  });
}

/**
 * Get product image URL
 */
export function getProductImage(url: string, size: keyof typeof SIZES = 'MEDIUM'): string {
  return getOptimizedImageUrl(url, {
    ...SIZES[size],
    fit: 'cover',
  });
}

/**
 * Get avatar URL
 */
export function getAvatar(url: string, size: 'small' | 'medium' | 'large' = 'medium'): string {
  const sizeMap = {
    small: 40,
    medium: 80,
    large: 150,
  };
  
  return getOptimizedImageUrl(url, {
    width: sizeMap[size],
    height: sizeMap[size],
    fit: 'cover',
    gravity: 'face',
  });
}

/**
 * Get placeholder URL (blurred low-quality)
 */
export function getPlaceholder(url: string): string {
  if (!url || !url.includes('cloudinary.com')) return '';

  const uploadIndex = url.indexOf('/upload/');
  if (uploadIndex === -1) return '';

  return (
    url.slice(0, uploadIndex + 8) +
    'w_20,q_30,e_blur:100,f_auto' +
    '/' +
    url.slice(uploadIndex + 8)
  );
}

// =====================================================
// RESPONSIVE IMAGE
// =====================================================

/**
 * Get responsive image data for FastImage
 */
export function getResponsiveImage(
  url: string,
  targetWidth: number,
  aspectRatio: number = 1,
): ResponsiveImage {
  const width = Math.min(targetWidth * 2, 1200); // 2x for retina, max 1200
  const height = Math.round(width / aspectRatio);

  return {
    uri: getOptimizedImageUrl(url, { width, height, fit: 'cover' }),
    placeholder: getPlaceholder(url),
    width,
    height,
  };
}

// =====================================================
// PROGRESSIVE IMAGE COMPONENT
// =====================================================
import React, { useState } from 'react';
import { View, Image, StyleSheet, Animated, ViewStyle } from 'react-native';

interface ProgressiveImageProps {
  source: string;
  style?: ViewStyle;
  width?: number;
  height?: number;
  resizeMode?: 'cover' | 'contain' | 'stretch';
}

export function ProgressiveImage({
  source,
  style,
  width = 200,
  height = 200,
  resizeMode = 'cover',
}: ProgressiveImageProps) {
  const [loaded, setLoaded] = useState(false);
  const opacity = useState(new Animated.Value(0))[0];

  const placeholderUri = getPlaceholder(source);
  const fullUri = getOptimizedImageUrl(source, { width: width * 2, height: height * 2 });

  const onLoad = () => {
    setLoaded(true);
    Animated.timing(opacity, {
      toValue: 1,
      duration: 300,
      useNativeDriver: true,
    }).start();
  };

  return (
    <View style={[styles.container, style, { width, height }]}>
      {/* Placeholder */}
      {placeholderUri && (
        <Image
          source={{ uri: placeholderUri }}
          style={[styles.image, { width, height }]}
          resizeMode={resizeMode}
          blurRadius={2}
        />
      )}

      {/* Full image */}
      <Animated.Image
        source={{ uri: fullUri }}
        style={[styles.image, styles.fullImage, { width, height, opacity }]}
        resizeMode={resizeMode}
        onLoad={onLoad}
      />
    </View>
  );
}

const styles = StyleSheet.create({
  container: {
    backgroundColor: '#F3F4F6',
    overflow: 'hidden',
  },
  image: {
    position: 'absolute',
    top: 0,
    left: 0,
  },
  fullImage: {
    zIndex: 1,
  },
});

// =====================================================
// VIDEO THUMBNAIL
// =====================================================

/**
 * Get video thumbnail from Cloudinary
 */
export function getVideoThumbnail(
  videoUrl: string,
  options: { width?: number; height?: number; time?: number } = {},
): string {
  if (!videoUrl.includes('cloudinary.com')) return '';

  // Convert video URL to image URL
  let thumbnailUrl = videoUrl
    .replace('/video/', '/image/')
    .replace(/\.[^/.]+$/, '.jpg');

  const transforms: string[] = [
    `w_${options.width || 400}`,
    `h_${options.height || 225}`,
    'c_fill',
    'q_auto',
    'f_auto',
  ];

  if (options.time !== undefined) {
    transforms.push(`so_${options.time}`); // Start offset
  }

  const transformation = transforms.join(',');

  const uploadIndex = thumbnailUrl.indexOf('/upload/');
  if (uploadIndex === -1) return thumbnailUrl;

  return (
    thumbnailUrl.slice(0, uploadIndex + 8) +
    transformation +
    '/' +
    thumbnailUrl.slice(uploadIndex + 8)
  );
}

// =====================================================
// PRELOAD IMAGES
// =====================================================

/**
 * Preload images for faster display
 */
export function preloadImages(urls: string[]): Promise<void[]> {
  return Promise.all(
    urls.filter(Boolean).map(
      (url) =>
        new Promise<void>((resolve) => {
          Image.prefetch(getOptimizedImageUrl(url, { width: 400 }))
            .then(() => resolve())
            .catch(() => resolve());
        }),
    ),
  );
}

/**
 * Preload product images
 */
export function preloadProductImages(products: Array<{ images?: Array<{ url: string }> }>): void {
  const urls = products
    .flatMap((p) => p.images?.slice(0, 1) || [])
    .map((img) => img.url);

  preloadImages(urls);
}
