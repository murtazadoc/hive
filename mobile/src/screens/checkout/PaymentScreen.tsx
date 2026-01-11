import React, { useState, useEffect, useRef } from 'react';
import {
  View,
  Text,
  TouchableOpacity,
  StyleSheet,
  Alert,
  ActivityIndicator,
  TextInput,
  Animated,
} from 'react-native';
import { useNavigation, useRoute } from '@react-navigation/native';
import Icon from 'react-native-vector-icons/Feather';
import { ordersApi, paymentsApi } from '../../api/payments';
import { useCartStore } from '../../store/cartStore';

// =====================================================
// PAYMENT SCREEN
// =====================================================
export default function PaymentScreen() {
  const navigation = useNavigation<any>();
  const route = useRoute<any>();
  const { orderId, orderNumber, total, phoneNumber: defaultPhone } = route.params;
  const { clearCart } = useCartStore();

  // State
  const [paymentMethod, setPaymentMethod] = useState<'mpesa' | 'wallet'>('mpesa');
  const [phoneNumber, setPhoneNumber] = useState(defaultPhone || '');
  const [isProcessing, setIsProcessing] = useState(false);
  const [paymentStatus, setPaymentStatus] = useState<'idle' | 'pending' | 'success' | 'failed'>('idle');
  const [checkoutRequestId, setCheckoutRequestId] = useState<string | null>(null);
  const [walletBalance, setWalletBalance] = useState<number>(0);

  // Animation
  const pulseAnim = useRef(new Animated.Value(1)).current;

  // Fetch wallet balance
  useEffect(() => {
    fetchWalletBalance();
  }, []);

  // Poll for payment status
  useEffect(() => {
    if (paymentStatus !== 'pending' || !checkoutRequestId) return;

    const interval = setInterval(async () => {
      try {
        const result = await paymentsApi.checkPaymentStatus(checkoutRequestId);
        
        if (result.status === 'completed') {
          setPaymentStatus('success');
          clearInterval(interval);
        } else if (result.status === 'failed') {
          setPaymentStatus('failed');
          clearInterval(interval);
        }
      } catch (error) {
        console.error('Status check failed:', error);
      }
    }, 3000);

    return () => clearInterval(interval);
  }, [paymentStatus, checkoutRequestId]);

  // Pulse animation for pending state
  useEffect(() => {
    if (paymentStatus === 'pending') {
      Animated.loop(
        Animated.sequence([
          Animated.timing(pulseAnim, {
            toValue: 1.1,
            duration: 800,
            useNativeDriver: true,
          }),
          Animated.timing(pulseAnim, {
            toValue: 1,
            duration: 800,
            useNativeDriver: true,
          }),
        ]),
      ).start();
    } else {
      pulseAnim.setValue(1);
    }
  }, [paymentStatus]);

  const fetchWalletBalance = async () => {
    try {
      const result = await paymentsApi.getWalletBalance();
      setWalletBalance(result.balance);
    } catch (error) {
      console.error('Failed to fetch wallet:', error);
    }
  };

  const handlePayment = async () => {
    if (paymentMethod === 'mpesa') {
      if (!phoneNumber.trim() || phoneNumber.length < 10) {
        Alert.alert('Error', 'Please enter a valid phone number');
        return;
      }
    }

    if (paymentMethod === 'wallet' && walletBalance < total) {
      Alert.alert('Insufficient Balance', 'Please top up your wallet or use M-Pesa');
      return;
    }

    setIsProcessing(true);
    setPaymentStatus('pending');

    try {
      const result = await ordersApi.payOrder(orderId, {
        paymentMethod,
        phoneNumber: paymentMethod === 'mpesa' ? phoneNumber.replace(/\s/g, '') : undefined,
      });

      if (result.success) {
        if (paymentMethod === 'wallet') {
          // Wallet payment is instant
          setPaymentStatus('success');
        } else {
          // M-Pesa - wait for callback
          setCheckoutRequestId(result.checkoutRequestId);
          // Status will be updated by polling
        }
      } else {
        setPaymentStatus('failed');
        Alert.alert('Payment Failed', result.error || 'Please try again');
      }
    } catch (error: any) {
      setPaymentStatus('failed');
      Alert.alert('Error', error.response?.data?.message || 'Payment failed');
    } finally {
      setIsProcessing(false);
    }
  };

  const handleDone = () => {
    clearCart();
    navigation.reset({
      index: 0,
      routes: [
        { name: 'Home' },
        { name: 'OrderDetail', params: { orderId } },
      ],
    });
  };

  const handleRetry = () => {
    setPaymentStatus('idle');
    setCheckoutRequestId(null);
  };

  // Success Screen
  if (paymentStatus === 'success') {
    return (
      <View style={styles.statusContainer}>
        <View style={styles.successIcon}>
          <Icon name="check" size={48} color="#fff" />
        </View>
        <Text style={styles.statusTitle}>Payment Successful!</Text>
        <Text style={styles.statusSubtitle}>
          Order #{orderNumber} has been placed
        </Text>
        <Text style={styles.statusAmount}>KES {total.toLocaleString()}</Text>
        <TouchableOpacity style={styles.doneButton} onPress={handleDone}>
          <Text style={styles.doneButtonText}>View Order</Text>
        </TouchableOpacity>
      </View>
    );
  }

  // Failed Screen
  if (paymentStatus === 'failed') {
    return (
      <View style={styles.statusContainer}>
        <View style={styles.failedIcon}>
          <Icon name="x" size={48} color="#fff" />
        </View>
        <Text style={styles.statusTitle}>Payment Failed</Text>
        <Text style={styles.statusSubtitle}>
          We couldn't process your payment
        </Text>
        <TouchableOpacity style={styles.retryButton} onPress={handleRetry}>
          <Text style={styles.retryButtonText}>Try Again</Text>
        </TouchableOpacity>
        <TouchableOpacity
          style={styles.cancelButton}
          onPress={() => navigation.goBack()}
        >
          <Text style={styles.cancelButtonText}>Cancel</Text>
        </TouchableOpacity>
      </View>
    );
  }

  // Pending Screen (waiting for M-Pesa)
  if (paymentStatus === 'pending') {
    return (
      <View style={styles.statusContainer}>
        <Animated.View
          style={[styles.pendingIcon, { transform: [{ scale: pulseAnim }] }]}
        >
          <Icon name="smartphone" size={48} color="#fff" />
        </Animated.View>
        <Text style={styles.statusTitle}>Check Your Phone</Text>
        <Text style={styles.statusSubtitle}>
          Enter your M-Pesa PIN to complete payment
        </Text>
        <Text style={styles.statusPhone}>{phoneNumber}</Text>
        <ActivityIndicator size="large" color="#F59E0B" style={{ marginTop: 24 }} />
        <Text style={styles.waitingText}>Waiting for confirmation...</Text>
      </View>
    );
  }

  // Payment Method Selection
  return (
    <View style={styles.container}>
      {/* Header */}
      <View style={styles.header}>
        <TouchableOpacity onPress={() => navigation.goBack()}>
          <Icon name="arrow-left" size={24} color="#111827" />
        </TouchableOpacity>
        <Text style={styles.headerTitle}>Payment</Text>
        <View style={{ width: 24 }} />
      </View>

      {/* Order Info */}
      <View style={styles.orderInfo}>
        <Text style={styles.orderLabel}>Order #{orderNumber}</Text>
        <Text style={styles.orderAmount}>KES {total.toLocaleString()}</Text>
      </View>

      {/* Payment Methods */}
      <View style={styles.section}>
        <Text style={styles.sectionTitle}>Select Payment Method</Text>

        {/* M-Pesa */}
        <TouchableOpacity
          style={[
            styles.methodCard,
            paymentMethod === 'mpesa' && styles.methodCardSelected,
          ]}
          onPress={() => setPaymentMethod('mpesa')}
        >
          <View style={[styles.methodIcon, { backgroundColor: '#43B02A' }]}>
            <Text style={styles.mpesaText}>M</Text>
          </View>
          <View style={styles.methodInfo}>
            <Text style={styles.methodName}>M-Pesa</Text>
            <Text style={styles.methodDesc}>Pay with your M-Pesa</Text>
          </View>
          <View
            style={[
              styles.radioOuter,
              paymentMethod === 'mpesa' && styles.radioOuterSelected,
            ]}
          >
            {paymentMethod === 'mpesa' && <View style={styles.radioInner} />}
          </View>
        </TouchableOpacity>

        {/* Wallet */}
        <TouchableOpacity
          style={[
            styles.methodCard,
            paymentMethod === 'wallet' && styles.methodCardSelected,
          ]}
          onPress={() => setPaymentMethod('wallet')}
        >
          <View style={[styles.methodIcon, { backgroundColor: '#F59E0B' }]}>
            <Icon name="credit-card" size={20} color="#fff" />
          </View>
          <View style={styles.methodInfo}>
            <Text style={styles.methodName}>Hive Wallet</Text>
            <Text style={styles.methodDesc}>
              Balance: KES {walletBalance.toLocaleString()}
            </Text>
          </View>
          <View
            style={[
              styles.radioOuter,
              paymentMethod === 'wallet' && styles.radioOuterSelected,
            ]}
          >
            {paymentMethod === 'wallet' && <View style={styles.radioInner} />}
          </View>
        </TouchableOpacity>
      </View>

      {/* Phone Number for M-Pesa */}
      {paymentMethod === 'mpesa' && (
        <View style={styles.section}>
          <Text style={styles.sectionTitle}>M-Pesa Phone Number</Text>
          <View style={styles.phoneInputContainer}>
            <Text style={styles.phonePrefix}>+254</Text>
            <TextInput
              style={styles.phoneInput}
              placeholder="7XX XXX XXX"
              value={phoneNumber}
              onChangeText={setPhoneNumber}
              keyboardType="phone-pad"
              maxLength={12}
            />
          </View>
          <Text style={styles.phoneHint}>
            You'll receive an STK push on this number
          </Text>
        </View>
      )}

      {/* Pay Button */}
      <View style={styles.footer}>
        <TouchableOpacity
          style={[
            styles.payButton,
            isProcessing && styles.payButtonDisabled,
          ]}
          onPress={handlePayment}
          disabled={isProcessing}
        >
          {isProcessing ? (
            <ActivityIndicator color="#fff" />
          ) : (
            <Text style={styles.payButtonText}>
              Pay KES {total.toLocaleString()}
            </Text>
          )}
        </TouchableOpacity>

        {/* Security Note */}
        <View style={styles.securityNote}>
          <Icon name="lock" size={14} color="#6B7280" />
          <Text style={styles.securityText}>
            Secured by Safaricom M-Pesa
          </Text>
        </View>
      </View>
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
  orderInfo: {
    backgroundColor: '#fff',
    padding: 20,
    alignItems: 'center',
    borderBottomWidth: 1,
    borderBottomColor: '#E5E7EB',
  },
  orderLabel: {
    fontSize: 14,
    color: '#6B7280',
    marginBottom: 4,
  },
  orderAmount: {
    fontSize: 32,
    fontWeight: '700',
    color: '#111827',
  },
  section: {
    backgroundColor: '#fff',
    marginTop: 12,
    padding: 16,
  },
  sectionTitle: {
    fontSize: 14,
    fontWeight: '600',
    color: '#6B7280',
    marginBottom: 16,
  },
  methodCard: {
    flexDirection: 'row',
    alignItems: 'center',
    padding: 16,
    borderRadius: 12,
    borderWidth: 2,
    borderColor: '#E5E7EB',
    marginBottom: 12,
  },
  methodCardSelected: {
    borderColor: '#F59E0B',
    backgroundColor: '#FFFBEB',
  },
  methodIcon: {
    width: 48,
    height: 48,
    borderRadius: 24,
    justifyContent: 'center',
    alignItems: 'center',
    marginRight: 16,
  },
  mpesaText: {
    color: '#fff',
    fontSize: 24,
    fontWeight: '700',
  },
  methodInfo: {
    flex: 1,
  },
  methodName: {
    fontSize: 16,
    fontWeight: '600',
    color: '#111827',
  },
  methodDesc: {
    fontSize: 13,
    color: '#6B7280',
    marginTop: 2,
  },
  radioOuter: {
    width: 24,
    height: 24,
    borderRadius: 12,
    borderWidth: 2,
    borderColor: '#D1D5DB',
    justifyContent: 'center',
    alignItems: 'center',
  },
  radioOuterSelected: {
    borderColor: '#F59E0B',
  },
  radioInner: {
    width: 12,
    height: 12,
    borderRadius: 6,
    backgroundColor: '#F59E0B',
  },
  phoneInputContainer: {
    flexDirection: 'row',
    alignItems: 'center',
    backgroundColor: '#F9FAFB',
    borderRadius: 12,
    paddingHorizontal: 16,
  },
  phonePrefix: {
    fontSize: 16,
    color: '#6B7280',
    marginRight: 8,
  },
  phoneInput: {
    flex: 1,
    fontSize: 16,
    paddingVertical: 16,
    color: '#111827',
  },
  phoneHint: {
    fontSize: 12,
    color: '#9CA3AF',
    marginTop: 8,
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
  },
  payButton: {
    backgroundColor: '#F59E0B',
    paddingVertical: 18,
    borderRadius: 12,
    alignItems: 'center',
  },
  payButtonDisabled: {
    backgroundColor: '#D1D5DB',
  },
  payButtonText: {
    color: '#fff',
    fontSize: 18,
    fontWeight: '600',
  },
  securityNote: {
    flexDirection: 'row',
    justifyContent: 'center',
    alignItems: 'center',
    marginTop: 12,
    gap: 6,
  },
  securityText: {
    fontSize: 12,
    color: '#6B7280',
  },
  // Status screens
  statusContainer: {
    flex: 1,
    backgroundColor: '#fff',
    justifyContent: 'center',
    alignItems: 'center',
    padding: 32,
  },
  successIcon: {
    width: 100,
    height: 100,
    borderRadius: 50,
    backgroundColor: '#10B981',
    justifyContent: 'center',
    alignItems: 'center',
    marginBottom: 24,
  },
  failedIcon: {
    width: 100,
    height: 100,
    borderRadius: 50,
    backgroundColor: '#EF4444',
    justifyContent: 'center',
    alignItems: 'center',
    marginBottom: 24,
  },
  pendingIcon: {
    width: 100,
    height: 100,
    borderRadius: 50,
    backgroundColor: '#F59E0B',
    justifyContent: 'center',
    alignItems: 'center',
    marginBottom: 24,
  },
  statusTitle: {
    fontSize: 24,
    fontWeight: '700',
    color: '#111827',
    marginBottom: 8,
  },
  statusSubtitle: {
    fontSize: 16,
    color: '#6B7280',
    textAlign: 'center',
  },
  statusAmount: {
    fontSize: 28,
    fontWeight: '700',
    color: '#10B981',
    marginTop: 16,
  },
  statusPhone: {
    fontSize: 18,
    fontWeight: '600',
    color: '#111827',
    marginTop: 16,
  },
  waitingText: {
    fontSize: 14,
    color: '#6B7280',
    marginTop: 16,
  },
  doneButton: {
    backgroundColor: '#F59E0B',
    paddingVertical: 16,
    paddingHorizontal: 48,
    borderRadius: 12,
    marginTop: 32,
  },
  doneButtonText: {
    color: '#fff',
    fontSize: 16,
    fontWeight: '600',
  },
  retryButton: {
    backgroundColor: '#F59E0B',
    paddingVertical: 16,
    paddingHorizontal: 48,
    borderRadius: 12,
    marginTop: 32,
  },
  retryButtonText: {
    color: '#fff',
    fontSize: 16,
    fontWeight: '600',
  },
  cancelButton: {
    paddingVertical: 16,
    marginTop: 16,
  },
  cancelButtonText: {
    color: '#6B7280',
    fontSize: 16,
  },
});
