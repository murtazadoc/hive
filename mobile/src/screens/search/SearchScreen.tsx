import React, { useState, useEffect, useCallback } from 'react';
import {
  View,
  Text,
  TextInput,
  TouchableOpacity,
  ScrollView,
  FlatList,
  Image,
  StyleSheet,
  ActivityIndicator,
  Keyboard,
} from 'react-native';
import { useNavigation } from '@react-navigation/native';
import Icon from 'react-native-vector-icons/Feather';
import { searchApi, ProductSearchResult, BusinessSearchResult, SearchFilters } from '../../api/search';
import debounce from 'lodash/debounce';

// =====================================================
// SEARCH SCREEN
// =====================================================
export default function SearchScreen() {
  const navigation = useNavigation<any>();
  
  // State
  const [query, setQuery] = useState('');
  const [suggestions, setSuggestions] = useState<string[]>([]);
  const [trending, setTrending] = useState<string[]>([]);
  const [products, setProducts] = useState<ProductSearchResult[]>([]);
  const [businesses, setBusinesses] = useState<BusinessSearchResult[]>([]);
  const [isLoading, setIsLoading] = useState(false);
  const [hasSearched, setHasSearched] = useState(false);
  const [showFilters, setShowFilters] = useState(false);
  const [activeTab, setActiveTab] = useState<'all' | 'products' | 'businesses'>('all');
  
  // Filters
  const [filters, setFilters] = useState<SearchFilters>({
    mode: 'hybrid',
  });

  // Stats
  const [searchTime, setSearchTime] = useState(0);
  const [totalResults, setTotalResults] = useState(0);

  // Load trending on mount
  useEffect(() => {
    loadTrending();
  }, []);

  // Debounced suggestions
  const loadSuggestions = useCallback(
    debounce(async (text: string) => {
      if (text.length < 2) {
        setSuggestions([]);
        return;
      }
      try {
        const results = await searchApi.getSuggestions(text);
        setSuggestions(results);
      } catch (error) {
        console.error('Failed to load suggestions');
      }
    }, 300),
    [],
  );

  // Load trending
  const loadTrending = async () => {
    try {
      const results = await searchApi.getTrending(undefined, 8);
      setTrending(results);
    } catch (error) {
      console.error('Failed to load trending');
    }
  };

  // Handle search
  const handleSearch = async (searchQuery: string = query) => {
    if (!searchQuery.trim()) return;

    Keyboard.dismiss();
    setIsLoading(true);
    setHasSearched(true);
    setSuggestions([]);

    try {
      const results = await searchApi.search(searchQuery.trim(), filters);
      setProducts(results.products.data);
      setBusinesses(results.businesses.data);
      setSearchTime(results.products.took);
      setTotalResults(results.products.total + results.businesses.total);
    } catch (error) {
      console.error('Search failed:', error);
    } finally {
      setIsLoading(false);
    }
  };

  // Handle query change
  const handleQueryChange = (text: string) => {
    setQuery(text);
    loadSuggestions(text);
  };

  // Handle suggestion tap
  const handleSuggestionTap = (suggestion: string) => {
    setQuery(suggestion);
    handleSearch(suggestion);
  };

  // Navigate to product
  const navigateToProduct = (product: ProductSearchResult) => {
    navigation.navigate('ProductDetail', {
      productId: product.id,
      businessId: product.businessSlug,
    });
  };

  // Navigate to business
  const navigateToBusiness = (business: BusinessSearchResult) => {
    navigation.navigate('BusinessDetail', { businessId: business.id });
  };

  // Render suggestion item
  const renderSuggestion = (item: string, index: number) => (
    <TouchableOpacity
      key={index}
      style={styles.suggestionItem}
      onPress={() => handleSuggestionTap(item)}
    >
      <Icon name="search" size={16} color="#9CA3AF" />
      <Text style={styles.suggestionText}>{item}</Text>
      <Icon name="arrow-up-left" size={16} color="#9CA3AF" />
    </TouchableOpacity>
  );

  // Render trending item
  const renderTrendingItem = (item: string, index: number) => (
    <TouchableOpacity
      key={index}
      style={styles.trendingChip}
      onPress={() => handleSuggestionTap(item)}
    >
      <Text style={styles.trendingText}>{item}</Text>
    </TouchableOpacity>
  );

  // Render product item
  const renderProductItem = ({ item }: { item: ProductSearchResult }) => (
    <TouchableOpacity
      style={styles.productCard}
      onPress={() => navigateToProduct(item)}
    >
      {item.thumbnailUrl ? (
        <Image source={{ uri: item.thumbnailUrl }} style={styles.productImage} />
      ) : (
        <View style={[styles.productImage, styles.placeholderImage]}>
          <Icon name="image" size={24} color="#D1D5DB" />
        </View>
      )}
      <View style={styles.productInfo}>
        <Text style={styles.productName} numberOfLines={2}>{item.name}</Text>
        <Text style={styles.productBusiness}>{item.businessName}</Text>
        <View style={styles.priceRow}>
          <Text style={styles.productPrice}>
            {item.currency} {item.price.toLocaleString()}
          </Text>
          {item.compareAtPrice && (
            <Text style={styles.comparePrice}>
              {item.currency} {item.compareAtPrice.toLocaleString()}
            </Text>
          )}
        </View>
        {item.similarity && (
          <View style={styles.similarityBadge}>
            <Icon name="zap" size={10} color="#F59E0B" />
            <Text style={styles.similarityText}>
              {Math.round(item.similarity * 100)}% match
            </Text>
          </View>
        )}
      </View>
    </TouchableOpacity>
  );

  // Render business item
  const renderBusinessItem = ({ item }: { item: BusinessSearchResult }) => (
    <TouchableOpacity
      style={styles.businessCard}
      onPress={() => navigateToBusiness(item)}
    >
      {item.logoUrl ? (
        <Image source={{ uri: item.logoUrl }} style={styles.businessLogo} />
      ) : (
        <View style={[styles.businessLogo, styles.placeholderLogo]}>
          <Text style={styles.logoInitial}>{item.businessName[0]}</Text>
        </View>
      )}
      <View style={styles.businessInfo}>
        <View style={styles.businessHeader}>
          <Text style={styles.businessName} numberOfLines={1}>{item.businessName}</Text>
          {item.isVerified && (
            <Icon name="check-circle" size={14} color="#10B981" />
          )}
        </View>
        <Text style={styles.businessLocation}>
          <Icon name="map-pin" size={12} color="#9CA3AF" /> {item.city || 'Kenya'}
        </Text>
        <Text style={styles.businessProducts}>
          {item.productCount} products
        </Text>
      </View>
      <Icon name="chevron-right" size={20} color="#D1D5DB" />
    </TouchableOpacity>
  );

  return (
    <View style={styles.container}>
      {/* Search Header */}
      <View style={styles.header}>
        <View style={styles.searchBar}>
          <Icon name="search" size={20} color="#9CA3AF" />
          <TextInput
            style={styles.searchInput}
            placeholder="Search products, businesses..."
            value={query}
            onChangeText={handleQueryChange}
            onSubmitEditing={() => handleSearch()}
            returnKeyType="search"
            autoCapitalize="none"
            autoCorrect={false}
          />
          {query.length > 0 && (
            <TouchableOpacity onPress={() => setQuery('')}>
              <Icon name="x" size={20} color="#9CA3AF" />
            </TouchableOpacity>
          )}
        </View>
        <TouchableOpacity
          style={styles.filterButton}
          onPress={() => setShowFilters(!showFilters)}
        >
          <Icon
            name="sliders"
            size={20}
            color={showFilters ? '#F59E0B' : '#6B7280'}
          />
        </TouchableOpacity>
      </View>

      {/* Filters */}
      {showFilters && (
        <View style={styles.filtersContainer}>
          <ScrollView horizontal showsHorizontalScrollIndicator={false}>
            <FilterChip
              label="In Stock"
              active={filters.inStock === true}
              onPress={() => setFilters({
                ...filters,
                inStock: filters.inStock ? undefined : true,
              })}
            />
            <FilterChip
              label="Verified Only"
              active={filters.isVerified === true}
              onPress={() => setFilters({
                ...filters,
                isVerified: filters.isVerified ? undefined : true,
              })}
            />
            <FilterChip
              label="AI Search"
              active={filters.mode === 'semantic'}
              onPress={() => setFilters({
                ...filters,
                mode: filters.mode === 'semantic' ? 'hybrid' : 'semantic',
              })}
              icon="zap"
            />
          </ScrollView>
        </View>
      )}

      {/* Suggestions */}
      {suggestions.length > 0 && (
        <View style={styles.suggestionsContainer}>
          {suggestions.map(renderSuggestion)}
        </View>
      )}

      {/* Content */}
      <ScrollView
        style={styles.content}
        showsVerticalScrollIndicator={false}
        keyboardShouldPersistTaps="handled"
      >
        {/* Loading */}
        {isLoading && (
          <View style={styles.loadingContainer}>
            <ActivityIndicator size="large" color="#F59E0B" />
            <Text style={styles.loadingText}>Searching...</Text>
          </View>
        )}

        {/* No Search Yet - Show Trending */}
        {!hasSearched && !isLoading && (
          <View style={styles.trendingSection}>
            <Text style={styles.sectionTitle}>
              <Icon name="trending-up" size={16} color="#6B7280" /> Trending Searches
            </Text>
            <View style={styles.trendingContainer}>
              {trending.map(renderTrendingItem)}
            </View>
          </View>
        )}

        {/* Results */}
        {hasSearched && !isLoading && (
          <>
            {/* Stats */}
            <View style={styles.statsRow}>
              <Text style={styles.statsText}>
                {totalResults} results in {searchTime}ms
              </Text>
            </View>

            {/* Tabs */}
            <View style={styles.tabsContainer}>
              <TouchableOpacity
                style={[styles.tab, activeTab === 'all' && styles.activeTab]}
                onPress={() => setActiveTab('all')}
              >
                <Text style={[styles.tabText, activeTab === 'all' && styles.activeTabText]}>
                  All
                </Text>
              </TouchableOpacity>
              <TouchableOpacity
                style={[styles.tab, activeTab === 'products' && styles.activeTab]}
                onPress={() => setActiveTab('products')}
              >
                <Text style={[styles.tabText, activeTab === 'products' && styles.activeTabText]}>
                  Products ({products.length})
                </Text>
              </TouchableOpacity>
              <TouchableOpacity
                style={[styles.tab, activeTab === 'businesses' && styles.activeTab]}
                onPress={() => setActiveTab('businesses')}
              >
                <Text style={[styles.tabText, activeTab === 'businesses' && styles.activeTabText]}>
                  Businesses ({businesses.length})
                </Text>
              </TouchableOpacity>
            </View>

            {/* No Results */}
            {products.length === 0 && businesses.length === 0 && (
              <View style={styles.emptyContainer}>
                <Icon name="search" size={48} color="#D1D5DB" />
                <Text style={styles.emptyTitle}>No results found</Text>
                <Text style={styles.emptyText}>
                  Try different keywords or remove filters
                </Text>
              </View>
            )}

            {/* Businesses Section */}
            {(activeTab === 'all' || activeTab === 'businesses') && businesses.length > 0 && (
              <View style={styles.section}>
                {activeTab === 'all' && (
                  <Text style={styles.sectionTitle}>Businesses</Text>
                )}
                {businesses.slice(0, activeTab === 'all' ? 3 : undefined).map((b) => (
                  <View key={b.id}>{renderBusinessItem({ item: b })}</View>
                ))}
              </View>
            )}

            {/* Products Section */}
            {(activeTab === 'all' || activeTab === 'products') && products.length > 0 && (
              <View style={styles.section}>
                {activeTab === 'all' && (
                  <Text style={styles.sectionTitle}>Products</Text>
                )}
                <View style={styles.productsGrid}>
                  {products.map((p) => (
                    <View key={p.id} style={styles.productGridItem}>
                      {renderProductItem({ item: p })}
                    </View>
                  ))}
                </View>
              </View>
            )}
          </>
        )}

        <View style={{ height: 100 }} />
      </ScrollView>
    </View>
  );
}

// =====================================================
// FILTER CHIP COMPONENT
// =====================================================
interface FilterChipProps {
  label: string;
  active: boolean;
  onPress: () => void;
  icon?: string;
}

function FilterChip({ label, active, onPress, icon }: FilterChipProps) {
  return (
    <TouchableOpacity
      style={[styles.filterChip, active && styles.filterChipActive]}
      onPress={onPress}
    >
      {icon && <Icon name={icon} size={14} color={active ? '#fff' : '#6B7280'} />}
      <Text style={[styles.filterChipText, active && styles.filterChipTextActive]}>
        {label}
      </Text>
    </TouchableOpacity>
  );
}

// =====================================================
// STYLES
// =====================================================
const styles = StyleSheet.create({
  container: {
    flex: 1,
    backgroundColor: '#F9FAFB',
  },
  header: {
    flexDirection: 'row',
    alignItems: 'center',
    padding: 16,
    paddingTop: 8,
    backgroundColor: '#fff',
    borderBottomWidth: 1,
    borderBottomColor: '#E5E7EB',
  },
  searchBar: {
    flex: 1,
    flexDirection: 'row',
    alignItems: 'center',
    backgroundColor: '#F3F4F6',
    borderRadius: 12,
    paddingHorizontal: 12,
    height: 44,
    gap: 8,
  },
  searchInput: {
    flex: 1,
    fontSize: 16,
    color: '#111827',
  },
  filterButton: {
    width: 44,
    height: 44,
    marginLeft: 8,
    justifyContent: 'center',
    alignItems: 'center',
    backgroundColor: '#F3F4F6',
    borderRadius: 12,
  },
  filtersContainer: {
    backgroundColor: '#fff',
    paddingHorizontal: 16,
    paddingVertical: 12,
    borderBottomWidth: 1,
    borderBottomColor: '#E5E7EB',
  },
  filterChip: {
    flexDirection: 'row',
    alignItems: 'center',
    paddingHorizontal: 14,
    paddingVertical: 8,
    backgroundColor: '#F3F4F6',
    borderRadius: 20,
    marginRight: 8,
    gap: 6,
  },
  filterChipActive: {
    backgroundColor: '#F59E0B',
  },
  filterChipText: {
    fontSize: 14,
    color: '#6B7280',
  },
  filterChipTextActive: {
    color: '#fff',
  },
  suggestionsContainer: {
    backgroundColor: '#fff',
    borderBottomWidth: 1,
    borderBottomColor: '#E5E7EB',
  },
  suggestionItem: {
    flexDirection: 'row',
    alignItems: 'center',
    paddingHorizontal: 16,
    paddingVertical: 12,
    gap: 12,
  },
  suggestionText: {
    flex: 1,
    fontSize: 16,
    color: '#374151',
  },
  content: {
    flex: 1,
  },
  loadingContainer: {
    padding: 48,
    alignItems: 'center',
  },
  loadingText: {
    marginTop: 12,
    color: '#6B7280',
  },
  trendingSection: {
    padding: 16,
  },
  sectionTitle: {
    fontSize: 16,
    fontWeight: '600',
    color: '#374151',
    marginBottom: 12,
  },
  trendingContainer: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    gap: 8,
  },
  trendingChip: {
    paddingHorizontal: 14,
    paddingVertical: 8,
    backgroundColor: '#fff',
    borderRadius: 20,
    borderWidth: 1,
    borderColor: '#E5E7EB',
  },
  trendingText: {
    fontSize: 14,
    color: '#374151',
  },
  statsRow: {
    paddingHorizontal: 16,
    paddingVertical: 8,
  },
  statsText: {
    fontSize: 12,
    color: '#9CA3AF',
  },
  tabsContainer: {
    flexDirection: 'row',
    paddingHorizontal: 16,
    marginBottom: 12,
    gap: 8,
  },
  tab: {
    paddingHorizontal: 16,
    paddingVertical: 8,
    borderRadius: 20,
    backgroundColor: '#F3F4F6',
  },
  activeTab: {
    backgroundColor: '#F59E0B',
  },
  tabText: {
    fontSize: 14,
    color: '#6B7280',
  },
  activeTabText: {
    color: '#fff',
    fontWeight: '600',
  },
  section: {
    padding: 16,
    paddingTop: 0,
  },
  emptyContainer: {
    padding: 48,
    alignItems: 'center',
  },
  emptyTitle: {
    fontSize: 18,
    fontWeight: '600',
    color: '#374151',
    marginTop: 16,
  },
  emptyText: {
    fontSize: 14,
    color: '#9CA3AF',
    marginTop: 4,
  },
  productsGrid: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    marginHorizontal: -6,
  },
  productGridItem: {
    width: '50%',
    padding: 6,
  },
  productCard: {
    backgroundColor: '#fff',
    borderRadius: 12,
    overflow: 'hidden',
  },
  productImage: {
    width: '100%',
    height: 120,
    backgroundColor: '#F3F4F6',
  },
  placeholderImage: {
    justifyContent: 'center',
    alignItems: 'center',
  },
  productInfo: {
    padding: 10,
  },
  productName: {
    fontSize: 14,
    fontWeight: '500',
    color: '#111827',
    marginBottom: 4,
  },
  productBusiness: {
    fontSize: 12,
    color: '#6B7280',
    marginBottom: 4,
  },
  priceRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 8,
  },
  productPrice: {
    fontSize: 14,
    fontWeight: '700',
    color: '#F59E0B',
  },
  comparePrice: {
    fontSize: 12,
    color: '#9CA3AF',
    textDecorationLine: 'line-through',
  },
  similarityBadge: {
    flexDirection: 'row',
    alignItems: 'center',
    marginTop: 6,
    gap: 4,
  },
  similarityText: {
    fontSize: 10,
    color: '#F59E0B',
  },
  businessCard: {
    flexDirection: 'row',
    alignItems: 'center',
    backgroundColor: '#fff',
    borderRadius: 12,
    padding: 12,
    marginBottom: 8,
  },
  businessLogo: {
    width: 48,
    height: 48,
    borderRadius: 12,
    backgroundColor: '#F3F4F6',
  },
  placeholderLogo: {
    justifyContent: 'center',
    alignItems: 'center',
    backgroundColor: '#F59E0B',
  },
  logoInitial: {
    fontSize: 20,
    fontWeight: '600',
    color: '#fff',
  },
  businessInfo: {
    flex: 1,
    marginLeft: 12,
  },
  businessHeader: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 6,
  },
  businessName: {
    fontSize: 16,
    fontWeight: '600',
    color: '#111827',
  },
  businessLocation: {
    fontSize: 12,
    color: '#6B7280',
    marginTop: 2,
  },
  businessProducts: {
    fontSize: 12,
    color: '#9CA3AF',
    marginTop: 2,
  },
});
