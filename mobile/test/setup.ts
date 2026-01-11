import '@testing-library/jest-native/extend-expect';
import { jest } from '@jest/globals';

// =====================================================
// MOCK NATIVE MODULES
// =====================================================

// Mock AsyncStorage
jest.mock('@react-native-async-storage/async-storage', () =>
  require('@react-native-async-storage/async-storage/jest/async-storage-mock'),
);

// Mock NetInfo
jest.mock('@react-native-community/netinfo', () => ({
  addEventListener: jest.fn(() => jest.fn()),
  fetch: jest.fn().mockResolvedValue({
    isConnected: true,
    isInternetReachable: true,
  }),
}));

// Mock Expo modules
jest.mock('expo-notifications', () => ({
  getPermissionsAsync: jest.fn().mockResolvedValue({ status: 'granted' }),
  requestPermissionsAsync: jest.fn().mockResolvedValue({ status: 'granted' }),
  getExpoPushTokenAsync: jest.fn().mockResolvedValue({ data: 'ExponentPushToken[xxx]' }),
  setNotificationHandler: jest.fn(),
  addNotificationReceivedListener: jest.fn(() => ({ remove: jest.fn() })),
  addNotificationResponseReceivedListener: jest.fn(() => ({ remove: jest.fn() })),
  setNotificationChannelAsync: jest.fn(),
  setBadgeCountAsync: jest.fn(),
}));

jest.mock('expo-device', () => ({
  isDevice: true,
}));

jest.mock('expo-constants', () => ({
  expoConfig: {
    extra: {
      eas: { projectId: 'test-project' },
    },
    version: '1.0.0',
  },
}));

jest.mock('expo-application', () => ({
  nativeApplicationVersion: '1.0.0',
}));

// Mock react-native-reanimated
jest.mock('react-native-reanimated', () => {
  const Reanimated = require('react-native-reanimated/mock');
  Reanimated.default.call = () => {};
  return Reanimated;
});

// Silence console warnings in tests
global.console = {
  ...console,
  warn: jest.fn(),
  error: jest.fn(),
};

// =====================================================
// TEST UTILITIES
// =====================================================

export const flushPromises = () => new Promise(setImmediate);

export const waitFor = async (condition: () => boolean, timeout = 5000) => {
  const start = Date.now();
  while (!condition()) {
    if (Date.now() - start > timeout) {
      throw new Error('Timeout waiting for condition');
    }
    await new Promise((resolve) => setTimeout(resolve, 50));
  }
};

// =====================================================
// MOCK DATA
// =====================================================

export const mockProduct = {
  id: 'product-123',
  name: 'Test Product',
  slug: 'test-product',
  description: 'A test product',
  price: 1500,
  images: [{ id: 'img-1', url: 'https://example.com/image.jpg', isPrimary: true }],
  business: {
    id: 'business-123',
    businessName: 'Test Business',
    slug: 'test-business',
  },
};

export const mockBusiness = {
  id: 'business-123',
  businessName: 'Test Business',
  slug: 'test-business',
  description: 'A test business',
  logoUrl: 'https://example.com/logo.jpg',
  followersCount: 100,
};

export const mockUser = {
  id: 'user-123',
  email: 'test@example.com',
  fullName: 'Test User',
  phone: '+254712345678',
};

export const mockOrder = {
  id: 'order-123',
  orderNumber: 'HV241225ABC123',
  items: [{ productId: 'product-123', quantity: 1, price: 1500 }],
  totalAmount: 1650,
  status: 'pending',
  paymentStatus: 'pending',
};
