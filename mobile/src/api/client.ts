import axios, { AxiosInstance, AxiosError, InternalAxiosRequestConfig } from 'axios';
import AsyncStorage from '@react-native-async-storage/async-storage';

// Configuration
const API_BASE_URL = __DEV__ 
  ? 'http://10.0.2.2:3000/api/v1' // Android emulator
  : 'https://api.hive.co.ke/api/v1';

// Storage keys
const TOKEN_KEY = '@hive_access_token';
const REFRESH_KEY = '@hive_refresh_token';

// Create axios instance
const api: AxiosInstance = axios.create({
  baseURL: API_BASE_URL,
  timeout: 30000,
  headers: {
    'Content-Type': 'application/json',
  },
});

// Request interceptor - attach token
api.interceptors.request.use(
  async (config: InternalAxiosRequestConfig) => {
    const token = await AsyncStorage.getItem(TOKEN_KEY);
    if (token) {
      config.headers.Authorization = `Bearer ${token}`;
    }
    return config;
  },
  (error) => Promise.reject(error)
);

// Response interceptor - handle token refresh
api.interceptors.response.use(
  (response) => response,
  async (error: AxiosError) => {
    const originalRequest = error.config as InternalAxiosRequestConfig & { _retry?: boolean };

    // If 401 and not already retrying, try to refresh token
    if (error.response?.status === 401 && !originalRequest._retry) {
      originalRequest._retry = true;

      try {
        const refreshToken = await AsyncStorage.getItem(REFRESH_KEY);
        if (refreshToken) {
          const response = await axios.post(`${API_BASE_URL}/auth/token/refresh`, {
            refreshToken,
          });

          const { accessToken, refreshToken: newRefreshToken } = response.data;

          await AsyncStorage.setItem(TOKEN_KEY, accessToken);
          await AsyncStorage.setItem(REFRESH_KEY, newRefreshToken);

          originalRequest.headers.Authorization = `Bearer ${accessToken}`;
          return api(originalRequest);
        }
      } catch (refreshError) {
        // Refresh failed, clear tokens
        await AsyncStorage.multiRemove([TOKEN_KEY, REFRESH_KEY]);
        // TODO: Navigate to login
      }
    }

    return Promise.reject(error);
  }
);

// =====================================================
// AUTH API
// =====================================================
export const authApi = {
  register: async (data: {
    phoneNumber: string;
    firstName: string;
    lastName: string;
    email?: string;
    password?: string;
  }) => {
    const response = await api.post('/auth/register', data);
    return response.data;
  },

  requestOtp: async (phoneNumber: string, purpose: 'registration' | 'login' | 'password_reset') => {
    const response = await api.post('/auth/otp/request', { phoneNumber, purpose });
    return response.data;
  },

  verifyOtp: async (phoneNumber: string, code: string, purpose: string) => {
    const response = await api.post('/auth/otp/verify', { phoneNumber, code, purpose });
    return response.data;
  },

  loginWithPassword: async (phoneNumber: string, password: string) => {
    const response = await api.post('/auth/login/password', { phoneNumber, password });
    return response.data;
  },

  loginWithOtp: async (phoneNumber: string, code: string) => {
    const response = await api.post('/auth/login/otp', { phoneNumber, code });
    return response.data;
  },

  refreshToken: async (refreshToken: string) => {
    const response = await api.post('/auth/token/refresh', { refreshToken });
    return response.data;
  },

  logout: async (refreshToken?: string) => {
    const response = await api.post('/auth/logout', { refreshToken });
    return response.data;
  },

  getCurrentUser: async () => {
    const response = await api.post('/auth/me');
    return response.data;
  },
};

// =====================================================
// USER API
// =====================================================
export const userApi = {
  getProfile: async () => {
    const response = await api.get('/users/profile');
    return response.data;
  },

  updateProfile: async (data: {
    firstName?: string;
    lastName?: string;
    email?: string;
    avatarUrl?: string;
  }) => {
    const response = await api.put('/users/profile', data);
    return response.data;
  },

  getBusinesses: async () => {
    const response = await api.get('/users/businesses');
    return response.data;
  },

  getContexts: async () => {
    const response = await api.get('/users/contexts');
    return response.data;
  },
};

// =====================================================
// BUSINESS API
// =====================================================
export const businessApi = {
  list: async (params?: {
    type?: string;
    categoryId?: string;
    area?: string;
    verified?: boolean;
    page?: number;
    limit?: number;
  }) => {
    const response = await api.get('/businesses', { params });
    return response.data;
  },

  getById: async (id: string) => {
    const response = await api.get(`/businesses/${id}`);
    return response.data;
  },

  getBySlug: async (slug: string) => {
    const response = await api.get(`/businesses/slug/${slug}`);
    return response.data;
  },

  create: async (data: {
    businessName: string;
    businessType: 'retail' | 'professional' | 'both';
    whatsappNumber: string;
    tagline?: string;
    description?: string;
    categoryId?: string;
    address?: string;
    city?: string;
    area?: string;
  }) => {
    const response = await api.post('/businesses', data);
    return response.data;
  },

  update: async (id: string, data: any) => {
    const response = await api.put(`/businesses/${id}`, data);
    return response.data;
  },

  delete: async (id: string) => {
    const response = await api.delete(`/businesses/${id}`);
    return response.data;
  },

  // Members
  getMembers: async (businessId: string) => {
    const response = await api.get(`/businesses/${businessId}/members`);
    return response.data;
  },

  inviteMember: async (businessId: string, data: {
    phoneNumber: string;
    role: 'admin' | 'editor' | 'viewer';
  }) => {
    const response = await api.post(`/businesses/${businessId}/members`, data);
    return response.data;
  },

  // KYC
  submitKyc: async (businessId: string, documentUrls: string[]) => {
    const response = await api.post(`/businesses/${businessId}/kyc`, { documentUrls });
    return response.data;
  },
};

// =====================================================
// CATEGORY API
// =====================================================
export const categoryApi = {
  getAll: async () => {
    const response = await api.get('/categories');
    return response.data;
  },

  getRoots: async () => {
    const response = await api.get('/categories/roots');
    return response.data;
  },

  getById: async (id: string) => {
    const response = await api.get(`/categories/${id}`);
    return response.data;
  },

  getSubcategories: async (parentId: string) => {
    const response = await api.get(`/categories/${parentId}/subcategories`);
    return response.data;
  },
};

// =====================================================
// TOKEN MANAGEMENT
// =====================================================
export const tokenManager = {
  setTokens: async (accessToken: string, refreshToken: string) => {
    await AsyncStorage.setItem(TOKEN_KEY, accessToken);
    await AsyncStorage.setItem(REFRESH_KEY, refreshToken);
  },

  getAccessToken: async () => {
    return AsyncStorage.getItem(TOKEN_KEY);
  },

  getRefreshToken: async () => {
    return AsyncStorage.getItem(REFRESH_KEY);
  },

  clearTokens: async () => {
    await AsyncStorage.multiRemove([TOKEN_KEY, REFRESH_KEY]);
  },

  hasTokens: async () => {
    const token = await AsyncStorage.getItem(TOKEN_KEY);
    return !!token;
  },
};

export default api;
