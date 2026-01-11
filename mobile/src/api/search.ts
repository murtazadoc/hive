/**
 * HIVE Search API Client
 * 
 * Provides AI-powered search for products and businesses
 * with semantic understanding and filtering.
 */

import api from './client';

// =====================================================
// TYPES
// =====================================================
export interface SearchFilters {
  city?: string;
  county?: string;
  categoryId?: string;
  priceMin?: number;
  priceMax?: number;
  inStock?: boolean;
  businessType?: 'retail' | 'professional' | 'both';
  isVerified?: boolean;
  page?: number;
  limit?: number;
  mode?: 'hybrid' | 'semantic' | 'keyword';
}

export interface ProductSearchResult {
  id: string;
  name: string;
  slug: string;
  description?: string;
  price: number;
  compareAtPrice?: number;
  currency: string;
  quantity: number;
  status: string;
  thumbnailUrl?: string;
  businessName: string;
  businessSlug: string;
  businessLogo?: string;
  city?: string;
  similarity?: number;
  matchType: 'semantic' | 'keyword' | 'hybrid';
}

export interface BusinessSearchResult {
  id: string;
  businessName: string;
  slug: string;
  description?: string;
  logoUrl?: string;
  coverImageUrl?: string;
  businessType: string;
  city?: string;
  county?: string;
  isVerified: boolean;
  productCount: number;
  similarity?: number;
  matchType: 'semantic' | 'keyword' | 'hybrid';
}

export interface SearchResponse<T> {
  data: T[];
  total: number;
  page: number;
  limit: number;
  query: string;
  filters: SearchFilters;
  searchMode: string;
  took: number;
}

export interface UnifiedSearchResponse {
  products: SearchResponse<ProductSearchResult>;
  businesses: SearchResponse<BusinessSearchResult>;
}

// =====================================================
// SEARCH API
// =====================================================
export const searchApi = {
  /**
   * Unified search for products and businesses
   */
  search: async (
    query: string,
    filters: SearchFilters = {},
  ): Promise<UnifiedSearchResponse> => {
    const params = new URLSearchParams({ q: query });

    if (filters.city) params.append('city', filters.city);
    if (filters.county) params.append('county', filters.county);
    if (filters.categoryId) params.append('categoryId', filters.categoryId);
    if (filters.priceMin) params.append('priceMin', filters.priceMin.toString());
    if (filters.priceMax) params.append('priceMax', filters.priceMax.toString());
    if (filters.inStock !== undefined) params.append('inStock', filters.inStock.toString());
    if (filters.businessType) params.append('businessType', filters.businessType);
    if (filters.page) params.append('page', filters.page.toString());
    if (filters.limit) params.append('limit', filters.limit.toString());
    if (filters.mode) params.append('mode', filters.mode);

    const response = await api.get(`/search?${params.toString()}`);
    return response.data;
  },

  /**
   * Search products only
   */
  searchProducts: async (
    query: string,
    filters: SearchFilters = {},
  ): Promise<SearchResponse<ProductSearchResult>> => {
    const params = new URLSearchParams({ q: query });

    if (filters.city) params.append('city', filters.city);
    if (filters.categoryId) params.append('categoryId', filters.categoryId);
    if (filters.priceMin) params.append('priceMin', filters.priceMin.toString());
    if (filters.priceMax) params.append('priceMax', filters.priceMax.toString());
    if (filters.inStock !== undefined) params.append('inStock', filters.inStock.toString());
    if (filters.page) params.append('page', filters.page.toString());
    if (filters.limit) params.append('limit', filters.limit.toString());
    if (filters.mode) params.append('mode', filters.mode);

    const response = await api.get(`/search/products?${params.toString()}`);
    return response.data;
  },

  /**
   * Search businesses only
   */
  searchBusinesses: async (
    query: string,
    filters: SearchFilters = {},
  ): Promise<SearchResponse<BusinessSearchResult>> => {
    const params = new URLSearchParams({ q: query });

    if (filters.city) params.append('city', filters.city);
    if (filters.county) params.append('county', filters.county);
    if (filters.businessType) params.append('businessType', filters.businessType);
    if (filters.isVerified !== undefined) params.append('isVerified', filters.isVerified.toString());
    if (filters.page) params.append('page', filters.page.toString());
    if (filters.limit) params.append('limit', filters.limit.toString());
    if (filters.mode) params.append('mode', filters.mode);

    const response = await api.get(`/search/businesses?${params.toString()}`);
    return response.data;
  },

  /**
   * Get autocomplete suggestions
   */
  getSuggestions: async (query: string, limit = 5): Promise<string[]> => {
    const response = await api.get(`/search/suggestions?q=${encodeURIComponent(query)}&limit=${limit}`);
    return response.data;
  },

  /**
   * Get trending searches
   */
  getTrending: async (city?: string, limit = 10): Promise<string[]> => {
    const params = new URLSearchParams();
    if (city) params.append('city', city);
    params.append('limit', limit.toString());

    const response = await api.get(`/search/trending?${params.toString()}`);
    return response.data;
  },

  /**
   * Get similar products
   */
  getSimilarProducts: async (
    productId: string,
    limit = 10,
  ): Promise<ProductSearchResult[]> => {
    const response = await api.get(`/search/products/${productId}/similar?limit=${limit}`);
    return response.data;
  },
};

export default searchApi;
