import React, { useState, useEffect } from 'react';
import {
  View,
  Text,
  StyleSheet,
  TextInput,
  TouchableOpacity,
  ScrollView,
  SafeAreaView,
  KeyboardAvoidingView,
  Platform,
  Alert,
  ActivityIndicator,
} from 'react-native';
import Icon from 'react-native-vector-icons/Feather';
import { useBusinessStore } from '../../store/authStore';
import { categoryApi } from '../../api/client';

const BUSINESS_TYPES = [
  { id: 'retail', label: 'Retail / Shop', icon: 'shopping-bag', description: 'Sell products' },
  { id: 'professional', label: 'Professional', icon: 'briefcase', description: 'Offer services' },
  { id: 'both', label: 'Both', icon: 'layers', description: 'Products & services' },
];

export default function CreateBusinessScreen({ navigation }: any) {
  const [step, setStep] = useState(1);
  const [businessType, setBusinessType] = useState<'retail' | 'professional' | 'both' | null>(null);
  const [categories, setCategories] = useState<any[]>([]);
  
  // Form data
  const [formData, setFormData] = useState({
    businessName: '',
    tagline: '',
    description: '',
    categoryId: '',
    whatsappNumber: '',
    phoneNumber: '',
    email: '',
    address: '',
    city: '',
    area: '',
  });

  const { createBusiness, isLoading, error, clearError } = useBusinessStore();

  useEffect(() => {
    loadCategories();
  }, []);

  const loadCategories = async () => {
    try {
      const cats = await categoryApi.getAll();
      setCategories(cats);
    } catch (err) {
      console.error('Failed to load categories:', err);
    }
  };

  const updateForm = (field: string, value: string) => {
    setFormData((prev) => ({ ...prev, [field]: value }));
    if (error) clearError();
  };

  const validateStep = (): boolean => {
    switch (step) {
      case 1:
        if (!businessType) {
          Alert.alert('Error', 'Please select a business type');
          return false;
        }
        return true;
      case 2:
        if (!formData.businessName.trim()) {
          Alert.alert('Error', 'Please enter your business name');
          return false;
        }
        if (!formData.whatsappNumber || formData.whatsappNumber.length < 10) {
          Alert.alert('Error', 'Please enter a valid WhatsApp number');
          return false;
        }
        return true;
      case 3:
        // Optional step - can proceed without data
        return true;
      default:
        return true;
    }
  };

  const handleNext = () => {
    if (validateStep()) {
      if (step < 3) {
        setStep(step + 1);
      } else {
        handleSubmit();
      }
    }
  };

  const handleBack = () => {
    if (step > 1) {
      setStep(step - 1);
    } else {
      navigation.goBack();
    }
  };

  const handleSubmit = async () => {
    try {
      const business = await createBusiness({
        businessName: formData.businessName.trim(),
        businessType: businessType!,
        whatsappNumber: formData.whatsappNumber,
        tagline: formData.tagline.trim() || undefined,
        description: formData.description.trim() || undefined,
        categoryId: formData.categoryId || undefined,
        phoneNumber: formData.phoneNumber || undefined,
        email: formData.email || undefined,
        address: formData.address || undefined,
        city: formData.city || undefined,
        area: formData.area || undefined,
      });

      Alert.alert(
        'Success! 🎉',
        'Your business has been created. You can now add products and submit for verification.',
        [
          {
            text: 'View Business',
            onPress: () => {
              navigation.replace('BusinessDetail', { businessId: business.id });
            },
          },
        ]
      );
    } catch (err) {
      // Error handled by store
    }
  };

  const renderStep1 = () => (
    <View style={styles.stepContent}>
      <Text style={styles.stepTitle}>What type of business?</Text>
      <Text style={styles.stepSubtitle}>
        Select the option that best describes your business
      </Text>

      <View style={styles.typeContainer}>
        {BUSINESS_TYPES.map((type) => (
          <TouchableOpacity
            key={type.id}
            style={[
              styles.typeCard,
              businessType === type.id && styles.typeCardActive,
            ]}
            onPress={() => setBusinessType(type.id as any)}
          >
            <View style={[
              styles.typeIcon,
              businessType === type.id && styles.typeIconActive,
            ]}>
              <Icon
                name={type.icon}
                size={28}
                color={businessType === type.id ? '#FFFFFF' : '#F59E0B'}
              />
            </View>
            <Text style={[
              styles.typeLabel,
              businessType === type.id && styles.typeLabelActive,
            ]}>
              {type.label}
            </Text>
            <Text style={styles.typeDescription}>{type.description}</Text>
          </TouchableOpacity>
        ))}
      </View>
    </View>
  );

  const renderStep2 = () => (
    <View style={styles.stepContent}>
      <Text style={styles.stepTitle}>Basic Information</Text>
      <Text style={styles.stepSubtitle}>
        Tell us about your business
      </Text>

      <View style={styles.inputContainer}>
        <Text style={styles.inputLabel}>Business Name *</Text>
        <View style={styles.inputWrapper}>
          <TextInput
            style={styles.input}
            placeholder="e.g., Doe Hardware"
            placeholderTextColor="#9CA3AF"
            value={formData.businessName}
            onChangeText={(text) => updateForm('businessName', text)}
          />
        </View>
      </View>

      <View style={styles.inputContainer}>
        <Text style={styles.inputLabel}>Tagline</Text>
        <View style={styles.inputWrapper}>
          <TextInput
            style={styles.input}
            placeholder="Short description (max 100 chars)"
            placeholderTextColor="#9CA3AF"
            value={formData.tagline}
            onChangeText={(text) => updateForm('tagline', text)}
            maxLength={100}
          />
        </View>
      </View>

      <View style={styles.inputContainer}>
        <Text style={styles.inputLabel}>WhatsApp Number *</Text>
        <View style={styles.inputWrapper}>
          <Icon name="message-circle" size={20} color="#9CA3AF" style={styles.inputIcon} />
          <TextInput
            style={styles.input}
            placeholder="+254712345678"
            placeholderTextColor="#9CA3AF"
            value={formData.whatsappNumber}
            onChangeText={(text) => updateForm('whatsappNumber', text.replace(/[^\d+]/g, ''))}
            keyboardType="phone-pad"
          />
        </View>
        <Text style={styles.inputHint}>
          Customers will contact you via WhatsApp
        </Text>
      </View>

      <View style={styles.inputContainer}>
        <Text style={styles.inputLabel}>Category</Text>
        <ScrollView horizontal showsHorizontalScrollIndicator={false}>
          {categories.map((cat) => (
            <TouchableOpacity
              key={cat.id}
              style={[
                styles.categoryChip,
                formData.categoryId === cat.id && styles.categoryChipActive,
              ]}
              onPress={() => updateForm('categoryId', 
                formData.categoryId === cat.id ? '' : cat.id
              )}
            >
              <Text style={[
                styles.categoryChipText,
                formData.categoryId === cat.id && styles.categoryChipTextActive,
              ]}>
                {cat.name}
              </Text>
            </TouchableOpacity>
          ))}
        </ScrollView>
      </View>
    </View>
  );

  const renderStep3 = () => (
    <View style={styles.stepContent}>
      <Text style={styles.stepTitle}>Location & Contact</Text>
      <Text style={styles.stepSubtitle}>
        Help customers find you (optional)
      </Text>

      <View style={styles.inputContainer}>
        <Text style={styles.inputLabel}>Address</Text>
        <View style={styles.inputWrapper}>
          <Icon name="map-pin" size={20} color="#9CA3AF" style={styles.inputIcon} />
          <TextInput
            style={styles.input}
            placeholder="Shop 12, Building Name"
            placeholderTextColor="#9CA3AF"
            value={formData.address}
            onChangeText={(text) => updateForm('address', text)}
          />
        </View>
      </View>

      <View style={styles.rowContainer}>
        <View style={[styles.inputContainer, styles.halfInput]}>
          <Text style={styles.inputLabel}>City</Text>
          <View style={styles.inputWrapper}>
            <TextInput
              style={styles.input}
              placeholder="Nairobi"
              placeholderTextColor="#9CA3AF"
              value={formData.city}
              onChangeText={(text) => updateForm('city', text)}
            />
          </View>
        </View>

        <View style={[styles.inputContainer, styles.halfInput]}>
          <Text style={styles.inputLabel}>Area</Text>
          <View style={styles.inputWrapper}>
            <TextInput
              style={styles.input}
              placeholder="Saifee Park"
              placeholderTextColor="#9CA3AF"
              value={formData.area}
              onChangeText={(text) => updateForm('area', text)}
            />
          </View>
        </View>
      </View>

      <View style={styles.inputContainer}>
        <Text style={styles.inputLabel}>Phone Number</Text>
        <View style={styles.inputWrapper}>
          <Icon name="phone" size={20} color="#9CA3AF" style={styles.inputIcon} />
          <TextInput
            style={styles.input}
            placeholder="+254712345678"
            placeholderTextColor="#9CA3AF"
            value={formData.phoneNumber}
            onChangeText={(text) => updateForm('phoneNumber', text.replace(/[^\d+]/g, ''))}
            keyboardType="phone-pad"
          />
        </View>
      </View>

      <View style={styles.inputContainer}>
        <Text style={styles.inputLabel}>Email</Text>
        <View style={styles.inputWrapper}>
          <Icon name="mail" size={20} color="#9CA3AF" style={styles.inputIcon} />
          <TextInput
            style={styles.input}
            placeholder="contact@business.com"
            placeholderTextColor="#9CA3AF"
            value={formData.email}
            onChangeText={(text) => updateForm('email', text)}
            keyboardType="email-address"
            autoCapitalize="none"
          />
        </View>
      </View>
    </View>
  );

  return (
    <SafeAreaView style={styles.container}>
      <KeyboardAvoidingView
        behavior={Platform.OS === 'ios' ? 'padding' : 'height'}
        style={styles.keyboardView}
      >
        {/* Progress */}
        <View style={styles.progressContainer}>
          {[1, 2, 3].map((s) => (
            <View
              key={s}
              style={[
                styles.progressDot,
                s <= step && styles.progressDotActive,
              ]}
            />
          ))}
        </View>

        {/* Error */}
        {error && (
          <View style={styles.errorContainer}>
            <Icon name="alert-circle" size={16} color="#DC2626" />
            <Text style={styles.errorText}>{error}</Text>
          </View>
        )}

        <ScrollView
          showsVerticalScrollIndicator={false}
          contentContainerStyle={styles.scrollContent}
        >
          {step === 1 && renderStep1()}
          {step === 2 && renderStep2()}
          {step === 3 && renderStep3()}
        </ScrollView>

        {/* Actions */}
        <View style={styles.actionsContainer}>
          <TouchableOpacity
            style={styles.backButton}
            onPress={handleBack}
          >
            <Icon name="arrow-left" size={20} color="#6B7280" />
            <Text style={styles.backButtonText}>Back</Text>
          </TouchableOpacity>

          <TouchableOpacity
            style={[styles.nextButton, isLoading && styles.nextButtonDisabled]}
            onPress={handleNext}
            disabled={isLoading}
          >
            {isLoading ? (
              <ActivityIndicator color="#FFFFFF" />
            ) : (
              <>
                <Text style={styles.nextButtonText}>
                  {step === 3 ? 'Create Business' : 'Next'}
                </Text>
                {step < 3 && <Icon name="arrow-right" size={20} color="#FFFFFF" />}
              </>
            )}
          </TouchableOpacity>
        </View>
      </KeyboardAvoidingView>
    </SafeAreaView>
  );
}

const styles = StyleSheet.create({
  container: {
    flex: 1,
    backgroundColor: '#FFFFFF',
  },
  keyboardView: {
    flex: 1,
  },
  progressContainer: {
    flexDirection: 'row',
    justifyContent: 'center',
    paddingVertical: 16,
  },
  progressDot: {
    width: 32,
    height: 4,
    borderRadius: 2,
    backgroundColor: '#E5E7EB',
    marginHorizontal: 4,
  },
  progressDotActive: {
    backgroundColor: '#F59E0B',
  },
  errorContainer: {
    flexDirection: 'row',
    alignItems: 'center',
    backgroundColor: '#FEF2F2',
    padding: 12,
    marginHorizontal: 20,
    borderRadius: 8,
  },
  errorText: {
    color: '#DC2626',
    fontSize: 14,
    marginLeft: 8,
    flex: 1,
  },
  scrollContent: {
    flexGrow: 1,
    paddingHorizontal: 20,
  },
  stepContent: {
    flex: 1,
    paddingTop: 16,
  },
  stepTitle: {
    fontSize: 24,
    fontWeight: '700',
    color: '#111827',
    marginBottom: 8,
  },
  stepSubtitle: {
    fontSize: 16,
    color: '#6B7280',
    marginBottom: 32,
  },
  typeContainer: {
    gap: 16,
  },
  typeCard: {
    padding: 20,
    borderRadius: 16,
    borderWidth: 2,
    borderColor: '#E5E7EB',
    alignItems: 'center',
    marginBottom: 12,
  },
  typeCardActive: {
    borderColor: '#F59E0B',
    backgroundColor: '#FFFBEB',
  },
  typeIcon: {
    width: 64,
    height: 64,
    borderRadius: 32,
    backgroundColor: '#FEF3C7',
    justifyContent: 'center',
    alignItems: 'center',
    marginBottom: 12,
  },
  typeIconActive: {
    backgroundColor: '#F59E0B',
  },
  typeLabel: {
    fontSize: 18,
    fontWeight: '600',
    color: '#374151',
    marginBottom: 4,
  },
  typeLabelActive: {
    color: '#F59E0B',
  },
  typeDescription: {
    fontSize: 14,
    color: '#6B7280',
  },
  inputContainer: {
    marginBottom: 20,
  },
  rowContainer: {
    flexDirection: 'row',
    justifyContent: 'space-between',
  },
  halfInput: {
    width: '48%',
  },
  inputLabel: {
    fontSize: 14,
    fontWeight: '500',
    color: '#374151',
    marginBottom: 8,
  },
  inputWrapper: {
    flexDirection: 'row',
    alignItems: 'center',
    backgroundColor: '#F9FAFB',
    borderWidth: 1,
    borderColor: '#E5E7EB',
    borderRadius: 12,
    paddingHorizontal: 16,
  },
  inputIcon: {
    marginRight: 12,
  },
  input: {
    flex: 1,
    paddingVertical: 14,
    fontSize: 16,
    color: '#111827',
  },
  inputHint: {
    fontSize: 12,
    color: '#9CA3AF',
    marginTop: 4,
  },
  categoryChip: {
    paddingHorizontal: 16,
    paddingVertical: 10,
    borderRadius: 20,
    backgroundColor: '#F3F4F6',
    marginRight: 8,
  },
  categoryChipActive: {
    backgroundColor: '#F59E0B',
  },
  categoryChipText: {
    fontSize: 14,
    color: '#6B7280',
  },
  categoryChipTextActive: {
    color: '#FFFFFF',
    fontWeight: '500',
  },
  actionsContainer: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    paddingHorizontal: 20,
    paddingVertical: 16,
    borderTopWidth: 1,
    borderTopColor: '#E5E7EB',
  },
  backButton: {
    flexDirection: 'row',
    alignItems: 'center',
    paddingVertical: 12,
    paddingHorizontal: 16,
  },
  backButtonText: {
    fontSize: 16,
    color: '#6B7280',
    marginLeft: 4,
  },
  nextButton: {
    flexDirection: 'row',
    alignItems: 'center',
    backgroundColor: '#F59E0B',
    paddingVertical: 14,
    paddingHorizontal: 24,
    borderRadius: 12,
  },
  nextButtonDisabled: {
    opacity: 0.7,
  },
  nextButtonText: {
    fontSize: 16,
    fontWeight: '600',
    color: '#FFFFFF',
    marginRight: 8,
  },
});
