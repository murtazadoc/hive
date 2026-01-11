/**
 * HIVE Offline Database Manager
 * 
 * Simple but effective offline-first implementation using AsyncStorage.
 * For production, consider WatermelonDB or Realm for better performance.
 */

import AsyncStorage from '@react-native-async-storage/async-storage';
import { v4 as uuidv4 } from 'uuid';
import NetInfo from '@react-native-community/netinfo';
import { syncApi, SyncChange } from '../api/products';

// Storage keys
const KEYS = {
  PRODUCTS: (businessId: string) => `@hive_products_${businessId}`,
  CATEGORIES: (businessId: string) => `@hive_categories_${businessId}`,
  PENDING_CHANGES: (businessId: string) => `@hive_pending_${businessId}`,
  LAST_SYNC: (businessId: string) => `@hive_lastsync_${businessId}`,
  DEVICE_ID: '@hive_device_id',
};

// Types
export interface LocalProduct {
  id: string;
  syncId: string;
  businessId: string;
  categoryId?: string;
  name: string;
  slug: string;
  description?: string;
  shortDescription?: string;
  price: number;
  compareAtPrice?: number;
  currency: string;
  sku?: string;
  quantity: number;
  status: string;
  isFeatured: boolean;
  images: Array<{
    id: string;
    url: string;
    isPrimary: boolean;
  }>;
  attributes: Record<string, any>;
  tags: string[];
  createdAt: string;
  updatedAt: string;
  _localUpdatedAt: string;
  _pendingSync: boolean;
}

export interface LocalCategory {
  id: string;
  businessId: string;
  name: string;
  slug: string;
  description?: string;
  parentId?: string;
  level: number;
  sortOrder: number;
  isActive: boolean;
  productCount: number;
}

interface PendingChange {
  id: string;
  entityType: 'product' | 'product_category' | 'product_image';
  entityId: string;
  syncId: string;
  operation: 'create' | 'update' | 'delete';
  payload: any;
  clientTimestamp: string;
  retryCount: number;
}

// =====================================================
// DEVICE ID MANAGEMENT
// =====================================================
async function getDeviceId(): Promise<string> {
  let deviceId = await AsyncStorage.getItem(KEYS.DEVICE_ID);
  if (!deviceId) {
    deviceId = uuidv4();
    await AsyncStorage.setItem(KEYS.DEVICE_ID, deviceId);
  }
  return deviceId;
}

// =====================================================
// NETWORK STATUS
// =====================================================
let isOnline = true;

NetInfo.addEventListener((state) => {
  isOnline = state.isConnected ?? false;
  
  // Auto-sync when coming back online
  if (isOnline) {
    // Trigger sync for all businesses (handled by SyncManager)
  }
});

export const checkOnlineStatus = () => isOnline;

// =====================================================
// LOCAL DATABASE CLASS
// =====================================================
export class LocalDatabase {
  private businessId: string;

  constructor(businessId: string) {
    this.businessId = businessId;
  }

  // =====================================================
  // PRODUCTS
  // =====================================================
  async getProducts(): Promise<LocalProduct[]> {
    const data = await AsyncStorage.getItem(KEYS.PRODUCTS(this.businessId));
    return data ? JSON.parse(data) : [];
  }

  async getProduct(productId: string): Promise<LocalProduct | null> {
    const products = await this.getProducts();
    return products.find((p) => p.id === productId) || null;
  }

  async saveProduct(product: LocalProduct): Promise<void> {
    const products = await this.getProducts();
    const index = products.findIndex((p) => p.id === product.id);

    const updatedProduct = {
      ...product,
      _localUpdatedAt: new Date().toISOString(),
    };

    if (index >= 0) {
      products[index] = updatedProduct;
    } else {
      products.push(updatedProduct);
    }

    await AsyncStorage.setItem(
      KEYS.PRODUCTS(this.businessId),
      JSON.stringify(products),
    );
  }

  async deleteProduct(productId: string): Promise<void> {
    const products = await this.getProducts();
    const filtered = products.filter((p) => p.id !== productId);
    await AsyncStorage.setItem(
      KEYS.PRODUCTS(this.businessId),
      JSON.stringify(filtered),
    );
  }

  async saveProducts(products: LocalProduct[]): Promise<void> {
    await AsyncStorage.setItem(
      KEYS.PRODUCTS(this.businessId),
      JSON.stringify(products),
    );
  }

  async searchProducts(query: string): Promise<LocalProduct[]> {
    const products = await this.getProducts();
    const lowerQuery = query.toLowerCase();

    return products.filter(
      (p) =>
        p.name.toLowerCase().includes(lowerQuery) ||
        p.description?.toLowerCase().includes(lowerQuery) ||
        p.sku?.toLowerCase().includes(lowerQuery) ||
        p.tags.some((t) => t.toLowerCase().includes(lowerQuery)),
    );
  }

  async getProductsByCategory(categoryId: string): Promise<LocalProduct[]> {
    const products = await this.getProducts();
    return products.filter((p) => p.categoryId === categoryId);
  }

  // =====================================================
  // CATEGORIES
  // =====================================================
  async getCategories(): Promise<LocalCategory[]> {
    const data = await AsyncStorage.getItem(KEYS.CATEGORIES(this.businessId));
    return data ? JSON.parse(data) : [];
  }

  async saveCategories(categories: LocalCategory[]): Promise<void> {
    await AsyncStorage.setItem(
      KEYS.CATEGORIES(this.businessId),
      JSON.stringify(categories),
    );
  }

  async saveCategory(category: LocalCategory): Promise<void> {
    const categories = await this.getCategories();
    const index = categories.findIndex((c) => c.id === category.id);

    if (index >= 0) {
      categories[index] = category;
    } else {
      categories.push(category);
    }

    await this.saveCategories(categories);
  }

  // =====================================================
  // PENDING CHANGES (Offline Queue)
  // =====================================================
  async getPendingChanges(): Promise<PendingChange[]> {
    const data = await AsyncStorage.getItem(KEYS.PENDING_CHANGES(this.businessId));
    return data ? JSON.parse(data) : [];
  }

  async addPendingChange(change: Omit<PendingChange, 'id' | 'retryCount'>): Promise<void> {
    const changes = await this.getPendingChanges();

    // Check if there's already a pending change for this entity
    const existingIndex = changes.findIndex(
      (c) => c.entityId === change.entityId && c.entityType === change.entityType,
    );

    const newChange: PendingChange = {
      ...change,
      id: uuidv4(),
      retryCount: 0,
    };

    if (existingIndex >= 0) {
      // Merge changes
      if (change.operation === 'delete') {
        // Delete supersedes update
        changes[existingIndex] = newChange;
      } else if (changes[existingIndex].operation === 'create' && change.operation === 'update') {
        // Keep as create but update payload
        changes[existingIndex].payload = {
          ...changes[existingIndex].payload,
          ...change.payload,
        };
        changes[existingIndex].clientTimestamp = change.clientTimestamp;
      } else {
        changes[existingIndex] = newChange;
      }
    } else {
      changes.push(newChange);
    }

    await AsyncStorage.setItem(
      KEYS.PENDING_CHANGES(this.businessId),
      JSON.stringify(changes),
    );
  }

  async removePendingChange(changeId: string): Promise<void> {
    const changes = await this.getPendingChanges();
    const filtered = changes.filter((c) => c.id !== changeId);
    await AsyncStorage.setItem(
      KEYS.PENDING_CHANGES(this.businessId),
      JSON.stringify(filtered),
    );
  }

  async clearPendingChanges(): Promise<void> {
    await AsyncStorage.removeItem(KEYS.PENDING_CHANGES(this.businessId));
  }

  // =====================================================
  // SYNC METADATA
  // =====================================================
  async getLastSyncTime(): Promise<Date | null> {
    const data = await AsyncStorage.getItem(KEYS.LAST_SYNC(this.businessId));
    return data ? new Date(data) : null;
  }

  async setLastSyncTime(date: Date): Promise<void> {
    await AsyncStorage.setItem(KEYS.LAST_SYNC(this.businessId), date.toISOString());
  }

  // =====================================================
  // CLEAR ALL DATA
  // =====================================================
  async clearAll(): Promise<void> {
    await Promise.all([
      AsyncStorage.removeItem(KEYS.PRODUCTS(this.businessId)),
      AsyncStorage.removeItem(KEYS.CATEGORIES(this.businessId)),
      AsyncStorage.removeItem(KEYS.PENDING_CHANGES(this.businessId)),
      AsyncStorage.removeItem(KEYS.LAST_SYNC(this.businessId)),
    ]);
  }
}

// =====================================================
// SYNC MANAGER
// =====================================================
export class SyncManager {
  private db: LocalDatabase;
  private businessId: string;
  private isSyncing = false;

  constructor(businessId: string) {
    this.businessId = businessId;
    this.db = new LocalDatabase(businessId);
  }

  // =====================================================
  // FULL SYNC (Initial or Recovery)
  // =====================================================
  async fullSync(): Promise<{ success: boolean; error?: string }> {
    if (!isOnline) {
      return { success: false, error: 'No internet connection' };
    }

    if (this.isSyncing) {
      return { success: false, error: 'Sync already in progress' };
    }

    this.isSyncing = true;

    try {
      const deviceId = await getDeviceId();
      const response = await syncApi.fullSync(this.businessId, deviceId);

      // Save all products
      const products: LocalProduct[] = response.products.map((p: any) => ({
        ...p,
        _localUpdatedAt: p.updatedAt,
        _pendingSync: false,
      }));
      await this.db.saveProducts(products);

      // Save all categories
      await this.db.saveCategories(response.categories);

      // Update sync time
      await this.db.setLastSyncTime(new Date(response.serverTimestamp));

      return { success: true };
    } catch (error: any) {
      console.error('Full sync failed:', error);
      return { success: false, error: error.message };
    } finally {
      this.isSyncing = false;
    }
  }

  // =====================================================
  // INCREMENTAL SYNC
  // =====================================================
  async sync(): Promise<{
    success: boolean;
    pushed: number;
    pulled: number;
    conflicts: number;
    error?: string;
  }> {
    if (!isOnline) {
      return { success: false, pushed: 0, pulled: 0, conflicts: 0, error: 'Offline' };
    }

    if (this.isSyncing) {
      return { success: false, pushed: 0, pulled: 0, conflicts: 0, error: 'Sync in progress' };
    }

    this.isSyncing = true;
    let pushed = 0;
    let pulled = 0;
    let conflicts = 0;

    try {
      const deviceId = await getDeviceId();

      // 1. Push pending changes
      const pendingChanges = await this.db.getPendingChanges();

      if (pendingChanges.length > 0) {
        const changes: SyncChange[] = pendingChanges.map((c) => ({
          entityType: c.entityType,
          entityId: c.entityId,
          syncId: c.syncId,
          operation: c.operation,
          payload: c.payload,
          clientTimestamp: new Date(c.clientTimestamp),
        }));

        const pushResult = await syncApi.push(this.businessId, deviceId, changes);

        for (const result of pushResult.results) {
          if (result.success) {
            // Remove from pending
            const change = pendingChanges.find((c) => c.syncId === result.syncId);
            if (change) {
              await this.db.removePendingChange(change.id);
              pushed++;
            }
          } else if (result.error === 'Conflict detected') {
            conflicts++;
          }
        }
      }

      // 2. Pull changes from server
      const lastSync = await this.db.getLastSyncTime();
      const pullResult = await syncApi.pull(
        this.businessId,
        deviceId,
        lastSync || new Date(0),
      );

      for (const change of pullResult.changes) {
        if (change.entityType === 'product') {
          if (change.operation === 'delete') {
            await this.db.deleteProduct(change.entityId);
          } else {
            const product: LocalProduct = {
              ...change.data,
              _localUpdatedAt: change.serverTimestamp,
              _pendingSync: false,
            };
            await this.db.saveProduct(product);
          }
          pulled++;
        } else if (change.entityType === 'product_category') {
          if (change.operation === 'delete') {
            const categories = await this.db.getCategories();
            await this.db.saveCategories(
              categories.filter((c) => c.id !== change.entityId),
            );
          } else {
            await this.db.saveCategory(change.data);
          }
          pulled++;
        }
      }

      // Update sync time
      await this.db.setLastSyncTime(new Date(pullResult.serverTimestamp));

      // Continue pulling if there's more
      if (pullResult.hasMore) {
        // Recursively pull more (in background)
        setTimeout(() => this.sync(), 100);
      }

      return { success: true, pushed, pulled, conflicts };
    } catch (error: any) {
      console.error('Sync failed:', error);
      return { success: false, pushed, pulled, conflicts, error: error.message };
    } finally {
      this.isSyncing = false;
    }
  }

  // =====================================================
  // OFFLINE-FIRST OPERATIONS
  // =====================================================
  async createProduct(data: Omit<LocalProduct, 'id' | 'syncId' | '_localUpdatedAt' | '_pendingSync'>): Promise<LocalProduct> {
    const id = uuidv4();
    const syncId = uuidv4();
    const now = new Date().toISOString();

    const product: LocalProduct = {
      ...data,
      id,
      syncId,
      _localUpdatedAt: now,
      _pendingSync: true,
    };

    // Save locally
    await this.db.saveProduct(product);

    // Queue for sync
    await this.db.addPendingChange({
      entityType: 'product',
      entityId: id,
      syncId,
      operation: 'create',
      payload: data,
      clientTimestamp: now,
    });

    // Try to sync if online
    if (isOnline) {
      this.sync();
    }

    return product;
  }

  async updateProduct(productId: string, data: Partial<LocalProduct>): Promise<LocalProduct | null> {
    const product = await this.db.getProduct(productId);
    if (!product) return null;

    const now = new Date().toISOString();
    const updated: LocalProduct = {
      ...product,
      ...data,
      _localUpdatedAt: now,
      _pendingSync: true,
    };

    // Save locally
    await this.db.saveProduct(updated);

    // Queue for sync
    await this.db.addPendingChange({
      entityType: 'product',
      entityId: productId,
      syncId: product.syncId,
      operation: 'update',
      payload: data,
      clientTimestamp: now,
    });

    // Try to sync if online
    if (isOnline) {
      this.sync();
    }

    return updated;
  }

  async deleteProduct(productId: string): Promise<void> {
    const product = await this.db.getProduct(productId);
    if (!product) return;

    // Delete locally
    await this.db.deleteProduct(productId);

    // Queue for sync
    await this.db.addPendingChange({
      entityType: 'product',
      entityId: productId,
      syncId: product.syncId,
      operation: 'delete',
      payload: null,
      clientTimestamp: new Date().toISOString(),
    });

    // Try to sync if online
    if (isOnline) {
      this.sync();
    }
  }

  // Get sync status
  async getSyncStatus(): Promise<{
    lastSync: Date | null;
    pendingChanges: number;
    isOnline: boolean;
  }> {
    const [lastSync, pendingChanges] = await Promise.all([
      this.db.getLastSyncTime(),
      this.db.getPendingChanges(),
    ]);

    return {
      lastSync,
      pendingChanges: pendingChanges.length,
      isOnline,
    };
  }
}

// =====================================================
// SINGLETON ACCESS
// =====================================================
const syncManagers = new Map<string, SyncManager>();

export function getSyncManager(businessId: string): SyncManager {
  if (!syncManagers.has(businessId)) {
    syncManagers.set(businessId, new SyncManager(businessId));
  }
  return syncManagers.get(businessId)!;
}

export function getLocalDatabase(businessId: string): LocalDatabase {
  return new LocalDatabase(businessId);
}
