import React, { useEffect } from 'react';
import {
  View,
  Text,
  StyleSheet,
  TouchableOpacity,
  FlatList,
  SafeAreaView,
  Image,
  RefreshControl,
} from 'react-native';
import Icon from 'react-native-vector-icons/Feather';
import { useAuthStore } from '../../store/authStore';

export default function MyBusinessesScreen({ navigation }: any) {
  const { businesses, loadBusinesses } = useAuthStore();
  const [refreshing, setRefreshing] = React.useState(false);

  useEffect(() => {
    loadBusinesses();
  }, []);

  const handleRefresh = async () => {
    setRefreshing(true);
    await loadBusinesses();
    setRefreshing(false);
  };

  const allBusinesses = [
    ...businesses.owned.map((b) => ({ ...b, role: 'owner' })),
    ...businesses.memberships,
  ];

  const renderBusiness = ({ item }: { item: any }) => (
    <TouchableOpacity
      style={styles.businessCard}
      onPress={() => navigation.navigate('BusinessDetail', { businessId: item.id })}
    >
      <View style={styles.businessLogo}>
        {item.logoUrl ? (
          <Image source={{ uri: item.logoUrl }} style={styles.logoImage} />
        ) : (
          <Icon name="briefcase" size={28} color="#F59E0B" />
        )}
      </View>

      <View style={styles.businessInfo}>
        <View style={styles.nameRow}>
          <Text style={styles.businessName} numberOfLines={1}>
            {item.businessName}
          </Text>
          {item.isVerified && (
            <Icon name="check-circle" size={16} color="#10B981" />
          )}
        </View>

        <View style={styles.metaRow}>
          <View style={styles.roleBadge}>
            <Text style={styles.roleText}>{item.role}</Text>
          </View>

          <View style={[
            styles.statusBadge,
            item.status === 'approved' && styles.statusApproved,
            item.status === 'pending' && styles.statusPending,
            item.status === 'draft' && styles.statusDraft,
          ]}>
            <Text style={styles.statusText}>{item.status}</Text>
          </View>
        </View>

        {item.category && (
          <Text style={styles.categoryText}>{item.category.name}</Text>
        )}
      </View>

      <Icon name="chevron-right" size={24} color="#9CA3AF" />
    </TouchableOpacity>
  );

  const renderEmpty = () => (
    <View style={styles.emptyContainer}>
      <View style={styles.emptyIcon}>
        <Icon name="briefcase" size={48} color="#D1D5DB" />
      </View>
      <Text style={styles.emptyTitle}>No Businesses Yet</Text>
      <Text style={styles.emptyText}>
        Create your first business to start connecting with customers
      </Text>
      <TouchableOpacity
        style={styles.createButton}
        onPress={() => navigation.navigate('CreateBusiness')}
      >
        <Icon name="plus" size={20} color="#FFFFFF" />
        <Text style={styles.createButtonText}>Create Business</Text>
      </TouchableOpacity>
    </View>
  );

  const renderHeader = () => (
    <View style={styles.listHeader}>
      <Text style={styles.listHeaderText}>
        {allBusinesses.length} {allBusinesses.length === 1 ? 'business' : 'businesses'}
      </Text>
    </View>
  );

  return (
    <SafeAreaView style={styles.container}>
      <FlatList
        data={allBusinesses}
        renderItem={renderBusiness}
        keyExtractor={(item) => item.id}
        contentContainerStyle={styles.listContainer}
        showsVerticalScrollIndicator={false}
        refreshControl={
          <RefreshControl
            refreshing={refreshing}
            onRefresh={handleRefresh}
            colors={['#F59E0B']}
          />
        }
        ListHeaderComponent={allBusinesses.length > 0 ? renderHeader : null}
        ListEmptyComponent={renderEmpty}
      />

      {/* FAB */}
      {allBusinesses.length > 0 && (
        <TouchableOpacity
          style={styles.fab}
          onPress={() => navigation.navigate('CreateBusiness')}
        >
          <Icon name="plus" size={24} color="#FFFFFF" />
        </TouchableOpacity>
      )}
    </SafeAreaView>
  );
}

const styles = StyleSheet.create({
  container: {
    flex: 1,
    backgroundColor: '#F9FAFB',
  },
  listContainer: {
    flexGrow: 1,
    paddingHorizontal: 20,
    paddingTop: 16,
  },
  listHeader: {
    marginBottom: 16,
  },
  listHeaderText: {
    fontSize: 14,
    color: '#6B7280',
  },
  businessCard: {
    flexDirection: 'row',
    alignItems: 'center',
    backgroundColor: '#FFFFFF',
    padding: 16,
    borderRadius: 16,
    marginBottom: 12,
    shadowColor: '#000',
    shadowOffset: { width: 0, height: 2 },
    shadowOpacity: 0.05,
    shadowRadius: 8,
    elevation: 2,
  },
  businessLogo: {
    width: 64,
    height: 64,
    borderRadius: 12,
    backgroundColor: '#FEF3C7',
    justifyContent: 'center',
    alignItems: 'center',
    marginRight: 16,
  },
  logoImage: {
    width: 64,
    height: 64,
    borderRadius: 12,
  },
  businessInfo: {
    flex: 1,
  },
  nameRow: {
    flexDirection: 'row',
    alignItems: 'center',
    marginBottom: 6,
  },
  businessName: {
    fontSize: 17,
    fontWeight: '600',
    color: '#111827',
    flex: 1,
    marginRight: 8,
  },
  metaRow: {
    flexDirection: 'row',
    alignItems: 'center',
    marginBottom: 4,
  },
  roleBadge: {
    paddingHorizontal: 8,
    paddingVertical: 2,
    borderRadius: 4,
    backgroundColor: '#EDE9FE',
    marginRight: 8,
  },
  roleText: {
    fontSize: 11,
    fontWeight: '600',
    color: '#7C3AED',
    textTransform: 'capitalize',
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
    fontSize: 11,
    fontWeight: '500',
    color: '#374151',
    textTransform: 'capitalize',
  },
  categoryText: {
    fontSize: 13,
    color: '#6B7280',
  },
  emptyContainer: {
    flex: 1,
    alignItems: 'center',
    justifyContent: 'center',
    paddingHorizontal: 40,
    paddingVertical: 80,
  },
  emptyIcon: {
    width: 96,
    height: 96,
    borderRadius: 48,
    backgroundColor: '#F3F4F6',
    justifyContent: 'center',
    alignItems: 'center',
    marginBottom: 24,
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
  createButton: {
    flexDirection: 'row',
    alignItems: 'center',
    backgroundColor: '#F59E0B',
    paddingHorizontal: 24,
    paddingVertical: 14,
    borderRadius: 12,
  },
  createButtonText: {
    fontSize: 16,
    fontWeight: '600',
    color: '#FFFFFF',
    marginLeft: 8,
  },
  fab: {
    position: 'absolute',
    right: 20,
    bottom: 20,
    width: 56,
    height: 56,
    borderRadius: 28,
    backgroundColor: '#F59E0B',
    justifyContent: 'center',
    alignItems: 'center',
    shadowColor: '#F59E0B',
    shadowOffset: { width: 0, height: 4 },
    shadowOpacity: 0.4,
    shadowRadius: 8,
    elevation: 8,
  },
});
