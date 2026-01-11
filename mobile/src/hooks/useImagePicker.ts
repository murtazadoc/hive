/**
 * HIVE Image Picker Hook
 * 
 * Wraps react-native-image-picker with convenience methods
 * and permission handling.
 */

import { useState, useCallback } from 'react';
import { Alert, Platform, Linking } from 'react-native';
import {
  launchCamera,
  launchImageLibrary,
  ImagePickerResponse,
  Asset,
  CameraOptions,
  ImageLibraryOptions,
} from 'react-native-image-picker';
import { ImageAsset } from '../services/imageUpload';

// =====================================================
// TYPES
// =====================================================
export interface UseImagePickerOptions {
  maxImages?: number;
  quality?: number;
  maxWidth?: number;
  maxHeight?: number;
  includeBase64?: boolean;
}

export interface UseImagePickerReturn {
  images: ImageAsset[];
  isLoading: boolean;
  error: string | null;
  pickFromGallery: () => Promise<ImageAsset[]>;
  pickFromCamera: () => Promise<ImageAsset | null>;
  removeImage: (index: number) => void;
  clearImages: () => void;
  reorderImages: (fromIndex: number, toIndex: number) => void;
}

// =====================================================
// HOOK
// =====================================================
export function useImagePicker(
  options: UseImagePickerOptions = {},
): UseImagePickerReturn {
  const {
    maxImages = 10,
    quality = 0.8,
    maxWidth = 1200,
    maxHeight = 1200,
    includeBase64 = false,
  } = options;

  const [images, setImages] = useState<ImageAsset[]>([]);
  const [isLoading, setIsLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  // Convert asset to our format
  const assetToImageAsset = (asset: Asset): ImageAsset => ({
    uri: asset.uri || '',
    width: asset.width || 0,
    height: asset.height || 0,
    type: asset.type,
    fileName: asset.fileName,
    fileSize: asset.fileSize,
  });

  // Handle picker response
  const handleResponse = useCallback(
    (response: ImagePickerResponse): ImageAsset[] => {
      if (response.didCancel) {
        return [];
      }

      if (response.errorCode) {
        let errorMessage = 'Failed to pick image';

        switch (response.errorCode) {
          case 'camera_unavailable':
            errorMessage = 'Camera is not available on this device';
            break;
          case 'permission':
            errorMessage = 'Permission denied. Please enable in Settings.';
            Alert.alert(
              'Permission Required',
              'Please enable camera/photo access in your device settings.',
              [
                { text: 'Cancel', style: 'cancel' },
                { text: 'Open Settings', onPress: () => Linking.openSettings() },
              ],
            );
            break;
          case 'others':
            errorMessage = response.errorMessage || 'Unknown error occurred';
            break;
        }

        setError(errorMessage);
        return [];
      }

      if (response.assets && response.assets.length > 0) {
        return response.assets.map(assetToImageAsset);
      }

      return [];
    },
    [],
  );

  // Pick from gallery
  const pickFromGallery = useCallback(async (): Promise<ImageAsset[]> => {
    setIsLoading(true);
    setError(null);

    const remainingSlots = maxImages - images.length;
    if (remainingSlots <= 0) {
      setError(`Maximum ${maxImages} images allowed`);
      setIsLoading(false);
      return [];
    }

    const options: ImageLibraryOptions = {
      mediaType: 'photo',
      selectionLimit: remainingSlots,
      quality,
      maxWidth,
      maxHeight,
      includeBase64,
    };

    try {
      const response = await launchImageLibrary(options);
      const newImages = handleResponse(response);

      if (newImages.length > 0) {
        setImages((prev) => [...prev, ...newImages].slice(0, maxImages));
      }

      return newImages;
    } catch (err: any) {
      setError(err.message || 'Failed to pick images');
      return [];
    } finally {
      setIsLoading(false);
    }
  }, [images.length, maxImages, quality, maxWidth, maxHeight, includeBase64, handleResponse]);

  // Pick from camera
  const pickFromCamera = useCallback(async (): Promise<ImageAsset | null> => {
    if (images.length >= maxImages) {
      setError(`Maximum ${maxImages} images allowed`);
      return null;
    }

    setIsLoading(true);
    setError(null);

    const options: CameraOptions = {
      mediaType: 'photo',
      quality,
      maxWidth,
      maxHeight,
      includeBase64,
      saveToPhotos: false,
      cameraType: 'back',
    };

    try {
      const response = await launchCamera(options);
      const newImages = handleResponse(response);

      if (newImages.length > 0) {
        setImages((prev) => [...prev, newImages[0]].slice(0, maxImages));
        return newImages[0];
      }

      return null;
    } catch (err: any) {
      setError(err.message || 'Failed to take photo');
      return null;
    } finally {
      setIsLoading(false);
    }
  }, [images.length, maxImages, quality, maxWidth, maxHeight, includeBase64, handleResponse]);

  // Remove image at index
  const removeImage = useCallback((index: number) => {
    setImages((prev) => prev.filter((_, i) => i !== index));
  }, []);

  // Clear all images
  const clearImages = useCallback(() => {
    setImages([]);
    setError(null);
  }, []);

  // Reorder images (for drag and drop)
  const reorderImages = useCallback((fromIndex: number, toIndex: number) => {
    setImages((prev) => {
      const result = [...prev];
      const [removed] = result.splice(fromIndex, 1);
      result.splice(toIndex, 0, removed);
      return result;
    });
  }, []);

  return {
    images,
    isLoading,
    error,
    pickFromGallery,
    pickFromCamera,
    removeImage,
    clearImages,
    reorderImages,
  };
}

// =====================================================
// SINGLE IMAGE PICKER HOOK
// =====================================================
export function useSingleImagePicker(
  options: Omit<UseImagePickerOptions, 'maxImages'> = {},
) {
  const result = useImagePicker({ ...options, maxImages: 1 });

  return {
    image: result.images[0] || null,
    isLoading: result.isLoading,
    error: result.error,
    pickFromGallery: async () => {
      const images = await result.pickFromGallery();
      return images[0] || null;
    },
    pickFromCamera: result.pickFromCamera,
    clearImage: result.clearImages,
  };
}

// =====================================================
// ACTION SHEET PICKER
// =====================================================
export function showImagePickerActionSheet(
  onPickFromGallery: () => void,
  onPickFromCamera: () => void,
) {
  Alert.alert(
    'Add Photo',
    'Choose a source',
    [
      { text: 'Camera', onPress: onPickFromCamera },
      { text: 'Photo Library', onPress: onPickFromGallery },
      { text: 'Cancel', style: 'cancel' },
    ],
    { cancelable: true },
  );
}
