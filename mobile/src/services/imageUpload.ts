/**
 * HIVE Image Upload Service
 * 
 * Handles image picking, compression, and upload with queue management.
 * Supports offline queuing and background upload.
 */

import { Platform } from 'react-native';
import AsyncStorage from '@react-native-async-storage/async-storage';
import { v4 as uuidv4 } from 'uuid';
import api from './client';

// =====================================================
// TYPES
// =====================================================
export interface ImageAsset {
  uri: string;
  width: number;
  height: number;
  type?: string;
  fileName?: string;
  fileSize?: number;
}

export interface UploadResult {
  id: string;
  url: string;
  thumbnailUrl: string;
  width: number;
  height: number;
  fileSize: number;
}

export interface UploadProgress {
  loaded: number;
  total: number;
  percent: number;
}

export interface PendingUpload {
  id: string;
  localUri: string;
  businessId: string;
  productId?: string;
  type: 'product' | 'logo' | 'cover' | 'general';
  status: 'pending' | 'uploading' | 'completed' | 'failed';
  retryCount: number;
  createdAt: string;
  error?: string;
}

type UploadProgressCallback = (progress: UploadProgress) => void;

// Storage key
const UPLOAD_QUEUE_KEY = '@hive_upload_queue';

// =====================================================
// IMAGE COMPRESSION (using react-native-image-resizer)
// =====================================================
// Note: In production, use react-native-image-resizer
// For now, we'll pass through and let the server handle it

export async function compressImage(
  uri: string,
  options: {
    maxWidth?: number;
    maxHeight?: number;
    quality?: number;
  } = {},
): Promise<{ uri: string; width: number; height: number }> {
  const { maxWidth = 1200, maxHeight = 1200, quality = 80 } = options;

  // In production, use:
  // import ImageResizer from 'react-native-image-resizer';
  // const result = await ImageResizer.createResizedImage(
  //   uri,
  //   maxWidth,
  //   maxHeight,
  //   'JPEG',
  //   quality,
  //   0, // rotation
  //   undefined, // outputPath
  //   false, // keepMeta
  // );
  // return { uri: result.uri, width: result.width, height: result.height };

  // For now, return original
  return { uri, width: maxWidth, height: maxHeight };
}

// =====================================================
// UPLOAD SERVICE
// =====================================================
class ImageUploadService {
  private isProcessingQueue = false;

  // =====================================================
  // UPLOAD SINGLE IMAGE
  // =====================================================
  async uploadImage(
    image: ImageAsset,
    options: {
      businessId?: string;
      productId?: string;
      type?: 'product' | 'logo' | 'cover' | 'general';
      compress?: boolean;
      onProgress?: UploadProgressCallback;
    } = {},
  ): Promise<UploadResult> {
    const {
      businessId,
      productId,
      type = 'general',
      compress = true,
      onProgress,
    } = options;

    // Compress image if needed
    let imageUri = image.uri;
    if (compress) {
      const compressed = await compressImage(image.uri, {
        maxWidth: type === 'logo' ? 400 : 1200,
        maxHeight: type === 'logo' ? 400 : 1200,
        quality: type === 'logo' ? 90 : 80,
      });
      imageUri = compressed.uri;
    }

    // Create form data
    const formData = new FormData();
    formData.append('file', {
      uri: Platform.OS === 'ios' ? imageUri.replace('file://', '') : imageUri,
      type: image.type || 'image/jpeg',
      name: image.fileName || `image_${Date.now()}.jpg`,
    } as any);

    // Determine endpoint
    let endpoint = '/upload/image';
    if (productId && businessId) {
      endpoint = `/businesses/${businessId}/products/${productId}/upload`;
    } else if (businessId && type === 'logo') {
      endpoint = `/businesses/${businessId}/upload/logo`;
    } else if (businessId && type === 'cover') {
      endpoint = `/businesses/${businessId}/upload/cover`;
    }

    // Upload with progress tracking
    const response = await api.post(endpoint, formData, {
      headers: {
        'Content-Type': 'multipart/form-data',
      },
      onUploadProgress: (progressEvent) => {
        if (onProgress && progressEvent.total) {
          onProgress({
            loaded: progressEvent.loaded,
            total: progressEvent.total,
            percent: Math.round((progressEvent.loaded * 100) / progressEvent.total),
          });
        }
      },
    });

    return response.data;
  }

  // =====================================================
  // UPLOAD MULTIPLE IMAGES
  // =====================================================
  async uploadImages(
    images: ImageAsset[],
    options: {
      businessId?: string;
      productId?: string;
      compress?: boolean;
      onProgress?: (index: number, progress: UploadProgress) => void;
    } = {},
  ): Promise<UploadResult[]> {
    const results: UploadResult[] = [];

    for (let i = 0; i < images.length; i++) {
      const result = await this.uploadImage(images[i], {
        ...options,
        type: 'product',
        onProgress: (progress) => options.onProgress?.(i, progress),
      });
      results.push(result);
    }

    return results;
  }

  // =====================================================
  // UPLOAD FROM BASE64
  // =====================================================
  async uploadBase64(
    base64Data: string,
    options: {
      folder?: string;
    } = {},
  ): Promise<UploadResult> {
    const response = await api.post('/upload/base64', {
      data: base64Data,
      folder: options.folder,
    });

    return response.data;
  }

  // =====================================================
  // UPLOAD FROM URL
  // =====================================================
  async uploadFromUrl(
    url: string,
    options: {
      folder?: string;
    } = {},
  ): Promise<UploadResult> {
    const response = await api.post('/upload/from-url', {
      url,
      folder: options.folder,
    });

    return response.data;
  }

  // =====================================================
  // DELETE IMAGE
  // =====================================================
  async deleteImage(publicId: string): Promise<{ success: boolean }> {
    const response = await api.delete(`/upload/${encodeURIComponent(publicId)}`);
    return response.data;
  }

  // =====================================================
  // OFFLINE UPLOAD QUEUE
  // =====================================================
  async queueUpload(
    localUri: string,
    options: {
      businessId: string;
      productId?: string;
      type: 'product' | 'logo' | 'cover';
    },
  ): Promise<string> {
    const queue = await this.getUploadQueue();

    const upload: PendingUpload = {
      id: uuidv4(),
      localUri,
      businessId: options.businessId,
      productId: options.productId,
      type: options.type,
      status: 'pending',
      retryCount: 0,
      createdAt: new Date().toISOString(),
    };

    queue.push(upload);
    await this.saveUploadQueue(queue);

    // Try to process immediately
    this.processUploadQueue();

    return upload.id;
  }

  async getUploadQueue(): Promise<PendingUpload[]> {
    const data = await AsyncStorage.getItem(UPLOAD_QUEUE_KEY);
    return data ? JSON.parse(data) : [];
  }

  private async saveUploadQueue(queue: PendingUpload[]): Promise<void> {
    await AsyncStorage.setItem(UPLOAD_QUEUE_KEY, JSON.stringify(queue));
  }

  async processUploadQueue(): Promise<void> {
    if (this.isProcessingQueue) return;
    this.isProcessingQueue = true;

    try {
      const queue = await this.getUploadQueue();
      const pendingUploads = queue.filter(
        (u) => u.status === 'pending' || (u.status === 'failed' && u.retryCount < 3),
      );

      for (const upload of pendingUploads) {
        try {
          // Update status to uploading
          upload.status = 'uploading';
          await this.saveUploadQueue(queue);

          // Perform upload
          await this.uploadImage(
            {
              uri: upload.localUri,
              width: 0,
              height: 0,
            },
            {
              businessId: upload.businessId,
              productId: upload.productId,
              type: upload.type,
            },
          );

          // Mark as completed
          upload.status = 'completed';
          await this.saveUploadQueue(queue);
        } catch (error: any) {
          // Mark as failed
          upload.status = 'failed';
          upload.retryCount += 1;
          upload.error = error.message;
          await this.saveUploadQueue(queue);
        }
      }

      // Clean up completed uploads older than 24 hours
      const cutoff = Date.now() - 24 * 60 * 60 * 1000;
      const cleanedQueue = queue.filter(
        (u) =>
          u.status !== 'completed' ||
          new Date(u.createdAt).getTime() > cutoff,
      );
      await this.saveUploadQueue(cleanedQueue);
    } finally {
      this.isProcessingQueue = false;
    }
  }

  async clearUploadQueue(): Promise<void> {
    await AsyncStorage.removeItem(UPLOAD_QUEUE_KEY);
  }

  async getPendingUploadsCount(): Promise<number> {
    const queue = await this.getUploadQueue();
    return queue.filter((u) => u.status === 'pending' || u.status === 'uploading').length;
  }
}

// =====================================================
// SINGLETON EXPORT
// =====================================================
export const imageUploadService = new ImageUploadService();

// =====================================================
// CONVENIENCE FUNCTIONS
// =====================================================
export async function uploadProductImage(
  image: ImageAsset,
  businessId: string,
  productId: string,
  onProgress?: UploadProgressCallback,
): Promise<UploadResult> {
  return imageUploadService.uploadImage(image, {
    businessId,
    productId,
    type: 'product',
    onProgress,
  });
}

export async function uploadBusinessLogo(
  image: ImageAsset,
  businessId: string,
  onProgress?: UploadProgressCallback,
): Promise<UploadResult> {
  return imageUploadService.uploadImage(image, {
    businessId,
    type: 'logo',
    onProgress,
  });
}

export async function uploadBusinessCover(
  image: ImageAsset,
  businessId: string,
  onProgress?: UploadProgressCallback,
): Promise<UploadResult> {
  return imageUploadService.uploadImage(image, {
    businessId,
    type: 'cover',
    onProgress,
  });
}
