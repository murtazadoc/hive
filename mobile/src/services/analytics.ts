/**
 * HIVE Analytics Tracking Service
 * 
 * Client-side event tracking with batching and offline support
 */

import AsyncStorage from '@react-native-async-storage/async-storage';
import { Platform } from 'react-native';
import * as Device from 'expo-device';
import * as Application from 'expo-application';
import NetInfo from '@react-native-community/netinfo';
import { v4 as uuidv4 } from 'uuid';
import api from '../api/client';

// =====================================================
// TYPES
// =====================================================
export interface TrackEvent {
  eventName: string;
  eventCategory?: string;
  properties?: Record<string, any>;
  productId?: string;
  businessId?: string;
  orderId?: string;
}

interface QueuedEvent extends TrackEvent {
  id: string;
  timestamp: string;
  sessionId: string;
  userId?: string;
  anonymousId: string;
}

// =====================================================
// CONSTANTS
// =====================================================
const STORAGE_KEYS = {
  ANONYMOUS_ID: 'hive_anonymous_id',
  SESSION_ID: 'hive_session_id',
  SESSION_START: 'hive_session_start',
  EVENT_QUEUE: 'hive_event_queue',
  UTM_PARAMS: 'hive_utm_params',
};

const BATCH_SIZE = 10;
const FLUSH_INTERVAL = 30000; // 30 seconds
const SESSION_TIMEOUT = 30 * 60 * 1000; // 30 minutes

// =====================================================
// ANALYTICS CLASS
// =====================================================
class Analytics {
  private anonymousId: string = '';
  private sessionId: string = '';
  private userId: string | null = null;
  private eventQueue: QueuedEvent[] = [];
  private flushTimer: NodeJS.Timeout | null = null;
  private isInitialized = false;
  private utmParams: Record<string, string> = {};

  // Device info (cached)
  private deviceInfo = {
    deviceType: 'mobile',
    platform: Platform.OS,
    appVersion: '',
    osVersion: Platform.Version.toString(),
  };

  /**
   * Initialize analytics
   */
  async initialize(): Promise<void> {
    if (this.isInitialized) return;

    // Get or create anonymous ID
    let storedAnonymousId = await AsyncStorage.getItem(STORAGE_KEYS.ANONYMOUS_ID);
    if (!storedAnonymousId) {
      storedAnonymousId = uuidv4();
      await AsyncStorage.setItem(STORAGE_KEYS.ANONYMOUS_ID, storedAnonymousId);
    }
    this.anonymousId = storedAnonymousId;

    // Get app version
    this.deviceInfo.appVersion = Application.nativeApplicationVersion || '';

    // Check/start session
    await this.checkSession();

    // Load queued events
    const queuedEvents = await AsyncStorage.getItem(STORAGE_KEYS.EVENT_QUEUE);
    if (queuedEvents) {
      this.eventQueue = JSON.parse(queuedEvents);
    }

    // Load UTM params
    const utmParams = await AsyncStorage.getItem(STORAGE_KEYS.UTM_PARAMS);
    if (utmParams) {
      this.utmParams = JSON.parse(utmParams);
    }

    // Start flush timer
    this.startFlushTimer();

    this.isInitialized = true;
    console.log('Analytics initialized');
  }

  /**
   * Identify user
   */
  identify(userId: string): void {
    this.userId = userId;
    
    // Track identification
    this.track({
      eventName: 'user_identified',
      properties: { userId },
    });
  }

  /**
   * Clear user (logout)
   */
  reset(): void {
    this.userId = null;
    this.startNewSession();
  }

  /**
   * Set UTM parameters
   */
  async setUtmParams(params: {
    utmSource?: string;
    utmMedium?: string;
    utmCampaign?: string;
  }): Promise<void> {
    this.utmParams = { ...this.utmParams, ...params };
    await AsyncStorage.setItem(STORAGE_KEYS.UTM_PARAMS, JSON.stringify(this.utmParams));
  }

  /**
   * Track an event
   */
  track(event: TrackEvent): void {
    const queuedEvent: QueuedEvent = {
      ...event,
      id: uuidv4(),
      timestamp: new Date().toISOString(),
      sessionId: this.sessionId,
      userId: this.userId || undefined,
      anonymousId: this.anonymousId,
    };

    this.eventQueue.push(queuedEvent);
    this.persistQueue();

    // Flush if queue is full
    if (this.eventQueue.length >= BATCH_SIZE) {
      this.flush();
    }
  }

  /**
   * Track page/screen view
   */
  trackScreen(screenName: string, params?: Record<string, any>): void {
    this.track({
      eventName: 'screen_view',
      eventCategory: 'page_view',
      properties: {
        screen_name: screenName,
        ...params,
      },
    });
  }

  /**
   * Track product view
   */
  trackProductView(productId: string, productName: string, businessId: string): void {
    this.track({
      eventName: 'product_view',
      eventCategory: 'page_view',
      productId,
      businessId,
      properties: {
        product_name: productName,
      },
    });
  }

  /**
   * Track add to cart
   */
  trackAddToCart(
    productId: string,
    productName: string,
    price: number,
    quantity: number,
  ): void {
    this.track({
      eventName: 'add_to_cart',
      eventCategory: 'conversion',
      productId,
      properties: {
        product_name: productName,
        price,
        quantity,
        value: price * quantity,
      },
    });
  }

  /**
   * Track purchase
   */
  trackPurchase(
    orderId: string,
    amount: number,
    items: Array<{ productId: string; quantity: number; price: number }>,
  ): void {
    this.track({
      eventName: 'purchase',
      eventCategory: 'conversion',
      orderId,
      properties: {
        amount,
        items_count: items.length,
        items,
      },
    });
  }

  /**
   * Track search
   */
  trackSearch(query: string, resultsCount: number): void {
    this.track({
      eventName: 'search',
      eventCategory: 'action',
      properties: {
        query,
        results_count: resultsCount,
      },
    });
  }

  /**
   * Track search result click
   */
  trackSearchClick(query: string, productId: string, position: number): void {
    this.track({
      eventName: 'search_click',
      eventCategory: 'action',
      productId,
      properties: {
        query,
        position,
      },
    });
  }

  /**
   * Track share
   */
  trackShare(
    contentType: 'product' | 'business' | 'reel',
    contentId: string,
    platform: string,
  ): void {
    this.track({
      eventName: `share_${contentType}`,
      eventCategory: 'action',
      properties: {
        content_id: contentId,
        platform,
      },
      ...(contentType === 'product' && { productId: contentId }),
      ...(contentType === 'business' && { businessId: contentId }),
    });
  }

  /**
   * Track funnel step
   */
  trackFunnelStep(funnelName: string, stepName: string, stepOrder: number): void {
    this.track({
      eventName: 'funnel_step',
      properties: {
        funnel_name: funnelName,
        step_name: stepName,
        step_order: stepOrder,
      },
    });
  }

  /**
   * Track error
   */
  trackError(errorName: string, errorMessage: string, stack?: string): void {
    this.track({
      eventName: 'error',
      eventCategory: 'error',
      properties: {
        error_name: errorName,
        error_message: errorMessage,
        stack: stack?.slice(0, 500),
      },
    });
  }

  /**
   * Flush events to server
   */
  async flush(): Promise<void> {
    if (this.eventQueue.length === 0) return;

    // Check network
    const netInfo = await NetInfo.fetch();
    if (!netInfo.isConnected) {
      console.log('Offline, skipping flush');
      return;
    }

    // Take events from queue
    const eventsToSend = this.eventQueue.splice(0, BATCH_SIZE);

    try {
      await api.post('/track/events', {
        events: eventsToSend.map((e) => ({
          eventName: e.eventName,
          eventCategory: e.eventCategory,
          userId: e.userId,
          anonymousId: e.anonymousId,
          sessionId: e.sessionId,
          productId: e.productId,
          businessId: e.businessId,
          orderId: e.orderId,
          properties: e.properties,
          utmSource: this.utmParams.utmSource,
          utmMedium: this.utmParams.utmMedium,
          utmCampaign: this.utmParams.utmCampaign,
          deviceType: this.deviceInfo.deviceType,
          platform: this.deviceInfo.platform,
          appVersion: this.deviceInfo.appVersion,
          clientTimestamp: e.timestamp,
        })),
      });

      // Persist remaining queue
      this.persistQueue();
    } catch (error) {
      // Put events back in queue
      this.eventQueue.unshift(...eventsToSend);
      console.error('Failed to flush events:', error);
    }
  }

  // =====================================================
  // PRIVATE METHODS
  // =====================================================

  private async checkSession(): Promise<void> {
    const storedSessionId = await AsyncStorage.getItem(STORAGE_KEYS.SESSION_ID);
    const storedSessionStart = await AsyncStorage.getItem(STORAGE_KEYS.SESSION_START);

    if (storedSessionId && storedSessionStart) {
      const sessionAge = Date.now() - parseInt(storedSessionStart, 10);
      
      if (sessionAge < SESSION_TIMEOUT) {
        // Resume session
        this.sessionId = storedSessionId;
        return;
      }
    }

    // Start new session
    await this.startNewSession();
  }

  private async startNewSession(): Promise<void> {
    this.sessionId = uuidv4();
    const now = Date.now().toString();

    await AsyncStorage.setItem(STORAGE_KEYS.SESSION_ID, this.sessionId);
    await AsyncStorage.setItem(STORAGE_KEYS.SESSION_START, now);

    // Notify server
    try {
      await api.post('/track/session/start', {
        sessionId: this.sessionId,
        userId: this.userId,
        anonymousId: this.anonymousId,
        utmSource: this.utmParams.utmSource,
        utmMedium: this.utmParams.utmMedium,
        utmCampaign: this.utmParams.utmCampaign,
        deviceType: this.deviceInfo.deviceType,
        platform: this.deviceInfo.platform,
      });
    } catch (error) {
      console.error('Failed to start session:', error);
    }
  }

  private async persistQueue(): Promise<void> {
    await AsyncStorage.setItem(
      STORAGE_KEYS.EVENT_QUEUE,
      JSON.stringify(this.eventQueue),
    );
  }

  private startFlushTimer(): void {
    if (this.flushTimer) {
      clearInterval(this.flushTimer);
    }

    this.flushTimer = setInterval(() => {
      this.flush();
    }, FLUSH_INTERVAL);
  }

  /**
   * Stop analytics (app background)
   */
  async pause(): Promise<void> {
    if (this.flushTimer) {
      clearInterval(this.flushTimer);
      this.flushTimer = null;
    }

    await this.flush();
  }

  /**
   * Resume analytics (app foreground)
   */
  resume(): void {
    this.checkSession();
    this.startFlushTimer();
  }
}

// =====================================================
// SINGLETON EXPORT
// =====================================================
export const analytics = new Analytics();

// =====================================================
// REACT HOOK
// =====================================================
import { useEffect } from 'react';
import { AppState, AppStateStatus } from 'react-native';

export function useAnalytics() {
  useEffect(() => {
    // Initialize
    analytics.initialize();

    // Handle app state changes
    const handleAppStateChange = (state: AppStateStatus) => {
      if (state === 'active') {
        analytics.resume();
      } else if (state === 'background') {
        analytics.pause();
      }
    };

    const subscription = AppState.addEventListener('change', handleAppStateChange);

    return () => {
      subscription.remove();
      analytics.pause();
    };
  }, []);

  return analytics;
}
