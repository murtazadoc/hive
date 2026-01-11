import React, { useEffect } from 'react';
import {
  View,
  Text,
  StyleSheet,
  TouchableOpacity,
  ScrollView,
  SafeAreaView,
  StatusBar,
  Image,
  FlatList,
} from 'react-native';
import { NativeStackNavigationProp } from '@react-navigation/native-stack';
import { CompositeNavigationProp } from '@react-navigation/native';
import { BottomTabNavigationProp } from '@react-navigation/bottom-tabs';
import Icon from 'react-native-vector-icons/Feather';
import { RootStackParamList, MainTabParamList } from '../../navigation/AppNavigator';
import { useAuthStore, useBusinessStore } from '../../store/authStore';

type Props = {
  navigation: CompositeNavigationProp<
    BottomTabNavigationProp<MainTabParamList, 'Home'>,
    NativeStackNavigationProp<RootStackParamList>
  >;
};

// Quick action buttons
const QUICK_ACTIONS = [
  { id: '1', icon: 'plus-circle', label: 'Add Business', action: 'CreateBusiness' },
  { id: '2', icon: 'briefcase', label: 'My Businesses', action: 'MyBusinesses' },
  { id: '3', icon: 'search', label: 'Find Services', action: 'Explore' },
  { id: '4', icon: 'users', label: 'Network', action: 'Network' },
];

export default function HomeScreen({ navigation }: Props) {
  const { user, currentContext, businesses, loadBusinesses } = useAuthStore();
  const { businesses: publicBusinesses, loadPublicBusinesses } = useBusinessStore();

  useEffect(() => {
    loadBusinesses();
    loadPublicBusinesses({ limit: 5, verified: true });
  }, []);

  const handleQuickAction = (action: string) => {
    switch (action) {
      case 'CreateBusiness':
        navigation.navigate('CreateBusiness');
        break;
      case 'MyBusinesses':
        navigation.navigate('MyBusinesses');
        break;
      case 'Explore':
        navigation.navigate('Explore');
        break;
      default:
        break;
    }
  };

  const renderQuickAction = ({ item }: { item: typeof QUICK_ACTIONS[0] }) => (
    <TouchableOpacity
      style={styles.quickActionCard}
      onPress={() => handleQuickAction(item.action)}
    >
      <View style={styles.quickActionIcon}>
        <Icon name={item.icon} size={24} color="#F59E0B" />
      </View>
      <Text style={styles.quickActionLabel}>{item.label}</Text>
    </TouchableOpacity>
  );

  const totalBusinesses = businesses.owned.length + businesses.memberships.length;

  return (
    <SafeAreaView style={styles.container}>
      <StatusBar barStyle="dark-content" backgroundColor="#FFFFFF" />
      
      <ScrollView showsVerticalScrollIndicator={false}>
        {/* Header with Context Switcher */}
        <View style={styles.header}>
          <View style={styles.headerLeft}>
            <TouchableOpacity style={styles.contextSwitcher}>
              <View style={styles.avatarContainer}>
                {currentContext?.avatar ? (
                  <Image source={{ uri: currentContext.avatar }} style={styles.avatar} />
                ) : (
                  <View style={styles.avatarPlaceholder}>
                    <Text style={styles.avatarText}>
                      {currentContext?.name?.charAt(0) || 'U'}
                    </Text>
                  </View>
                )}
              </View>
              <View style={styles.contextInfo}>
                <Text style={styles.greeting}>
                  {currentContext?.type === 'personal' ? 'Personal' : 'Business'}
                </Text>
                <View style={styles.contextNameRow}>
                  <Text style={styles.contextName} numberOfLines={1}>
                    {currentContext?.name || 'Select Context'}
                  </Text>
                  <Icon name="chevron-down" size={16} color="#6B7280" />
                </View>
              </View>
            </TouchableOpacity>
          </View>
          
          <View style={styles.headerRight}>
            <TouchableOpacity style={styles.iconButton}>
              <Icon name="bell" size={22} color="#374151" />
              <View style={styles.notificationBadge} />
            </TouchableOpacity>
          </View>
        </View>

        {/* Welcome Section */}
        <View style={styles.welcomeSection}>
          <Text style={styles.welcomeText}>
            Welcome back, {user?.firstName || 'User'}! 👋
          </Text>
          <Text style={styles.welcomeSubtext}>
            What would you like to do today?
          </Text>
        </View>

        {/* Quick Actions */}
        <View style={styles.section}>
          <FlatList
            data={QUICK_ACTIONS}
            renderItem={renderQuickAction}
            keyExtractor={(item) => item.id}
            horizontal
            showsHorizontalScrollIndicator={false}
            contentContainerStyle={styles.quickActionsContainer}
          />
        </View>

        {/* Stats Card */}
        <View style={styles.section}>
          <View style={styles.statsCard}>
            <View style={styles.statItem}>
              <Text style={styles.statValue}>{businesses.owned.length}</Text>
              <Text style={styles.statLabel}>Owned</Text>
            </View>
            <View style={styles.statDivider} />
            <View style={styles.statItem}>
              <Text style={styles.statValue}>{businesses.memberships.length}</Text>
              <Text style={styles.statLabel}>Member Of</Text>
            </View>
            <View style={styles.statDivider} />
            <View style={styles.statItem}>
              <Text style={styles.statValue}>{totalBusinesses}</Text>
              <Text style={styles.statLabel}>Total</Text>
            </View>
          </View>
        </View>

        {/* My Businesses Preview */}
        {businesses.owned.length > 0 && (
          <View style={styles.section}>
            <View style={styles.sectionHeader}>
              <Text style={styles.sectionTitle}>My Businesses</Text>
              <TouchableOpacity onPress={() => navigation.navigate('MyBusinesses')}>
                <Text style={styles.seeAllText}>See All</Text>
              </TouchableOpacity>
            </View>
            
            {businesses.owned.slice(0, 3).map((business) => (
              <TouchableOpacity
                key={business.id}
                style={styles.businessCard}
                onPress={() => navigation.navigate('BusinessDetail', { businessId: business.id })}
              >
                <View style={styles.businessLogo}>
                  {business.logoUrl ? (
                    <Image source={{ uri: business.logoUrl }} style={styles.logoImage} />
                  ) : (
                    <Icon name="briefcase" size={24} color="#F59E0B" />
                  )}
                </View>
                <View style={styles.businessInfo}>
                  <Text style={styles.businessName}>{business.businessName}</Text>
                  <View style={styles.businessMeta}>
                    <View style={[
                      styles.statusBadge,
                      business.status === 'approved' && styles.statusApproved,
                      business.status === 'pending' && styles.statusPending,
                      business.status === 'draft' && styles.statusDraft,
                    ]}>
                      <Text style={styles.statusText}>{business.status}</Text>
                    </View>
                    {business.isVerified && (
                      <Icon name="check-circle" size={14} color="#10B981" style={{ marginLeft: 8 }} />
                    )}
                  </View>
                </View>
                <Icon name="chevron-right" size={20} color="#9CA3AF" />
              </TouchableOpacity>
            ))}
          </View>
        )}

        {/* Featured Businesses */}
        {publicBusinesses.length > 0 && (
          <View style={styles.section}>
            <View style={styles.sectionHeader}>
              <Text style={styles.sectionTitle}>Featured Businesses</Text>
              <TouchableOpacity onPress={() => navigation.navigate('Explore')}>
                <Text style={styles.seeAllText}>Explore</Text>
              </TouchableOpacity>
            </View>
            
            <ScrollView horizontal showsHorizontalScrollIndicator={false}>
              {publicBusinesses.map((business: any) => (
                <TouchableOpacity
                  key={business.id}
                  style={styles.featuredCard}
                  onPress={() => navigation.navigate('BusinessDetail', { businessId: business.id })}
                >
                  <View style={styles.featuredImage}>
                    <Icon name="image" size={32} color="#D1D5DB" />
                  </View>
                  <Text style={styles.featuredName} numberOfLines={1}>
                    {business.businessName}
                  </Text>
                  <Text style={styles.featuredCategory} numberOfLines={1}>
                    {business.category?.name || 'Business'}
                  </Text>
                </TouchableOpacity>
              ))}
            </ScrollView>
          </View>
        )}

        {/* Empty State */}
        {businesses.owned.length === 0 && (
          <View style={styles.emptyState}>
            <View style={styles.emptyIcon}>
              <Icon name="briefcase" size={48} color="#D1D5DB" />
            </View>
            <Text style={styles.emptyTitle}>No Businesses Yet</Text>
            <Text style={styles.emptyText}>
              Create your first business to start connecting with customers
            </Text>
            <TouchableOpacity
              style={styles.emptyButton}
              onPress={() => navigation.navigate('CreateBusiness')}
            >
              <Icon name="plus" size={20} color="#FFFFFF" />
              <Text style={styles.emptyButtonText}>Create Business</Text>
            </TouchableOpacity>
          </View>
        )}

        <View style={{ height: 24 }} />
      </ScrollView>
    </SafeAreaView>
  );
}

const styles = StyleSheet.create({
  container: {
    flex: 1,
    backgroundColor: '#F9FAFB',
  },
  header: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    paddingHorizontal: 20,
    paddingVertical: 16,
    backgroundColor: '#FFFFFF',
    borderBottomWidth: 1,
    borderBottomColor: '#E5E7EB',
  },
  headerLeft: {
    flex: 1,
  },
  headerRight: {
    flexDirection: 'row',
  },
  contextSwitcher: {
    flexDirection: 'row',
    alignItems: 'center',
  },
  avatarContainer: {
    marginRight: 12,
  },
  avatar: {
    width: 44,
    height: 44,
    borderRadius: 22,
  },
  avatarPlaceholder: {
    width: 44,
    height: 44,
    borderRadius: 22,
    backgroundColor: '#FEF3C7',
    justifyContent: 'center',
    alignItems: 'center',
  },
  avatarText: {
    fontSize: 18,
    fontWeight: '600',
    color: '#F59E0B',
  },
  contextInfo: {
    flex: 1,
  },
  greeting: {
    fontSize: 12,
    color: '#6B7280',
    marginBottom: 2,
  },
  contextNameRow: {
    flexDirection: 'row',
    alignItems: 'center',
  },
  contextName: {
    fontSize: 16,
    fontWeight: '600',
    color: '#111827',
    marginRight: 4,
    maxWidth: 150,
  },
  iconButton: {
    width: 44,
    height: 44,
    borderRadius: 22,
    backgroundColor: '#F3F4F6',
    justifyContent: 'center',
    alignItems: 'center',
    position: 'relative',
  },
  notificationBadge: {
    position: 'absolute',
    top: 10,
    right: 10,
    width: 8,
    height: 8,
    borderRadius: 4,
    backgroundColor: '#EF4444',
  },
  welcomeSection: {
    paddingHorizontal: 20,
    paddingTop: 24,
    paddingBottom: 16,
  },
  welcomeText: {
    fontSize: 24,
    fontWeight: '700',
    color: '#111827',
    marginBottom: 4,
  },
  welcomeSubtext: {
    fontSize: 16,
    color: '#6B7280',
  },
  section: {
    marginBottom: 24,
  },
  sectionHeader: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    paddingHorizontal: 20,
    marginBottom: 12,
  },
  sectionTitle: {
    fontSize: 18,
    fontWeight: '600',
    color: '#111827',
  },
  seeAllText: {
    fontSize: 14,
    color: '#F59E0B',
    fontWeight: '500',
  },
  quickActionsContainer: {
    paddingHorizontal: 16,
  },
  quickActionCard: {
    width: 100,
    alignItems: 'center',
    marginHorizontal: 4,
    padding: 16,
    backgroundColor: '#FFFFFF',
    borderRadius: 12,
    shadowColor: '#000',
    shadowOffset: { width: 0, height: 2 },
    shadowOpacity: 0.05,
    shadowRadius: 4,
    elevation: 2,
  },
  quickActionIcon: {
    width: 48,
    height: 48,
    borderRadius: 24,
    backgroundColor: '#FEF3C7',
    justifyContent: 'center',
    alignItems: 'center',
    marginBottom: 8,
  },
  quickActionLabel: {
    fontSize: 12,
    color: '#374151',
    textAlign: 'center',
  },
  statsCard: {
    flexDirection: 'row',
    backgroundColor: '#FFFFFF',
    marginHorizontal: 20,
    padding: 20,
    borderRadius: 16,
    shadowColor: '#000',
    shadowOffset: { width: 0, height: 2 },
    shadowOpacity: 0.05,
    shadowRadius: 8,
    elevation: 2,
  },
  statItem: {
    flex: 1,
    alignItems: 'center',
  },
  statValue: {
    fontSize: 28,
    fontWeight: '700',
    color: '#F59E0B',
    marginBottom: 4,
  },
  statLabel: {
    fontSize: 12,
    color: '#6B7280',
  },
  statDivider: {
    width: 1,
    backgroundColor: '#E5E7EB',
    marginVertical: 4,
  },
  businessCard: {
    flexDirection: 'row',
    alignItems: 'center',
    backgroundColor: '#FFFFFF',
    marginHorizontal: 20,
    marginBottom: 8,
    padding: 16,
    borderRadius: 12,
    shadowColor: '#000',
    shadowOffset: { width: 0, height: 1 },
    shadowOpacity: 0.05,
    shadowRadius: 4,
    elevation: 1,
  },
  businessLogo: {
    width: 48,
    height: 48,
    borderRadius: 12,
    backgroundColor: '#FEF3C7',
    justifyContent: 'center',
    alignItems: 'center',
    marginRight: 12,
  },
  logoImage: {
    width: 48,
    height: 48,
    borderRadius: 12,
  },
  businessInfo: {
    flex: 1,
  },
  businessName: {
    fontSize: 16,
    fontWeight: '600',
    color: '#111827',
    marginBottom: 4,
  },
  businessMeta: {
    flexDirection: 'row',
    alignItems: 'center',
  },
  statusBadge: {
    paddingHorizontal: 8,
    paddingVertical: 2,
    borderRadius: 4,
    backgroundColor: '#F3F4F6',
  },
  statusApproved: {
    backgroundColor: '#D1FAE5',
  },
  statusPending: {
    backgroundColor: '#FEF3C7',
  },
  statusDraft: {
    backgroundColor: '#F3F4F6',
  },
  statusText: {
    fontSize: 12,
    fontWeight: '500',
    color: '#374151',
    textTransform: 'capitalize',
  },
  featuredCard: {
    width: 150,
    marginLeft: 20,
    backgroundColor: '#FFFFFF',
    borderRadius: 12,
    overflow: 'hidden',
    shadowColor: '#000',
    shadowOffset: { width: 0, height: 2 },
    shadowOpacity: 0.05,
    shadowRadius: 4,
    elevation: 2,
  },
  featuredImage: {
    width: '100%',
    height: 100,
    backgroundColor: '#F3F4F6',
    justifyContent: 'center',
    alignItems: 'center',
  },
  featuredName: {
    fontSize: 14,
    fontWeight: '600',
    color: '#111827',
    paddingHorizontal: 12,
    paddingTop: 12,
  },
  featuredCategory: {
    fontSize: 12,
    color: '#6B7280',
    paddingHorizontal: 12,
    paddingBottom: 12,
    paddingTop: 4,
  },
  emptyState: {
    alignItems: 'center',
    paddingHorizontal: 40,
    paddingVertical: 40,
  },
  emptyIcon: {
    width: 96,
    height: 96,
    borderRadius: 48,
    backgroundColor: '#F3F4F6',
    justifyContent: 'center',
    alignItems: 'center',
    marginBottom: 16,
  },
  emptyTitle: {
    fontSize: 20,
    fontWeight: '600',
    color: '#111827',
    marginBottom: 8,
  },
  emptyText: {
    fontSize: 14,
    color: '#6B7280',
    textAlign: 'center',
    marginBottom: 24,
    lineHeight: 20,
  },
  emptyButton: {
    flexDirection: 'row',
    alignItems: 'center',
    backgroundColor: '#F59E0B',
    paddingHorizontal: 24,
    paddingVertical: 12,
    borderRadius: 12,
  },
  emptyButtonText: {
    color: '#FFFFFF',
    fontSize: 16,
    fontWeight: '600',
    marginLeft: 8,
  },
});
