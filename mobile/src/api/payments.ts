/**
 * HIVE Payments API Client
 */

import api from './client';

// =====================================================
// TYPES
// =====================================================
export interface CreateOrderDto {
  businessId: string;
  items: Array<{
    productId: string;
    quantity: number;
    variantId?: string;
  }>;
  deliveryType: 'pickup' | 'delivery';
  deliveryAddress?: {
    address: string;
    city: string;
    county: string;
    postalCode?: string;
    instructions?: string;
  };
  buyerPhone: string;
  buyerName: string;
  discountCode?: string;
}

export interface Order {
  id: string;
  orderNumber: string;
  items: any[];
  subtotal: number;
  discountAmount: number;
  deliveryFee: number;
  serviceFee: number;
  totalAmount: number;
  status: string;
  paymentStatus: string;
  deliveryType: string;
  deliveryAddress?: any;
  business: {
    id: string;
    businessName: string;
    logoUrl?: string;
  };
  createdAt: string;
}

export interface PayOrderDto {
  paymentMethod: 'mpesa' | 'wallet';
  phoneNumber?: string;
}

// =====================================================
// ORDERS API
// =====================================================
export const ordersApi = {
  createOrder: async (dto: CreateOrderDto): Promise<{
    orderId: string;
    orderNumber: string;
    total: number;
    status: string;
  }> => {
    const response = await api.post('/orders', dto);
    return response.data;
  },

  payOrder: async (orderId: string, dto: PayOrderDto): Promise<{
    success: boolean;
    checkoutRequestId?: string;
    error?: string;
  }> => {
    const response = await api.post(`/orders/${orderId}/pay`, dto);
    return response.data;
  },

  getOrder: async (orderId: string): Promise<Order> => {
    const response = await api.get(`/orders/${orderId}`);
    return response.data;
  },

  getMyOrders: async (status?: string, limit?: number, cursor?: string): Promise<Order[]> => {
    const response = await api.get('/orders', {
      params: { status, limit, cursor },
    });
    return response.data;
  },

  getOrderStatus: async (orderId: string): Promise<{
    status: string;
    paymentStatus: string;
  }> => {
    const response = await api.get(`/orders/${orderId}/status`);
    return response.data;
  },
};

// =====================================================
// PAYMENTS API
// =====================================================
export const paymentsApi = {
  // Wallet
  getWallet: async (): Promise<{
    id: string;
    balance: number;
    currency: string;
  }> => {
    const response = await api.get('/wallet');
    return response.data;
  },

  getWalletBalance: async (): Promise<{
    balance: number;
    currency: string;
  }> => {
    const response = await api.get('/wallet/balance');
    return response.data;
  },

  depositToWallet: async (amount: number, phoneNumber: string): Promise<{
    success: boolean;
    checkoutRequestId?: string;
    error?: string;
  }> => {
    const response = await api.post('/wallet/deposit', {
      amount,
      phoneNumber,
    });
    return response.data;
  },

  getTransactions: async (limit?: number, cursor?: string): Promise<any[]> => {
    const response = await api.get('/wallet/transactions', {
      params: { limit, cursor },
    });
    return response.data;
  },

  // Payment status
  checkPaymentStatus: async (checkoutRequestId: string): Promise<{
    status: 'pending' | 'completed' | 'failed';
    mpesaReceipt?: string;
  }> => {
    const response = await api.get(`/payments/status/${checkoutRequestId}`);
    return response.data;
  },

  // Discounts
  validateDiscount: async (
    code: string,
    businessId: string,
    subtotal: number,
  ): Promise<{
    valid: boolean;
    discountId?: string;
    discountAmount?: number;
  }> => {
    const response = await api.post('/discounts/validate', {
      code,
      businessId,
      subtotal,
    });
    return response.data;
  },
};

// =====================================================
// BUSINESS ORDERS API
// =====================================================
export const businessOrdersApi = {
  getOrders: async (
    businessId: string,
    status?: string,
    limit?: number,
    cursor?: string,
  ): Promise<Order[]> => {
    const response = await api.get(`/businesses/${businessId}/orders`, {
      params: { status, limit, cursor },
    });
    return response.data;
  },

  updateOrderStatus: async (
    businessId: string,
    orderId: string,
    status: string,
    notes?: string,
  ): Promise<Order> => {
    const response = await api.put(`/businesses/${businessId}/orders/${orderId}/status`, {
      status,
      notes,
    });
    return response.data;
  },
};
