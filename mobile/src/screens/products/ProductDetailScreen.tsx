import React, { useEffect, useState } from 'react';
import {
  View,
  Text,
  ScrollView,
  Image,
  TouchableOpacity,
  StyleSheet,
  Alert,
  Share,
  Dimensions,
} from 'react-native';
import { useNavigation, useRoute } from '@react-navigation/native';
import Icon from 'react-native-vector-icons/Feather';
import { useProductStore } from '../../store/productStore';

const { width } = Dimensions.get('window');

export default function ProductDetailScreen() {
  const navigation = useNavigation<any>();
  const route = useRoute<any>();
  const { productId, businessId } = route.params;

  const {
    selectedProduct: product,
    isLoading,
    getProduct,
    deleteProduct,
    updateInventory,
  } = useProductStore();

  const [currentImageIndex, setCurrentImageIndex] = useState(0);
  const [showInventoryModal, setShowInventoryModal] = useState(false);

  useEffect(() => {
    getProduct(productId);
  }, [productId]);

  // Share product
  const handleShare = async () => {
    if (!product) return;
    try {
      await Share.share({
        message: `Check out ${product.name} - ${product.currency} ${product.price.toLocaleString()}\n\nhttps://hive.co.ke/p/${product.slug}`,
        title: product.name,
      });
    } catch (error) {
      console.error('Share failed:', error);
    }
  };

  // Delete product
  const handleDelete = () => {
    Alert.alert(
      'Delete Product',
      'Are you sure you want to delete this product? This action cannot be undone.',
      [
        { text: 'Cancel', style: 'cancel' },
        {
          text: 'Delete',
          style: 'destructive',
          onPress: async () => {
            await deleteProduct(productId);
            navigation.goBack();
          },
        },
      ],
    );
  };

  // Quick inventory adjustment
  const handleQuickInventory = (action: 'add' | 'subtract') => {
    Alert.prompt(
      action === 'add' ? 'Add Stock' : 'Remove Stock',
      'Enter quantity:',
      async (value) => {
        const qty = parseInt(value, 10);
        if (qty > 0) {
          await updateInventory(productId, action, qty);
          getProduct(productId); // Refresh
        }
      },
      'plain-text',
      '',
      'numeric',
    );
  };

  if (isLoading || !product) {
    return (
      <View style={styles.loadingContainer}>
        <Text>Loading...</Text>
      </View>
    );
  }

  const images = product.images || [];
  const hasDiscount = product.compareAtPrice && product.compareAtPrice > product.price;
  const discountPercent = hasDiscount
    ? Math.round((1 - product.price / product.compareAtPrice!) * 100)
    : 0;
  const profit = product.costPrice
    ? product.price - product.costPrice
    : null;
  const profitMargin = profit && product.costPrice
    ? Math.round((profit / product.price) * 100)
    : null;

  return (
    <View style={styles.container}>
      <ScrollView showsVerticalScrollIndicator={false}>
        {/* Image Gallery */}
        <View style={styles.imageContainer}>
          {images.length > 0 ? (
            <>
              <ScrollView
                horizontal
                pagingEnabled
                showsHorizontalScrollIndicator={false}
                onMomentumScrollEnd={(e) => {
                  const index = Math.round(e.nativeEvent.contentOffset.x / width);
                  setCurrentImageIndex(index);
                }}
              >
                {images.map((img, index) => (
                  <Image
                    key={index}
                    source={{ uri: img.url }}
                    style={styles.productImage}
                  />
                ))}
              </ScrollView>
              {images.length > 1 && (
                <View style={styles.pagination}>
                  {images.map((_, index) => (
                    <View
                      key={index}
                      style={[
                        styles.paginationDot,
                        currentImageIndex === index && styles.paginationDotActive,
                      ]}
                    />
                  ))}
                </View>
              )}
            </>
          ) : (
            <View style={styles.placeholderImage}>
              <Icon name="image" size={64} color="#D1D5DB" />
            </View>
          )}

          {/* Badges */}
          <View style={styles.badgesContainer}>
            {product.isFeatured && (
              <View style={styles.featuredBadge}>
                <Icon name="star" size={12} color="#fff" />
                <Text style={styles.badgeText}>Featured</Text>
              </View>
            )}
            {hasDiscount && (
              <View style={styles.discountBadge}>
                <Text style={styles.badgeText}>-{discountPercent}%</Text>
              </View>
            )}
            {product._pendingSync && (
              <View style={styles.syncBadge}>
                <Icon name="refresh-cw" size={12} color="#fff" />
                <Text style={styles.badgeText}>Pending Sync</Text>
              </View>
            )}
          </View>
        </View>

        {/* Product Info */}
        <View style={styles.infoSection}>
          {/* Status & Category */}
          <View style={styles.metaRow}>
            <View
              style={[
                styles.statusBadge,
                product.status === 'active' && styles.activeBadge,
                product.status === 'draft' && styles.draftBadge,
                product.status === 'out_of_stock' && styles.outOfStockBadge,
              ]}
            >
              <Text style={styles.statusText}>{product.status}</Text>
            </View>
            {product.categoryId && (
              <Text style={styles.categoryText}>
                {/* Would show category name */}
                Category
              </Text>
            )}
          </View>

          {/* Name */}
          <Text style={styles.productName}>{product.name}</Text>

          {/* Price */}
          <View style={styles.priceContainer}>
            <Text style={styles.price}>
              {product.currency} {product.price.toLocaleString()}
            </Text>
            {hasDiscount && (
              <Text style={styles.comparePrice}>
                {product.currency} {product.compareAtPrice?.toLocaleString()}
              </Text>
            )}
          </View>

          {/* SKU */}
          {product.sku && (
            <Text style={styles.sku}>SKU: {product.sku}</Text>
          )}
        </View>

        {/* Inventory Card */}
        <View style={styles.inventoryCard}>
          <View style={styles.inventoryHeader}>
            <Text style={styles.cardTitle}>Inventory</Text>
            <View style={styles.inventoryActions}>
              <TouchableOpacity
                style={styles.inventoryBtn}
                onPress={() => handleQuickInventory('subtract')}
              >
                <Icon name="minus" size={20} color="#EF4444" />
              </TouchableOpacity>
              <TouchableOpacity
                style={styles.inventoryBtn}
                onPress={() => handleQuickInventory('add')}
              >
                <Icon name="plus" size={20} color="#10B981" />
              </TouchableOpacity>
            </View>
          </View>

          <View style={styles.inventoryStats}>
            <View style={styles.inventoryStat}>
              <Text style={styles.inventoryNumber}>{product.quantity}</Text>
              <Text style={styles.inventoryLabel}>In Stock</Text>
            </View>
            <View style={styles.inventoryDivider} />
            <View style={styles.inventoryStat}>
              <Text style={styles.inventoryNumber}>{product.lowStockThreshold || 5}</Text>
              <Text style={styles.inventoryLabel}>Low Stock Alert</Text>
            </View>
          </View>

          {product.quantity <= (product.lowStockThreshold || 5) && (
            <View style={styles.lowStockWarning}>
              <Icon name="alert-triangle" size={16} color="#F59E0B" />
              <Text style={styles.lowStockText}>
                {product.quantity === 0 ? 'Out of stock!' : 'Low stock - reorder soon'}
              </Text>
            </View>
          )}
        </View>

        {/* Profit Card */}
        {(profit !== null || product.costPrice) && (
          <View style={styles.profitCard}>
            <Text style={styles.cardTitle}>Profit Analysis</Text>
            <View style={styles.profitStats}>
              <View style={styles.profitStat}>
                <Text style={styles.profitLabel}>Cost</Text>
                <Text style={styles.profitValue}>
                  {product.currency} {product.costPrice?.toLocaleString() || '-'}
                </Text>
              </View>
              <View style={styles.profitStat}>
                <Text style={styles.profitLabel}>Profit/Unit</Text>
                <Text style={[styles.profitValue, styles.profitPositive]}>
                  {product.currency} {profit?.toLocaleString() || '-'}
                </Text>
              </View>
              <View style={styles.profitStat}>
                <Text style={styles.profitLabel}>Margin</Text>
                <Text style={[styles.profitValue, styles.profitPositive]}>
                  {profitMargin ? `${profitMargin}%` : '-'}
                </Text>
              </View>
            </View>
          </View>
        )}

        {/* Description */}
        {product.description && (
          <View style={styles.descriptionCard}>
            <Text style={styles.cardTitle}>Description</Text>
            <Text style={styles.description}>{product.description}</Text>
          </View>
        )}

        {/* Tags */}
        {product.tags && product.tags.length > 0 && (
          <View style={styles.tagsCard}>
            <Text style={styles.cardTitle}>Tags</Text>
            <View style={styles.tagsContainer}>
              {product.tags.map((tag) => (
                <View key={tag} style={styles.tag}>
                  <Text style={styles.tagText}>{tag}</Text>
                </View>
              ))}
            </View>
          </View>
        )}

        {/* Stats */}
        <View style={styles.statsCard}>
          <Text style={styles.cardTitle}>Performance</Text>
          <View style={styles.statsRow}>
            <View style={styles.stat}>
              <Icon name="eye" size={20} color="#6B7280" />
              <Text style={styles.statNumber}>{product.viewCount || 0}</Text>
              <Text style={styles.statLabel}>Views</Text>
            </View>
            <View style={styles.stat}>
              <Icon name="shopping-bag" size={20} color="#6B7280" />
              <Text style={styles.statNumber}>{product.orderCount || 0}</Text>
              <Text style={styles.statLabel}>Orders</Text>
            </View>
            <View style={styles.stat}>
              <Icon name="percent" size={20} color="#6B7280" />
              <Text style={styles.statNumber}>
                {product.viewCount
                  ? ((product.orderCount || 0) / product.viewCount * 100).toFixed(1)
                  : 0}%
              </Text>
              <Text style={styles.statLabel}>Conversion</Text>
            </View>
          </View>
        </View>

        {/* Spacer */}
        <View style={{ height: 100 }} />
      </ScrollView>

      {/* Bottom Actions */}
      <View style={styles.bottomActions}>
        <TouchableOpacity style={styles.actionBtn} onPress={handleShare}>
          <Icon name="share-2" size={20} color="#6B7280" />
        </TouchableOpacity>

        <TouchableOpacity style={styles.actionBtn} onPress={handleDelete}>
          <Icon name="trash-2" size={20} color="#EF4444" />
        </TouchableOpacity>

        <TouchableOpacity
          style={styles.editButton}
          onPress={() =>
            navigation.navigate('CreateProduct', { businessId, productId })
          }
        >
          <Icon name="edit-2" size={20} color="#fff" />
          <Text style={styles.editButtonText}>Edit Product</Text>
        </TouchableOpacity>
      </View>
    </View>
  );
}

const styles = StyleSheet.create({
  container: {
    flex: 1,
    backgroundColor: '#F9FAFB',
  },
  loadingContainer: {
    flex: 1,
    justifyContent: 'center',
    alignItems: 'center',
  },
  imageContainer: {
    width: '100%',
    height: width,
    backgroundColor: '#fff',
    position: 'relative',
  },
  productImage: {
    width,
    height: width,
    resizeMode: 'cover',
  },
  placeholderImage: {
    width: '100%',
    height: '100%',
    justifyContent: 'center',
    alignItems: 'center',
    backgroundColor: '#F3F4F6',
  },
  pagination: {
    position: 'absolute',
    bottom: 16,
    left: 0,
    right: 0,
    flexDirection: 'row',
    justifyContent: 'center',
    gap: 8,
  },
  paginationDot: {
    width: 8,
    height: 8,
    borderRadius: 4,
    backgroundColor: 'rgba(255, 255, 255, 0.5)',
  },
  paginationDotActive: {
    backgroundColor: '#fff',
    width: 24,
  },
  badgesContainer: {
    position: 'absolute',
    top: 16,
    left: 16,
    flexDirection: 'row',
    gap: 8,
  },
  featuredBadge: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 4,
    backgroundColor: '#F59E0B',
    paddingHorizontal: 10,
    paddingVertical: 6,
    borderRadius: 16,
  },
  discountBadge: {
    backgroundColor: '#EF4444',
    paddingHorizontal: 10,
    paddingVertical: 6,
    borderRadius: 16,
  },
  syncBadge: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 4,
    backgroundColor: '#6B7280',
    paddingHorizontal: 10,
    paddingVertical: 6,
    borderRadius: 16,
  },
  badgeText: {
    fontSize: 12,
    fontWeight: '600',
    color: '#fff',
  },
  infoSection: {
    backgroundColor: '#fff',
    padding: 16,
    borderBottomWidth: 1,
    borderBottomColor: '#E5E7EB',
  },
  metaRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 12,
    marginBottom: 8,
  },
  statusBadge: {
    paddingHorizontal: 10,
    paddingVertical: 4,
    borderRadius: 12,
  },
  activeBadge: {
    backgroundColor: '#D1FAE5',
  },
  draftBadge: {
    backgroundColor: '#F3F4F6',
  },
  outOfStockBadge: {
    backgroundColor: '#FEE2E2',
  },
  statusText: {
    fontSize: 12,
    fontWeight: '600',
    color: '#374151',
    textTransform: 'capitalize',
  },
  categoryText: {
    fontSize: 12,
    color: '#6B7280',
  },
  productName: {
    fontSize: 24,
    fontWeight: '700',
    color: '#111827',
    marginBottom: 8,
  },
  priceContainer: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 12,
  },
  price: {
    fontSize: 28,
    fontWeight: '700',
    color: '#F59E0B',
  },
  comparePrice: {
    fontSize: 18,
    color: '#9CA3AF',
    textDecorationLine: 'line-through',
  },
  sku: {
    fontSize: 12,
    color: '#9CA3AF',
    marginTop: 8,
  },
  inventoryCard: {
    backgroundColor: '#fff',
    margin: 16,
    marginBottom: 8,
    padding: 16,
    borderRadius: 16,
  },
  inventoryHeader: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    marginBottom: 16,
  },
  cardTitle: {
    fontSize: 16,
    fontWeight: '700',
    color: '#111827',
  },
  inventoryActions: {
    flexDirection: 'row',
    gap: 8,
  },
  inventoryBtn: {
    width: 40,
    height: 40,
    borderRadius: 20,
    backgroundColor: '#F3F4F6',
    justifyContent: 'center',
    alignItems: 'center',
  },
  inventoryStats: {
    flexDirection: 'row',
    alignItems: 'center',
  },
  inventoryStat: {
    flex: 1,
    alignItems: 'center',
  },
  inventoryNumber: {
    fontSize: 32,
    fontWeight: '700',
    color: '#111827',
  },
  inventoryLabel: {
    fontSize: 12,
    color: '#6B7280',
    marginTop: 4,
  },
  inventoryDivider: {
    width: 1,
    height: 40,
    backgroundColor: '#E5E7EB',
  },
  lowStockWarning: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 8,
    marginTop: 16,
    padding: 12,
    backgroundColor: '#FEF3C7',
    borderRadius: 12,
  },
  lowStockText: {
    fontSize: 14,
    color: '#92400E',
  },
  profitCard: {
    backgroundColor: '#fff',
    marginHorizontal: 16,
    marginBottom: 8,
    padding: 16,
    borderRadius: 16,
  },
  profitStats: {
    flexDirection: 'row',
    marginTop: 12,
  },
  profitStat: {
    flex: 1,
    alignItems: 'center',
  },
  profitLabel: {
    fontSize: 12,
    color: '#6B7280',
    marginBottom: 4,
  },
  profitValue: {
    fontSize: 16,
    fontWeight: '600',
    color: '#111827',
  },
  profitPositive: {
    color: '#10B981',
  },
  descriptionCard: {
    backgroundColor: '#fff',
    marginHorizontal: 16,
    marginBottom: 8,
    padding: 16,
    borderRadius: 16,
  },
  description: {
    fontSize: 14,
    color: '#374151',
    lineHeight: 22,
    marginTop: 12,
  },
  tagsCard: {
    backgroundColor: '#fff',
    marginHorizontal: 16,
    marginBottom: 8,
    padding: 16,
    borderRadius: 16,
  },
  tagsContainer: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    gap: 8,
    marginTop: 12,
  },
  tag: {
    backgroundColor: '#F3F4F6',
    paddingHorizontal: 12,
    paddingVertical: 6,
    borderRadius: 16,
  },
  tagText: {
    fontSize: 14,
    color: '#374151',
  },
  statsCard: {
    backgroundColor: '#fff',
    marginHorizontal: 16,
    marginBottom: 8,
    padding: 16,
    borderRadius: 16,
  },
  statsRow: {
    flexDirection: 'row',
    marginTop: 16,
  },
  stat: {
    flex: 1,
    alignItems: 'center',
  },
  statNumber: {
    fontSize: 20,
    fontWeight: '700',
    color: '#111827',
    marginTop: 8,
  },
  statLabel: {
    fontSize: 12,
    color: '#6B7280',
    marginTop: 4,
  },
  bottomActions: {
    position: 'absolute',
    bottom: 0,
    left: 0,
    right: 0,
    flexDirection: 'row',
    alignItems: 'center',
    padding: 16,
    backgroundColor: '#fff',
    borderTopWidth: 1,
    borderTopColor: '#E5E7EB',
    gap: 12,
  },
  actionBtn: {
    width: 48,
    height: 48,
    borderRadius: 12,
    backgroundColor: '#F3F4F6',
    justifyContent: 'center',
    alignItems: 'center',
  },
  editButton: {
    flex: 1,
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    gap: 8,
    backgroundColor: '#F59E0B',
    paddingVertical: 14,
    borderRadius: 12,
  },
  editButtonText: {
    fontSize: 16,
    fontWeight: '600',
    color: '#fff',
  },
});
