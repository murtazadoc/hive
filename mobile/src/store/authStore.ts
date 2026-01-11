import { create } from 'zustand';
import { authApi, userApi, tokenManager } from '../api/client';

// =====================================================
// TYPES
// =====================================================
interface User {
  id: string;
  phoneNumber: string;
  email?: string;
  firstName: string;
  lastName: string;
  avatarUrl?: string;
  phoneVerified: boolean;
  emailVerified: boolean;
}

interface Business {
  id: string;
  businessName: string;
  slug: string;
  logoUrl?: string;
  businessType: 'retail' | 'professional' | 'both';
  status: string;
  isVerified: boolean;
  role: string;
}

interface Context {
  type: 'personal' | 'business';
  id: string;
  name: string;
  avatar?: string;
  role?: string;
  status?: string;
  isVerified?: boolean;
}

interface AuthState {
  // State
  user: User | null;
  businesses: {
    owned: Business[];
    memberships: Business[];
  };
  currentContext: Context | null;
  isLoading: boolean;
  isAuthenticated: boolean;
  error: string | null;

  // Actions
  register: (data: {
    phoneNumber: string;
    firstName: string;
    lastName: string;
    email?: string;
    password?: string;
  }) => Promise<void>;

  requestOtp: (phoneNumber: string, purpose: 'registration' | 'login' | 'password_reset') => Promise<any>;
  verifyOtp: (phoneNumber: string, code: string, purpose: string) => Promise<void>;
  
  loginWithPassword: (phoneNumber: string, password: string) => Promise<void>;
  loginWithOtp: (phoneNumber: string, code: string) => Promise<void>;
  
  logout: () => Promise<void>;
  
  loadUser: () => Promise<void>;
  loadBusinesses: () => Promise<void>;
  
  setCurrentContext: (context: Context) => void;
  switchContext: (contextId: string, type: 'personal' | 'business') => void;
  
  checkAuth: () => Promise<boolean>;
  clearError: () => void;
}

// =====================================================
// STORE
// =====================================================
export const useAuthStore = create<AuthState>((set, get) => ({
  // Initial state
  user: null,
  businesses: { owned: [], memberships: [] },
  currentContext: null,
  isLoading: false,
  isAuthenticated: false,
  error: null,

  // =====================================================
  // REGISTRATION
  // =====================================================
  register: async (data) => {
    set({ isLoading: true, error: null });
    try {
      await authApi.register(data);
      // After registration, user needs to verify OTP
      // Don't set isAuthenticated yet
    } catch (error: any) {
      const message = error.response?.data?.message || 'Registration failed';
      set({ error: message });
      throw error;
    } finally {
      set({ isLoading: false });
    }
  },

  // =====================================================
  // OTP
  // =====================================================
  requestOtp: async (phoneNumber, purpose) => {
    set({ isLoading: true, error: null });
    try {
      const response = await authApi.requestOtp(phoneNumber, purpose);
      return response;
    } catch (error: any) {
      const message = error.response?.data?.message || 'Failed to send OTP';
      set({ error: message });
      throw error;
    } finally {
      set({ isLoading: false });
    }
  },

  verifyOtp: async (phoneNumber, code, purpose) => {
    set({ isLoading: true, error: null });
    try {
      const response = await authApi.verifyOtp(phoneNumber, code, purpose);
      
      // If login or registration verification, we get tokens
      if (response.accessToken) {
        await tokenManager.setTokens(response.accessToken, response.refreshToken);
        await get().loadUser();
        set({ isAuthenticated: true });
      }
    } catch (error: any) {
      const message = error.response?.data?.message || 'Invalid OTP';
      set({ error: message });
      throw error;
    } finally {
      set({ isLoading: false });
    }
  },

  // =====================================================
  // LOGIN
  // =====================================================
  loginWithPassword: async (phoneNumber, password) => {
    set({ isLoading: true, error: null });
    try {
      const response = await authApi.loginWithPassword(phoneNumber, password);
      await tokenManager.setTokens(response.accessToken, response.refreshToken);
      await get().loadUser();
      set({ isAuthenticated: true });
    } catch (error: any) {
      const message = error.response?.data?.message || 'Invalid credentials';
      set({ error: message });
      throw error;
    } finally {
      set({ isLoading: false });
    }
  },

  loginWithOtp: async (phoneNumber, code) => {
    set({ isLoading: true, error: null });
    try {
      const response = await authApi.loginWithOtp(phoneNumber, code);
      await tokenManager.setTokens(response.accessToken, response.refreshToken);
      await get().loadUser();
      set({ isAuthenticated: true });
    } catch (error: any) {
      const message = error.response?.data?.message || 'Login failed';
      set({ error: message });
      throw error;
    } finally {
      set({ isLoading: false });
    }
  },

  // =====================================================
  // LOGOUT
  // =====================================================
  logout: async () => {
    set({ isLoading: true });
    try {
      const refreshToken = await tokenManager.getRefreshToken();
      await authApi.logout(refreshToken || undefined);
    } catch (error) {
      // Ignore logout errors
    } finally {
      await tokenManager.clearTokens();
      set({
        user: null,
        businesses: { owned: [], memberships: [] },
        currentContext: null,
        isAuthenticated: false,
        isLoading: false,
      });
    }
  },

  // =====================================================
  // LOAD DATA
  // =====================================================
  loadUser: async () => {
    try {
      const user = await authApi.getCurrentUser();
      
      // Set personal context as default
      const personalContext: Context = {
        type: 'personal',
        id: user.id,
        name: `${user.firstName} ${user.lastName}`,
        avatar: user.avatarUrl,
      };

      set({ 
        user, 
        currentContext: personalContext,
      });

      // Load businesses in background
      get().loadBusinesses();
    } catch (error) {
      // If failed to load user, clear auth
      await tokenManager.clearTokens();
      set({ isAuthenticated: false, user: null });
    }
  },

  loadBusinesses: async () => {
    try {
      const businesses = await userApi.getBusinesses();
      set({ businesses });
    } catch (error) {
      console.error('Failed to load businesses:', error);
    }
  },

  // =====================================================
  // CONTEXT SWITCHING
  // =====================================================
  setCurrentContext: (context) => {
    set({ currentContext: context });
  },

  switchContext: (contextId, type) => {
    const { user, businesses } = get();

    if (type === 'personal' && user) {
      set({
        currentContext: {
          type: 'personal',
          id: user.id,
          name: `${user.firstName} ${user.lastName}`,
          avatar: user.avatarUrl,
        },
      });
    } else {
      const allBusinesses = [...businesses.owned, ...businesses.memberships];
      const business = allBusinesses.find((b) => b.id === contextId);
      
      if (business) {
        set({
          currentContext: {
            type: 'business',
            id: business.id,
            name: business.businessName,
            avatar: business.logoUrl,
            role: business.role,
            status: business.status,
            isVerified: business.isVerified,
          },
        });
      }
    }
  },

  // =====================================================
  // AUTH CHECK
  // =====================================================
  checkAuth: async () => {
    const hasTokens = await tokenManager.hasTokens();
    
    if (!hasTokens) {
      set({ isAuthenticated: false });
      return false;
    }

    try {
      await get().loadUser();
      set({ isAuthenticated: true });
      return true;
    } catch (error) {
      await tokenManager.clearTokens();
      set({ isAuthenticated: false });
      return false;
    }
  },

  clearError: () => set({ error: null }),
}));

// =====================================================
// BUSINESS STORE (Separate for business operations)
// =====================================================
interface BusinessState {
  businesses: any[];
  selectedBusiness: any | null;
  isLoading: boolean;
  error: string | null;

  loadPublicBusinesses: (params?: any) => Promise<void>;
  loadBusiness: (id: string) => Promise<void>;
  createBusiness: (data: any) => Promise<any>;
  updateBusiness: (id: string, data: any) => Promise<void>;
  clearError: () => void;
}

export const useBusinessStore = create<BusinessState>((set, get) => ({
  businesses: [],
  selectedBusiness: null,
  isLoading: false,
  error: null,

  loadPublicBusinesses: async (params) => {
    set({ isLoading: true, error: null });
    try {
      const { businessApi } = await import('../api/client');
      const response = await businessApi.list(params);
      set({ businesses: response.data });
    } catch (error: any) {
      set({ error: error.response?.data?.message || 'Failed to load businesses' });
    } finally {
      set({ isLoading: false });
    }
  },

  loadBusiness: async (id) => {
    set({ isLoading: true, error: null });
    try {
      const { businessApi } = await import('../api/client');
      const business = await businessApi.getById(id);
      set({ selectedBusiness: business });
    } catch (error: any) {
      set({ error: error.response?.data?.message || 'Failed to load business' });
    } finally {
      set({ isLoading: false });
    }
  },

  createBusiness: async (data) => {
    set({ isLoading: true, error: null });
    try {
      const { businessApi } = await import('../api/client');
      const business = await businessApi.create(data);
      
      // Reload user's businesses
      const { useAuthStore } = await import('./authStore');
      useAuthStore.getState().loadBusinesses();
      
      return business;
    } catch (error: any) {
      const message = error.response?.data?.message || 'Failed to create business';
      set({ error: message });
      throw error;
    } finally {
      set({ isLoading: false });
    }
  },

  updateBusiness: async (id, data) => {
    set({ isLoading: true, error: null });
    try {
      const { businessApi } = await import('../api/client');
      const business = await businessApi.update(id, data);
      set({ selectedBusiness: business });
    } catch (error: any) {
      set({ error: error.response?.data?.message || 'Failed to update business' });
      throw error;
    } finally {
      set({ isLoading: false });
    }
  },

  clearError: () => set({ error: null }),
}));
