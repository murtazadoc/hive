import React, { useEffect, useState, useCallback } from 'react';
import {
  View,
  Text,
  FlatList,
  TextInput,
  TouchableOpacity,
  Image,
  StyleSheet,
  RefreshControl,
  Alert,
} from 'react-native';
import { useNavigation, useRoute } from '@react-navigation/native';
import Icon from 'react-native-vector-icons/Feather';
import { useProductStore } from '../../store/productStore';
import { useAuthStore } from '../../store/authStore';

export default function ProductsListScreen() {
  const navigation = useNavigation<any>();
  const route = useRoute<any>();
  const businessId = route.params?.businessId;

  const {
    products,
    categories,
    isLoading,
    isSyncing,
    pendingChanges,
    isOnline,
    error,
    setBusinessContext,
    loadProducts,
    sync,
    searchProducts,
  } = useProductStore();

  const [searchQuery, setSearchQuery] = useState('');
  const [selectedCategory, setSelectedCategory] = useState<string | null>(null);
  const [refreshing, setRefreshing] = useState(false);

  // Initialize business context
  useEffect(() => {
    if (businessId) {
      setBusinessContext(businessId);
    }
  }, [businessId]);

  // Search handler
  const handleSearch = useCallback(
    async (query: string) => {
      setSearchQuery(query);
      if (query.trim()) {
        const results = await searchProducts(query);
        // Results will be in store
      } else {
        loadProducts({ categoryId: selectedCategory });
      }
    },
    [selectedCategory],
  );

  // Category filter
  const handleCategoryFilter = (categoryId: string | null) => {
    setSelectedCategory(categoryId);
    loadProducts({ categoryId });
  };

  // Refresh
  const onRefresh = async () => {
    setRefreshing(true);
    await sync();
    setRefreshing(false);
  };

  // Render product item
  const renderProduct = ({ item }: { item: any }) => {
    const primaryImage = item.images?.find((i: any) => i.isPrimary) || item.images?.[0];
    const isLowStock = item.quantity <= 5 && item.quantity > 0;
    const isOutOfStock = item.quantity === 0;

    return (
      <TouchableOpacity
        style={styles.productCard}
        onPress={() =>
          navigation.navigate('ProductDetail', { productId: item.id, businessId })
        }
      >
        <View style={styles.imageContainer}>
          {primaryImage ? (
            <Image source={{ uri: primaryImage.url }} style={styles.productImage} />
          ) : (
            <View style={styles.placeholderImage}>
              <Icon name="package" size={32} color="#9CA3AF" />
            </View>
          )}
          {item._pendingSync && (
            <View style={styles.syncBadge}>
              <Icon name="refresh-cw" size={12} color="#fff" />
            </View>
          )}
        </View>

        <View style={styles.productInfo}>
          <Text style={styles.productName} numberOfLines={2}>
            {item.name}
          </Text>

          <View style={styles.priceRow}>
            <Text style={styles.price}>
              {item.currency} {item.price.toLocaleString()}
            </Text>
            {item.compareAtPrice && (
              <Text style={styles.comparePrice}>
                {item.currency} {item.compareAtPrice.toLocaleString()}
              </Text>
            )}
          </View>

          <View style={styles.stockRow}>
            <View
              style={[
                styles.stockBadge,
                isOutOfStock && styles.outOfStockBadge,
                isLowStock && styles.lowStockBadge,
              ]}
            >
              <Text
                style={[
                  styles.stockText,
                  isOutOfStock && styles.outOfStockText,
                  isLowStock && styles.lowStockText,
                ]}
              >
                {isOutOfStock
                  ? 'Out of Stock'
                  : isLowStock
                  ? `Low: ${item.quantity}`
                  : `In Stock: ${item.quantity}`}
              </Text>
            </View>

            <View
              style={[
                styles.statusBadge,
                item.status === 'active' && styles.activeBadge,
                item.status === 'draft' && styles.draftBadge,
              ]}
            >
              <Text style={styles.statusText}>{item.status}</Text>
            </View>
          </View>
        </View>
      </TouchableOpacity>
    );
  };

  return (
    <View style={styles.container}>
      {/* Sync Status Bar */}
      <View style={[styles.statusBar, !isOnline && styles.offlineBar]}>
        <View style={styles.statusLeft}>
          <View
            style={[styles.statusDot, isOnline ? styles.onlineDot : styles.offlineDot]}
          />
          <Text style={styles.statusText}>
            {isOnline ? 'Online' : 'Offline'}
          </Text>
        </View>
        {pendingChanges > 0 && (
          <TouchableOpacity style={styles.syncButton} onPress={sync}>
            <Icon
              name="refresh-cw"
              size={14}
              color="#F59E0B"
              style={isSyncing ? styles.spinning : undefined}
            />
            <Text style={styles.syncText}>
              {isSyncing ? 'Syncing...' : `${pendingChanges} pending`}
            </Text>
          </TouchableOpacity>
        )}
      </View>

      {/* Search Bar */}
      <View style={styles.searchContainer}>
        <View style={styles.searchBox}>
          <Icon name="search" size={20} color="#9CA3AF" />
          <TextInput
            style={styles.searchInput}
            placeholder="Search products..."
            placeholderTextColor="#9CA3AF"
            value={searchQuery}
            onChangeText={handleSearch}
          />
          {searchQuery.length > 0 && (
            <TouchableOpacity onPress={() => handleSearch('')}>
              <Icon name="x" size={20} color="#9CA3AF" />
            </TouchableOpacity>
          )}
        </View>

        <TouchableOpacity
          style={styles.addButton}
          onPress={() => navigation.navigate('CreateProduct', { businessId })}
        >
          <Icon name="plus" size={24} color="#fff" />
        </TouchableOpacity>
      </View>

      {/* Category Filter */}
      <View style={styles.categoryContainer}>
        <FlatList
          horizontal
          showsHorizontalScrollIndicator={false}
          data={[{ id: null, name: 'All' }, ...categories]}
          keyExtractor={(item) => item.id || 'all'}
          renderItem={({ item }) => (
            <TouchableOpacity
              style={[
                styles.categoryChip,
                selectedCategory === item.id && styles.categoryChipActive,
              ]}
              onPress={() => handleCategoryFilter(item.id)}
            >
              <Text
                style={[
                  styles.categoryChipText,
                  selectedCategory === item.id && styles.categoryChipTextActive,
                ]}
              >
                {item.name}
              </Text>
            </TouchableOpacity>
          )}
        />
      </View>

      {/* Products List */}
      <FlatList
        data={products}
        keyExtractor={(item) => item.id}
        renderItem={renderProduct}
        numColumns={2}
        columnWrapperStyle={styles.row}
        contentContainerStyle={styles.listContent}
        refreshControl={
          <RefreshControl
            refreshing={refreshing}
            onRefresh={onRefresh}
            colors={['#F59E0B']}
            tintColor="#F59E0B"
          />
        }
        ListEmptyComponent={
          <View style={styles.emptyContainer}>
            <Icon name="package" size={64} color="#D1D5DB" />
            <Text style={styles.emptyTitle}>No products yet</Text>
            <Text style={styles.emptySubtitle}>
              Tap the + button to add your first product
            </Text>
          </View>
        }
      />
    </View>
  );
}

const styles = StyleSheet.create({
  container: {
    flex: 1,
    backgroundColor: '#F9FAFB',
  },
  statusBar: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    paddingHorizontal: 16,
    paddingVertical: 8,
    backgroundColor: '#fff',
    borderBottomWidth: 1,
    borderBottomColor: '#E5E7EB',
  },
  offlineBar: {
    backgroundColor: '#FEF3C7',
  },
  statusLeft: {
    flexDirection: 'row',
    alignItems: 'center',
  },
  statusDot: {
    width: 8,
    height: 8,
    borderRadius: 4,
    marginRight: 8,
  },
  onlineDot: {
    backgroundColor: '#10B981',
  },
  offlineDot: {
    backgroundColor: '#F59E0B',
  },
  statusText: {
    fontSize: 12,
    color: '#6B7280',
  },
  syncButton: {
    flexDirection: 'row',
    alignItems: 'center',
    padding: 8,
  },
  syncText: {
    fontSize: 12,
    color: '#F59E0B',
    marginLeft: 4,
  },
  spinning: {
    // Add animation in real implementation
  },
  searchContainer: {
    flexDirection: 'row',
    paddingHorizontal: 16,
    paddingVertical: 12,
    gap: 12,
  },
  searchBox: {
    flex: 1,
    flexDirection: 'row',
    alignItems: 'center',
    backgroundColor: '#fff',
    borderRadius: 12,
    paddingHorizontal: 12,
    borderWidth: 1,
    borderColor: '#E5E7EB',
  },
  searchInput: {
    flex: 1,
    paddingVertical: 12,
    paddingHorizontal: 8,
    fontSize: 16,
    color: '#111827',
  },
  addButton: {
    width: 48,
    height: 48,
    backgroundColor: '#F59E0B',
    borderRadius: 12,
    justifyContent: 'center',
    alignItems: 'center',
  },
  categoryContainer: {
    paddingHorizontal: 16,
    paddingBottom: 12,
  },
  categoryChip: {
    paddingHorizontal: 16,
    paddingVertical: 8,
    backgroundColor: '#fff',
    borderRadius: 20,
    marginRight: 8,
    borderWidth: 1,
    borderColor: '#E5E7EB',
  },
  categoryChipActive: {
    backgroundColor: '#F59E0B',
    borderColor: '#F59E0B',
  },
  categoryChipText: {
    fontSize: 14,
    color: '#6B7280',
  },
  categoryChipTextActive: {
    color: '#fff',
    fontWeight: '600',
  },
  listContent: {
    paddingHorizontal: 12,
    paddingBottom: 24,
  },
  row: {
    justifyContent: 'space-between',
  },
  productCard: {
    width: '48%',
    backgroundColor: '#fff',
    borderRadius: 12,
    marginBottom: 12,
    overflow: 'hidden',
    shadowColor: '#000',
    shadowOffset: { width: 0, height: 1 },
    shadowOpacity: 0.05,
    shadowRadius: 2,
    elevation: 1,
  },
  imageContainer: {
    aspectRatio: 1,
    position: 'relative',
  },
  productImage: {
    width: '100%',
    height: '100%',
    resizeMode: 'cover',
  },
  placeholderImage: {
    width: '100%',
    height: '100%',
    backgroundColor: '#F3F4F6',
    justifyContent: 'center',
    alignItems: 'center',
  },
  syncBadge: {
    position: 'absolute',
    top: 8,
    right: 8,
    backgroundColor: '#F59E0B',
    borderRadius: 10,
    padding: 4,
  },
  productInfo: {
    padding: 12,
  },
  productName: {
    fontSize: 14,
    fontWeight: '600',
    color: '#111827',
    marginBottom: 4,
  },
  priceRow: {
    flexDirection: 'row',
    alignItems: 'center',
    marginBottom: 8,
  },
  price: {
    fontSize: 16,
    fontWeight: '700',
    color: '#F59E0B',
  },
  comparePrice: {
    fontSize: 12,
    color: '#9CA3AF',
    textDecorationLine: 'line-through',
    marginLeft: 8,
  },
  stockRow: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
  },
  stockBadge: {
    paddingHorizontal: 8,
    paddingVertical: 4,
    backgroundColor: '#D1FAE5',
    borderRadius: 8,
  },
  lowStockBadge: {
    backgroundColor: '#FEF3C7',
  },
  outOfStockBadge: {
    backgroundColor: '#FEE2E2',
  },
  stockText: {
    fontSize: 10,
    fontWeight: '600',
    color: '#059669',
  },
  lowStockText: {
    color: '#D97706',
  },
  outOfStockText: {
    color: '#DC2626',
  },
  statusBadge: {
    paddingHorizontal: 8,
    paddingVertical: 4,
    borderRadius: 8,
  },
  activeBadge: {
    backgroundColor: '#DBEAFE',
  },
  draftBadge: {
    backgroundColor: '#F3F4F6',
  },
  emptyContainer: {
    flex: 1,
    justifyContent: 'center',
    alignItems: 'center',
    paddingTop: 100,
  },
  emptyTitle: {
    fontSize: 18,
    fontWeight: '600',
    color: '#374151',
    marginTop: 16,
  },
  emptySubtitle: {
    fontSize: 14,
    color: '#9CA3AF',
    marginTop: 8,
    textAlign: 'center',
  },
});
