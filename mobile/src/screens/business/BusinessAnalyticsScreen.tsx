import React, { useState, useEffect } from 'react';
import {
  View,
  Text,
  ScrollView,
  TouchableOpacity,
  StyleSheet,
  RefreshControl,
  ActivityIndicator,
  Dimensions,
} from 'react-native';
import { useRoute } from '@react-navigation/native';
import Icon from 'react-native-vector-icons/Feather';
import { LineChart, BarChart } from 'react-native-chart-kit';
import { format, subDays } from 'date-fns';
import { businessAnalyticsApi } from '../../api/analytics';

const { width: screenWidth } = Dimensions.get('window');

// =====================================================
// TYPES
// =====================================================
interface OverviewStats {
  profileViews: number;
  uniqueVisitors: number;
  productViews: number;
  followers: number;
  newFollowers: number;
  orders: number;
  revenue: number;
  conversionRate: number;
}

// =====================================================
// STAT CARD COMPONENT
// =====================================================
function StatCard({
  title,
  value,
  icon,
  color,
  suffix = '',
  prefix = '',
}: {
  title: string;
  value: number;
  icon: string;
  color: string;
  suffix?: string;
  prefix?: string;
}) {
  return (
    <View style={styles.statCard}>
      <View style={[styles.statIcon, { backgroundColor: `${color}20` }]}>
        <Icon name={icon} size={20} color={color} />
      </View>
      <Text style={styles.statValue}>
        {prefix}{value.toLocaleString()}{suffix}
      </Text>
      <Text style={styles.statTitle}>{title}</Text>
    </View>
  );
}

// =====================================================
// BUSINESS ANALYTICS SCREEN
// =====================================================
export default function BusinessAnalyticsScreen() {
  const route = useRoute<any>();
  const { businessId } = route.params;

  const [period, setPeriod] = useState<'7d' | '30d' | '90d'>('7d');
  const [loading, setLoading] = useState(true);
  const [refreshing, setRefreshing] = useState(false);

  const [overview, setOverview] = useState<OverviewStats | null>(null);
  const [dailyStats, setDailyStats] = useState<any[]>([]);
  const [topProducts, setTopProducts] = useState<any[]>([]);

  const getDateRange = () => {
    const endDate = new Date();
    let startDate: Date;

    switch (period) {
      case '7d':
        startDate = subDays(endDate, 6);
        break;
      case '30d':
        startDate = subDays(endDate, 29);
        break;
      case '90d':
        startDate = subDays(endDate, 89);
        break;
    }

    return {
      startDate: format(startDate, 'yyyy-MM-dd'),
      endDate: format(endDate, 'yyyy-MM-dd'),
    };
  };

  const loadData = async () => {
    const { startDate, endDate } = getDateRange();

    try {
      const [overviewData, dailyData, productsData] = await Promise.all([
        businessAnalyticsApi.getOverview(businessId, startDate, endDate),
        businessAnalyticsApi.getDailyStats(businessId, startDate, endDate),
        businessAnalyticsApi.getTopProducts(businessId, startDate, endDate, 5),
      ]);

      setOverview(overviewData);
      setDailyStats(dailyData);
      setTopProducts(productsData);
    } catch (error) {
      console.error('Failed to load analytics:', error);
    } finally {
      setLoading(false);
      setRefreshing(false);
    }
  };

  useEffect(() => {
    loadData();
  }, [period]);

  const handleRefresh = () => {
    setRefreshing(true);
    loadData();
  };

  // Prepare chart data
  const chartData = {
    labels: dailyStats.slice(-7).map((d) => format(new Date(d.date), 'dd')),
    datasets: [
      {
        data: dailyStats.slice(-7).map((d) => d.profileViews || 0),
        color: () => '#F59E0B',
      },
    ],
  };

  const revenueChartData = {
    labels: dailyStats.slice(-7).map((d) => format(new Date(d.date), 'dd')),
    datasets: [
      {
        data: dailyStats.slice(-7).map((d) => d.revenue || 0),
      },
    ],
  };

  const chartConfig = {
    backgroundGradientFrom: '#fff',
    backgroundGradientTo: '#fff',
    color: (opacity = 1) => `rgba(245, 158, 11, ${opacity})`,
    strokeWidth: 2,
    decimalPlaces: 0,
    propsForLabels: {
      fontSize: 10,
    },
  };

  if (loading) {
    return (
      <View style={styles.loadingContainer}>
        <ActivityIndicator size="large" color="#F59E0B" />
      </View>
    );
  }

  return (
    <ScrollView
      style={styles.container}
      refreshControl={
        <RefreshControl
          refreshing={refreshing}
          onRefresh={handleRefresh}
          colors={['#F59E0B']}
        />
      }
    >
      {/* Period Selector */}
      <View style={styles.periodSelector}>
        {(['7d', '30d', '90d'] as const).map((p) => (
          <TouchableOpacity
            key={p}
            style={[
              styles.periodButton,
              period === p && styles.periodButtonActive,
            ]}
            onPress={() => setPeriod(p)}
          >
            <Text
              style={[
                styles.periodButtonText,
                period === p && styles.periodButtonTextActive,
              ]}
            >
              {p === '7d' ? '7 Days' : p === '30d' ? '30 Days' : '90 Days'}
            </Text>
          </TouchableOpacity>
        ))}
      </View>

      {/* Overview Stats */}
      <View style={styles.statsGrid}>
        <StatCard
          title="Profile Views"
          value={overview?.profileViews || 0}
          icon="eye"
          color="#3B82F6"
        />
        <StatCard
          title="Unique Visitors"
          value={overview?.uniqueVisitors || 0}
          icon="users"
          color="#10B981"
        />
        <StatCard
          title="Followers"
          value={overview?.followers || 0}
          icon="heart"
          color="#EC4899"
        />
        <StatCard
          title="New Followers"
          value={overview?.newFollowers || 0}
          icon="user-plus"
          color="#8B5CF6"
          prefix="+"
        />
        <StatCard
          title="Orders"
          value={overview?.orders || 0}
          icon="shopping-bag"
          color="#F59E0B"
        />
        <StatCard
          title="Revenue"
          value={overview?.revenue || 0}
          icon="dollar-sign"
          color="#10B981"
          prefix="KES "
        />
      </View>

      {/* Conversion Rate */}
      <View style={styles.conversionCard}>
        <Text style={styles.sectionTitle}>Conversion Rate</Text>
        <View style={styles.conversionRow}>
          <View style={styles.conversionItem}>
            <Text style={styles.conversionValue}>
              {overview?.conversionRate || 0}%
            </Text>
            <Text style={styles.conversionLabel}>Views → Orders</Text>
          </View>
          <View style={styles.conversionItem}>
            <Text style={styles.conversionValue}>
              {overview?.productViews || 0}
            </Text>
            <Text style={styles.conversionLabel}>Product Views</Text>
          </View>
        </View>
      </View>

      {/* Views Chart */}
      <View style={styles.chartCard}>
        <Text style={styles.sectionTitle}>Profile Views</Text>
        {dailyStats.length > 0 && (
          <LineChart
            data={chartData}
            width={screenWidth - 48}
            height={200}
            chartConfig={chartConfig}
            bezier
            style={styles.chart}
          />
        )}
      </View>

      {/* Revenue Chart */}
      <View style={styles.chartCard}>
        <Text style={styles.sectionTitle}>Revenue (KES)</Text>
        {dailyStats.length > 0 && (
          <BarChart
            data={revenueChartData}
            width={screenWidth - 48}
            height={200}
            chartConfig={{
              ...chartConfig,
              color: (opacity = 1) => `rgba(16, 185, 129, ${opacity})`,
            }}
            style={styles.chart}
            yAxisLabel="KES "
            yAxisSuffix=""
          />
        )}
      </View>

      {/* Top Products */}
      <View style={styles.section}>
        <Text style={styles.sectionTitle}>Top Products</Text>
        {topProducts.map((product, index) => (
          <View key={product.id} style={styles.productRow}>
            <View style={styles.productRank}>
              <Text style={styles.productRankText}>#{index + 1}</Text>
            </View>
            <View style={styles.productInfo}>
              <Text style={styles.productName} numberOfLines={1}>
                {product.name}
              </Text>
              <Text style={styles.productStats}>
                {product.views} views • {product.orders} orders
              </Text>
            </View>
            <Text style={styles.productRevenue}>
              KES {product.revenue?.toLocaleString() || 0}
            </Text>
          </View>
        ))}
      </View>

      <View style={{ height: 40 }} />
    </ScrollView>
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
  loadingContainer: {
    flex: 1,
    justifyContent: 'center',
    alignItems: 'center',
  },
  periodSelector: {
    flexDirection: 'row',
    padding: 16,
    gap: 8,
  },
  periodButton: {
    flex: 1,
    paddingVertical: 10,
    borderRadius: 8,
    backgroundColor: '#fff',
    alignItems: 'center',
    borderWidth: 1,
    borderColor: '#E5E7EB',
  },
  periodButtonActive: {
    backgroundColor: '#F59E0B',
    borderColor: '#F59E0B',
  },
  periodButtonText: {
    fontSize: 14,
    color: '#6B7280',
    fontWeight: '500',
  },
  periodButtonTextActive: {
    color: '#fff',
  },
  statsGrid: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    padding: 8,
  },
  statCard: {
    width: '50%',
    padding: 8,
  },
  statIcon: {
    width: 40,
    height: 40,
    borderRadius: 20,
    justifyContent: 'center',
    alignItems: 'center',
    marginBottom: 8,
  },
  statValue: {
    fontSize: 24,
    fontWeight: '700',
    color: '#111827',
  },
  statTitle: {
    fontSize: 13,
    color: '#6B7280',
    marginTop: 4,
  },
  conversionCard: {
    backgroundColor: '#fff',
    margin: 16,
    marginTop: 8,
    padding: 16,
    borderRadius: 12,
  },
  conversionRow: {
    flexDirection: 'row',
    marginTop: 12,
  },
  conversionItem: {
    flex: 1,
    alignItems: 'center',
  },
  conversionValue: {
    fontSize: 28,
    fontWeight: '700',
    color: '#F59E0B',
  },
  conversionLabel: {
    fontSize: 13,
    color: '#6B7280',
    marginTop: 4,
  },
  chartCard: {
    backgroundColor: '#fff',
    margin: 16,
    marginTop: 8,
    padding: 16,
    borderRadius: 12,
  },
  sectionTitle: {
    fontSize: 16,
    fontWeight: '600',
    color: '#111827',
    marginBottom: 12,
  },
  chart: {
    borderRadius: 8,
    marginLeft: -16,
  },
  section: {
    backgroundColor: '#fff',
    margin: 16,
    marginTop: 8,
    padding: 16,
    borderRadius: 12,
  },
  productRow: {
    flexDirection: 'row',
    alignItems: 'center',
    paddingVertical: 12,
    borderBottomWidth: 1,
    borderBottomColor: '#F3F4F6',
  },
  productRank: {
    width: 32,
    height: 32,
    borderRadius: 16,
    backgroundColor: '#F3F4F6',
    justifyContent: 'center',
    alignItems: 'center',
    marginRight: 12,
  },
  productRankText: {
    fontSize: 12,
    fontWeight: '600',
    color: '#6B7280',
  },
  productInfo: {
    flex: 1,
  },
  productName: {
    fontSize: 14,
    fontWeight: '500',
    color: '#111827',
  },
  productStats: {
    fontSize: 12,
    color: '#6B7280',
    marginTop: 2,
  },
  productRevenue: {
    fontSize: 14,
    fontWeight: '600',
    color: '#10B981',
  },
});
