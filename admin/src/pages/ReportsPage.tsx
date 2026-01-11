import { useState } from 'react';
import { useQuery } from '@tanstack/react-query';
import {
  Chart as ChartJS,
  CategoryScale,
  LinearScale,
  PointElement,
  LineElement,
  BarElement,
  ArcElement,
  Title,
  Tooltip,
  Legend,
} from 'chart.js';
import { Line, Bar, Doughnut } from 'react-chartjs-2';
import { reportsApi } from '../api/client';
import { format, subDays } from 'date-fns';
import { ArrowDownTrayIcon } from '@heroicons/react/24/outline';

ChartJS.register(
  CategoryScale,
  LinearScale,
  PointElement,
  LineElement,
  BarElement,
  ArcElement,
  Title,
  Tooltip,
  Legend
);

export default function ReportsPage() {
  const [dateRange, setDateRange] = useState({
    startDate: format(subDays(new Date(), 30), 'yyyy-MM-dd'),
    endDate: format(new Date(), 'yyyy-MM-dd'),
  });

  // Mock data for charts
  const userGrowthData = {
    labels: ['Week 1', 'Week 2', 'Week 3', 'Week 4'],
    datasets: [
      {
        label: 'New Users',
        data: [320, 450, 380, 520],
        borderColor: '#F59E0B',
        backgroundColor: 'rgba(245, 158, 11, 0.1)',
        fill: true,
      },
    ],
  };

  const businessGrowthData = {
    labels: ['Week 1', 'Week 2', 'Week 3', 'Week 4'],
    datasets: [
      {
        label: 'New Businesses',
        data: [45, 62, 58, 75],
        backgroundColor: '#3B82F6',
      },
    ],
  };

  const categoryDistribution = {
    labels: ['Retail', 'Professional', 'Food & Bev', 'Beauty', 'Tech'],
    datasets: [
      {
        data: [35, 25, 20, 12, 8],
        backgroundColor: [
          '#F59E0B',
          '#3B82F6',
          '#10B981',
          '#EC4899',
          '#8B5CF6',
        ],
      },
    ],
  };

  const handleExport = async (type: string) => {
    try {
      const blob = await reportsApi.exportCsv(type, dateRange.startDate, dateRange.endDate);
      const url = window.URL.createObjectURL(blob);
      const a = document.createElement('a');
      a.href = url;
      a.download = `${type}-report-${dateRange.startDate}-to-${dateRange.endDate}.csv`;
      a.click();
    } catch (error) {
      console.error('Export failed:', error);
    }
  };

  return (
    <div className="space-y-6">
      <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-4">
        <div>
          <h1 className="text-2xl font-bold text-gray-900">Reports</h1>
          <p className="text-gray-500">Analytics and insights</p>
        </div>

        <div className="flex items-center gap-4">
          <div className="flex items-center gap-2">
            <input
              type="date"
              value={dateRange.startDate}
              onChange={(e) => setDateRange({ ...dateRange, startDate: e.target.value })}
              className="input w-auto"
            />
            <span className="text-gray-500">to</span>
            <input
              type="date"
              value={dateRange.endDate}
              onChange={(e) => setDateRange({ ...dateRange, endDate: e.target.value })}
              className="input w-auto"
            />
          </div>
        </div>
      </div>

      {/* Summary Cards */}
      <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-6">
        <SummaryCard title="Total Users" value="12,847" change="+12.5%" />
        <SummaryCard title="Active Businesses" value="3,421" change="+8.3%" />
        <SummaryCard title="Total Products" value="28,493" change="+15.2%" />
        <SummaryCard title="Avg Products/Business" value="8.3" change="+2.1%" />
      </div>

      {/* Charts */}
      <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
        <div className="card">
          <div className="flex items-center justify-between mb-4">
            <h3 className="text-lg font-semibold">User Growth</h3>
            <button
              onClick={() => handleExport('users')}
              className="btn-secondary text-sm flex items-center gap-2"
            >
              <ArrowDownTrayIcon className="h-4 w-4" />
              Export
            </button>
          </div>
          <div className="h-64">
            <Line data={userGrowthData} options={{ maintainAspectRatio: false }} />
          </div>
        </div>

        <div className="card">
          <div className="flex items-center justify-between mb-4">
            <h3 className="text-lg font-semibold">Business Registrations</h3>
            <button
              onClick={() => handleExport('businesses')}
              className="btn-secondary text-sm flex items-center gap-2"
            >
              <ArrowDownTrayIcon className="h-4 w-4" />
              Export
            </button>
          </div>
          <div className="h-64">
            <Bar data={businessGrowthData} options={{ maintainAspectRatio: false }} />
          </div>
        </div>

        <div className="card">
          <h3 className="text-lg font-semibold mb-4">Business Categories</h3>
          <div className="h-64 flex justify-center">
            <Doughnut data={categoryDistribution} options={{ maintainAspectRatio: false }} />
          </div>
        </div>

        <div className="card">
          <h3 className="text-lg font-semibold mb-4">Top Performing Businesses</h3>
          <div className="space-y-4">
            {[
              { name: 'TechHub Electronics', products: 342, orders: 1250 },
              { name: 'Fresh Produce Ltd', products: 156, orders: 980 },
              { name: 'Urban Fashion', products: 278, orders: 856 },
              { name: 'Home Essentials', products: 189, orders: 720 },
              { name: 'Auto Parts Kenya', products: 445, orders: 650 },
            ].map((business, index) => (
              <div key={index} className="flex items-center justify-between py-2">
                <div className="flex items-center gap-3">
                  <span className="text-sm font-medium text-gray-500 w-6">
                    {index + 1}
                  </span>
                  <span className="font-medium">{business.name}</span>
                </div>
                <div className="text-right">
                  <p className="text-sm font-medium">{business.products} products</p>
                  <p className="text-xs text-gray-500">{business.orders} orders</p>
                </div>
              </div>
            ))}
          </div>
        </div>
      </div>
    </div>
  );
}

function SummaryCard({ title, value, change }: { title: string; value: string; change: string }) {
  const isPositive = change.startsWith('+');
  
  return (
    <div className="card">
      <p className="text-sm text-gray-500">{title}</p>
      <p className="text-2xl font-bold mt-1">{value}</p>
      <p className={`text-sm mt-2 ${isPositive ? 'text-green-600' : 'text-red-600'}`}>
        {change} from last period
      </p>
    </div>
  );
}
