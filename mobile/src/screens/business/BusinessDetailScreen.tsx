import React, { useEffect } from 'react';
import {
  View,
  Text,
  StyleSheet,
  ScrollView,
  TouchableOpacity,
  SafeAreaView,
  Image,
  Linking,
  ActivityIndicator,
  Alert,
} from 'react-native';
import Icon from 'react-native-vector-icons/Feather';
import { useBusinessStore } from '../../store/authStore';

export default function BusinessDetailScreen({ route, navigation }: any) {
  const { businessId } = route.params;
  const { selectedBusiness, isLoading, loadBusiness, error } = useBusinessStore();

  useEffect(() => {
    loadBusiness(businessId);
  }, [businessId]);

  const handleWhatsApp = () => {
    if (selectedBusiness?.whatsappNumber) {
      const url = `whatsapp://send?phone=${selectedBusiness.whatsappNumber.replace(/\+/g, '')}`;
      Linking.openURL(url).catch(() => {
        Alert.alert('Error', 'WhatsApp is not installed');
      });
    }
  };

  const handleCall = () => {
    if (selectedBusiness?.phoneNumber || selectedBusiness?.whatsappNumber) {
      const phone = selectedBusiness.phoneNumber || selectedBusiness.whatsappNumber;
      Linking.openURL(`tel:${phone}`);
    }
  };

  const handleEmail = () => {
    if (selectedBusiness?.email) {
      Linking.openURL(`mailto:${selectedBusiness.email}`);
    }
  };

  if (isLoading) {
    return (
      <SafeAreaView style={styles.loadingContainer}>
        <ActivityIndicator size="large" color="#F59E0B" />
      </SafeAreaView>
    );
  }

  if (error || !selectedBusiness) {
    return (
      <SafeAreaView style={styles.errorContainer}>
        <Icon name="alert-circle" size={48} color="#EF4444" />
        <Text style={styles.errorTitle}>Failed to load business</Text>
        <Text style={styles.errorText}>{error || 'Business not found'}</Text>
        <TouchableOpacity
          style={styles.retryButton}
          onPress={() => loadBusiness(businessId)}
        >
          <Text style={styles.retryButtonText}>Retry</Text>
        </TouchableOpacity>
      </SafeAreaView>
    );
  }

  return (
    <SafeAreaView style={styles.container}>
      <ScrollView showsVerticalScrollIndicator={false}>
        {/* Cover Image */}
        <View style={styles.coverContainer}>
          {selectedBusiness.coverImageUrl ? (
            <Image
              source={{ uri: selectedBusiness.coverImageUrl }}
              style={styles.coverImage}
            />
          ) : (
            <View style={styles.coverPlaceholder}>
              <Icon name="image" size={48} color="#D1D5DB" />
            </View>
          )}
        </View>

        {/* Logo & Name */}
        <View style={styles.headerContainer}>
          <View style={styles.logoContainer}>
            {selectedBusiness.logoUrl ? (
              <Image
                source={{ uri: selectedBusiness.logoUrl }}
                style={styles.logo}
              />
            ) : (
              <View style={styles.logoPlaceholder}>
                <Icon name="briefcase" size={32} color="#F59E0B" />
              </View>
            )}
          </View>

          <View style={styles.nameContainer}>
            <View style={styles.nameRow}>
              <Text style={styles.businessName} numberOfLines={2}>
                {selectedBusiness.businessName}
              </Text>
              {selectedBusiness.isVerified && (
                <Icon name="check-circle" size={20} color="#10B981" style={{ marginLeft: 8 }} />
              )}
            </View>
            {selectedBusiness.tagline && (
              <Text style={styles.tagline}>{selectedBusiness.tagline}</Text>
            )}
          </View>
        </View>

        {/* Status Badge */}
        <View style={styles.statusContainer}>
          <View style={[
            styles.statusBadge,
            selectedBusiness.status === 'approved' && styles.statusApproved,
            selectedBusiness.status === 'pending' && styles.statusPending,
            selectedBusiness.status === 'draft' && styles.statusDraft,
            selectedBusiness.status === 'rejected' && styles.statusRejected,
          ]}>
            <Text style={styles.statusText}>
              {selectedBusiness.status.charAt(0).toUpperCase() + selectedBusiness.status.slice(1)}
            </Text>
          </View>
          <Text style={styles.categoryText}>
            {selectedBusiness.category?.name || selectedBusiness.businessType}
          </Text>
        </View>

        {/* Quick Actions */}
        <View style={styles.actionsContainer}>
          <TouchableOpacity style={styles.actionButton} onPress={handleWhatsApp}>
            <View style={[styles.actionIcon, { backgroundColor: '#22C55E' }]}>
              <Icon name="message-circle" size={20} color="#FFFFFF" />
            </View>
            <Text style={styles.actionLabel}>WhatsApp</Text>
          </TouchableOpacity>

          <TouchableOpacity style={styles.actionButton} onPress={handleCall}>
            <View style={[styles.actionIcon, { backgroundColor: '#3B82F6' }]}>
              <Icon name="phone" size={20} color="#FFFFFF" />
            </View>
            <Text style={styles.actionLabel}>Call</Text>
          </TouchableOpacity>

          {selectedBusiness.email && (
            <TouchableOpacity style={styles.actionButton} onPress={handleEmail}>
              <View style={[styles.actionIcon, { backgroundColor: '#EF4444' }]}>
                <Icon name="mail" size={20} color="#FFFFFF" />
              </View>
              <Text style={styles.actionLabel}>Email</Text>
            </TouchableOpacity>
          )}

          <TouchableOpacity style={styles.actionButton}>
            <View style={[styles.actionIcon, { backgroundColor: '#8B5CF6' }]}>
              <Icon name="share-2" size={20} color="#FFFFFF" />
            </View>
            <Text style={styles.actionLabel}>Share</Text>
          </TouchableOpacity>
        </View>

        {/* About Section */}
        {selectedBusiness.description && (
          <View style={styles.section}>
            <Text style={styles.sectionTitle}>About</Text>
            <Text style={styles.descriptionText}>{selectedBusiness.description}</Text>
          </View>
        )}

        {/* Contact Info */}
        <View style={styles.section}>
          <Text style={styles.sectionTitle}>Contact Information</Text>
          
          <View style={styles.infoCard}>
            <View style={styles.infoRow}>
              <Icon name="message-circle" size={18} color="#6B7280" />
              <Text style={styles.infoText}>{selectedBusiness.whatsappNumber}</Text>
            </View>

            {selectedBusiness.phoneNumber && (
              <View style={styles.infoRow}>
                <Icon name="phone" size={18} color="#6B7280" />
                <Text style={styles.infoText}>{selectedBusiness.phoneNumber}</Text>
              </View>
            )}

            {selectedBusiness.email && (
              <View style={styles.infoRow}>
                <Icon name="mail" size={18} color="#6B7280" />
                <Text style={styles.infoText}>{selectedBusiness.email}</Text>
              </View>
            )}

            {selectedBusiness.website && (
              <View style={styles.infoRow}>
                <Icon name="globe" size={18} color="#6B7280" />
                <Text style={styles.infoText}>{selectedBusiness.website}</Text>
              </View>
            )}
          </View>
        </View>

        {/* Location */}
        {(selectedBusiness.address || selectedBusiness.area) && (
          <View style={styles.section}>
            <Text style={styles.sectionTitle}>Location</Text>
            
            <View style={styles.infoCard}>
              <View style={styles.infoRow}>
                <Icon name="map-pin" size={18} color="#6B7280" />
                <Text style={styles.infoText}>
                  {[selectedBusiness.address, selectedBusiness.area, selectedBusiness.city]
                    .filter(Boolean)
                    .join(', ')}
                </Text>
              </View>
            </View>
          </View>
        )}

        {/* Professional Profile */}
        {selectedBusiness.professionalProfile && (
          <View style={styles.section}>
            <Text style={styles.sectionTitle}>Professional Details</Text>
            
            <View style={styles.infoCard}>
              {selectedBusiness.professionalProfile.title && (
                <View style={styles.infoRow}>
                  <Icon name="award" size={18} color="#6B7280" />
                  <Text style={styles.infoText}>{selectedBusiness.professionalProfile.title}</Text>
                </View>
              )}

              {selectedBusiness.professionalProfile.yearsOfExperience && (
                <View style={styles.infoRow}>
                  <Icon name="clock" size={18} color="#6B7280" />
                  <Text style={styles.infoText}>
                    {selectedBusiness.professionalProfile.yearsOfExperience} years experience
                  </Text>
                </View>
              )}

              {selectedBusiness.professionalProfile.hourlyRate && (
                <View style={styles.infoRow}>
                  <Icon name="dollar-sign" size={18} color="#6B7280" />
                  <Text style={styles.infoText}>
                    {selectedBusiness.professionalProfile.currency || 'KES'} {selectedBusiness.professionalProfile.hourlyRate}/hr
                  </Text>
                </View>
              )}
            </View>
          </View>
        )}

        {/* Owner Info */}
        <View style={styles.section}>
          <Text style={styles.sectionTitle}>Owner</Text>
          
          <View style={styles.ownerCard}>
            <View style={styles.ownerAvatar}>
              <Text style={styles.ownerAvatarText}>
                {selectedBusiness.owner?.firstName?.charAt(0) || 'U'}
              </Text>
            </View>
            <View style={styles.ownerInfo}>
              <Text style={styles.ownerName}>
                {selectedBusiness.owner?.firstName} {selectedBusiness.owner?.lastName}
              </Text>
              <Text style={styles.ownerRole}>Business Owner</Text>
            </View>
          </View>
        </View>

        <View style={{ height: 40 }} />
      </ScrollView>

      {/* Bottom Action */}
      <View style={styles.bottomAction}>
        <TouchableOpacity style={styles.whatsappButton} onPress={handleWhatsApp}>
          <Icon name="message-circle" size={24} color="#FFFFFF" />
          <Text style={styles.whatsappButtonText}>Chat on WhatsApp</Text>
        </TouchableOpacity>
      </View>
    </SafeAreaView>
  );
}

const styles = StyleSheet.create({
  container: {
    flex: 1,
    backgroundColor: '#F9FAFB',
  },
  loadingContainer: {
    flex: 1,
    justifyContent: 'center',
    alignItems: 'center',
    backgroundColor: '#FFFFFF',
  },
  errorContainer: {
    flex: 1,
    justifyContent: 'center',
    alignItems: 'center',
    padding: 40,
    backgroundColor: '#FFFFFF',
  },
  errorTitle: {
    fontSize: 18,
    fontWeight: '600',
    color: '#111827',
    marginTop: 16,
  },
  errorText: {
    fontSize: 14,
    color: '#6B7280',
    marginTop: 8,
    textAlign: 'center',
  },
  retryButton: {
    marginTop: 24,
    paddingHorizontal: 24,
    paddingVertical: 12,
    backgroundColor: '#F59E0B',
    borderRadius: 8,
  },
  retryButtonText: {
    fontSize: 16,
    fontWeight: '600',
    color: '#FFFFFF',
  },
  coverContainer: {
    width: '100%',
    height: 200,
  },
  coverImage: {
    width: '100%',
    height: '100%',
  },
  coverPlaceholder: {
    width: '100%',
    height: '100%',
    backgroundColor: '#F3F4F6',
    justifyContent: 'center',
    alignItems: 'center',
  },
  headerContainer: {
    flexDirection: 'row',
    paddingHorizontal: 20,
    marginTop: -40,
  },
  logoContainer: {
    marginRight: 16,
  },
  logo: {
    width: 80,
    height: 80,
    borderRadius: 16,
    borderWidth: 4,
    borderColor: '#FFFFFF',
  },
  logoPlaceholder: {
    width: 80,
    height: 80,
    borderRadius: 16,
    backgroundColor: '#FEF3C7',
    borderWidth: 4,
    borderColor: '#FFFFFF',
    justifyContent: 'center',
    alignItems: 'center',
  },
  nameContainer: {
    flex: 1,
    justifyContent: 'flex-end',
    paddingBottom: 8,
  },
  nameRow: {
    flexDirection: 'row',
    alignItems: 'center',
  },
  businessName: {
    fontSize: 22,
    fontWeight: '700',
    color: '#111827',
    flex: 1,
  },
  tagline: {
    fontSize: 14,
    color: '#6B7280',
    marginTop: 4,
  },
  statusContainer: {
    flexDirection: 'row',
    alignItems: 'center',
    paddingHorizontal: 20,
    paddingTop: 12,
  },
  statusBadge: {
    paddingHorizontal: 12,
    paddingVertical: 4,
    borderRadius: 12,
    backgroundColor: '#F3F4F6',
    marginRight: 12,
  },
  statusApproved: { backgroundColor: '#D1FAE5' },
  statusPending: { backgroundColor: '#FEF3C7' },
  statusDraft: { backgroundColor: '#F3F4F6' },
  statusRejected: { backgroundColor: '#FEE2E2' },
  statusText: {
    fontSize: 12,
    fontWeight: '600',
    color: '#374151',
  },
  categoryText: {
    fontSize: 14,
    color: '#6B7280',
    textTransform: 'capitalize',
  },
  actionsContainer: {
    flexDirection: 'row',
    justifyContent: 'space-around',
    paddingVertical: 20,
    paddingHorizontal: 20,
    backgroundColor: '#FFFFFF',
    marginTop: 16,
    marginHorizontal: 20,
    borderRadius: 16,
  },
  actionButton: {
    alignItems: 'center',
  },
  actionIcon: {
    width: 48,
    height: 48,
    borderRadius: 24,
    justifyContent: 'center',
    alignItems: 'center',
    marginBottom: 8,
  },
  actionLabel: {
    fontSize: 12,
    color: '#374151',
  },
  section: {
    paddingHorizontal: 20,
    marginTop: 24,
  },
  sectionTitle: {
    fontSize: 18,
    fontWeight: '600',
    color: '#111827',
    marginBottom: 12,
  },
  descriptionText: {
    fontSize: 15,
    color: '#4B5563',
    lineHeight: 24,
  },
  infoCard: {
    backgroundColor: '#FFFFFF',
    borderRadius: 12,
    padding: 16,
  },
  infoRow: {
    flexDirection: 'row',
    alignItems: 'center',
    paddingVertical: 8,
  },
  infoText: {
    fontSize: 15,
    color: '#374151',
    marginLeft: 12,
    flex: 1,
  },
  ownerCard: {
    flexDirection: 'row',
    alignItems: 'center',
    backgroundColor: '#FFFFFF',
    borderRadius: 12,
    padding: 16,
  },
  ownerAvatar: {
    width: 48,
    height: 48,
    borderRadius: 24,
    backgroundColor: '#FEF3C7',
    justifyContent: 'center',
    alignItems: 'center',
    marginRight: 12,
  },
  ownerAvatarText: {
    fontSize: 18,
    fontWeight: '600',
    color: '#F59E0B',
  },
  ownerInfo: {
    flex: 1,
  },
  ownerName: {
    fontSize: 16,
    fontWeight: '600',
    color: '#111827',
  },
  ownerRole: {
    fontSize: 14,
    color: '#6B7280',
    marginTop: 2,
  },
  bottomAction: {
    backgroundColor: '#FFFFFF',
    paddingHorizontal: 20,
    paddingVertical: 16,
    borderTopWidth: 1,
    borderTopColor: '#E5E7EB',
  },
  whatsappButton: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    backgroundColor: '#22C55E',
    paddingVertical: 16,
    borderRadius: 12,
  },
  whatsappButtonText: {
    fontSize: 18,
    fontWeight: '600',
    color: '#FFFFFF',
    marginLeft: 12,
  },
});
