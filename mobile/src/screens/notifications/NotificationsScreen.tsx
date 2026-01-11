import React, { useEffect, useCallback } from 'react';
import {
  View,
  Text,
  FlatList,
  TouchableOpacity,
  StyleSheet,
  RefreshControl,
  ActivityIndicator,
} from 'react-native';
import { useNavigation, useFocusEffect } from '@react-navigation/native';
import Icon from 'react-native-vector-icons/Feather';
import { formatDistanceToNow } from 'date-fns';
import { useNotificationsStore } from '../../store/notificationsStore';
import { clearBadge } from '../../services/notifications';

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

// =====================================================
// NOTIFICATIONS SCREEN
// =====================================================
export default function NotificationsScreen() {
  const navigation = useNavigation<any>();
  const {
    notifications,
    isLoading,
    hasMore,
    fetchNotifications,
    fetchMore,
    markAsRead,
    markAllAsRead,
  } = useNotificationsStore();

  // Fetch on mount
  useEffect(() => {
    fetchNotifications();
  }, []);

  // Clear badge when screen is focused
  useFocusEffect(
    useCallback(() => {
      clearBadge();
    }, []),
  );

  const handlePress = async (notification: Notification) => {
    // Mark as read
    if (!notification.readAt) {
      await markAsRead(notification.id);
    }

    // Navigate based on action
    const data = notification.actionData || {};
    
    switch (notification.actionType) {
      case 'open_order':
        navigation.navigate('OrderDetail', { orderId: data.orderId });
        break;
      case 'open_product':
        navigation.navigate('ProductDetail', { productId: data.productId });
        break;
      case 'open_business':
        navigation.navigate('BusinessDetail', { businessId: data.businessId });
        break;
      case 'open_reel':
        navigation.navigate('ReelDetail', { reelId: data.reelId });
        break;
      default:
        // No action
        break;
    }
  };

  const getIcon = (type: string): string => {
    const icons: Record<string, string> = {
      'order_update': 'package',
      'payment': 'credit-card',
      'promotion': 'tag',
      'price_drop': 'trending-down',
      'new_product': 'box',
      'message': 'message-circle',
      'social': 'users',
      'announcement': 'bell',
    };
    return icons[type] || 'bell';
  };

  const getIconColor = (type: string): string => {
    const colors: Record<string, string> = {
      'order_update': '#3B82F6',
      'payment': '#10B981',
      'promotion': '#F59E0B',
      'price_drop': '#EF4444',
      'new_product': '#8B5CF6',
      'message': '#06B6D4',
      'social': '#EC4899',
    };
    return colors[type] || '#6B7280';
  };

  const renderItem = ({ item }: { item: Notification }) => (
    <TouchableOpacity
      style={[
        styles.notificationItem,
        !item.readAt && styles.notificationUnread,
      ]}
      onPress={() => handlePress(item)}
      activeOpacity={0.7}
    >
      <View
        style={[
          styles.iconContainer,
          { backgroundColor: getIconColor(item.type) + '20' },
        ]}
      >
        <Icon
          name={getIcon(item.type)}
          size={20}
          color={getIconColor(item.type)}
        />
      </View>

      <View style={styles.content}>
        <Text style={styles.title} numberOfLines={1}>
          {item.title}
        </Text>
        <Text style={styles.body} numberOfLines={2}>
          {item.body}
        </Text>
        <Text style={styles.time}>
          {formatDistanceToNow(new Date(item.createdAt), { addSuffix: true })}
        </Text>
      </View>

      {!item.readAt && <View style={styles.unreadDot} />}

      <Icon name="chevron-right" size={20} color="#D1D5DB" />
    </TouchableOpacity>
  );

  const renderEmpty = () => (
    <View style={styles.emptyContainer}>
      <Icon name="bell-off" size={64} color="#D1D5DB" />
      <Text style={styles.emptyTitle}>No notifications yet</Text>
      <Text style={styles.emptyText}>
        When you get notifications, they'll show up here
      </Text>
    </View>
  );

  const renderFooter = () => {
    if (!hasMore) return null;
    return (
      <View style={styles.footer}>
        <ActivityIndicator size="small" color="#F59E0B" />
      </View>
    );
  };

  const unreadCount = notifications.filter((n) => !n.readAt).length;

  return (
    <View style={styles.container}>
      {/* Header */}
      <View style={styles.header}>
        <TouchableOpacity onPress={() => navigation.goBack()}>
          <Icon name="arrow-left" size={24} color="#111827" />
        </TouchableOpacity>
        <Text style={styles.headerTitle}>Notifications</Text>
        {unreadCount > 0 ? (
          <TouchableOpacity onPress={markAllAsRead}>
            <Text style={styles.markAllRead}>Mark all read</Text>
          </TouchableOpacity>
        ) : (
          <View style={{ width: 80 }} />
        )}
      </View>

      {/* List */}
      <FlatList
        data={notifications}
        keyExtractor={(item) => item.id}
        renderItem={renderItem}
        ListEmptyComponent={!isLoading ? renderEmpty : null}
        ListFooterComponent={renderFooter}
        refreshControl={
          <RefreshControl
            refreshing={isLoading}
            onRefresh={fetchNotifications}
            colors={['#F59E0B']}
            tintColor="#F59E0B"
          />
        }
        onEndReached={fetchMore}
        onEndReachedThreshold={0.5}
        contentContainerStyle={
          notifications.length === 0 && !isLoading
            ? styles.emptyList
            : undefined
        }
      />
    </View>
  );
}

// =====================================================
// STYLES
// =====================================================
const styles = StyleSheet.create({
  container: {
    flex: 1,
    backgroundColor: '#F9FAFB',
  },
  header: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    padding: 16,
    backgroundColor: '#fff',
    borderBottomWidth: 1,
    borderBottomColor: '#E5E7EB',
  },
  headerTitle: {
    fontSize: 18,
    fontWeight: '600',
    color: '#111827',
  },
  markAllRead: {
    fontSize: 14,
    color: '#F59E0B',
    fontWeight: '500',
  },
  notificationItem: {
    flexDirection: 'row',
    alignItems: 'center',
    padding: 16,
    backgroundColor: '#fff',
    borderBottomWidth: 1,
    borderBottomColor: '#F3F4F6',
  },
  notificationUnread: {
    backgroundColor: '#FFFBEB',
  },
  iconContainer: {
    width: 44,
    height: 44,
    borderRadius: 22,
    justifyContent: 'center',
    alignItems: 'center',
    marginRight: 12,
  },
  content: {
    flex: 1,
    marginRight: 8,
  },
  title: {
    fontSize: 15,
    fontWeight: '600',
    color: '#111827',
    marginBottom: 4,
  },
  body: {
    fontSize: 14,
    color: '#6B7280',
    lineHeight: 20,
    marginBottom: 4,
  },
  time: {
    fontSize: 12,
    color: '#9CA3AF',
  },
  unreadDot: {
    width: 8,
    height: 8,
    borderRadius: 4,
    backgroundColor: '#F59E0B',
    marginRight: 8,
  },
  emptyContainer: {
    flex: 1,
    justifyContent: 'center',
    alignItems: 'center',
    padding: 32,
  },
  emptyList: {
    flex: 1,
  },
  emptyTitle: {
    fontSize: 18,
    fontWeight: '600',
    color: '#111827',
    marginTop: 16,
    marginBottom: 8,
  },
  emptyText: {
    fontSize: 14,
    color: '#6B7280',
    textAlign: 'center',
  },
  footer: {
    padding: 16,
    alignItems: 'center',
  },
});
