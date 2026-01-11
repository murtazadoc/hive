import { create } from 'zustand';
import api from '../api/client';
import { setBadgeCount } from '../services/notifications';

// =====================================================
// TYPES
// =====================================================
interface Notification {
  id: string;
  type: string;
  title: string;
  body: string;
  imageUrl?: string;
  actionType?: string;
  actionData?: Record<string, any>;
  readAt?: string;
  createdAt: string;
}

interface NotificationsState {
  notifications: Notification[];
  unreadCount: number;
  isLoading: boolean;
  hasMore: boolean;
  cursor: string | null;

  // Actions
  fetchNotifications: () => Promise<void>;
  fetchMore: () => Promise<void>;
  fetchUnreadCount: () => Promise<void>;
  markAsRead: (id: string) => Promise<void>;
  markAllAsRead: () => Promise<void>;
  addNotification: (notification: Notification) => void;
  clearNotifications: () => void;
}

// =====================================================
// STORE
// =====================================================
export const useNotificationsStore = create<NotificationsState>((set, get) => ({
  notifications: [],
  unreadCount: 0,
  isLoading: false,
  hasMore: true,
  cursor: null,

  fetchNotifications: async () => {
    set({ isLoading: true });

    try {
      const response = await api.get('/notifications', {
        params: { limit: 20 },
      });

      const notifications = response.data;
      const cursor = notifications.length === 20 
        ? notifications[notifications.length - 1].id 
        : null;

      set({
        notifications,
        hasMore: notifications.length === 20,
        cursor,
        isLoading: false,
      });

      // Update badge
      get().fetchUnreadCount();
    } catch (error) {
      console.error('Failed to fetch notifications:', error);
      set({ isLoading: false });
    }
  },

  fetchMore: async () => {
    const { hasMore, cursor, isLoading, notifications } = get();
    
    if (!hasMore || isLoading || !cursor) return;

    set({ isLoading: true });

    try {
      const response = await api.get('/notifications', {
        params: { limit: 20, cursor },
      });

      const newNotifications = response.data;
      const newCursor = newNotifications.length === 20
        ? newNotifications[newNotifications.length - 1].id
        : null;

      set({
        notifications: [...notifications, ...newNotifications],
        hasMore: newNotifications.length === 20,
        cursor: newCursor,
        isLoading: false,
      });
    } catch (error) {
      console.error('Failed to fetch more notifications:', error);
      set({ isLoading: false });
    }
  },

  fetchUnreadCount: async () => {
    try {
      const response = await api.get('/notifications/unread-count');
      const count = response.data.count;
      
      set({ unreadCount: count });
      setBadgeCount(count);
    } catch (error) {
      console.error('Failed to fetch unread count:', error);
    }
  },

  markAsRead: async (id: string) => {
    try {
      await api.post(`/notifications/${id}/read`);

      set((state) => ({
        notifications: state.notifications.map((n) =>
          n.id === id ? { ...n, readAt: new Date().toISOString() } : n
        ),
        unreadCount: Math.max(0, state.unreadCount - 1),
      }));

      // Update badge
      const { unreadCount } = get();
      setBadgeCount(unreadCount);
    } catch (error) {
      console.error('Failed to mark as read:', error);
    }
  },

  markAllAsRead: async () => {
    try {
      await api.post('/notifications/read-all');

      set((state) => ({
        notifications: state.notifications.map((n) => ({
          ...n,
          readAt: n.readAt || new Date().toISOString(),
        })),
        unreadCount: 0,
      }));

      setBadgeCount(0);
    } catch (error) {
      console.error('Failed to mark all as read:', error);
    }
  },

  addNotification: (notification: Notification) => {
    set((state) => ({
      notifications: [notification, ...state.notifications],
      unreadCount: state.unreadCount + 1,
    }));

    // Update badge
    const { unreadCount } = get();
    setBadgeCount(unreadCount);
  },

  clearNotifications: () => {
    set({
      notifications: [],
      unreadCount: 0,
      hasMore: true,
      cursor: null,
    });
    setBadgeCount(0);
  },
}));

// =====================================================
// SELECTOR HOOKS
// =====================================================
export const useUnreadCount = () => useNotificationsStore((state) => state.unreadCount);
