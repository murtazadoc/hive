import { create } from 'zustand';
import {
  LocalProduct,
  LocalCategory,
  getSyncManager,
  getLocalDatabase,
  checkOnlineStatus,
} from '../database/localDb';
import { productApi, productCategoryApi, inventoryApi } from '../api/products';

// =====================================================
// PRODUCT STORE
// =====================================================
interface ProductState {
  // Data
  products: LocalProduct[];
  categories: LocalCategory[];
  selectedProduct: LocalProduct | null;

  // UI State
  isLoading: boolean;
  isSyncing: boolean;
  error: string | null;

  // Sync Status
  lastSyncAt: Date | null;
  pendingChanges: number;
  isOnline: boolean;

  // Current business context
  currentBusinessId: string | null;

  // Actions
  setBusinessContext: (businessId: string) => Promise<void>;
  loadProducts: (params?: any) => Promise<void>;
  loadCategories: () => Promise<void>;
  getProduct: (productId: string) => Promise<LocalProduct | null>;

  // CRUD with offline support
  createProduct: (data: any) => Promise<LocalProduct>;
  updateProduct: (productId: string, data: any) => Promise<LocalProduct | null>;
  deleteProduct: (productId: string) => Promise<void>;

  // Categories
  createCategory: (data: any) => Promise<any>;
  updateCategory: (categoryId: string, data: any) => Promise<any>;
  deleteCategory: (categoryId: string) => Promise<void>;

  // Inventory
  updateInventory: (
    productId: string,
    action: 'set' | 'add' | 'subtract',
    quantity: number,
    reason?: string,
  ) => Promise<void>;

  // Sync
  sync: () => Promise<void>;
  fullSync: () => Promise<void>;
  checkSyncStatus: () => Promise<void>;

  // Helpers
  searchProducts: (query: string) => Promise<LocalProduct[]>;
  clearError: () => void;
}

export const useProductStore = create<ProductState>((set, get) => ({
  // Initial state
  products: [],
  categories: [],
  selectedProduct: null,
  isLoading: false,
  isSyncing: false,
  error: null,
  lastSyncAt: null,
  pendingChanges: 0,
  isOnline: true,
  currentBusinessId: null,

  // =====================================================
  // BUSINESS CONTEXT
  // =====================================================
  setBusinessContext: async (businessId: string) => {
    set({ currentBusinessId: businessId, isLoading: true });

    try {
      const db = getLocalDatabase(businessId);
      const syncManager = getSyncManager(businessId);

      // Load from local first
      const [products, categories, status] = await Promise.all([
        db.getProducts(),
        db.getCategories(),
        syncManager.getSyncStatus(),
      ]);

      set({
        products,
        categories,
        lastSyncAt: status.lastSync,
        pendingChanges: status.pendingChanges,
        isOnline: status.isOnline,
      });

      // If empty or never synced, do full sync
      if (products.length === 0 || !status.lastSync) {
        await get().fullSync();
      } else {
        // Otherwise do incremental sync in background
        get().sync();
      }
    } catch (error: any) {
      set({ error: error.message });
    } finally {
      set({ isLoading: false });
    }
  },

  // =====================================================
  // LOAD DATA
  // =====================================================
  loadProducts: async (params) => {
    const { currentBusinessId } = get();
    if (!currentBusinessId) return;

    set({ isLoading: true });

    try {
      const db = getLocalDatabase(currentBusinessId);
      let products = await db.getProducts();

      // Apply filters locally
      if (params?.categoryId) {
        products = products.filter((p) => p.categoryId === params.categoryId);
      }
      if (params?.status) {
        products = products.filter((p) => p.status === params.status);
      }
      if (params?.search) {
        products = await db.searchProducts(params.search);
      }
      if (params?.inStock === true) {
        products = products.filter((p) => p.quantity > 0);
      }

      // Sort
      if (params?.sort === 'price_asc') {
        products.sort((a, b) => a.price - b.price);
      } else if (params?.sort === 'price_desc') {
        products.sort((a, b) => b.price - a.price);
      } else if (params?.sort === 'name') {
        products.sort((a, b) => a.name.localeCompare(b.name));
      } else {
        products.sort(
          (a, b) =>
            new Date(b.createdAt).getTime() - new Date(a.createdAt).getTime(),
        );
      }

      set({ products });
    } catch (error: any) {
      set({ error: error.message });
    } finally {
      set({ isLoading: false });
    }
  },

  loadCategories: async () => {
    const { currentBusinessId } = get();
    if (!currentBusinessId) return;

    try {
      const db = getLocalDatabase(currentBusinessId);
      const categories = await db.getCategories();
      set({ categories });
    } catch (error: any) {
      set({ error: error.message });
    }
  },

  getProduct: async (productId: string) => {
    const { currentBusinessId } = get();
    if (!currentBusinessId) return null;

    const db = getLocalDatabase(currentBusinessId);
    const product = await db.getProduct(productId);
    set({ selectedProduct: product });
    return product;
  },

  // =====================================================
  // PRODUCT CRUD (Offline-First)
  // =====================================================
  createProduct: async (data) => {
    const { currentBusinessId } = get();
    if (!currentBusinessId) throw new Error('No business context');

    set({ isLoading: true, error: null });

    try {
      const syncManager = getSyncManager(currentBusinessId);
      const product = await syncManager.createProduct({
        ...data,
        businessId: currentBusinessId,
        currency: data.currency || 'KES',
        status: data.status || 'draft',
        isFeatured: data.isFeatured || false,
        quantity: data.quantity || 0,
        images: data.images || [],
        attributes: data.attributes || {},
        tags: data.tags || [],
        createdAt: new Date().toISOString(),
        updatedAt: new Date().toISOString(),
      });

      // Update local state
      set((state) => ({
        products: [product, ...state.products],
        pendingChanges: state.pendingChanges + 1,
      }));

      return product;
    } catch (error: any) {
      set({ error: error.message });
      throw error;
    } finally {
      set({ isLoading: false });
    }
  },

  updateProduct: async (productId, data) => {
    const { currentBusinessId } = get();
    if (!currentBusinessId) return null;

    set({ isLoading: true, error: null });

    try {
      const syncManager = getSyncManager(currentBusinessId);
      const product = await syncManager.updateProduct(productId, {
        ...data,
        updatedAt: new Date().toISOString(),
      });

      if (product) {
        set((state) => ({
          products: state.products.map((p) =>
            p.id === productId ? product : p,
          ),
          selectedProduct:
            state.selectedProduct?.id === productId
              ? product
              : state.selectedProduct,
          pendingChanges: state.pendingChanges + 1,
        }));
      }

      return product;
    } catch (error: any) {
      set({ error: error.message });
      throw error;
    } finally {
      set({ isLoading: false });
    }
  },

  deleteProduct: async (productId) => {
    const { currentBusinessId } = get();
    if (!currentBusinessId) return;

    set({ isLoading: true, error: null });

    try {
      const syncManager = getSyncManager(currentBusinessId);
      await syncManager.deleteProduct(productId);

      set((state) => ({
        products: state.products.filter((p) => p.id !== productId),
        selectedProduct:
          state.selectedProduct?.id === productId ? null : state.selectedProduct,
        pendingChanges: state.pendingChanges + 1,
      }));
    } catch (error: any) {
      set({ error: error.message });
      throw error;
    } finally {
      set({ isLoading: false });
    }
  },

  // =====================================================
  // CATEGORIES (Online-only for now)
  // =====================================================
  createCategory: async (data) => {
    const { currentBusinessId } = get();
    if (!currentBusinessId) throw new Error('No business context');

    if (!checkOnlineStatus()) {
      throw new Error('Categories require internet connection');
    }

    set({ isLoading: true, error: null });

    try {
      const category = await productCategoryApi.create(currentBusinessId, data);
      
      const db = getLocalDatabase(currentBusinessId);
      await db.saveCategory(category);

      set((state) => ({
        categories: [...state.categories, category],
      }));

      return category;
    } catch (error: any) {
      set({ error: error.message });
      throw error;
    } finally {
      set({ isLoading: false });
    }
  },

  updateCategory: async (categoryId, data) => {
    const { currentBusinessId } = get();
    if (!currentBusinessId) return null;

    if (!checkOnlineStatus()) {
      throw new Error('Categories require internet connection');
    }

    set({ isLoading: true, error: null });

    try {
      const category = await productCategoryApi.update(
        currentBusinessId,
        categoryId,
        data,
      );

      const db = getLocalDatabase(currentBusinessId);
      await db.saveCategory(category);

      set((state) => ({
        categories: state.categories.map((c) =>
          c.id === categoryId ? category : c,
        ),
      }));

      return category;
    } catch (error: any) {
      set({ error: error.message });
      throw error;
    } finally {
      set({ isLoading: false });
    }
  },

  deleteCategory: async (categoryId) => {
    const { currentBusinessId } = get();
    if (!currentBusinessId) return;

    if (!checkOnlineStatus()) {
      throw new Error('Categories require internet connection');
    }

    set({ isLoading: true, error: null });

    try {
      await productCategoryApi.delete(currentBusinessId, categoryId);

      const db = getLocalDatabase(currentBusinessId);
      const categories = await db.getCategories();
      await db.saveCategories(categories.filter((c) => c.id !== categoryId));

      set((state) => ({
        categories: state.categories.filter((c) => c.id !== categoryId),
      }));
    } catch (error: any) {
      set({ error: error.message });
      throw error;
    } finally {
      set({ isLoading: false });
    }
  },

  // =====================================================
  // INVENTORY
  // =====================================================
  updateInventory: async (productId, action, quantity, reason) => {
    const { currentBusinessId, updateProduct } = get();
    if (!currentBusinessId) return;

    // Update locally first
    const product = await get().getProduct(productId);
    if (!product) return;

    let newQuantity = product.quantity;
    switch (action) {
      case 'set':
        newQuantity = quantity;
        break;
      case 'add':
        newQuantity = product.quantity + quantity;
        break;
      case 'subtract':
        newQuantity = Math.max(0, product.quantity - quantity);
        break;
    }

    await updateProduct(productId, { quantity: newQuantity });

    // If online, also update server
    if (checkOnlineStatus()) {
      try {
        await inventoryApi.update(currentBusinessId, productId, {
          action,
          quantity,
          reason,
        });
      } catch (error) {
        console.error('Failed to sync inventory:', error);
        // Already updated locally, will sync later
      }
    }
  },

  // =====================================================
  // SYNC
  // =====================================================
  sync: async () => {
    const { currentBusinessId } = get();
    if (!currentBusinessId) return;

    set({ isSyncing: true });

    try {
      const syncManager = getSyncManager(currentBusinessId);
      const result = await syncManager.sync();

      if (result.success) {
        // Reload data from local DB
        const db = getLocalDatabase(currentBusinessId);
        const [products, categories, status] = await Promise.all([
          db.getProducts(),
          db.getCategories(),
          syncManager.getSyncStatus(),
        ]);

        set({
          products,
          categories,
          lastSyncAt: status.lastSync,
          pendingChanges: status.pendingChanges,
        });
      }
    } catch (error: any) {
      console.error('Sync failed:', error);
    } finally {
      set({ isSyncing: false });
    }
  },

  fullSync: async () => {
    const { currentBusinessId } = get();
    if (!currentBusinessId) return;

    set({ isSyncing: true, isLoading: true });

    try {
      const syncManager = getSyncManager(currentBusinessId);
      const result = await syncManager.fullSync();

      if (result.success) {
        const db = getLocalDatabase(currentBusinessId);
        const [products, categories, status] = await Promise.all([
          db.getProducts(),
          db.getCategories(),
          syncManager.getSyncStatus(),
        ]);

        set({
          products,
          categories,
          lastSyncAt: status.lastSync,
          pendingChanges: status.pendingChanges,
        });
      }
    } catch (error: any) {
      set({ error: error.message });
    } finally {
      set({ isSyncing: false, isLoading: false });
    }
  },

  checkSyncStatus: async () => {
    const { currentBusinessId } = get();
    if (!currentBusinessId) return;

    const syncManager = getSyncManager(currentBusinessId);
    const status = await syncManager.getSyncStatus();

    set({
      lastSyncAt: status.lastSync,
      pendingChanges: status.pendingChanges,
      isOnline: status.isOnline,
    });
  },

  // =====================================================
  // HELPERS
  // =====================================================
  searchProducts: async (query) => {
    const { currentBusinessId } = get();
    if (!currentBusinessId) return [];

    const db = getLocalDatabase(currentBusinessId);
    return db.searchProducts(query);
  },

  clearError: () => set({ error: null }),
}));
