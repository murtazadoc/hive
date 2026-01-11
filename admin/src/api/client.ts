import axios from 'axios';

const API_BASE_URL = import.meta.env.VITE_API_URL || '/api/v1';

// Create axios instance
const api = axios.create({
  baseURL: API_BASE_URL,
  headers: {
    'Content-Type': 'application/json',
  },
});

// Request interceptor - add auth token
api.interceptors.request.use((config) => {
  const token = localStorage.getItem('admin_token');
  if (token) {
    config.headers.Authorization = `Bearer ${token}`;
  }
  return config;
});

// Response interceptor - handle errors
api.interceptors.response.use(
  (response) => response,
  (error) => {
    if (error.response?.status === 401) {
      localStorage.removeItem('admin_token');
      window.location.href = '/login';
    }
    return Promise.reject(error);
  }
);

export default api;

// =====================================================
// AUTH API
// =====================================================
export const authApi = {
  login: async (email: string, password: string) => {
    const response = await api.post('/auth/admin/login', { email, password });
    return response.data;
  },
  
  logout: async () => {
    await api.post('/auth/logout');
    localStorage.removeItem('admin_token');
  },
  
  getProfile: async () => {
    const response = await api.get('/users/profile');
    return response.data;
  },
};

// =====================================================
// DASHBOARD API
// =====================================================
export const dashboardApi = {
  getStats: async () => {
    const response = await api.get('/admin/dashboard/stats');
    return response.data;
  },
  
  getRecentActivity: async () => {
    const response = await api.get('/admin/dashboard/activity');
    return response.data;
  },
  
  getChartData: async (period: string = '7d') => {
    const response = await api.get(`/admin/dashboard/charts?period=${period}`);
    return response.data;
  },
};

// =====================================================
// USERS API
// =====================================================
export interface User {
  id: string;
  phoneNumber: string;
  email?: string;
  firstName?: string;
  lastName?: string;
  isVerified: boolean;
  isBanned: boolean;
  createdAt: string;
  _count?: {
    businesses: number;
  };
}

export interface UserFilters {
  search?: string;
  verified?: boolean;
  banned?: boolean;
  page?: number;
  limit?: number;
}

export const usersApi = {
  list: async (filters: UserFilters = {}) => {
    const response = await api.get('/admin/users', { params: filters });
    return response.data;
  },
  
  getById: async (id: string) => {
    const response = await api.get(`/admin/users/${id}`);
    return response.data;
  },
  
  ban: async (id: string, reason: string) => {
    const response = await api.post(`/admin/users/${id}/ban`, { reason });
    return response.data;
  },
  
  unban: async (id: string) => {
    const response = await api.post(`/admin/users/${id}/unban`);
    return response.data;
  },
  
  delete: async (id: string) => {
    const response = await api.delete(`/admin/users/${id}`);
    return response.data;
  },
};

// =====================================================
// BUSINESSES API
// =====================================================
export interface Business {
  id: string;
  ownerId: string;
  businessName: string;
  slug: string;
  businessType: 'retail' | 'professional' | 'both';
  status: 'draft' | 'pending' | 'approved' | 'rejected' | 'suspended';
  categoryId?: string;
  logoUrl?: string;
  phoneNumber?: string;
  email?: string;
  whatsappNumber?: string;
  description?: string;
  address?: string;
  city?: string;
  county?: string;
  isVerified: boolean;
  createdAt: string;
  updatedAt: string;
  owner?: User;
  category?: { name: string };
  _count?: {
    products: number;
    members: number;
  };
}

export interface BusinessFilters {
  search?: string;
  status?: string;
  type?: string;
  categoryId?: string;
  page?: number;
  limit?: number;
}

export const businessesApi = {
  list: async (filters: BusinessFilters = {}) => {
    const response = await api.get('/admin/businesses', { params: filters });
    return response.data;
  },
  
  getById: async (id: string) => {
    const response = await api.get(`/admin/businesses/${id}`);
    return response.data;
  },
  
  approve: async (id: string, notes?: string) => {
    const response = await api.post(`/admin/businesses/${id}/approve`, { notes });
    return response.data;
  },
  
  reject: async (id: string, reason: string) => {
    const response = await api.post(`/admin/businesses/${id}/reject`, { reason });
    return response.data;
  },
  
  suspend: async (id: string, reason: string) => {
    const response = await api.post(`/admin/businesses/${id}/suspend`, { reason });
    return response.data;
  },
  
  unsuspend: async (id: string) => {
    const response = await api.post(`/admin/businesses/${id}/unsuspend`);
    return response.data;
  },
  
  delete: async (id: string) => {
    const response = await api.delete(`/admin/businesses/${id}`);
    return response.data;
  },
  
  getPendingCount: async () => {
    const response = await api.get('/admin/businesses/pending/count');
    return response.data;
  },
};

// =====================================================
// PRODUCTS API
// =====================================================
export interface Product {
  id: string;
  businessId: string;
  name: string;
  slug: string;
  price: number;
  quantity: number;
  status: string;
  isFeatured: boolean;
  createdAt: string;
  business?: Business;
  images?: { url: string; thumbnailUrl?: string }[];
}

export interface ProductFilters {
  search?: string;
  status?: string;
  businessId?: string;
  featured?: boolean;
  page?: number;
  limit?: number;
}

export const productsApi = {
  list: async (filters: ProductFilters = {}) => {
    const response = await api.get('/admin/products', { params: filters });
    return response.data;
  },
  
  getById: async (id: string) => {
    const response = await api.get(`/admin/products/${id}`);
    return response.data;
  },
  
  feature: async (id: string) => {
    const response = await api.post(`/admin/products/${id}/feature`);
    return response.data;
  },
  
  unfeature: async (id: string) => {
    const response = await api.post(`/admin/products/${id}/unfeature`);
    return response.data;
  },
  
  delete: async (id: string) => {
    const response = await api.delete(`/admin/products/${id}`);
    return response.data;
  },
};

// =====================================================
// CATEGORIES API
// =====================================================
export interface Category {
  id: string;
  name: string;
  slug: string;
  description?: string;
  icon?: string;
  parentId?: string;
  level: number;
  sortOrder: number;
  isActive: boolean;
  _count?: {
    businesses: number;
    children: number;
  };
}

export const categoriesApi = {
  list: async () => {
    const response = await api.get('/admin/categories');
    return response.data;
  },
  
  create: async (data: Partial<Category>) => {
    const response = await api.post('/admin/categories', data);
    return response.data;
  },
  
  update: async (id: string, data: Partial<Category>) => {
    const response = await api.put(`/admin/categories/${id}`, data);
    return response.data;
  },
  
  delete: async (id: string) => {
    const response = await api.delete(`/admin/categories/${id}`);
    return response.data;
  },
  
  reorder: async (items: { id: string; sortOrder: number }[]) => {
    const response = await api.post('/admin/categories/reorder', { items });
    return response.data;
  },
};

// =====================================================
// REPORTS API
// =====================================================
export const reportsApi = {
  getBusinessReport: async (startDate: string, endDate: string) => {
    const response = await api.get('/admin/reports/businesses', {
      params: { startDate, endDate },
    });
    return response.data;
  },
  
  getUserReport: async (startDate: string, endDate: string) => {
    const response = await api.get('/admin/reports/users', {
      params: { startDate, endDate },
    });
    return response.data;
  },
  
  getProductReport: async (startDate: string, endDate: string) => {
    const response = await api.get('/admin/reports/products', {
      params: { startDate, endDate },
    });
    return response.data;
  },
  
  exportCsv: async (type: string, startDate: string, endDate: string) => {
    const response = await api.get(`/admin/reports/export/${type}`, {
      params: { startDate, endDate },
      responseType: 'blob',
    });
    return response.data;
  },
};
