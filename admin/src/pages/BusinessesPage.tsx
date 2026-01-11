import { useState } from 'react';
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { Link, useSearchParams } from 'react-router-dom';
import { businessesApi, Business, BusinessFilters } from '../api/client';
import toast from 'react-hot-toast';
import clsx from 'clsx';
import {
  MagnifyingGlassIcon,
  FunnelIcon,
  CheckCircleIcon,
  XCircleIcon,
  EyeIcon,
  TrashIcon,
} from '@heroicons/react/24/outline';
import { format } from 'date-fns';

const statusColors: Record<string, string> = {
  draft: 'badge-gray',
  pending: 'badge-warning',
  approved: 'badge-success',
  rejected: 'badge-danger',
  suspended: 'badge-danger',
};

const statusLabels: Record<string, string> = {
  draft: 'Draft',
  pending: 'Pending',
  approved: 'Approved',
  rejected: 'Rejected',
  suspended: 'Suspended',
};

export default function BusinessesPage() {
  const queryClient = useQueryClient();
  const [searchParams, setSearchParams] = useSearchParams();
  
  const [filters, setFilters] = useState<BusinessFilters>({
    search: searchParams.get('search') || '',
    status: searchParams.get('status') || '',
    page: parseInt(searchParams.get('page') || '1'),
    limit: 20,
  });

  // Fetch businesses
  const { data, isLoading, error } = useQuery({
    queryKey: ['businesses', filters],
    queryFn: () => businessesApi.list(filters),
  });

  // Mutations
  const approveMutation = useMutation({
    mutationFn: (id: string) => businessesApi.approve(id),
    onSuccess: () => {
      toast.success('Business approved');
      queryClient.invalidateQueries({ queryKey: ['businesses'] });
    },
    onError: () => toast.error('Failed to approve'),
  });

  const rejectMutation = useMutation({
    mutationFn: ({ id, reason }: { id: string; reason: string }) =>
      businessesApi.reject(id, reason),
    onSuccess: () => {
      toast.success('Business rejected');
      queryClient.invalidateQueries({ queryKey: ['businesses'] });
    },
    onError: () => toast.error('Failed to reject'),
  });

  const suspendMutation = useMutation({
    mutationFn: ({ id, reason }: { id: string; reason: string }) =>
      businessesApi.suspend(id, reason),
    onSuccess: () => {
      toast.success('Business suspended');
      queryClient.invalidateQueries({ queryKey: ['businesses'] });
    },
    onError: () => toast.error('Failed to suspend'),
  });

  // Handlers
  const handleSearch = (e: React.FormEvent<HTMLFormElement>) => {
    e.preventDefault();
    const formData = new FormData(e.currentTarget);
    const search = formData.get('search') as string;
    setFilters({ ...filters, search, page: 1 });
    setSearchParams({ ...Object.fromEntries(searchParams), search });
  };

  const handleStatusFilter = (status: string) => {
    setFilters({ ...filters, status, page: 1 });
    if (status) {
      setSearchParams({ ...Object.fromEntries(searchParams), status });
    } else {
      searchParams.delete('status');
      setSearchParams(searchParams);
    }
  };

  const handleApprove = (id: string) => {
    if (window.confirm('Approve this business?')) {
      approveMutation.mutate(id);
    }
  };

  const handleReject = (id: string) => {
    const reason = window.prompt('Rejection reason:');
    if (reason) {
      rejectMutation.mutate({ id, reason });
    }
  };

  const handleSuspend = (id: string) => {
    const reason = window.prompt('Suspension reason:');
    if (reason) {
      suspendMutation.mutate({ id, reason });
    }
  };

  return (
    <div className="space-y-6">
      {/* Header */}
      <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-4">
        <div>
          <h1 className="text-2xl font-bold text-gray-900">Businesses</h1>
          <p className="text-gray-500">Manage and approve business profiles</p>
        </div>
      </div>

      {/* Filters */}
      <div className="card">
        <div className="flex flex-col md:flex-row md:items-center gap-4">
          {/* Search */}
          <form onSubmit={handleSearch} className="flex-1">
            <div className="relative">
              <MagnifyingGlassIcon className="absolute left-3 top-1/2 -translate-y-1/2 h-5 w-5 text-gray-400" />
              <input
                type="text"
                name="search"
                defaultValue={filters.search}
                placeholder="Search businesses..."
                className="input pl-10"
              />
            </div>
          </form>

          {/* Status Filter */}
          <div className="flex items-center gap-2">
            <FunnelIcon className="h-5 w-5 text-gray-400" />
            <select
              value={filters.status}
              onChange={(e) => handleStatusFilter(e.target.value)}
              className="input w-auto"
            >
              <option value="">All Statuses</option>
              <option value="pending">Pending</option>
              <option value="approved">Approved</option>
              <option value="rejected">Rejected</option>
              <option value="suspended">Suspended</option>
              <option value="draft">Draft</option>
            </select>
          </div>
        </div>
      </div>

      {/* Status Tabs */}
      <div className="flex gap-2 overflow-x-auto pb-2">
        {['', 'pending', 'approved', 'rejected', 'suspended'].map((status) => (
          <button
            key={status}
            onClick={() => handleStatusFilter(status)}
            className={clsx(
              'px-4 py-2 rounded-lg text-sm font-medium whitespace-nowrap transition-colors',
              filters.status === status
                ? 'bg-honey-500 text-white'
                : 'bg-gray-100 text-gray-600 hover:bg-gray-200'
            )}
          >
            {status ? statusLabels[status] : 'All'}
            {status === 'pending' && data?.pendingCount ? (
              <span className="ml-2 bg-white/20 px-2 py-0.5 rounded-full text-xs">
                {data.pendingCount}
              </span>
            ) : null}
          </button>
        ))}
      </div>

      {/* Table */}
      <div className="card overflow-hidden p-0">
        {isLoading ? (
          <div className="p-12 text-center">
            <div className="animate-spin h-8 w-8 border-2 border-honey-500 border-t-transparent rounded-full mx-auto"></div>
          </div>
        ) : error ? (
          <div className="p-12 text-center text-red-500">Failed to load businesses</div>
        ) : (
          <div className="overflow-x-auto">
            <table className="min-w-full divide-y divide-gray-200">
              <thead className="bg-gray-50">
                <tr>
                  <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">
                    Business
                  </th>
                  <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">
                    Owner
                  </th>
                  <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">
                    Category
                  </th>
                  <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">
                    Status
                  </th>
                  <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">
                    Products
                  </th>
                  <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">
                    Created
                  </th>
                  <th className="px-6 py-3 text-right text-xs font-medium text-gray-500 uppercase tracking-wider">
                    Actions
                  </th>
                </tr>
              </thead>
              <tbody className="bg-white divide-y divide-gray-200">
                {data?.data?.map((business: Business) => (
                  <tr key={business.id} className="hover:bg-gray-50">
                    <td className="px-6 py-4 whitespace-nowrap">
                      <div className="flex items-center">
                        {business.logoUrl ? (
                          <img
                            src={business.logoUrl}
                            alt=""
                            className="h-10 w-10 rounded-lg object-cover"
                          />
                        ) : (
                          <div className="h-10 w-10 rounded-lg bg-honey-100 flex items-center justify-center">
                            <span className="text-honey-600 font-medium">
                              {business.businessName[0]}
                            </span>
                          </div>
                        )}
                        <div className="ml-3">
                          <p className="text-sm font-medium text-gray-900">
                            {business.businessName}
                          </p>
                          <p className="text-sm text-gray-500">/{business.slug}</p>
                        </div>
                      </div>
                    </td>
                    <td className="px-6 py-4 whitespace-nowrap">
                      <p className="text-sm text-gray-900">
                        {business.owner?.firstName} {business.owner?.lastName}
                      </p>
                      <p className="text-sm text-gray-500">{business.phoneNumber}</p>
                    </td>
                    <td className="px-6 py-4 whitespace-nowrap">
                      <span className="text-sm text-gray-500">
                        {business.category?.name || '-'}
                      </span>
                    </td>
                    <td className="px-6 py-4 whitespace-nowrap">
                      <span className={statusColors[business.status]}>
                        {statusLabels[business.status]}
                      </span>
                    </td>
                    <td className="px-6 py-4 whitespace-nowrap text-sm text-gray-500">
                      {business._count?.products || 0}
                    </td>
                    <td className="px-6 py-4 whitespace-nowrap text-sm text-gray-500">
                      {format(new Date(business.createdAt), 'MMM d, yyyy')}
                    </td>
                    <td className="px-6 py-4 whitespace-nowrap text-right text-sm">
                      <div className="flex items-center justify-end gap-2">
                        <Link
                          to={`/businesses/${business.id}`}
                          className="p-2 text-gray-400 hover:text-gray-600"
                          title="View"
                        >
                          <EyeIcon className="h-5 w-5" />
                        </Link>
                        
                        {business.status === 'pending' && (
                          <>
                            <button
                              onClick={() => handleApprove(business.id)}
                              className="p-2 text-green-500 hover:text-green-700"
                              title="Approve"
                            >
                              <CheckCircleIcon className="h-5 w-5" />
                            </button>
                            <button
                              onClick={() => handleReject(business.id)}
                              className="p-2 text-red-500 hover:text-red-700"
                              title="Reject"
                            >
                              <XCircleIcon className="h-5 w-5" />
                            </button>
                          </>
                        )}
                        
                        {business.status === 'approved' && (
                          <button
                            onClick={() => handleSuspend(business.id)}
                            className="p-2 text-yellow-500 hover:text-yellow-700"
                            title="Suspend"
                          >
                            <XCircleIcon className="h-5 w-5" />
                          </button>
                        )}
                      </div>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}

        {/* Pagination */}
        {data?.pagination && (
          <div className="px-6 py-4 border-t border-gray-200 flex items-center justify-between">
            <p className="text-sm text-gray-500">
              Showing {((filters.page || 1) - 1) * (filters.limit || 20) + 1} to{' '}
              {Math.min((filters.page || 1) * (filters.limit || 20), data.pagination.total)} of{' '}
              {data.pagination.total} results
            </p>
            <div className="flex gap-2">
              <button
                onClick={() => setFilters({ ...filters, page: (filters.page || 1) - 1 })}
                disabled={filters.page === 1}
                className="btn-secondary disabled:opacity-50"
              >
                Previous
              </button>
              <button
                onClick={() => setFilters({ ...filters, page: (filters.page || 1) + 1 })}
                disabled={(filters.page || 1) >= data.pagination.totalPages}
                className="btn-secondary disabled:opacity-50"
              >
                Next
              </button>
            </div>
          </div>
        )}
      </div>
    </div>
  );
}
