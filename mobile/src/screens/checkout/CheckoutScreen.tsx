import React, { useState, useEffect } from 'react';
import {
  View,
  Text,
  ScrollView,
  TouchableOpacity,
  TextInput,
  StyleSheet,
  Alert,
  ActivityIndicator,
  KeyboardAvoidingView,
  Platform,
} from 'react-native';
import { useNavigation, useRoute } from '@react-navigation/native';
import Icon from 'react-native-vector-icons/Feather';
import { useCartStore } from '../../store/cartStore';
import { ordersApi, paymentsApi } from '../../api/payments';

// =====================================================
// TYPES
// =====================================================
interface DeliveryAddress {
  address: string;
  city: string;
  county: string;
  postalCode?: string;
  instructions?: string;
}

// =====================================================
// CHECKOUT SCREEN
// =====================================================
export default function CheckoutScreen() {
  const navigation = useNavigation<any>();
  const route = useRoute<any>();
  const { items, businessId, clearCart, getTotal } = useCartStore();

  // Form state
  const [deliveryType, setDeliveryType] = useState<'pickup' | 'delivery'>('delivery');
  const [address, setAddress] = useState<DeliveryAddress>({
    address: '',
    city: 'Nairobi',
    county: 'Nairobi',
  });
  const [buyerName, setBuyerName] = useState('');
  const [buyerPhone, setBuyerPhone] = useState('');
  const [discountCode, setDiscountCode] = useState('');
  const [discountApplied, setDiscountApplied] = useState<{ amount: number; code: string } | null>(null);

  // Loading states
  const [isValidating, setIsValidating] = useState(false);
  const [isCreatingOrder, setIsCreatingOrder] = useState(false);

  // Calculate totals
  const subtotal = getTotal();
  const deliveryFee = deliveryType === 'delivery' ? 150 : 0;
  const serviceFee = Math.round((subtotal - (discountApplied?.amount || 0)) * 0.025);
  const total = subtotal - (discountApplied?.amount || 0) + deliveryFee + serviceFee;

  // Validate discount code
  const handleValidateDiscount = async () => {
    if (!discountCode.trim()) return;

    setIsValidating(true);
    try {
      const result = await paymentsApi.validateDiscount(discountCode, businessId, subtotal);
      
      if (result.valid) {
        setDiscountApplied({ amount: result.discountAmount, code: discountCode });
        Alert.alert('Success', `Discount of KES ${result.discountAmount.toLocaleString()} applied!`);
      } else {
        Alert.alert('Invalid Code', 'This discount code is not valid');
      }
    } catch (error) {
      Alert.alert('Error', 'Failed to validate discount code');
    } finally {
      setIsValidating(false);
    }
  };

  // Create order and proceed to payment
  const handlePlaceOrder = async () => {
    // Validate
    if (!buyerName.trim()) {
      Alert.alert('Error', 'Please enter your name');
      return;
    }
    if (!buyerPhone.trim() || buyerPhone.length < 10) {
      Alert.alert('Error', 'Please enter a valid phone number');
      return;
    }
    if (deliveryType === 'delivery' && !address.address.trim()) {
      Alert.alert('Error', 'Please enter a delivery address');
      return;
    }

    setIsCreatingOrder(true);
    try {
      const order = await ordersApi.createOrder({
        businessId,
        items: items.map((item) => ({
          productId: item.product.id,
          quantity: item.quantity,
          variantId: item.variantId,
        })),
        deliveryType,
        deliveryAddress: deliveryType === 'delivery' ? address : undefined,
        buyerPhone: buyerPhone.replace(/\s/g, ''),
        buyerName,
        discountCode: discountApplied?.code,
      });

      // Navigate to payment screen
      navigation.navigate('Payment', {
        orderId: order.orderId,
        orderNumber: order.orderNumber,
        total: order.total,
        phoneNumber: buyerPhone,
      });
    } catch (error: any) {
      Alert.alert('Error', error.response?.data?.message || 'Failed to create order');
    } finally {
      setIsCreatingOrder(false);
    }
  };

  if (items.length === 0) {
    return (
      <View style={styles.emptyContainer}>
        <Icon name="shopping-bag" size={64} color="#D1D5DB" />
        <Text style={styles.emptyText}>Your cart is empty</Text>
        <TouchableOpacity
          style={styles.continueButton}
          onPress={() => navigation.goBack()}
        >
          <Text style={styles.continueButtonText}>Continue Shopping</Text>
        </TouchableOpacity>
      </View>
    );
  }

  return (
    <KeyboardAvoidingView
      style={{ flex: 1 }}
      behavior={Platform.OS === 'ios' ? 'padding' : undefined}
    >
      <ScrollView style={styles.container} showsVerticalScrollIndicator={false}>
        {/* Order Summary */}
        <View style={styles.section}>
          <Text style={styles.sectionTitle}>Order Summary</Text>
          {items.map((item) => (
            <View key={item.product.id} style={styles.orderItem}>
              <Text style={styles.itemName} numberOfLines={1}>
                {item.product.name}
              </Text>
              <Text style={styles.itemQty}>x{item.quantity}</Text>
              <Text style={styles.itemPrice}>
                KES {(item.product.price * item.quantity).toLocaleString()}
              </Text>
            </View>
          ))}
        </View>

        {/* Delivery Type */}
        <View style={styles.section}>
          <Text style={styles.sectionTitle}>Delivery Method</Text>
          <View style={styles.deliveryOptions}>
            <TouchableOpacity
              style={[
                styles.deliveryOption,
                deliveryType === 'pickup' && styles.deliveryOptionSelected,
              ]}
              onPress={() => setDeliveryType('pickup')}
            >
              <Icon
                name="map-pin"
                size={24}
                color={deliveryType === 'pickup' ? '#F59E0B' : '#6B7280'}
              />
              <Text
                style={[
                  styles.deliveryOptionText,
                  deliveryType === 'pickup' && styles.deliveryOptionTextSelected,
                ]}
              >
                Pickup
              </Text>
              <Text style={styles.deliveryOptionPrice}>Free</Text>
            </TouchableOpacity>

            <TouchableOpacity
              style={[
                styles.deliveryOption,
                deliveryType === 'delivery' && styles.deliveryOptionSelected,
              ]}
              onPress={() => setDeliveryType('delivery')}
            >
              <Icon
                name="truck"
                size={24}
                color={deliveryType === 'delivery' ? '#F59E0B' : '#6B7280'}
              />
              <Text
                style={[
                  styles.deliveryOptionText,
                  deliveryType === 'delivery' && styles.deliveryOptionTextSelected,
                ]}
              >
                Delivery
              </Text>
              <Text style={styles.deliveryOptionPrice}>KES 150</Text>
            </TouchableOpacity>
          </View>
        </View>

        {/* Delivery Address */}
        {deliveryType === 'delivery' && (
          <View style={styles.section}>
            <Text style={styles.sectionTitle}>Delivery Address</Text>
            <TextInput
              style={styles.input}
              placeholder="Street address"
              value={address.address}
              onChangeText={(text) => setAddress({ ...address, address: text })}
            />
            <View style={styles.row}>
              <TextInput
                style={[styles.input, { flex: 1, marginRight: 8 }]}
                placeholder="City"
                value={address.city}
                onChangeText={(text) => setAddress({ ...address, city: text })}
              />
              <TextInput
                style={[styles.input, { flex: 1 }]}
                placeholder="County"
                value={address.county}
                onChangeText={(text) => setAddress({ ...address, county: text })}
              />
            </View>
            <TextInput
              style={[styles.input, styles.textArea]}
              placeholder="Delivery instructions (optional)"
              value={address.instructions}
              onChangeText={(text) => setAddress({ ...address, instructions: text })}
              multiline
              numberOfLines={2}
            />
          </View>
        )}

        {/* Contact Info */}
        <View style={styles.section}>
          <Text style={styles.sectionTitle}>Contact Information</Text>
          <TextInput
            style={styles.input}
            placeholder="Your name"
            value={buyerName}
            onChangeText={setBuyerName}
          />
          <TextInput
            style={styles.input}
            placeholder="Phone number (e.g., 0712345678)"
            value={buyerPhone}
            onChangeText={setBuyerPhone}
            keyboardType="phone-pad"
          />
        </View>

        {/* Discount Code */}
        <View style={styles.section}>
          <Text style={styles.sectionTitle}>Discount Code</Text>
          <View style={styles.discountRow}>
            <TextInput
              style={[styles.input, { flex: 1, marginRight: 8, marginBottom: 0 }]}
              placeholder="Enter code"
              value={discountCode}
              onChangeText={setDiscountCode}
              autoCapitalize="characters"
              editable={!discountApplied}
            />
            {discountApplied ? (
              <TouchableOpacity
                style={styles.removeDiscountButton}
                onPress={() => {
                  setDiscountApplied(null);
                  setDiscountCode('');
                }}
              >
                <Icon name="x" size={20} color="#EF4444" />
              </TouchableOpacity>
            ) : (
              <TouchableOpacity
                style={styles.applyButton}
                onPress={handleValidateDiscount}
                disabled={isValidating}
              >
                {isValidating ? (
                  <ActivityIndicator size="small" color="#fff" />
                ) : (
                  <Text style={styles.applyButtonText}>Apply</Text>
                )}
              </TouchableOpacity>
            )}
          </View>
          {discountApplied && (
            <Text style={styles.discountApplied}>
              ✓ Discount of KES {discountApplied.amount.toLocaleString()} applied
            </Text>
          )}
        </View>

        {/* Price Breakdown */}
        <View style={styles.section}>
          <Text style={styles.sectionTitle}>Price Details</Text>
          <View style={styles.priceRow}>
            <Text style={styles.priceLabel}>Subtotal</Text>
            <Text style={styles.priceValue}>KES {subtotal.toLocaleString()}</Text>
          </View>
          {discountApplied && (
            <View style={styles.priceRow}>
              <Text style={styles.priceLabel}>Discount</Text>
              <Text style={[styles.priceValue, { color: '#10B981' }]}>
                -KES {discountApplied.amount.toLocaleString()}
              </Text>
            </View>
          )}
          <View style={styles.priceRow}>
            <Text style={styles.priceLabel}>Delivery Fee</Text>
            <Text style={styles.priceValue}>
              {deliveryFee === 0 ? 'Free' : `KES ${deliveryFee}`}
            </Text>
          </View>
          <View style={styles.priceRow}>
            <Text style={styles.priceLabel}>Service Fee</Text>
            <Text style={styles.priceValue}>KES {serviceFee.toLocaleString()}</Text>
          </View>
          <View style={[styles.priceRow, styles.totalRow]}>
            <Text style={styles.totalLabel}>Total</Text>
            <Text style={styles.totalValue}>KES {total.toLocaleString()}</Text>
          </View>
        </View>

        <View style={{ height: 100 }} />
      </ScrollView>

      {/* Place Order Button */}
      <View style={styles.footer}>
        <View style={styles.footerTotal}>
          <Text style={styles.footerTotalLabel}>Total</Text>
          <Text style={styles.footerTotalValue}>KES {total.toLocaleString()}</Text>
        </View>
        <TouchableOpacity
          style={styles.placeOrderButton}
          onPress={handlePlaceOrder}
          disabled={isCreatingOrder}
        >
          {isCreatingOrder ? (
            <ActivityIndicator color="#fff" />
          ) : (
            <Text style={styles.placeOrderButtonText}>Proceed to Payment</Text>
          )}
        </TouchableOpacity>
      </View>
    </KeyboardAvoidingView>
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
  emptyContainer: {
    flex: 1,
    justifyContent: 'center',
    alignItems: 'center',
    backgroundColor: '#F9FAFB',
    padding: 20,
  },
  emptyText: {
    fontSize: 18,
    color: '#6B7280',
    marginTop: 16,
    marginBottom: 24,
  },
  continueButton: {
    backgroundColor: '#F59E0B',
    paddingVertical: 14,
    paddingHorizontal: 32,
    borderRadius: 12,
  },
  continueButtonText: {
    color: '#fff',
    fontSize: 16,
    fontWeight: '600',
  },
  section: {
    backgroundColor: '#fff',
    marginTop: 12,
    padding: 16,
  },
  sectionTitle: {
    fontSize: 16,
    fontWeight: '600',
    color: '#111827',
    marginBottom: 16,
  },
  orderItem: {
    flexDirection: 'row',
    alignItems: 'center',
    paddingVertical: 8,
    borderBottomWidth: 1,
    borderBottomColor: '#F3F4F6',
  },
  itemName: {
    flex: 1,
    fontSize: 14,
    color: '#374151',
  },
  itemQty: {
    fontSize: 14,
    color: '#6B7280',
    marginHorizontal: 12,
  },
  itemPrice: {
    fontSize: 14,
    fontWeight: '600',
    color: '#111827',
  },
  deliveryOptions: {
    flexDirection: 'row',
    gap: 12,
  },
  deliveryOption: {
    flex: 1,
    alignItems: 'center',
    padding: 16,
    borderRadius: 12,
    borderWidth: 2,
    borderColor: '#E5E7EB',
    gap: 8,
  },
  deliveryOptionSelected: {
    borderColor: '#F59E0B',
    backgroundColor: '#FFFBEB',
  },
  deliveryOptionText: {
    fontSize: 14,
    fontWeight: '600',
    color: '#6B7280',
  },
  deliveryOptionTextSelected: {
    color: '#B45309',
  },
  deliveryOptionPrice: {
    fontSize: 12,
    color: '#9CA3AF',
  },
  input: {
    backgroundColor: '#F9FAFB',
    borderRadius: 10,
    paddingHorizontal: 16,
    paddingVertical: 14,
    fontSize: 15,
    color: '#111827',
    marginBottom: 12,
  },
  textArea: {
    minHeight: 80,
    textAlignVertical: 'top',
  },
  row: {
    flexDirection: 'row',
  },
  discountRow: {
    flexDirection: 'row',
    alignItems: 'center',
  },
  applyButton: {
    backgroundColor: '#F59E0B',
    paddingHorizontal: 20,
    paddingVertical: 14,
    borderRadius: 10,
  },
  applyButtonText: {
    color: '#fff',
    fontWeight: '600',
  },
  removeDiscountButton: {
    padding: 14,
    backgroundColor: '#FEE2E2',
    borderRadius: 10,
  },
  discountApplied: {
    color: '#10B981',
    fontSize: 13,
    marginTop: 8,
  },
  priceRow: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    paddingVertical: 8,
  },
  priceLabel: {
    fontSize: 14,
    color: '#6B7280',
  },
  priceValue: {
    fontSize: 14,
    color: '#111827',
  },
  totalRow: {
    borderTopWidth: 1,
    borderTopColor: '#E5E7EB',
    marginTop: 8,
    paddingTop: 16,
  },
  totalLabel: {
    fontSize: 16,
    fontWeight: '600',
    color: '#111827',
  },
  totalValue: {
    fontSize: 18,
    fontWeight: '700',
    color: '#F59E0B',
  },
  footer: {
    position: 'absolute',
    bottom: 0,
    left: 0,
    right: 0,
    backgroundColor: '#fff',
    padding: 16,
    paddingBottom: 34,
    borderTopWidth: 1,
    borderTopColor: '#E5E7EB',
    flexDirection: 'row',
    alignItems: 'center',
  },
  footerTotal: {
    flex: 1,
  },
  footerTotalLabel: {
    fontSize: 12,
    color: '#6B7280',
  },
  footerTotalValue: {
    fontSize: 18,
    fontWeight: '700',
    color: '#111827',
  },
  placeOrderButton: {
    backgroundColor: '#F59E0B',
    paddingVertical: 16,
    paddingHorizontal: 32,
    borderRadius: 12,
  },
  placeOrderButtonText: {
    color: '#fff',
    fontSize: 16,
    fontWeight: '600',
  },
});
