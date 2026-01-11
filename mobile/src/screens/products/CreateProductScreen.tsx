import React, { useState, useEffect } from 'react';
import {
  View,
  Text,
  TextInput,
  TouchableOpacity,
  ScrollView,
  StyleSheet,
  Alert,
  Switch,
  KeyboardAvoidingView,
  Platform,
} from 'react-native';
import { useNavigation, useRoute } from '@react-navigation/native';
import Icon from 'react-native-vector-icons/Feather';
import { useProductStore } from '../../store/productStore';
import ImageUploader, { UploadedImage } from '../../components/ImageUploader';

export default function CreateProductScreen() {
  const navigation = useNavigation<any>();
  const route = useRoute<any>();
  const { businessId, productId } = route.params || {};
  const isEditing = !!productId;

  const {
    selectedProduct,
    categories,
    isLoading,
    createProduct,
    updateProduct,
    getProduct,
  } = useProductStore();

  // Form state
  const [name, setName] = useState('');
  const [description, setDescription] = useState('');
  const [shortDescription, setShortDescription] = useState('');
  const [price, setPrice] = useState('');
  const [compareAtPrice, setCompareAtPrice] = useState('');
  const [costPrice, setCostPrice] = useState('');
  const [sku, setSku] = useState('');
  const [quantity, setQuantity] = useState('0');
  const [categoryId, setCategoryId] = useState<string | null>(null);
  const [trackInventory, setTrackInventory] = useState(true);
  const [isFeatured, setIsFeatured] = useState(false);
  const [status, setStatus] = useState<'draft' | 'active'>('draft');
  const [images, setImages] = useState<UploadedImage[]>([]);
  const [tags, setTags] = useState<string[]>([]);
  const [tagInput, setTagInput] = useState('');

  // Load product for editing
  useEffect(() => {
    if (isEditing && productId) {
      getProduct(productId).then((product) => {
        if (product) {
          setName(product.name);
          setDescription(product.description || '');
          setShortDescription(product.shortDescription || '');
          setPrice(product.price.toString());
          setCompareAtPrice(product.compareAtPrice?.toString() || '');
          setCostPrice(product.costPrice?.toString() || '');
          setSku(product.sku || '');
          setQuantity(product.quantity.toString());
          setCategoryId(product.categoryId || null);
          setTrackInventory(product.trackInventory !== false);
          setIsFeatured(product.isFeatured);
          setStatus(product.status as 'draft' | 'active');
          setImages(
            product.images?.map((img: any) => ({
              id: img.id,
              remoteUrl: img.url,
              thumbnailUrl: img.thumbnailUrl || img.url,
            })) || [],
          );
          setTags(product.tags || []);
        }
      });
    }
  }, [productId]);

  // Add tag
  const addTag = () => {
    if (tagInput.trim() && !tags.includes(tagInput.trim().toLowerCase())) {
      setTags([...tags, tagInput.trim().toLowerCase()]);
      setTagInput('');
    }
  };

  // Remove tag
  const removeTag = (tag: string) => {
    setTags(tags.filter((t) => t !== tag));
  };

  // Submit
  const handleSubmit = async () => {
    // Validation
    if (!name.trim()) {
      Alert.alert('Error', 'Product name is required');
      return;
    }

    if (!price || parseFloat(price) <= 0) {
      Alert.alert('Error', 'Please enter a valid price');
      return;
    }

    const productData = {
      name: name.trim(),
      description: description.trim() || undefined,
      shortDescription: shortDescription.trim() || undefined,
      price: parseFloat(price),
      compareAtPrice: compareAtPrice ? parseFloat(compareAtPrice) : undefined,
      costPrice: costPrice ? parseFloat(costPrice) : undefined,
      sku: sku.trim() || undefined,
      quantity: parseInt(quantity, 10) || 0,
      categoryId: categoryId || undefined,
      trackInventory,
      isFeatured,
      status,
      images: images
        .filter((img) => img.remoteUrl)
        .map((img, index) => ({
          url: img.remoteUrl!,
          thumbnailUrl: img.thumbnailUrl,
          isPrimary: index === 0,
        })),
      tags,
    };

    try {
      if (isEditing) {
        await updateProduct(productId, productData);
        Alert.alert('Success', 'Product updated!');
      } else {
        await createProduct(productData);
        Alert.alert('Success', 'Product created!');
      }
      navigation.goBack();
    } catch (error: any) {
      Alert.alert('Error', error.message || 'Failed to save product');
    }
  };

  return (
    <KeyboardAvoidingView
      style={styles.container}
      behavior={Platform.OS === 'ios' ? 'padding' : undefined}
    >
      <ScrollView style={styles.scrollView} showsVerticalScrollIndicator={false}>
        {/* Images */}
        <View style={styles.section}>
          <Text style={styles.sectionTitle}>Images</Text>
          <ImageUploader
            images={images}
            onChange={setImages}
            maxImages={10}
            businessId={businessId}
            productId={isEditing ? productId : undefined}
            autoUpload={!!businessId}
            showPrimaryBadge
            onUploadComplete={(result, index) => {
              console.log('Upload complete:', result, index);
            }}
            onUploadError={(error, index) => {
              Alert.alert('Upload Error', error);
            }}
          />
        </View>

        {/* Basic Info */}
        <View style={styles.section}>
          <Text style={styles.sectionTitle}>Basic Information</Text>

          <View style={styles.inputGroup}>
            <Text style={styles.label}>Product Name *</Text>
            <TextInput
              style={styles.input}
              placeholder="e.g., iPhone 15 Pro Max"
              placeholderTextColor="#9CA3AF"
              value={name}
              onChangeText={setName}
            />
          </View>

          <View style={styles.inputGroup}>
            <Text style={styles.label}>Short Description</Text>
            <TextInput
              style={styles.input}
              placeholder="Brief description for listings"
              placeholderTextColor="#9CA3AF"
              value={shortDescription}
              onChangeText={setShortDescription}
              maxLength={500}
            />
          </View>

          <View style={styles.inputGroup}>
            <Text style={styles.label}>Full Description</Text>
            <TextInput
              style={[styles.input, styles.textArea]}
              placeholder="Detailed product description..."
              placeholderTextColor="#9CA3AF"
              value={description}
              onChangeText={setDescription}
              multiline
              numberOfLines={4}
            />
          </View>
        </View>

        {/* Pricing */}
        <View style={styles.section}>
          <Text style={styles.sectionTitle}>Pricing</Text>

          <View style={styles.row}>
            <View style={[styles.inputGroup, styles.flex1]}>
              <Text style={styles.label}>Price (KES) *</Text>
              <TextInput
                style={styles.input}
                placeholder="0"
                placeholderTextColor="#9CA3AF"
                value={price}
                onChangeText={setPrice}
                keyboardType="numeric"
              />
            </View>

            <View style={[styles.inputGroup, styles.flex1]}>
              <Text style={styles.label}>Compare at Price</Text>
              <TextInput
                style={styles.input}
                placeholder="Original price"
                placeholderTextColor="#9CA3AF"
                value={compareAtPrice}
                onChangeText={setCompareAtPrice}
                keyboardType="numeric"
              />
            </View>
          </View>

          <View style={styles.inputGroup}>
            <Text style={styles.label}>Cost Price (for profit tracking)</Text>
            <TextInput
              style={styles.input}
              placeholder="Your cost"
              placeholderTextColor="#9CA3AF"
              value={costPrice}
              onChangeText={setCostPrice}
              keyboardType="numeric"
            />
          </View>
        </View>

        {/* Inventory */}
        <View style={styles.section}>
          <Text style={styles.sectionTitle}>Inventory</Text>

          <View style={styles.switchRow}>
            <Text style={styles.label}>Track Inventory</Text>
            <Switch
              value={trackInventory}
              onValueChange={setTrackInventory}
              trackColor={{ false: '#D1D5DB', true: '#FCD34D' }}
              thumbColor={trackInventory ? '#F59E0B' : '#9CA3AF'}
            />
          </View>

          <View style={styles.row}>
            <View style={[styles.inputGroup, styles.flex1]}>
              <Text style={styles.label}>SKU</Text>
              <TextInput
                style={styles.input}
                placeholder="Stock keeping unit"
                placeholderTextColor="#9CA3AF"
                value={sku}
                onChangeText={setSku}
              />
            </View>

            <View style={[styles.inputGroup, styles.flex1]}>
              <Text style={styles.label}>Quantity</Text>
              <TextInput
                style={styles.input}
                placeholder="0"
                placeholderTextColor="#9CA3AF"
                value={quantity}
                onChangeText={setQuantity}
                keyboardType="numeric"
              />
            </View>
          </View>
        </View>

        {/* Category */}
        <View style={styles.section}>
          <Text style={styles.sectionTitle}>Category</Text>
          <ScrollView horizontal showsHorizontalScrollIndicator={false}>
            <TouchableOpacity
              style={[
                styles.categoryChip,
                !categoryId && styles.categoryChipActive,
              ]}
              onPress={() => setCategoryId(null)}
            >
              <Text
                style={[
                  styles.categoryChipText,
                  !categoryId && styles.categoryChipTextActive,
                ]}
              >
                None
              </Text>
            </TouchableOpacity>
            {categories.map((cat) => (
              <TouchableOpacity
                key={cat.id}
                style={[
                  styles.categoryChip,
                  categoryId === cat.id && styles.categoryChipActive,
                ]}
                onPress={() => setCategoryId(cat.id)}
              >
                <Text
                  style={[
                    styles.categoryChipText,
                    categoryId === cat.id && styles.categoryChipTextActive,
                  ]}
                >
                  {cat.name}
                </Text>
              </TouchableOpacity>
            ))}
          </ScrollView>
        </View>

        {/* Tags */}
        <View style={styles.section}>
          <Text style={styles.sectionTitle}>Tags</Text>
          <View style={styles.tagsContainer}>
            {tags.map((tag) => (
              <View key={tag} style={styles.tag}>
                <Text style={styles.tagText}>{tag}</Text>
                <TouchableOpacity onPress={() => removeTag(tag)}>
                  <Icon name="x" size={14} color="#6B7280" />
                </TouchableOpacity>
              </View>
            ))}
          </View>
          <View style={styles.tagInputRow}>
            <TextInput
              style={[styles.input, styles.flex1]}
              placeholder="Add a tag..."
              placeholderTextColor="#9CA3AF"
              value={tagInput}
              onChangeText={setTagInput}
              onSubmitEditing={addTag}
            />
            <TouchableOpacity style={styles.addTagBtn} onPress={addTag}>
              <Icon name="plus" size={20} color="#F59E0B" />
            </TouchableOpacity>
          </View>
        </View>

        {/* Status */}
        <View style={styles.section}>
          <Text style={styles.sectionTitle}>Status</Text>

          <View style={styles.switchRow}>
            <Text style={styles.label}>Featured Product</Text>
            <Switch
              value={isFeatured}
              onValueChange={setIsFeatured}
              trackColor={{ false: '#D1D5DB', true: '#FCD34D' }}
              thumbColor={isFeatured ? '#F59E0B' : '#9CA3AF'}
            />
          </View>

          <View style={styles.statusRow}>
            <TouchableOpacity
              style={[
                styles.statusBtn,
                status === 'draft' && styles.statusBtnActive,
              ]}
              onPress={() => setStatus('draft')}
            >
              <Icon
                name="edit-3"
                size={18}
                color={status === 'draft' ? '#F59E0B' : '#9CA3AF'}
              />
              <Text
                style={[
                  styles.statusBtnText,
                  status === 'draft' && styles.statusBtnTextActive,
                ]}
              >
                Draft
              </Text>
            </TouchableOpacity>

            <TouchableOpacity
              style={[
                styles.statusBtn,
                status === 'active' && styles.statusBtnActive,
              ]}
              onPress={() => setStatus('active')}
            >
              <Icon
                name="check-circle"
                size={18}
                color={status === 'active' ? '#F59E0B' : '#9CA3AF'}
              />
              <Text
                style={[
                  styles.statusBtnText,
                  status === 'active' && styles.statusBtnTextActive,
                ]}
              >
                Active
              </Text>
            </TouchableOpacity>
          </View>
        </View>

        {/* Spacer for button */}
        <View style={{ height: 100 }} />
      </ScrollView>

      {/* Submit Button */}
      <View style={styles.buttonContainer}>
        <TouchableOpacity
          style={styles.submitButton}
          onPress={handleSubmit}
          disabled={isLoading}
        >
          <Text style={styles.submitButtonText}>
            {isLoading ? 'Saving...' : isEditing ? 'Update Product' : 'Create Product'}
          </Text>
        </TouchableOpacity>
      </View>
    </KeyboardAvoidingView>
  );
}

const styles = StyleSheet.create({
  container: {
    flex: 1,
    backgroundColor: '#F9FAFB',
  },
  scrollView: {
    flex: 1,
  },
  section: {
    backgroundColor: '#fff',
    marginBottom: 8,
    padding: 16,
  },
  sectionTitle: {
    fontSize: 16,
    fontWeight: '700',
    color: '#111827',
    marginBottom: 16,
  },
  inputGroup: {
    marginBottom: 16,
  },
  label: {
    fontSize: 14,
    fontWeight: '600',
    color: '#374151',
    marginBottom: 8,
  },
  input: {
    borderWidth: 1,
    borderColor: '#E5E7EB',
    borderRadius: 12,
    padding: 14,
    fontSize: 16,
    color: '#111827',
    backgroundColor: '#F9FAFB',
  },
  textArea: {
    height: 100,
    textAlignVertical: 'top',
  },
  row: {
    flexDirection: 'row',
    gap: 12,
  },
  flex1: {
    flex: 1,
  },
  switchRow: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    marginBottom: 16,
  },
  imagesContainer: {
    flexDirection: 'row',
    gap: 12,
  },
  imageWrapper: {
    width: 100,
    height: 100,
    borderRadius: 12,
    overflow: 'hidden',
    position: 'relative',
  },
  productImage: {
    width: '100%',
    height: '100%',
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
  removeImageBtn: {
    position: 'absolute',
    top: 4,
    right: 4,
    backgroundColor: 'rgba(0, 0, 0, 0.5)',
    borderRadius: 12,
    padding: 4,
  },
  addImageBtn: {
    width: 100,
    height: 100,
    borderRadius: 12,
    borderWidth: 2,
    borderColor: '#E5E7EB',
    borderStyle: 'dashed',
    justifyContent: 'center',
    alignItems: 'center',
  },
  addImageText: {
    fontSize: 12,
    color: '#9CA3AF',
    marginTop: 4,
  },
  categoryChip: {
    paddingHorizontal: 16,
    paddingVertical: 10,
    backgroundColor: '#F3F4F6',
    borderRadius: 20,
    marginRight: 8,
  },
  categoryChipActive: {
    backgroundColor: '#F59E0B',
  },
  categoryChipText: {
    fontSize: 14,
    color: '#6B7280',
  },
  categoryChipTextActive: {
    color: '#fff',
    fontWeight: '600',
  },
  tagsContainer: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    gap: 8,
    marginBottom: 12,
  },
  tag: {
    flexDirection: 'row',
    alignItems: 'center',
    backgroundColor: '#F3F4F6',
    paddingHorizontal: 12,
    paddingVertical: 6,
    borderRadius: 16,
    gap: 6,
  },
  tagText: {
    fontSize: 14,
    color: '#374151',
  },
  tagInputRow: {
    flexDirection: 'row',
    gap: 8,
  },
  addTagBtn: {
    width: 48,
    height: 48,
    justifyContent: 'center',
    alignItems: 'center',
    backgroundColor: '#FEF3C7',
    borderRadius: 12,
  },
  statusRow: {
    flexDirection: 'row',
    gap: 12,
  },
  statusBtn: {
    flex: 1,
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    gap: 8,
    paddingVertical: 14,
    borderRadius: 12,
    borderWidth: 1,
    borderColor: '#E5E7EB',
    backgroundColor: '#F9FAFB',
  },
  statusBtnActive: {
    borderColor: '#F59E0B',
    backgroundColor: '#FEF3C7',
  },
  statusBtnText: {
    fontSize: 14,
    color: '#9CA3AF',
  },
  statusBtnTextActive: {
    color: '#F59E0B',
    fontWeight: '600',
  },
  buttonContainer: {
    position: 'absolute',
    bottom: 0,
    left: 0,
    right: 0,
    padding: 16,
    backgroundColor: '#fff',
    borderTopWidth: 1,
    borderTopColor: '#E5E7EB',
  },
  submitButton: {
    backgroundColor: '#F59E0B',
    borderRadius: 12,
    paddingVertical: 16,
    alignItems: 'center',
  },
  submitButtonText: {
    fontSize: 16,
    fontWeight: '700',
    color: '#fff',
  },
});
