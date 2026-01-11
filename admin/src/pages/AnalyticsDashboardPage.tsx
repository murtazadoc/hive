import React, { useState, useEffect } from 'react';
import {
  Box,
  Grid,
  Paper,
  Typography,
  Card,
  CardContent,
  Select,
  MenuItem,
  FormControl,
  InputLabel,
  CircularProgress,
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableRow,
  Tabs,
  Tab,
} from '@mui/material';
import {
  TrendingUp,
  TrendingDown,
  People,
  Visibility,
  ShoppingCart,
  AttachMoney,
  Timer,
  Search,
} from '@mui/icons-material';
import {
  LineChart,
  Line,
  AreaChart,
  Area,
  BarChart,
  Bar,
  PieChart,
  Pie,
  Cell,
  XAxis,
  YAxis,
  CartesianGrid,
  Tooltip,
  Legend,
  ResponsiveContainer,
} from 'recharts';
import { format, subDays, startOfDay, endOfDay } from 'date-fns';
import { analyticsApi } from '../../api/analytics';

// =====================================================
// TYPES
// =====================================================
interface OverviewStats {
  totalUsers: number;
  newUsers: number;
  sessions: number;
  pageViews: number;
  avgSessionDuration: number;
  bounceRate: number;
  conversionRate: number;
  revenue: number;
}

interface DailyStats {
  date: string;
  sessions: number;
  pageViews: number;
  orders: number;
  revenue: number;
}

// =====================================================
// STAT CARD COMPONENT
// =====================================================
function StatCard({
  title,
  value,
  change,
  icon,
  color = '#F59E0B',
  format: formatFn,
}: {
  title: string;
  value: number;
  change?: number;
  icon: React.ReactNode;
  color?: string;
  format?: (v: number) => string;
}) {
  const formattedValue = formatFn ? formatFn(value) : value.toLocaleString();
  const isPositive = (change || 0) >= 0;

  return (
    <Card sx={{ height: '100%' }}>
      <CardContent>
        <Box display="flex" justifyContent="space-between" alignItems="flex-start">
          <Box>
            <Typography color="textSecondary" variant="body2" gutterBottom>
              {title}
            </Typography>
            <Typography variant="h4" fontWeight={600}>
              {formattedValue}
            </Typography>
            {change !== undefined && (
              <Box display="flex" alignItems="center" mt={1}>
                {isPositive ? (
                  <TrendingUp sx={{ color: 'success.main', fontSize: 18 }} />
                ) : (
                  <TrendingDown sx={{ color: 'error.main', fontSize: 18 }} />
                )}
                <Typography
                  variant="body2"
                  sx={{ color: isPositive ? 'success.main' : 'error.main', ml: 0.5 }}
                >
                  {isPositive ? '+' : ''}{change}%
                </Typography>
                <Typography variant="body2" color="textSecondary" sx={{ ml: 0.5 }}>
                  vs last period
                </Typography>
              </Box>
            )}
          </Box>
          <Box
            sx={{
              backgroundColor: `${color}20`,
              borderRadius: 2,
              p: 1.5,
            }}
          >
            {icon}
          </Box>
        </Box>
      </CardContent>
    </Card>
  );
}

// =====================================================
// ANALYTICS DASHBOARD PAGE
// =====================================================
export default function AnalyticsDashboardPage() {
  const [dateRange, setDateRange] = useState('7d');
  const [tabValue, setTabValue] = useState(0);
  const [loading, setLoading] = useState(true);
  
  const [overview, setOverview] = useState<OverviewStats | null>(null);
  const [dailyStats, setDailyStats] = useState<DailyStats[]>([]);
  const [topPages, setTopPages] = useState<any[]>([]);
  const [trafficSources, setTrafficSources] = useState<any[]>([]);
  const [topSearches, setTopSearches] = useState<any[]>([]);
  const [checkoutFunnel, setCheckoutFunnel] = useState<any[]>([]);

  const getDateRange = () => {
    const end = endOfDay(new Date());
    let start: Date;
    
    switch (dateRange) {
      case '1d':
        start = startOfDay(new Date());
        break;
      case '7d':
        start = startOfDay(subDays(new Date(), 6));
        break;
      case '30d':
        start = startOfDay(subDays(new Date(), 29));
        break;
      case '90d':
        start = startOfDay(subDays(new Date(), 89));
        break;
      default:
        start = startOfDay(subDays(new Date(), 6));
    }
    
    return {
      startDate: format(start, 'yyyy-MM-dd'),
      endDate: format(end, 'yyyy-MM-dd'),
    };
  };

  useEffect(() => {
    loadData();
  }, [dateRange]);

  const loadData = async () => {
    setLoading(true);
    const { startDate, endDate } = getDateRange();

    try {
      const [
        overviewData,
        dailyData,
        pagesData,
        sourcesData,
        searchesData,
        funnelData,
      ] = await Promise.all([
        analyticsApi.getOverview(startDate, endDate),
        analyticsApi.getDailyStats(startDate, endDate),
        analyticsApi.getTopPages(startDate, endDate),
        analyticsApi.getTrafficSources(startDate, endDate),
        analyticsApi.getTopSearches(startDate, endDate),
        analyticsApi.getFunnelConversion('checkout', startDate, endDate),
      ]);

      setOverview(overviewData);
      setDailyStats(dailyData);
      setTopPages(pagesData);
      setTrafficSources(sourcesData);
      setTopSearches(searchesData);
      setCheckoutFunnel(funnelData);
    } catch (error) {
      console.error('Failed to load analytics:', error);
    } finally {
      setLoading(false);
    }
  };

  const COLORS = ['#F59E0B', '#3B82F6', '#10B981', '#8B5CF6', '#EC4899', '#6B7280'];

  if (loading) {
    return (
      <Box display="flex" justifyContent="center" alignItems="center" minHeight={400}>
        <CircularProgress />
      </Box>
    );
  }

  return (
    <Box p={3}>
      {/* Header */}
      <Box display="flex" justifyContent="space-between" alignItems="center" mb={3}>
        <Typography variant="h5" fontWeight={600}>
          Analytics Dashboard
        </Typography>
        
        <FormControl size="small" sx={{ minWidth: 120 }}>
          <InputLabel>Period</InputLabel>
          <Select
            value={dateRange}
            label="Period"
            onChange={(e) => setDateRange(e.target.value)}
          >
            <MenuItem value="1d">Today</MenuItem>
            <MenuItem value="7d">Last 7 days</MenuItem>
            <MenuItem value="30d">Last 30 days</MenuItem>
            <MenuItem value="90d">Last 90 days</MenuItem>
          </Select>
        </FormControl>
      </Box>

      {/* Overview Stats */}
      <Grid container spacing={3} mb={3}>
        <Grid item xs={12} sm={6} md={3}>
          <StatCard
            title="Total Users"
            value={overview?.totalUsers || 0}
            change={12.5}
            icon={<People sx={{ color: '#3B82F6', fontSize: 28 }} />}
            color="#3B82F6"
          />
        </Grid>
        <Grid item xs={12} sm={6} md={3}>
          <StatCard
            title="Page Views"
            value={overview?.pageViews || 0}
            change={8.2}
            icon={<Visibility sx={{ color: '#10B981', fontSize: 28 }} />}
            color="#10B981"
          />
        </Grid>
        <Grid item xs={12} sm={6} md={3}>
          <StatCard
            title="Conversion Rate"
            value={overview?.conversionRate || 0}
            change={-2.1}
            icon={<ShoppingCart sx={{ color: '#8B5CF6', fontSize: 28 }} />}
            color="#8B5CF6"
            format={(v) => `${v}%`}
          />
        </Grid>
        <Grid item xs={12} sm={6} md={3}>
          <StatCard
            title="Revenue"
            value={overview?.revenue || 0}
            change={15.3}
            icon={<AttachMoney sx={{ color: '#F59E0B', fontSize: 28 }} />}
            color="#F59E0B"
            format={(v) => `KES ${v.toLocaleString()}`}
          />
        </Grid>
      </Grid>

      {/* Charts Row */}
      <Grid container spacing={3} mb={3}>
        {/* Traffic Chart */}
        <Grid item xs={12} lg={8}>
          <Paper sx={{ p: 3 }}>
            <Typography variant="h6" mb={2}>Traffic Overview</Typography>
            <ResponsiveContainer width="100%" height={300}>
              <AreaChart data={dailyStats}>
                <CartesianGrid strokeDasharray="3 3" />
                <XAxis 
                  dataKey="date" 
                  tickFormatter={(v) => format(new Date(v), 'MMM d')}
                />
                <YAxis />
                <Tooltip 
                  labelFormatter={(v) => format(new Date(v), 'MMM d, yyyy')}
                />
                <Legend />
                <Area
                  type="monotone"
                  dataKey="sessions"
                  name="Sessions"
                  stroke="#3B82F6"
                  fill="#3B82F6"
                  fillOpacity={0.2}
                />
                <Area
                  type="monotone"
                  dataKey="pageViews"
                  name="Page Views"
                  stroke="#10B981"
                  fill="#10B981"
                  fillOpacity={0.2}
                />
              </AreaChart>
            </ResponsiveContainer>
          </Paper>
        </Grid>

        {/* Traffic Sources */}
        <Grid item xs={12} lg={4}>
          <Paper sx={{ p: 3, height: '100%' }}>
            <Typography variant="h6" mb={2}>Traffic Sources</Typography>
            <ResponsiveContainer width="100%" height={250}>
              <PieChart>
                <Pie
                  data={trafficSources}
                  dataKey="sessions"
                  nameKey="source"
                  cx="50%"
                  cy="50%"
                  outerRadius={80}
                  label={({ name, percentage }) => `${name}: ${percentage}%`}
                >
                  {trafficSources.map((_, index) => (
                    <Cell key={index} fill={COLORS[index % COLORS.length]} />
                  ))}
                </Pie>
                <Tooltip />
              </PieChart>
            </ResponsiveContainer>
          </Paper>
        </Grid>
      </Grid>

      {/* Revenue Chart */}
      <Grid container spacing={3} mb={3}>
        <Grid item xs={12}>
          <Paper sx={{ p: 3 }}>
            <Typography variant="h6" mb={2}>Revenue & Orders</Typography>
            <ResponsiveContainer width="100%" height={300}>
              <LineChart data={dailyStats}>
                <CartesianGrid strokeDasharray="3 3" />
                <XAxis 
                  dataKey="date" 
                  tickFormatter={(v) => format(new Date(v), 'MMM d')}
                />
                <YAxis yAxisId="left" />
                <YAxis yAxisId="right" orientation="right" />
                <Tooltip 
                  labelFormatter={(v) => format(new Date(v), 'MMM d, yyyy')}
                  formatter={(value: any, name: string) => [
                    name === 'Revenue' ? `KES ${value.toLocaleString()}` : value,
                    name,
                  ]}
                />
                <Legend />
                <Line
                  yAxisId="right"
                  type="monotone"
                  dataKey="orders"
                  name="Orders"
                  stroke="#8B5CF6"
                  strokeWidth={2}
                />
                <Line
                  yAxisId="left"
                  type="monotone"
                  dataKey="revenue"
                  name="Revenue"
                  stroke="#F59E0B"
                  strokeWidth={2}
                />
              </LineChart>
            </ResponsiveContainer>
          </Paper>
        </Grid>
      </Grid>

      {/* Tabs Section */}
      <Paper sx={{ mb: 3 }}>
        <Tabs value={tabValue} onChange={(_, v) => setTabValue(v)}>
          <Tab label="Top Pages" />
          <Tab label="Top Searches" />
          <Tab label="Checkout Funnel" />
        </Tabs>

        <Box p={3}>
          {/* Top Pages */}
          {tabValue === 0 && (
            <Table>
              <TableHead>
                <TableRow>
                  <TableCell>Page</TableCell>
                  <TableCell>Type</TableCell>
                  <TableCell align="right">Views</TableCell>
                  <TableCell align="right">Unique Visitors</TableCell>
                  <TableCell align="right">Avg. Time</TableCell>
                </TableRow>
              </TableHead>
              <TableBody>
                {topPages.map((page, index) => (
                  <TableRow key={index}>
                    <TableCell>{page.pagePath}</TableCell>
                    <TableCell>{page.pageType}</TableCell>
                    <TableCell align="right">{page.views.toLocaleString()}</TableCell>
                    <TableCell align="right">{page.uniqueVisitors.toLocaleString()}</TableCell>
                    <TableCell align="right">{page.avgTimeOnPage}s</TableCell>
                  </TableRow>
                ))}
              </TableBody>
            </Table>
          )}

          {/* Top Searches */}
          {tabValue === 1 && (
            <Table>
              <TableHead>
                <TableRow>
                  <TableCell>Search Query</TableCell>
                  <TableCell align="right">Searches</TableCell>
                  <TableCell align="right">Avg. Results</TableCell>
                  <TableCell align="right">Click Rate</TableCell>
                </TableRow>
              </TableHead>
              <TableBody>
                {topSearches.map((search, index) => (
                  <TableRow key={index}>
                    <TableCell>
                      <Box display="flex" alignItems="center">
                        <Search sx={{ color: 'text.secondary', mr: 1, fontSize: 18 }} />
                        {search.query}
                      </Box>
                    </TableCell>
                    <TableCell align="right">{search.count.toLocaleString()}</TableCell>
                    <TableCell align="right">{search.avgResults}</TableCell>
                    <TableCell align="right">{search.clickRate}%</TableCell>
                  </TableRow>
                ))}
              </TableBody>
            </Table>
          )}

          {/* Checkout Funnel */}
          {tabValue === 2 && (
            <Box>
              <ResponsiveContainer width="100%" height={300}>
                <BarChart data={checkoutFunnel} layout="vertical">
                  <CartesianGrid strokeDasharray="3 3" />
                  <XAxis type="number" />
                  <YAxis dataKey="step" type="category" width={120} />
                  <Tooltip 
                    formatter={(value: any) => [value.toLocaleString(), 'Users']}
                  />
                  <Bar dataKey="users" fill="#F59E0B">
                    {checkoutFunnel.map((_, index) => (
                      <Cell 
                        key={index} 
                        fill={COLORS[index % COLORS.length]} 
                      />
                    ))}
                  </Bar>
                </BarChart>
              </ResponsiveContainer>

              <Table sx={{ mt: 3 }}>
                <TableHead>
                  <TableRow>
                    <TableCell>Step</TableCell>
                    <TableCell align="right">Users</TableCell>
                    <TableCell align="right">Conversion Rate</TableCell>
                    <TableCell align="right">Drop-off</TableCell>
                  </TableRow>
                </TableHead>
                <TableBody>
                  {checkoutFunnel.map((step, index) => (
                    <TableRow key={index}>
                      <TableCell>{step.step}</TableCell>
                      <TableCell align="right">{step.users.toLocaleString()}</TableCell>
                      <TableCell align="right">{step.conversionRate}%</TableCell>
                      <TableCell align="right">
                        {step.dropoffRate > 0 && (
                          <Typography color="error.main">
                            -{step.dropoffRate}%
                          </Typography>
                        )}
                      </TableCell>
                    </TableRow>
                  ))}
                </TableBody>
              </Table>
            </Box>
          )}
        </Box>
      </Paper>

      {/* Additional Stats */}
      <Grid container spacing={3}>
        <Grid item xs={12} sm={6} md={3}>
          <StatCard
            title="New Users"
            value={overview?.newUsers || 0}
            icon={<People sx={{ color: '#10B981', fontSize: 28 }} />}
            color="#10B981"
          />
        </Grid>
        <Grid item xs={12} sm={6} md={3}>
          <StatCard
            title="Sessions"
            value={overview?.sessions || 0}
            icon={<Visibility sx={{ color: '#3B82F6', fontSize: 28 }} />}
            color="#3B82F6"
          />
        </Grid>
        <Grid item xs={12} sm={6} md={3}>
          <StatCard
            title="Avg. Session Duration"
            value={overview?.avgSessionDuration || 0}
            icon={<Timer sx={{ color: '#8B5CF6', fontSize: 28 }} />}
            color="#8B5CF6"
            format={(v) => `${Math.floor(v / 60)}m ${v % 60}s`}
          />
        </Grid>
        <Grid item xs={12} sm={6} md={3}>
          <StatCard
            title="Bounce Rate"
            value={overview?.bounceRate || 0}
            icon={<TrendingDown sx={{ color: '#EF4444', fontSize: 28 }} />}
            color="#EF4444"
            format={(v) => `${v}%`}
          />
        </Grid>
      </Grid>
    </Box>
  );
}
