import { useState } from 'react';
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import toast from 'react-hot-toast';
import clsx from 'clsx';
import {
  CheckCircleIcon,
  XCircleIcon,
  ExclamationTriangleIcon,
  EyeIcon,
  FunnelIcon,
  ArrowPathIcon,
} from '@heroicons/react/24/outline';
import { format } from 'date-fns';
import api from '../api/client';

// =====================================================
// TYPES
// =====================================================
interface ModerationItem {
  id: string;
  contentType: string;
  contentId: string;
  status: string;
  priority: number;
  autoFlags: Record<string, number>;
  detectionLabels: string[];
  confidenceScore: number;
  detectionSource: string;
  reportReason?: string;
  createdAt: string;
  content?: any;
  business?: { id: string; businessName: string };
}

interface ModerationStats {
  total: number;
  pending: number;
  high_priority: number;
  approved: number;
  rejected: number;
}

// =====================================================
// API
// =====================================================
const moderationApi = {
  getQueue: async (filters: any) => {
    const response = await api.get('/admin/moderation/queue', { params: filters });
    return response.data;
  },
  getStats: async () => {
    const response = await api.get('/admin/moderation/queue/stats');
    return response.data;
  },
  takeAction: async (id: string, action: any) => {
    const response = await api.post(`/admin/moderation/queue/${id}/action`, action);
    return response.data;
  },
  bulkApprove: async (ids: string[]) => {
    const response = await api.post('/admin/moderation/queue/bulk-approve', { ids });
    return response.data;
  },
};

// =====================================================
// MODERATION PAGE
// =====================================================
export default function ModerationPage() {
  const queryClient = useQueryClient();
  const [filters, setFilters] = useState({
    status: 'pending',
    contentType: '',
    priority: '',
    page: 1,
  });
  const [selectedItems, setSelectedItems] = useState<string[]>([]);
  const [detailItem, setDetailItem] = useState<ModerationItem | null>(null);

  // Fetch queue
  const { data, isLoading, refetch } = useQuery({
    queryKey: ['moderation-queue', filters],
    queryFn: () => moderationApi.getQueue(filters),
    refetchInterval: 30000, // Auto-refresh every 30s
  });

  // Fetch stats
  const { data: stats } = useQuery({
    queryKey: ['moderation-stats'],
    queryFn: () => moderationApi.getStats(),
    refetchInterval: 30000,
  });

  // Action mutation
  const actionMutation = useMutation({
    mutationFn: ({ id, action }: { id: string; action: any }) =>
      moderationApi.takeAction(id, action),
    onSuccess: () => {
      toast.success('Action completed');
      queryClient.invalidateQueries({ queryKey: ['moderation-queue'] });
      queryClient.invalidateQueries({ queryKey: ['moderation-stats'] });
      setDetailItem(null);
    },
    onError: () => toast.error('Action failed'),
  });

  // Bulk approve mutation
  const bulkApproveMutation = useMutation({
    mutationFn: (ids: string[]) => moderationApi.bulkApprove(ids),
    onSuccess: (data) => {
      toast.success(`Approved ${data.approved} items`);
      queryClient.invalidateQueries({ queryKey: ['moderation-queue'] });
      setSelectedItems([]);
    },
  });

  const handleAction = (id: string, action: string, notes?: string) => {
    actionMutation.mutate({ id, action: { action, notes } });
  };

  const handleBulkApprove = () => {
    if (selectedItems.length === 0) return;
    if (window.confirm(`Approve ${selectedItems.length} items?`)) {
      bulkApproveMutation.mutate(selectedItems);
    }
  };

  const toggleSelect = (id: string) => {
    setSelectedItems((prev) =>
      prev.includes(id) ? prev.filter((i) => i !== id) : [...prev, id]
    );
  };

  const selectAll = () => {
    if (selectedItems.length === data?.items?.length) {
      setSelectedItems([]);
    } else {
      setSelectedItems(data?.items?.map((i: ModerationItem) => i.id) || []);
    }
  };

  return (
    <div className="space-y-6">
      {/* Header */}
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-2xl font-bold text-gray-900">Content Moderation</h1>
          <p className="text-gray-500">Review and moderate flagged content</p>
        </div>
        <button onClick={() => refetch()} className="btn-secondary flex items-center gap-2">
          <ArrowPathIcon className="h-4 w-4" />
          Refresh
        </button>
      </div>

      {/* Stats */}
      {stats && (
        <div className="grid grid-cols-2 md:grid-cols-5 gap-4">
          <StatCard label="Pending" value={stats.pending} highlight />
          <StatCard label="High Priority" value={stats.high_priority} color="red" />
          <StatCard label="In Review" value={stats.in_review || 0} />
          <StatCard label="Approved Today" value={stats.approved} color="green" />
          <StatCard label="Rejected Today" value={stats.rejected} color="yellow" />
        </div>
      )}

      {/* Filters */}
      <div className="card">
        <div className="flex flex-wrap gap-4 items-center">
          <div className="flex items-center gap-2">
            <FunnelIcon className="h-5 w-5 text-gray-400" />
            <span className="text-sm font-medium text-gray-700">Filters:</span>
          </div>

          <select
            value={filters.status}
            onChange={(e) => setFilters({ ...filters, status: e.target.value, page: 1 })}
            className="input w-auto"
          >
            <option value="">All Status</option>
            <option value="pending">Pending</option>
            <option value="in_review">In Review</option>
            <option value="escalated">Escalated</option>
          </select>

          <select
            value={filters.contentType}
            onChange={(e) => setFilters({ ...filters, contentType: e.target.value, page: 1 })}
            className="input w-auto"
          >
            <option value="">All Types</option>
            <option value="product">Products</option>
            <option value="reel">Reels</option>
            <option value="business">Businesses</option>
            <option value="comment">Comments</option>
          </select>

          <select
            value={filters.priority}
            onChange={(e) => setFilters({ ...filters, priority: e.target.value, page: 1 })}
            className="input w-auto"
          >
            <option value="">All Priority</option>
            <option value="high">High (70+)</option>
            <option value="medium">Medium (40-69)</option>
            <option value="low">Low (&lt;40)</option>
          </select>

          {selectedItems.length > 0 && (
            <button onClick={handleBulkApprove} className="btn-primary ml-auto">
              Approve Selected ({selectedItems.length})
            </button>
          )}
        </div>
      </div>

      {/* Queue Table */}
      <div className="card p-0 overflow-hidden">
        {isLoading ? (
          <div className="p-12 text-center">
            <div className="animate-spin h-8 w-8 border-2 border-honey-500 border-t-transparent rounded-full mx-auto"></div>
          </div>
        ) : data?.items?.length === 0 ? (
          <div className="p-12 text-center text-gray-500">
            <CheckCircleIcon className="h-12 w-12 mx-auto mb-4 text-green-500" />
            <p className="text-lg font-medium">All caught up!</p>
            <p>No items pending moderation</p>
          </div>
        ) : (
          <div className="overflow-x-auto">
            <table className="min-w-full divide-y divide-gray-200">
              <thead className="bg-gray-50">
                <tr>
                  <th className="px-4 py-3 text-left">
                    <input
                      type="checkbox"
                      checked={selectedItems.length === data?.items?.length}
                      onChange={selectAll}
                      className="rounded"
                    />
                  </th>
                  <th className="px-4 py-3 text-left text-xs font-medium text-gray-500 uppercase">
                    Content
                  </th>
                  <th className="px-4 py-3 text-left text-xs font-medium text-gray-500 uppercase">
                    Business
                  </th>
                  <th className="px-4 py-3 text-left text-xs font-medium text-gray-500 uppercase">
                    Flags
                  </th>
                  <th className="px-4 py-3 text-left text-xs font-medium text-gray-500 uppercase">
                    Priority
                  </th>
                  <th className="px-4 py-3 text-left text-xs font-medium text-gray-500 uppercase">
                    Source
                  </th>
                  <th className="px-4 py-3 text-left text-xs font-medium text-gray-500 uppercase">
                    Time
                  </th>
                  <th className="px-4 py-3 text-right text-xs font-medium text-gray-500 uppercase">
                    Actions
                  </th>
                </tr>
              </thead>
              <tbody className="divide-y divide-gray-200">
                {data?.items?.map((item: ModerationItem) => (
                  <tr
                    key={item.id}
                    className={clsx(
                      'hover:bg-gray-50',
                      item.priority >= 70 && 'bg-red-50'
                    )}
                  >
                    <td className="px-4 py-3">
                      <input
                        type="checkbox"
                        checked={selectedItems.includes(item.id)}
                        onChange={() => toggleSelect(item.id)}
                        className="rounded"
                      />
                    </td>
                    <td className="px-4 py-3">
                      <div className="flex items-center gap-3">
                        {item.content?.images?.[0]?.url && (
                          <img
                            src={item.content.images[0].url}
                            alt=""
                            className="h-12 w-12 rounded-lg object-cover"
                          />
                        )}
                        <div>
                          <p className="font-medium text-gray-900">
                            {item.content?.name || item.content?.caption?.slice(0, 50) || item.contentId.slice(0, 8)}
                          </p>
                          <p className="text-sm text-gray-500 capitalize">{item.contentType}</p>
                        </div>
                      </div>
                    </td>
                    <td className="px-4 py-3 text-sm text-gray-500">
                      {item.business?.businessName || '-'}
                    </td>
                    <td className="px-4 py-3">
                      <div className="flex flex-wrap gap-1">
                        {item.detectionLabels.slice(0, 3).map((label) => (
                          <span
                            key={label}
                            className={clsx(
                              'badge',
                              label.includes('alcohol') && 'badge-warning',
                              label.includes('nsfw') && 'badge-danger',
                              label.includes('spam') && 'badge-info',
                              !label.includes('alcohol') && !label.includes('nsfw') && !label.includes('spam') && 'badge-gray'
                            )}
                          >
                            {label}
                          </span>
                        ))}
                        {item.detectionLabels.length > 3 && (
                          <span className="badge badge-gray">+{item.detectionLabels.length - 3}</span>
                        )}
                      </div>
                    </td>
                    <td className="px-4 py-3">
                      <span
                        className={clsx(
                          'badge',
                          item.priority >= 70 && 'badge-danger',
                          item.priority >= 40 && item.priority < 70 && 'badge-warning',
                          item.priority < 40 && 'badge-gray'
                        )}
                      >
                        {item.priority}
                      </span>
                    </td>
                    <td className="px-4 py-3 text-sm text-gray-500 capitalize">
                      {item.detectionSource.replace('_', ' ')}
                    </td>
                    <td className="px-4 py-3 text-sm text-gray-500">
                      {format(new Date(item.createdAt), 'MMM d, HH:mm')}
                    </td>
                    <td className="px-4 py-3">
                      <div className="flex items-center justify-end gap-2">
                        <button
                          onClick={() => setDetailItem(item)}
                          className="p-2 text-gray-400 hover:text-gray-600"
                          title="View Details"
                        >
                          <EyeIcon className="h-5 w-5" />
                        </button>
                        <button
                          onClick={() => handleAction(item.id, 'approve')}
                          className="p-2 text-green-500 hover:text-green-700"
                          title="Approve"
                        >
                          <CheckCircleIcon className="h-5 w-5" />
                        </button>
                        <button
                          onClick={() => {
                            const notes = window.prompt('Rejection reason:');
                            if (notes) handleAction(item.id, 'reject', notes);
                          }}
                          className="p-2 text-red-500 hover:text-red-700"
                          title="Reject"
                        >
                          <XCircleIcon className="h-5 w-5" />
                        </button>
                        <button
                          onClick={() => {
                            const notes = window.prompt('Warning message:');
                            if (notes) handleAction(item.id, 'warn', notes);
                          }}
                          className="p-2 text-yellow-500 hover:text-yellow-700"
                          title="Warn"
                        >
                          <ExclamationTriangleIcon className="h-5 w-5" />
                        </button>
                      </div>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}

        {/* Pagination */}
        {data?.total > 20 && (
          <div className="px-6 py-4 border-t border-gray-200 flex items-center justify-between">
            <p className="text-sm text-gray-500">
              Showing {(filters.page - 1) * 20 + 1} to {Math.min(filters.page * 20, data.total)} of {data.total}
            </p>
            <div className="flex gap-2">
              <button
                onClick={() => setFilters({ ...filters, page: filters.page - 1 })}
                disabled={filters.page === 1}
                className="btn-secondary disabled:opacity-50"
              >
                Previous
              </button>
              <button
                onClick={() => setFilters({ ...filters, page: filters.page + 1 })}
                disabled={filters.page * 20 >= data.total}
                className="btn-secondary disabled:opacity-50"
              >
                Next
              </button>
            </div>
          </div>
        )}
      </div>

      {/* Detail Modal */}
      {detailItem && (
        <DetailModal
          item={detailItem}
          onClose={() => setDetailItem(null)}
          onAction={(action, notes) => handleAction(detailItem.id, action, notes)}
        />
      )}
    </div>
  );
}

// =====================================================
// STAT CARD
// =====================================================
function StatCard({
  label,
  value,
  color,
  highlight,
}: {
  label: string;
  value: number;
  color?: 'red' | 'green' | 'yellow';
  highlight?: boolean;
}) {
  return (
    <div
      className={clsx(
        'card text-center',
        highlight && 'border-honey-300 bg-honey-50'
      )}
    >
      <p className="text-sm text-gray-500">{label}</p>
      <p
        className={clsx(
          'text-2xl font-bold mt-1',
          color === 'red' && 'text-red-600',
          color === 'green' && 'text-green-600',
          color === 'yellow' && 'text-yellow-600',
          !color && 'text-gray-900'
        )}
      >
        {value}
      </p>
    </div>
  );
}

// =====================================================
// DETAIL MODAL
// =====================================================
function DetailModal({
  item,
  onClose,
  onAction,
}: {
  item: ModerationItem;
  onClose: () => void;
  onAction: (action: string, notes?: string) => void;
}) {
  const [notes, setNotes] = useState('');

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/50 p-4">
      <div className="bg-white rounded-xl shadow-xl w-full max-w-2xl max-h-[90vh] overflow-y-auto">
        {/* Header */}
        <div className="p-6 border-b border-gray-200">
          <div className="flex items-center justify-between">
            <h2 className="text-lg font-semibold">Review Content</h2>
            <button onClick={onClose} className="text-gray-400 hover:text-gray-600">
              <XCircleIcon className="h-6 w-6" />
            </button>
          </div>
        </div>

        {/* Content */}
        <div className="p-6 space-y-6">
          {/* Content Preview */}
          <div>
            <h3 className="text-sm font-medium text-gray-500 mb-2">Content Preview</h3>
            {item.contentType === 'product' && item.content && (
              <div className="flex gap-4">
                {item.content.images?.[0] && (
                  <img
                    src={item.content.images[0].url}
                    alt=""
                    className="h-32 w-32 rounded-lg object-cover"
                  />
                )}
                <div>
                  <p className="font-medium text-gray-900">{item.content.name}</p>
                  <p className="text-sm text-gray-500 mt-1">{item.content.description?.slice(0, 200)}</p>
                  {item.content.price && (
                    <p className="text-sm font-medium mt-2">KES {item.content.price.toLocaleString()}</p>
                  )}
                </div>
              </div>
            )}
            {item.contentType === 'reel' && item.content && (
              <div>
                {item.content.thumbnailUrl && (
                  <img
                    src={item.content.thumbnailUrl}
                    alt=""
                    className="h-48 rounded-lg object-cover"
                  />
                )}
                <p className="mt-2 text-gray-700">{item.content.caption}</p>
              </div>
            )}
          </div>

          {/* Detection Info */}
          <div>
            <h3 className="text-sm font-medium text-gray-500 mb-2">Detection Results</h3>
            <div className="bg-gray-50 rounded-lg p-4">
              <div className="flex flex-wrap gap-2 mb-3">
                {item.detectionLabels.map((label) => (
                  <span key={label} className="badge badge-warning">{label}</span>
                ))}
              </div>
              <dl className="grid grid-cols-2 gap-2 text-sm">
                <div>
                  <dt className="text-gray-500">Confidence</dt>
                  <dd className="font-medium">{(item.confidenceScore * 100).toFixed(1)}%</dd>
                </div>
                <div>
                  <dt className="text-gray-500">Priority</dt>
                  <dd className="font-medium">{item.priority}</dd>
                </div>
                <div>
                  <dt className="text-gray-500">Source</dt>
                  <dd className="font-medium capitalize">{item.detectionSource.replace('_', ' ')}</dd>
                </div>
                {item.reportReason && (
                  <div className="col-span-2">
                    <dt className="text-gray-500">Report Reason</dt>
                    <dd className="font-medium">{item.reportReason}</dd>
                  </div>
                )}
              </dl>
            </div>
          </div>

          {/* Scores */}
          {Object.keys(item.autoFlags).length > 0 && (
            <div>
              <h3 className="text-sm font-medium text-gray-500 mb-2">Detection Scores</h3>
              <div className="space-y-2">
                {Object.entries(item.autoFlags).map(([key, value]) => (
                  <div key={key} className="flex items-center gap-3">
                    <span className="text-sm text-gray-600 w-24 capitalize">{key}</span>
                    <div className="flex-1 bg-gray-200 rounded-full h-2">
                      <div
                        className={clsx(
                          'h-2 rounded-full',
                          value > 0.7 ? 'bg-red-500' : value > 0.4 ? 'bg-yellow-500' : 'bg-green-500'
                        )}
                        style={{ width: `${value * 100}%` }}
                      />
                    </div>
                    <span className="text-sm font-medium w-12">{(value * 100).toFixed(0)}%</span>
                  </div>
                ))}
              </div>
            </div>
          )}

          {/* Notes */}
          <div>
            <label className="text-sm font-medium text-gray-500 mb-2 block">
              Moderation Notes
            </label>
            <textarea
              value={notes}
              onChange={(e) => setNotes(e.target.value)}
              className="input"
              rows={3}
              placeholder="Add notes about this decision..."
            />
          </div>
        </div>

        {/* Actions */}
        <div className="p-6 border-t border-gray-200 flex justify-end gap-3">
          <button onClick={onClose} className="btn-secondary">
            Cancel
          </button>
          <button
            onClick={() => {
              onAction('warn', notes);
              onClose();
            }}
            className="bg-yellow-500 text-white px-4 py-2 rounded-lg font-medium hover:bg-yellow-600"
          >
            Warn Business
          </button>
          <button
            onClick={() => {
              onAction('reject', notes);
              onClose();
            }}
            className="btn-danger"
          >
            Reject
          </button>
          <button
            onClick={() => {
              onAction('approve', notes);
              onClose();
            }}
            className="btn-primary"
          >
            Approve
          </button>
        </div>
      </div>
    </div>
  );
}
