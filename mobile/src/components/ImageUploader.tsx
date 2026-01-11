import React, { useState, useCallback } from 'react';
import {
  View,
  Text,
  Image,
  TouchableOpacity,
  StyleSheet,
  ScrollView,
  ActivityIndicator,
  Alert,
} from 'react-native';
import Icon from 'react-native-vector-icons/Feather';
import {
  useImagePicker,
  showImagePickerActionSheet,
} from '../hooks/useImagePicker';
import {
  imageUploadService,
  ImageAsset,
  UploadResult,
  UploadProgress,
} from '../services/imageUpload';

// =====================================================
// TYPES
// =====================================================
export interface UploadedImage {
  id?: string;
  localUri?: string;
  remoteUrl?: string;
  thumbnailUrl?: string;
  isUploading?: boolean;
  uploadProgress?: number;
  error?: string;
}

interface ImageUploaderProps {
  images: UploadedImage[];
  onChange: (images: UploadedImage[]) => void;
  maxImages?: number;
  businessId?: string;
  productId?: string;
  autoUpload?: boolean;
  showPrimaryBadge?: boolean;
  onUploadComplete?: (result: UploadResult, index: number) => void;
  onUploadError?: (error: string, index: number) => void;
}

// =====================================================
// COMPONENT
// =====================================================
export default function ImageUploader({
  images,
  onChange,
  maxImages = 10,
  businessId,
  productId,
  autoUpload = false,
  showPrimaryBadge = true,
  onUploadComplete,
  onUploadError,
}: ImageUploaderProps) {
  const [uploadingIndices, setUploadingIndices] = useState<Set<number>>(new Set());

  const {
    pickFromGallery,
    pickFromCamera,
    isLoading: isPickerLoading,
    error: pickerError,
  } = useImagePicker({ maxImages: maxImages - images.length });

  // Handle image selection
  const handleAddImages = useCallback(
    async (selectedImages: ImageAsset[]) => {
      const newImages: UploadedImage[] = selectedImages.map((img) => ({
        localUri: img.uri,
        isUploading: autoUpload,
        uploadProgress: 0,
      }));

      const updatedImages = [...images, ...newImages].slice(0, maxImages);
      onChange(updatedImages);

      // Auto upload if enabled
      if (autoUpload && businessId) {
        const startIndex = images.length;
        selectedImages.forEach((img, i) => {
          uploadImage(img, startIndex + i);
        });
      }
    },
    [images, maxImages, autoUpload, businessId, onChange],
  );

  // Pick images handler
  const handlePickImages = useCallback(() => {
    if (images.length >= maxImages) {
      Alert.alert('Limit Reached', `Maximum ${maxImages} images allowed`);
      return;
    }

    showImagePickerActionSheet(
      async () => {
        const selected = await pickFromGallery();
        if (selected.length > 0) {
          handleAddImages(selected);
        }
      },
      async () => {
        const selected = await pickFromCamera();
        if (selected) {
          handleAddImages([selected]);
        }
      },
    );
  }, [images.length, maxImages, pickFromGallery, pickFromCamera, handleAddImages]);

  // Upload single image
  const uploadImage = useCallback(
    async (image: ImageAsset, index: number) => {
      if (!businessId) return;

      setUploadingIndices((prev) => new Set(prev).add(index));

      // Update progress
      const updateProgress = (progress: UploadProgress) => {
        onChange(
          images.map((img, i) =>
            i === index ? { ...img, uploadProgress: progress.percent } : img,
          ),
        );
      };

      try {
        const result = await imageUploadService.uploadImage(image, {
          businessId,
          productId,
          type: productId ? 'product' : 'general',
          onProgress: updateProgress,
        });

        // Update with remote URL
        onChange(
          images.map((img, i) =>
            i === index
              ? {
                  ...img,
                  id: result.id,
                  remoteUrl: result.url,
                  thumbnailUrl: result.thumbnailUrl,
                  isUploading: false,
                  uploadProgress: 100,
                }
              : img,
          ),
        );

        onUploadComplete?.(result, index);
      } catch (error: any) {
        onChange(
          images.map((img, i) =>
            i === index
              ? { ...img, isUploading: false, error: error.message }
              : img,
          ),
        );
        onUploadError?.(error.message, index);
      } finally {
        setUploadingIndices((prev) => {
          const next = new Set(prev);
          next.delete(index);
          return next;
        });
      }
    },
    [businessId, productId, images, onChange, onUploadComplete, onUploadError],
  );

  // Remove image
  const handleRemoveImage = useCallback(
    (index: number) => {
      Alert.alert('Remove Image', 'Are you sure you want to remove this image?', [
        { text: 'Cancel', style: 'cancel' },
        {
          text: 'Remove',
          style: 'destructive',
          onPress: () => {
            onChange(images.filter((_, i) => i !== index));
          },
        },
      ]);
    },
    [images, onChange],
  );

  // Set as primary
  const handleSetPrimary = useCallback(
    (index: number) => {
      const reordered = [...images];
      const [selected] = reordered.splice(index, 1);
      reordered.unshift(selected);
      onChange(reordered);
    },
    [images, onChange],
  );

  // Retry failed upload
  const handleRetryUpload = useCallback(
    (index: number) => {
      const image = images[index];
      if (image.localUri) {
        onChange(
          images.map((img, i) =>
            i === index ? { ...img, error: undefined, isUploading: true } : img,
          ),
        );
        uploadImage(
          { uri: image.localUri, width: 0, height: 0 },
          index,
        );
      }
    },
    [images, onChange, uploadImage],
  );

  return (
    <View style={styles.container}>
      <ScrollView
        horizontal
        showsHorizontalScrollIndicator={false}
        contentContainerStyle={styles.scrollContent}
      >
        {/* Existing Images */}
        {images.map((image, index) => (
          <View key={index} style={styles.imageWrapper}>
            <Image
              source={{ uri: image.thumbnailUrl || image.remoteUrl || image.localUri }}
              style={styles.image}
            />

            {/* Primary Badge */}
            {showPrimaryBadge && index === 0 && (
              <View style={styles.primaryBadge}>
                <Text style={styles.primaryText}>Primary</Text>
              </View>
            )}

            {/* Upload Progress */}
            {image.isUploading && (
              <View style={styles.uploadOverlay}>
                <ActivityIndicator color="#fff" size="small" />
                <Text style={styles.progressText}>
                  {image.uploadProgress || 0}%
                </Text>
              </View>
            )}

            {/* Error State */}
            {image.error && (
              <TouchableOpacity
                style={styles.errorOverlay}
                onPress={() => handleRetryUpload(index)}
              >
                <Icon name="alert-circle" size={24} color="#fff" />
                <Text style={styles.errorText}>Tap to retry</Text>
              </TouchableOpacity>
            )}

            {/* Actions */}
            {!image.isUploading && !image.error && (
              <>
                <TouchableOpacity
                  style={styles.removeButton}
                  onPress={() => handleRemoveImage(index)}
                >
                  <Icon name="x" size={16} color="#fff" />
                </TouchableOpacity>

                {index !== 0 && (
                  <TouchableOpacity
                    style={styles.primaryButton}
                    onPress={() => handleSetPrimary(index)}
                  >
                    <Icon name="star" size={14} color="#F59E0B" />
                  </TouchableOpacity>
                )}
              </>
            )}
          </View>
        ))}

        {/* Add Button */}
        {images.length < maxImages && (
          <TouchableOpacity
            style={styles.addButton}
            onPress={handlePickImages}
            disabled={isPickerLoading}
          >
            {isPickerLoading ? (
              <ActivityIndicator color="#9CA3AF" />
            ) : (
              <>
                <Icon name="plus" size={28} color="#9CA3AF" />
                <Text style={styles.addText}>Add Photo</Text>
                <Text style={styles.countText}>
                  {images.length}/{maxImages}
                </Text>
              </>
            )}
          </TouchableOpacity>
        )}
      </ScrollView>

      {/* Error Message */}
      {pickerError && (
        <Text style={styles.errorMessage}>{pickerError}</Text>
      )}
    </View>
  );
}

// =====================================================
// STYLES
// =====================================================
const styles = StyleSheet.create({
  container: {
    marginVertical: 8,
  },
  scrollContent: {
    paddingHorizontal: 4,
    gap: 12,
  },
  imageWrapper: {
    width: 100,
    height: 100,
    borderRadius: 12,
    overflow: 'hidden',
    position: 'relative',
    backgroundColor: '#F3F4F6',
  },
  image: {
    width: '100%',
    height: '100%',
    resizeMode: 'cover',
  },
  primaryBadge: {
    position: 'absolute',
    bottom: 0,
    left: 0,
    right: 0,
    backgroundColor: 'rgba(245, 158, 11, 0.9)',
    paddingVertical: 4,
    alignItems: 'center',
  },
  primaryText: {
    fontSize: 10,
    fontWeight: '600',
    color: '#fff',
  },
  uploadOverlay: {
    ...StyleSheet.absoluteFillObject,
    backgroundColor: 'rgba(0, 0, 0, 0.6)',
    justifyContent: 'center',
    alignItems: 'center',
  },
  progressText: {
    color: '#fff',
    fontSize: 12,
    marginTop: 4,
  },
  errorOverlay: {
    ...StyleSheet.absoluteFillObject,
    backgroundColor: 'rgba(239, 68, 68, 0.8)',
    justifyContent: 'center',
    alignItems: 'center',
  },
  errorText: {
    color: '#fff',
    fontSize: 10,
    marginTop: 4,
  },
  removeButton: {
    position: 'absolute',
    top: 4,
    right: 4,
    width: 24,
    height: 24,
    borderRadius: 12,
    backgroundColor: 'rgba(0, 0, 0, 0.6)',
    justifyContent: 'center',
    alignItems: 'center',
  },
  primaryButton: {
    position: 'absolute',
    top: 4,
    left: 4,
    width: 24,
    height: 24,
    borderRadius: 12,
    backgroundColor: '#fff',
    justifyContent: 'center',
    alignItems: 'center',
  },
  addButton: {
    width: 100,
    height: 100,
    borderRadius: 12,
    borderWidth: 2,
    borderColor: '#E5E7EB',
    borderStyle: 'dashed',
    justifyContent: 'center',
    alignItems: 'center',
    backgroundColor: '#F9FAFB',
  },
  addText: {
    fontSize: 12,
    color: '#6B7280',
    marginTop: 4,
  },
  countText: {
    fontSize: 10,
    color: '#9CA3AF',
    marginTop: 2,
  },
  errorMessage: {
    color: '#EF4444',
    fontSize: 12,
    marginTop: 8,
    paddingHorizontal: 4,
  },
});

// =====================================================
// SINGLE IMAGE UPLOADER
// =====================================================
interface SingleImageUploaderProps {
  image: UploadedImage | null;
  onChange: (image: UploadedImage | null) => void;
  businessId?: string;
  type?: 'logo' | 'cover';
  placeholder?: string;
  shape?: 'square' | 'circle' | 'banner';
}

export function SingleImageUploader({
  image,
  onChange,
  businessId,
  type = 'logo',
  placeholder = 'Add Photo',
  shape = 'square',
}: SingleImageUploaderProps) {
  const [isUploading, setIsUploading] = useState(false);
  const [uploadProgress, setUploadProgress] = useState(0);

  const { pickFromGallery, pickFromCamera, isLoading } = useImagePicker({
    maxImages: 1,
  });

  const handlePick = () => {
    showImagePickerActionSheet(
      async () => {
        const selected = await pickFromGallery();
        if (selected.length > 0) {
          handleImageSelected(selected[0]);
        }
      },
      async () => {
        const selected = await pickFromCamera();
        if (selected) {
          handleImageSelected(selected);
        }
      },
    );
  };

  const handleImageSelected = async (selectedImage: ImageAsset) => {
    onChange({ localUri: selectedImage.uri, isUploading: true });

    if (businessId) {
      setIsUploading(true);
      try {
        const result = await imageUploadService.uploadImage(selectedImage, {
          businessId,
          type,
          onProgress: (progress) => setUploadProgress(progress.percent),
        });

        onChange({
          id: result.id,
          remoteUrl: result.url,
          thumbnailUrl: result.thumbnailUrl,
          isUploading: false,
        });
      } catch (error: any) {
        onChange({ localUri: selectedImage.uri, error: error.message });
      } finally {
        setIsUploading(false);
        setUploadProgress(0);
      }
    } else {
      onChange({ localUri: selectedImage.uri });
    }
  };

  const shapeStyles = {
    square: { width: 120, height: 120, borderRadius: 12 },
    circle: { width: 120, height: 120, borderRadius: 60 },
    banner: { width: '100%' as const, height: 160, borderRadius: 12 },
  };

  return (
    <TouchableOpacity
      style={[styles.singleContainer, shapeStyles[shape]]}
      onPress={handlePick}
      disabled={isLoading || isUploading}
    >
      {image?.remoteUrl || image?.localUri ? (
        <Image
          source={{ uri: image.thumbnailUrl || image.remoteUrl || image.localUri }}
          style={[styles.singleImage, shapeStyles[shape]]}
        />
      ) : (
        <View style={styles.singlePlaceholder}>
          <Icon name="camera" size={32} color="#9CA3AF" />
          <Text style={styles.placeholderText}>{placeholder}</Text>
        </View>
      )}

      {(isUploading || image?.isUploading) && (
        <View style={styles.singleOverlay}>
          <ActivityIndicator color="#fff" />
          <Text style={styles.progressText}>{uploadProgress}%</Text>
        </View>
      )}

      {image?.error && (
        <View style={[styles.singleOverlay, styles.errorBg]}>
          <Icon name="alert-circle" size={24} color="#fff" />
          <Text style={styles.errorText}>Upload failed</Text>
        </View>
      )}

      {(image?.remoteUrl || image?.localUri) && !isUploading && !image?.error && (
        <View style={styles.editBadge}>
          <Icon name="edit-2" size={14} color="#fff" />
        </View>
      )}
    </TouchableOpacity>
  );
}

// Additional styles for SingleImageUploader
Object.assign(styles, StyleSheet.create({
  singleContainer: {
    overflow: 'hidden',
    backgroundColor: '#F3F4F6',
    justifyContent: 'center',
    alignItems: 'center',
    position: 'relative',
  },
  singleImage: {
    resizeMode: 'cover',
  },
  singlePlaceholder: {
    alignItems: 'center',
  },
  placeholderText: {
    fontSize: 12,
    color: '#9CA3AF',
    marginTop: 8,
  },
  singleOverlay: {
    ...StyleSheet.absoluteFillObject,
    backgroundColor: 'rgba(0, 0, 0, 0.6)',
    justifyContent: 'center',
    alignItems: 'center',
  },
  errorBg: {
    backgroundColor: 'rgba(239, 68, 68, 0.8)',
  },
  editBadge: {
    position: 'absolute',
    bottom: 8,
    right: 8,
    width: 32,
    height: 32,
    borderRadius: 16,
    backgroundColor: 'rgba(0, 0, 0, 0.6)',
    justifyContent: 'center',
    alignItems: 'center',
  },
}));
