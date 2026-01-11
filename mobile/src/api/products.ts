import api from './client';

// =====================================================
// PRODUCT CATEGORIES API
// =====================================================
export const productCategoryApi = {
  getAll: async (businessId: string) => {
    const response = await api.get(`/businesses/${businessId}/products/categories`);
    return response.data;
  },

  create: async (businessId: string, data: {
    name: string;
    description?: string;
    imageUrl?: string;
    parentId?: string;
  }) => {
    const response = await api.post(`/businesses/${businessId}/products/categories`, data);
    return response.data;
  },

  update: async (businessId: string, categoryId: string, data: any) => {
    const response = await api.put(
      `/businesses/${businessId}/products/categories/${categoryId}`,
      data,
    );
    return response.data;
  },

  delete: async (businessId: string, categoryId: string) => {
    const response = await api.delete(
      `/businesses/${businessId}/products/categories/${categoryId}`,
    );
    return response.data;
  },
};

// =====================================================
// PRODUCTS API
// =====================================================
export interface ProductQueryParams {
  categoryId?: string;
  status?: 'draft' | 'active' | 'out_of_stock' | 'discontinued';
  featured?: boolean;
  inStock?: boolean;
  search?: string;
  minPrice?: number;
  maxPrice?: number;
  sort?: 'price_asc' | 'price_desc' | 'newest' | 'name' | 'popular';
  page?: number;
  limit?: number;
}

export interface CreateProductData {
  name: string;
  description?: string;
  shortDescription?: string;
  price: number;
  compareAtPrice?: number;
  costPrice?: number;
  currency?: string;
  categoryId?: string;
  sku?: string;
  barcode?: string;
  trackInventory?: boolean;
  quantity?: number;
  lowStockThreshold?: number;
  weight?: number;
  weightUnit?: string;
  status?: 'draft' | 'active';
  isFeatured?: boolean;
  attributes?: Record<string, any>;
  tags?: string[];
  images?: Array<{
    url: string;
    altText?: string;
    isPrimary?: boolean;
  }>;
  variants?: Array<{
    name: string;
    sku?: string;
    price: number;
    quantity?: number;
    options: Record<string, string>;
  }>;
  syncId?: string;
}

export const productApi = {
  list: async (businessId: string, params?: ProductQueryParams) => {
    const response = await api.get(`/businesses/${businessId}/products`, { params });
    return response.data;
  },

  getById: async (businessId: string, productId: string) => {
    const response = await api.get(`/businesses/${businessId}/products/${productId}`);
    return response.data;
  },

  getBySlug: async (businessSlug: string, productSlug: string) => {
    const response = await api.get(`/products/${businessSlug}/${productSlug}`);
    return response.data;
  },

  create: async (businessId: string, data: CreateProductData) => {
    const response = await api.post(`/businesses/${businessId}/products`, data);
    return response.data;
  },

  update: async (businessId: string, productId: string, data: Partial<CreateProductData>) => {
    const response = await api.put(`/businesses/${businessId}/products/${productId}`, data);
    return response.data;
  },

  delete: async (businessId: string, productId: string) => {
    const response = await api.delete(`/businesses/${businessId}/products/${productId}`);
    return response.data;
  },

  // Images
  addImage: async (
    businessId: string,
    productId: string,
    data: { url: string; altText?: string; isPrimary?: boolean },
  ) => {
    const response = await api.post(
      `/businesses/${businessId}/products/${productId}/images`,
      data,
    );
    return response.data;
  },

  deleteImage: async (businessId: string, productId: string, imageId: string) => {
    const response = await api.delete(
      `/businesses/${businessId}/products/${productId}/images/${imageId}`,
    );
    return response.data;
  },

  reorderImages: async (businessId: string, productId: string, imageIds: string[]) => {
    const response = await api.put(
      `/businesses/${businessId}/products/${productId}/images/reorder`,
      { imageIds },
    );
    return response.data;
  },
};

// =====================================================
// INVENTORY API
// =====================================================
export const inventoryApi = {
  update: async (
    businessId: string,
    productId: string,
    data: {
      action: 'set' | 'add' | 'subtract' | 'adjustment';
      quantity: number;
      reason?: string;
      variantId?: string;
    },
  ) => {
    const response = await api.put(
      `/businesses/${businessId}/products/${productId}/inventory`,
      data,
    );
    return response.data;
  },

  getLogs: async (businessId: string, productId: string) => {
    const response = await api.get(
      `/businesses/${businessId}/products/${productId}/inventory/logs`,
    );
    return response.data;
  },

  getLowStock: async (businessId: string) => {
    const response = await api.get(`/businesses/${businessId}/inventory/low-stock`);
    return response.data;
  },
};

// =====================================================
// SYNC API
// =====================================================
export interface SyncChange {
  entityType: 'product' | 'product_category' | 'product_image';
  entityId: string;
  syncId: string;
  operation: 'create' | 'update' | 'delete';
  payload: any;
  clientTimestamp: Date;
}

export const syncApi = {
  push: async (businessId: string, deviceId: string, changes: SyncChange[]) => {
    const response = await api.post(`/businesses/${businessId}/sync/push`, {
      deviceId,
      changes,
    });
    return response.data;
  },

  pull: async (businessId: string, deviceId: string, lastSyncAt: Date, entityTypes?: string[]) => {
    const response = await api.post(`/businesses/${businessId}/sync/pull`, {
      deviceId,
      lastSyncAt,
      entityTypes,
    });
    return response.data;
  },

  fullSync: async (businessId: string, deviceId: string) => {
    const response = await api.get(`/businesses/${businessId}/sync/full`, {
      params: { deviceId },
    });
    return response.data;
  },

  getCheckpoint: async (businessId: string, deviceId: string) => {
    const response = await api.get(`/businesses/${businessId}/sync/checkpoint`, {
      params: { deviceId },
    });
    return response.data;
  },

  getConflicts: async (businessId: string) => {
    const response = await api.get(`/businesses/${businessId}/sync/conflicts`);
    return response.data;
  },

  resolveConflict: async (
    businessId: string,
    conflictId: string,
    resolution: 'keep_server' | 'keep_client' | 'merge',
    mergedData?: any,
  ) => {
    const response = await api.post(
      `/businesses/${businessId}/sync/conflicts/${conflictId}/resolve`,
      { resolution, mergedData },
    );
    return response.data;
  },
};
