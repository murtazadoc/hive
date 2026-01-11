/**
 * HIVE Mobile Analytics API Client
 */

import api from './client';

export const businessAnalyticsApi = {
  // Business Overview
  getOverview: async (
    businessId: string,
    startDate: string,
    endDate: string,
  ) => {
    const response = await api.get(`/businesses/${businessId}/analytics/overview`, {
      params: { startDate, endDate },
    });
    return response.data;
  },

  // Business Daily Stats
  getDailyStats: async (
    businessId: string,
    startDate: string,
    endDate: string,
  ) => {
    const response = await api.get(`/businesses/${businessId}/analytics/daily`, {
      params: { startDate, endDate },
    });
    return response.data;
  },

  // Top Products
  getTopProducts: async (
    businessId: string,
    startDate: string,
    endDate: string,
    limit?: number,
  ) => {
    const response = await api.get(`/businesses/${businessId}/analytics/top-products`, {
      params: { startDate, endDate, limit },
    });
    return response.data;
  },
};

export const productAnalyticsApi = {
  // Product Stats
  getStats: async (
    productId: string,
    startDate: string,
    endDate: string,
  ) => {
    const response = await api.get(`/products/${productId}/analytics`, {
      params: { startDate, endDate },
    });
    return response.data;
  },
};
