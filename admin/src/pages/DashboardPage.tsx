import { useQuery } from '@tanstack/react-query';
import { Link } from 'react-router-dom';
import {
  Chart as ChartJS,
  CategoryScale,
  LinearScale,
  PointElement,
  LineElement,
  BarElement,
  Title,
  Tooltip,
  Legend,
  Filler,
} from 'chart.js';
import { Line, Bar } from 'react-chartjs-2';
import {
  UsersIcon,
  BuildingStorefrontIcon,
  CubeIcon,
  ClockIcon,
  ArrowTrendingUpIcon,
  ArrowTrendingDownIcon,
} from '@heroicons/react/24/outline';
import { dashboardApi, businessesApi } from '../api/client';
import { format } from 'date-fns';

// Register Chart.js components
ChartJS.register(
  CategoryScale,
  LinearScale,
  PointElement,
  LineElement,
  BarElement,
  Title,
  Tooltip,
  Legend,
  Filler
);

export default function DashboardPage() {
  // Mock data for now - replace with actual API calls
  const stats = {
    totalUsers: 12847,
    usersChange: 12.5,
    totalBusinesses: 3421,
    businessesChange: 8.3,
    totalProducts: 28493,
    productsChange: 15.2,
    pendingApprovals: 47,
  };

  const { data: pendingCount } = useQuery({
    queryKey: ['pending-businesses-count'],
    queryFn: () => businessesApi.getPendingCount(),
    initialData: { count: 47 },
  });

  // Chart data
  const lineChartData = {
    labels: ['Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat', 'Sun'],
    datasets: [
      {
        label: 'New Users',
        data: [65, 78, 90, 81, 56, 55, 72],
        borderColor: '#F59E0B',
        backgroundColor: 'rgba(245, 158, 11, 0.1)',
        fill: true,
        tension: 0.4,
      },
      {
        label: 'New Businesses',
        data: [28, 35, 40, 31, 26, 22, 34],
        borderColor: '#3B82F6',
        backgroundColor: 'rgba(59, 130, 246, 0.1)',
        fill: true,
        tension: 0.4,
      },
    ],
  };

  const barChartData = {
    labels: ['Retail', 'Professional', 'Food & Bev', 'Beauty', 'Tech', 'Other'],
    datasets: [
      {
        label: 'Businesses by Category',
        data: [890, 654, 543, 432, 321, 581],
        backgroundColor: [
          'rgba(245, 158, 11, 0.8)',
          'rgba(59, 130, 246, 0.8)',
          'rgba(16, 185, 129, 0.8)',
          'rgba(236, 72, 153, 0.8)',
          'rgba(139, 92, 246, 0.8)',
          'rgba(107, 114, 128, 0.8)',
        ],
      },
    ],
  };

  const chartOptions = {
    responsive: true,
    maintainAspectRatio: false,
    plugins: {
      legend: {
        position: 'bottom' as const,
      },
    },
    scales: {
      y: {
        beginAtZero: true,
      },
    },
  };

  // Recent activity mock data
  const recentActivity = [
    { id: 1, type: 'business', action: 'New business registered', name: 'Doe Hardware', time: '5 min ago' },
    { id: 2, type: 'user', action: 'New user signed up', name: 'John Kamau', time: '12 min ago' },
    { id: 3, type: 'approval', action: 'Business pending approval', name: 'Fresh Produce Ltd', time: '25 min ago' },
    { id: 4, type: 'product', action: 'New product listed', name: 'iPhone 15 Pro', time: '1 hr ago' },
    { id: 5, type: 'business', action: 'Business approved', name: 'TechHub Kenya', time: '2 hr ago' },
  ];

  return (
    <div className="space-y-6">
      {/* Header */}
      <div>
        <h1 className="text-2xl font-bold text-gray-900">Dashboard</h1>
        <p className="text-gray-500">Welcome back! Here's what's happening today.</p>
      </div>

      {/* Stats Grid */}
      <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-6">
        <StatCard
          title="Total Users"
          value={stats.totalUsers.toLocaleString()}
          change={stats.usersChange}
          icon={UsersIcon}
          href="/users"
        />
        <StatCard
          title="Businesses"
          value={stats.totalBusinesses.toLocaleString()}
          change={stats.businessesChange}
          icon={BuildingStorefrontIcon}
          href="/businesses"
        />
        <StatCard
          title="Products"
          value={stats.totalProducts.toLocaleString()}
          change={stats.productsChange}
          icon={CubeIcon}
          href="/products"
        />
        <StatCard
          title="Pending Approvals"
          value={pendingCount?.count || stats.pendingApprovals}
          icon={ClockIcon}
          href="/businesses?status=pending"
          highlight
        />
      </div>

      {/* Charts */}
      <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
        <div className="card">
          <h3 className="text-lg font-semibold text-gray-900 mb-4">
            Growth Overview
          </h3>
          <div className="h-80">
            <Line data={lineChartData} options={chartOptions} />
          </div>
        </div>

        <div className="card">
          <h3 className="text-lg font-semibold text-gray-900 mb-4">
            Businesses by Category
          </h3>
          <div className="h-80">
            <Bar data={barChartData} options={chartOptions} />
          </div>
        </div>
      </div>

      {/* Recent Activity & Quick Actions */}
      <div className="grid grid-cols-1 lg:grid-cols-3 gap-6">
        {/* Recent Activity */}
        <div className="lg:col-span-2 card">
          <div className="flex items-center justify-between mb-4">
            <h3 className="text-lg font-semibold text-gray-900">Recent Activity</h3>
            <Link to="/reports" className="text-sm text-honey-600 hover:text-honey-700">
              View all
            </Link>
          </div>
          <div className="space-y-4">
            {recentActivity.map((activity) => (
              <div
                key={activity.id}
                className="flex items-center justify-between py-3 border-b border-gray-100 last:border-0"
              >
                <div className="flex items-center space-x-3">
                  <div className={`w-10 h-10 rounded-full flex items-center justify-center ${
                    activity.type === 'business' ? 'bg-blue-100 text-blue-600' :
                    activity.type === 'user' ? 'bg-green-100 text-green-600' :
                    activity.type === 'approval' ? 'bg-yellow-100 text-yellow-600' :
                    'bg-purple-100 text-purple-600'
                  }`}>
                    {activity.type === 'business' && <BuildingStorefrontIcon className="h-5 w-5" />}
                    {activity.type === 'user' && <UsersIcon className="h-5 w-5" />}
                    {activity.type === 'approval' && <ClockIcon className="h-5 w-5" />}
                    {activity.type === 'product' && <CubeIcon className="h-5 w-5" />}
                  </div>
                  <div>
                    <p className="text-sm font-medium text-gray-900">{activity.action}</p>
                    <p className="text-sm text-gray-500">{activity.name}</p>
                  </div>
                </div>
                <span className="text-xs text-gray-400">{activity.time}</span>
              </div>
            ))}
          </div>
        </div>

        {/* Quick Actions */}
        <div className="card">
          <h3 className="text-lg font-semibold text-gray-900 mb-4">Quick Actions</h3>
          <div className="space-y-3">
            <Link
              to="/businesses?status=pending"
              className="block w-full p-4 bg-yellow-50 rounded-lg hover:bg-yellow-100 transition-colors"
            >
              <div className="flex items-center justify-between">
                <div>
                  <p className="font-medium text-yellow-800">Review Pending</p>
                  <p className="text-sm text-yellow-600">{pendingCount?.count || 47} businesses waiting</p>
                </div>
                <ClockIcon className="h-8 w-8 text-yellow-500" />
              </div>
            </Link>

            <Link
              to="/categories"
              className="block w-full p-4 bg-blue-50 rounded-lg hover:bg-blue-100 transition-colors"
            >
              <div className="flex items-center justify-between">
                <div>
                  <p className="font-medium text-blue-800">Manage Categories</p>
                  <p className="text-sm text-blue-600">Add or edit categories</p>
                </div>
                <svg className="h-8 w-8 text-blue-500" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M7 7h.01M7 3h5c.512 0 1.024.195 1.414.586l7 7a2 2 0 010 2.828l-7 7a2 2 0 01-2.828 0l-7-7A1.994 1.994 0 013 12V7a4 4 0 014-4z" />
                </svg>
              </div>
            </Link>

            <Link
              to="/reports"
              className="block w-full p-4 bg-green-50 rounded-lg hover:bg-green-100 transition-colors"
            >
              <div className="flex items-center justify-between">
                <div>
                  <p className="font-medium text-green-800">Generate Report</p>
                  <p className="text-sm text-green-600">Export analytics data</p>
                </div>
                <ChartBarIcon className="h-8 w-8 text-green-500" />
              </div>
            </Link>
          </div>
        </div>
      </div>
    </div>
  );
}

// Stat Card Component
interface StatCardProps {
  title: string;
  value: string | number;
  change?: number;
  icon: React.ElementType;
  href: string;
  highlight?: boolean;
}

function StatCard({ title, value, change, icon: Icon, href, highlight }: StatCardProps) {
  return (
    <Link
      to={href}
      className={`card hover:shadow-md transition-shadow ${
        highlight ? 'border-yellow-300 bg-yellow-50' : ''
      }`}
    >
      <div className="flex items-start justify-between">
        <div>
          <p className="text-sm font-medium text-gray-500">{title}</p>
          <p className={`text-2xl font-bold mt-1 ${highlight ? 'text-yellow-700' : 'text-gray-900'}`}>
            {value}
          </p>
          {change !== undefined && (
            <div className={`flex items-center mt-2 text-sm ${
              change >= 0 ? 'text-green-600' : 'text-red-600'
            }`}>
              {change >= 0 ? (
                <ArrowTrendingUpIcon className="h-4 w-4 mr-1" />
              ) : (
                <ArrowTrendingDownIcon className="h-4 w-4 mr-1" />
              )}
              <span>{Math.abs(change)}% from last month</span>
            </div>
          )}
        </div>
        <div className={`p-3 rounded-lg ${highlight ? 'bg-yellow-200' : 'bg-gray-100'}`}>
          <Icon className={`h-6 w-6 ${highlight ? 'text-yellow-700' : 'text-gray-600'}`} />
        </div>
      </div>
    </Link>
  );
}
