/**
 * HIVE Push Notifications Setup
 * 
 * Uses Expo Notifications for cross-platform support
 */

import { useEffect, useRef, useState } from 'react';
import { Platform, AppState, AppStateStatus } from 'react-native';
import * as Notifications from 'expo-notifications';
import * as Device from 'expo-device';
import Constants from 'expo-constants';
import { useNavigation } from '@react-navigation/native';
import api from '../api/client';

// =====================================================
// CONFIGURATION
// =====================================================

// Configure notification behavior
Notifications.setNotificationHandler({
  handleNotification: async () => ({
    shouldShowAlert: true,
    shouldPlaySound: true,
    shouldSetBadge: true,
  }),
});

// =====================================================
// TYPES
// =====================================================
export interface NotificationData {
  notificationId?: string;
  actionType?: string;
  screen?: string;
  orderId?: string;
  productId?: string;
  businessId?: string;
  reelId?: string;
  url?: string;
}

// =====================================================
// REGISTER FOR PUSH NOTIFICATIONS
// =====================================================
export async function registerForPushNotifications(): Promise<string | null> {
  if (!Device.isDevice) {
    console.log('Push notifications only work on physical devices');
    return null;
  }

  // Check existing permissions
  const { status: existingStatus } = await Notifications.getPermissionsAsync();
  let finalStatus = existingStatus;

  // Request if not granted
  if (existingStatus !== 'granted') {
    const { status } = await Notifications.requestPermissionsAsync();
    finalStatus = status;
  }

  if (finalStatus !== 'granted') {
    console.log('Push notification permission denied');
    return null;
  }

  // Get push token
  try {
    const token = await Notifications.getExpoPushTokenAsync({
      projectId: Constants.expoConfig?.extra?.eas?.projectId,
    });

    // Register with backend
    await registerTokenWithBackend(token.data);

    return token.data;
  } catch (error) {
    console.error('Failed to get push token:', error);
    return null;
  }
}

/**
 * Register token with backend
 */
async function registerTokenWithBackend(token: string): Promise<void> {
  try {
    await api.post('/notifications/tokens', {
      token,
      platform: Platform.OS as 'ios' | 'android',
      appVersion: Constants.expoConfig?.version,
      osVersion: Platform.Version.toString(),
    });
    console.log('Push token registered with backend');
  } catch (error) {
    console.error('Failed to register token:', error);
  }
}

/**
 * Unregister token
 */
export async function unregisterPushToken(token: string): Promise<void> {
  try {
    await api.delete(`/notifications/tokens/${encodeURIComponent(token)}`);
  } catch (error) {
    console.error('Failed to unregister token:', error);
  }
}

// =====================================================
// ANDROID CHANNEL SETUP
// =====================================================
export async function setupAndroidChannels(): Promise<void> {
  if (Platform.OS !== 'android') return;

  await Notifications.setNotificationChannelAsync('default', {
    name: 'Default',
    importance: Notifications.AndroidImportance.HIGH,
    vibrationPattern: [0, 250, 250, 250],
    lightColor: '#F59E0B',
  });

  await Notifications.setNotificationChannelAsync('orders', {
    name: 'Order Updates',
    importance: Notifications.AndroidImportance.HIGH,
    sound: 'default',
  });

  await Notifications.setNotificationChannelAsync('promotions', {
    name: 'Promotions',
    importance: Notifications.AndroidImportance.DEFAULT,
  });

  await Notifications.setNotificationChannelAsync('messages', {
    name: 'Messages',
    importance: Notifications.AndroidImportance.HIGH,
    sound: 'default',
  });
}

// =====================================================
// USE NOTIFICATIONS HOOK
// =====================================================
export function useNotifications() {
  const [expoPushToken, setExpoPushToken] = useState<string | null>(null);
  const [notification, setNotification] = useState<Notifications.Notification | null>(null);
  const navigation = useNavigation<any>();
  const notificationListener = useRef<Notifications.Subscription>();
  const responseListener = useRef<Notifications.Subscription>();

  useEffect(() => {
    // Setup Android channels
    setupAndroidChannels();

    // Register for push
    registerForPushNotifications().then((token) => {
      setExpoPushToken(token);
    });

    // Listen for incoming notifications (foreground)
    notificationListener.current = Notifications.addNotificationReceivedListener(
      (notification) => {
        setNotification(notification);
        console.log('Notification received:', notification);
      },
    );

    // Listen for notification interactions (tap)
    responseListener.current = Notifications.addNotificationResponseReceivedListener(
      (response) => {
        const data = response.notification.request.content.data as NotificationData;
        handleNotificationAction(data, navigation);
      },
    );

    // Check for initial notification (app opened from notification)
    Notifications.getLastNotificationResponseAsync().then((response) => {
      if (response) {
        const data = response.notification.request.content.data as NotificationData;
        handleNotificationAction(data, navigation);
      }
    });

    return () => {
      if (notificationListener.current) {
        Notifications.removeNotificationSubscription(notificationListener.current);
      }
      if (responseListener.current) {
        Notifications.removeNotificationSubscription(responseListener.current);
      }
    };
  }, []);

  return {
    expoPushToken,
    notification,
  };
}

// =====================================================
// HANDLE NOTIFICATION ACTION
// =====================================================
function handleNotificationAction(
  data: NotificationData,
  navigation: any,
): void {
  // Track click
  if (data.notificationId) {
    api.post(`/notifications/${data.notificationId}/click`).catch(() => {});
  }

  // Navigate based on action type
  switch (data.actionType) {
    case 'open_order':
      if (data.orderId) {
        navigation.navigate('OrderDetail', { orderId: data.orderId });
      }
      break;

    case 'open_product':
      if (data.productId) {
        navigation.navigate('ProductDetail', { productId: data.productId });
      }
      break;

    case 'open_business':
      if (data.businessId) {
        navigation.navigate('BusinessDetail', { businessId: data.businessId });
      }
      break;

    case 'open_reel':
      if (data.reelId) {
        navigation.navigate('ReelDetail', { reelId: data.reelId });
      }
      break;

    case 'open_url':
      if (data.url) {
        // Open in browser or deep link
        navigation.navigate('WebView', { url: data.url });
      }
      break;

    case 'open_screen':
      if (data.screen) {
        navigation.navigate(data.screen);
      }
      break;

    default:
      // Open notifications list
      navigation.navigate('Notifications');
  }
}

// =====================================================
// BADGE MANAGEMENT
// =====================================================
export async function setBadgeCount(count: number): Promise<void> {
  await Notifications.setBadgeCountAsync(count);
}

export async function clearBadge(): Promise<void> {
  await Notifications.setBadgeCountAsync(0);
}

// =====================================================
// LOCAL NOTIFICATIONS
// =====================================================
export async function scheduleLocalNotification(
  title: string,
  body: string,
  data?: NotificationData,
  trigger?: Notifications.NotificationTriggerInput,
): Promise<string> {
  return Notifications.scheduleNotificationAsync({
    content: {
      title,
      body,
      data,
      sound: true,
    },
    trigger: trigger || null, // null = immediate
  });
}

export async function cancelScheduledNotification(id: string): Promise<void> {
  await Notifications.cancelScheduledNotificationAsync(id);
}

export async function cancelAllScheduledNotifications(): Promise<void> {
  await Notifications.cancelAllScheduledNotificationsAsync();
}
