/**
 * HIVE Admin Analytics API Client
 */

import api from './client';

export const analyticsApi = {
  // Platform Overview
  getOverview: async (startDate: string, endDate: string) => {
    const response = await api.get('/admin/analytics/overview', {
      params: { startDate, endDate },
    });
    return response.data;
  },

  // Daily Stats
  getDailyStats: async (
    startDate: string,
    endDate: string,
    metrics?: string[],
  ) => {
    const response = await api.get('/admin/analytics/daily', {
      params: { startDate, endDate, metrics: metrics?.join(',') },
    });
    return response.data;
  },

  // Top Pages
  getTopPages: async (
    startDate: string,
    endDate: string,
    limit?: number,
  ) => {
    const response = await api.get('/admin/analytics/top-pages', {
      params: { startDate, endDate, limit },
    });
    return response.data;
  },

  // Traffic Sources
  getTrafficSources: async (startDate: string, endDate: string) => {
    const response = await api.get('/admin/analytics/traffic-sources', {
      params: { startDate, endDate },
    });
    return response.data;
  },

  // Top Searches
  getTopSearches: async (
    startDate: string,
    endDate: string,
    limit?: number,
  ) => {
    const response = await api.get('/admin/analytics/top-searches', {
      params: { startDate, endDate, limit },
    });
    return response.data;
  },

  // Zero Result Searches
  getZeroResultSearches: async (
    startDate: string,
    endDate: string,
    limit?: number,
  ) => {
    const response = await api.get('/admin/analytics/zero-results', {
      params: { startDate, endDate, limit },
    });
    return response.data;
  },

  // Funnel Conversion
  getFunnelConversion: async (
    funnelName: string,
    startDate: string,
    endDate: string,
  ) => {
    const response = await api.get(`/admin/analytics/funnel/${funnelName}`, {
      params: { startDate, endDate },
    });
    return response.data;
  },
};

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
