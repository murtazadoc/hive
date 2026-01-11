/**
 * HIVE Optimized API Client
 * 
 * Features:
 * - Request caching
 * - Request deduplication
 * - Automatic retry
 * - Offline queue
 * - Response compression
 */

import axios, { AxiosInstance, AxiosRequestConfig, AxiosResponse } from 'axios';
import AsyncStorage from '@react-native-async-storage/async-storage';
import NetInfo from '@react-native-community/netinfo';

// =====================================================
// TYPES
// =====================================================
interface CacheEntry {
  data: any;
  timestamp: number;
  etag?: string;
}

interface QueuedRequest {
  id: string;
  config: AxiosRequestConfig;
  timestamp: number;
}

interface CacheOptions {
  ttl?: number;
  key?: string;
  staleWhileRevalidate?: boolean;
}

// =====================================================
// CONSTANTS
// =====================================================
const CACHE_PREFIX = '@api_cache:';
const QUEUE_KEY = '@api_queue';
const DEFAULT_TTL = 5 * 60 * 1000; // 5 minutes
const MAX_RETRIES = 3;
const RETRY_DELAY = 1000;

// =====================================================
// CACHE MANAGER
// =====================================================
class CacheManager {
  private memoryCache = new Map<string, CacheEntry>();

  async get(key: string): Promise<CacheEntry | null> {
    // Try memory first
    const memEntry = this.memoryCache.get(key);
    if (memEntry) {
      return memEntry;
    }

    // Try AsyncStorage
    try {
      const stored = await AsyncStorage.getItem(CACHE_PREFIX + key);
      if (stored) {
        const entry = JSON.parse(stored) as CacheEntry;
        this.memoryCache.set(key, entry); // Populate memory cache
        return entry;
      }
    } catch (error) {
      console.error('Cache read error:', error);
    }

    return null;
  }

  async set(key: string, data: any, ttl: number, etag?: string): Promise<void> {
    const entry: CacheEntry = {
      data,
      timestamp: Date.now(),
      etag,
    };

    // Store in memory
    this.memoryCache.set(key, entry);

    // Store in AsyncStorage
    try {
      await AsyncStorage.setItem(CACHE_PREFIX + key, JSON.stringify(entry));
    } catch (error) {
      console.error('Cache write error:', error);
    }

    // Schedule cleanup
    setTimeout(() => {
      this.memoryCache.delete(key);
    }, ttl);
  }

  async delete(key: string): Promise<void> {
    this.memoryCache.delete(key);
    try {
      await AsyncStorage.removeItem(CACHE_PREFIX + key);
    } catch (error) {
      console.error('Cache delete error:', error);
    }
  }

  async clear(): Promise<void> {
    this.memoryCache.clear();
    try {
      const keys = await AsyncStorage.getAllKeys();
      const cacheKeys = keys.filter((k) => k.startsWith(CACHE_PREFIX));
      await AsyncStorage.multiRemove(cacheKeys);
    } catch (error) {
      console.error('Cache clear error:', error);
    }
  }

  isStale(entry: CacheEntry, ttl: number): boolean {
    return Date.now() - entry.timestamp > ttl;
  }
}

// =====================================================
// REQUEST DEDUPLICATION
// =====================================================
class RequestDeduplicator {
  private pending = new Map<string, Promise<AxiosResponse>>();

  getKey(config: AxiosRequestConfig): string {
    return `${config.method}:${config.url}:${JSON.stringify(config.params || {})}`;
  }

  get(key: string): Promise<AxiosResponse> | undefined {
    return this.pending.get(key);
  }

  set(key: string, promise: Promise<AxiosResponse>): void {
    this.pending.set(key, promise);
    promise.finally(() => this.pending.delete(key));
  }
}

// =====================================================
// OFFLINE QUEUE
// =====================================================
class OfflineQueue {
  private queue: QueuedRequest[] = [];
  private processing = false;

  async load(): Promise<void> {
    try {
      const stored = await AsyncStorage.getItem(QUEUE_KEY);
      if (stored) {
        this.queue = JSON.parse(stored);
      }
    } catch (error) {
      console.error('Queue load error:', error);
    }
  }

  async save(): Promise<void> {
    try {
      await AsyncStorage.setItem(QUEUE_KEY, JSON.stringify(this.queue));
    } catch (error) {
      console.error('Queue save error:', error);
    }
  }

  add(config: AxiosRequestConfig): void {
    // Only queue mutating requests
    if (!['POST', 'PUT', 'PATCH', 'DELETE'].includes(config.method?.toUpperCase() || '')) {
      return;
    }

    this.queue.push({
      id: `${Date.now()}-${Math.random()}`,
      config,
      timestamp: Date.now(),
    });

    this.save();
  }

  async process(client: AxiosInstance): Promise<void> {
    if (this.processing || this.queue.length === 0) return;

    this.processing = true;

    while (this.queue.length > 0) {
      const request = this.queue[0];
      
      try {
        await client.request(request.config);
        this.queue.shift();
        await this.save();
      } catch (error) {
        // Stop processing on error
        break;
      }
    }

    this.processing = false;
  }

  get length(): number {
    return this.queue.length;
  }
}

// =====================================================
// OPTIMIZED API CLIENT
// =====================================================
class OptimizedApiClient {
  private client: AxiosInstance;
  private cache: CacheManager;
  private deduplicator: RequestDeduplicator;
  private offlineQueue: OfflineQueue;
  private isOnline: boolean = true;

  constructor(baseURL: string) {
    this.client = axios.create({
      baseURL,
      timeout: 30000,
      headers: {
        'Accept-Encoding': 'gzip, deflate',
      },
    });

    this.cache = new CacheManager();
    this.deduplicator = new RequestDeduplicator();
    this.offlineQueue = new OfflineQueue();

    this.setupInterceptors();
    this.setupNetworkListener();
    this.offlineQueue.load();
  }

  private setupInterceptors(): void {
    // Request interceptor
    this.client.interceptors.request.use(
      async (config) => {
        // Add auth token
        const token = await AsyncStorage.getItem('@auth_token');
        if (token) {
          config.headers.Authorization = `Bearer ${token}`;
        }

        return config;
      },
      (error) => Promise.reject(error),
    );

    // Response interceptor
    this.client.interceptors.response.use(
      (response) => response,
      async (error) => {
        // Handle 401
        if (error.response?.status === 401) {
          await AsyncStorage.removeItem('@auth_token');
          // Navigate to login
        }

        return Promise.reject(error);
      },
    );
  }

  private setupNetworkListener(): void {
    NetInfo.addEventListener((state) => {
      const wasOffline = !this.isOnline;
      this.isOnline = state.isConnected ?? true;

      // Process queue when coming online
      if (wasOffline && this.isOnline) {
        this.offlineQueue.process(this.client);
      }
    });
  }

  // =====================================================
  // PUBLIC METHODS
  // =====================================================

  /**
   * GET with caching
   */
  async get<T>(
    url: string,
    config?: AxiosRequestConfig,
    cacheOptions?: CacheOptions,
  ): Promise<T> {
    const cacheKey = cacheOptions?.key || `GET:${url}:${JSON.stringify(config?.params || {})}`;
    const ttl = cacheOptions?.ttl || DEFAULT_TTL;

    // Check cache
    const cached = await this.cache.get(cacheKey);
    
    if (cached) {
      if (!this.cache.isStale(cached, ttl)) {
        return cached.data;
      }

      // Stale-while-revalidate
      if (cacheOptions?.staleWhileRevalidate) {
        this.fetchAndCache(url, config, cacheKey, ttl, cached.etag);
        return cached.data;
      }
    }

    // Check for duplicate in-flight request
    const dedupeKey = this.deduplicator.getKey({ method: 'GET', url, ...config });
    const pending = this.deduplicator.get(dedupeKey);
    
    if (pending) {
      const response = await pending;
      return response.data;
    }

    // Make request
    const promise = this.fetchAndCache(url, config, cacheKey, ttl, cached?.etag);
    this.deduplicator.set(dedupeKey, promise as any);

    const response = await promise;
    return response;
  }

  private async fetchAndCache(
    url: string,
    config: AxiosRequestConfig | undefined,
    cacheKey: string,
    ttl: number,
    etag?: string,
  ): Promise<any> {
    const headers: Record<string, string> = {};
    if (etag) {
      headers['If-None-Match'] = etag;
    }

    try {
      const response = await this.client.get(url, {
        ...config,
        headers: { ...config?.headers, ...headers },
      });

      // Cache response
      await this.cache.set(
        cacheKey,
        response.data,
        ttl,
        response.headers.etag,
      );

      return response.data;
    } catch (error: any) {
      // Handle 304 Not Modified
      if (error.response?.status === 304 && etag) {
        const cached = await this.cache.get(cacheKey);
        if (cached) return cached.data;
      }

      throw error;
    }
  }

  /**
   * POST request
   */
  async post<T>(url: string, data?: any, config?: AxiosRequestConfig): Promise<T> {
    if (!this.isOnline) {
      this.offlineQueue.add({ method: 'POST', url, data, ...config });
      throw new Error('Request queued for later');
    }

    return this.withRetry(() => this.client.post(url, data, config));
  }

  /**
   * PUT request
   */
  async put<T>(url: string, data?: any, config?: AxiosRequestConfig): Promise<T> {
    if (!this.isOnline) {
      this.offlineQueue.add({ method: 'PUT', url, data, ...config });
      throw new Error('Request queued for later');
    }

    return this.withRetry(() => this.client.put(url, data, config));
  }

  /**
   * DELETE request
   */
  async delete<T>(url: string, config?: AxiosRequestConfig): Promise<T> {
    if (!this.isOnline) {
      this.offlineQueue.add({ method: 'DELETE', url, ...config });
      throw new Error('Request queued for later');
    }

    return this.withRetry(() => this.client.delete(url, config));
  }

  /**
   * Retry logic
   */
  private async withRetry<T>(
    fn: () => Promise<AxiosResponse<T>>,
    retries: number = MAX_RETRIES,
  ): Promise<T> {
    try {
      const response = await fn();
      return response.data;
    } catch (error: any) {
      if (retries > 0 && this.isRetryable(error)) {
        await this.delay(RETRY_DELAY);
        return this.withRetry(fn, retries - 1);
      }
      throw error;
    }
  }

  private isRetryable(error: any): boolean {
    if (!error.response) return true; // Network error
    const status = error.response.status;
    return status === 408 || status === 429 || status >= 500;
  }

  private delay(ms: number): Promise<void> {
    return new Promise((resolve) => setTimeout(resolve, ms));
  }

  /**
   * Invalidate cache
   */
  async invalidateCache(pattern?: string): Promise<void> {
    if (pattern) {
      // TODO: Implement pattern-based invalidation
    } else {
      await this.cache.clear();
    }
  }

  /**
   * Get pending queue count
   */
  get pendingQueueCount(): number {
    return this.offlineQueue.length;
  }
}

// =====================================================
// EXPORT SINGLETON
// =====================================================
const API_BASE_URL = 'https://api.hive.co.ke'; // Replace with actual

export const api = new OptimizedApiClient(API_BASE_URL);

export default api;
