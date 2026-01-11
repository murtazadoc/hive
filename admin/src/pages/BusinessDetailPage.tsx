import { useParams, Link, useNavigate } from 'react-router-dom';
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { businessesApi } from '../api/client';
import { ArrowLeftIcon, CheckCircleIcon, XCircleIcon } from '@heroicons/react/24/outline';
import { format } from 'date-fns';
import toast from 'react-hot-toast';

const statusColors: Record<string, string> = {
  draft: 'badge-gray',
  pending: 'badge-warning',
  approved: 'badge-success',
  rejected: 'badge-danger',
  suspended: 'badge-danger',
};

export default function BusinessDetailPage() {
  const { id } = useParams<{ id: string }>();
  const navigate = useNavigate();
  const queryClient = useQueryClient();

  const { data: business, isLoading } = useQuery({
    queryKey: ['business', id],
    queryFn: () => businessesApi.getById(id!),
    enabled: !!id,
  });

  const approveMutation = useMutation({
    mutationFn: () => businessesApi.approve(id!),
    onSuccess: () => {
      toast.success('Business approved');
      queryClient.invalidateQueries({ queryKey: ['business', id] });
    },
  });

  const rejectMutation = useMutation({
    mutationFn: (reason: string) => businessesApi.reject(id!, reason),
    onSuccess: () => {
      toast.success('Business rejected');
      queryClient.invalidateQueries({ queryKey: ['business', id] });
    },
  });

  if (isLoading) {
    return (
      <div className="flex items-center justify-center h-64">
        <div className="animate-spin h-8 w-8 border-2 border-honey-500 border-t-transparent rounded-full"></div>
      </div>
    );
  }

  if (!business) {
    return <div className="text-center py-12 text-gray-500">Business not found</div>;
  }

  const handleReject = () => {
    const reason = window.prompt('Rejection reason:');
    if (reason) {
      rejectMutation.mutate(reason);
    }
  };

  return (
    <div className="space-y-6">
      {/* Header */}
      <div className="flex items-center justify-between">
        <div className="flex items-center gap-4">
          <Link to="/businesses" className="p-2 hover:bg-gray-100 rounded-lg">
            <ArrowLeftIcon className="h-5 w-5" />
          </Link>
          <div className="flex items-center gap-4">
            {business.logoUrl ? (
              <img src={business.logoUrl} alt="" className="h-16 w-16 rounded-xl object-cover" />
            ) : (
              <div className="h-16 w-16 rounded-xl bg-honey-100 flex items-center justify-center">
                <span className="text-2xl font-bold text-honey-600">{business.businessName[0]}</span>
              </div>
            )}
            <div>
              <h1 className="text-2xl font-bold text-gray-900">{business.businessName}</h1>
              <p className="text-gray-500">/{business.slug}</p>
            </div>
          </div>
        </div>

        {business.status === 'pending' && (
          <div className="flex gap-2">
            <button onClick={() => approveMutation.mutate()} className="btn-primary flex items-center gap-2">
              <CheckCircleIcon className="h-5 w-5" />
              Approve
            </button>
            <button onClick={handleReject} className="btn-danger flex items-center gap-2">
              <XCircleIcon className="h-5 w-5" />
              Reject
            </button>
          </div>
        )}
      </div>

      {/* Status Banner */}
      {business.status === 'pending' && (
        <div className="bg-yellow-50 border border-yellow-200 rounded-lg p-4">
          <p className="text-yellow-800 font-medium">This business is pending approval</p>
        </div>
      )}

      {/* Content Grid */}
      <div className="grid grid-cols-1 lg:grid-cols-3 gap-6">
        {/* Main Info */}
        <div className="lg:col-span-2 space-y-6">
          <div className="card">
            <h2 className="text-lg font-semibold mb-4">Business Information</h2>
            <dl className="grid grid-cols-2 gap-4">
              <div>
                <dt className="text-sm text-gray-500">Status</dt>
                <dd className="mt-1"><span className={statusColors[business.status]}>{business.status}</span></dd>
              </div>
              <div>
                <dt className="text-sm text-gray-500">Type</dt>
                <dd className="mt-1 font-medium capitalize">{business.businessType}</dd>
              </div>
              <div>
                <dt className="text-sm text-gray-500">Category</dt>
                <dd className="mt-1 font-medium">{business.category?.name || '-'}</dd>
              </div>
              <div>
                <dt className="text-sm text-gray-500">Products</dt>
                <dd className="mt-1 font-medium">{business._count?.products || 0}</dd>
              </div>
              <div className="col-span-2">
                <dt className="text-sm text-gray-500">Description</dt>
                <dd className="mt-1 text-gray-700">{business.description || 'No description'}</dd>
              </div>
            </dl>
          </div>

          <div className="card">
            <h2 className="text-lg font-semibold mb-4">Contact Information</h2>
            <dl className="grid grid-cols-2 gap-4">
              <div>
                <dt className="text-sm text-gray-500">Phone</dt>
                <dd className="mt-1 font-medium">{business.phoneNumber || '-'}</dd>
              </div>
              <div>
                <dt className="text-sm text-gray-500">WhatsApp</dt>
                <dd className="mt-1 font-medium">{business.whatsappNumber || '-'}</dd>
              </div>
              <div>
                <dt className="text-sm text-gray-500">Email</dt>
                <dd className="mt-1 font-medium">{business.email || '-'}</dd>
              </div>
              <div>
                <dt className="text-sm text-gray-500">Location</dt>
                <dd className="mt-1 font-medium">{business.city}, {business.county}</dd>
              </div>
              <div className="col-span-2">
                <dt className="text-sm text-gray-500">Address</dt>
                <dd className="mt-1 font-medium">{business.address || '-'}</dd>
              </div>
            </dl>
          </div>
        </div>

        {/* Sidebar */}
        <div className="space-y-6">
          <div className="card">
            <h2 className="text-lg font-semibold mb-4">Owner</h2>
            <div className="flex items-center gap-3">
              <div className="h-12 w-12 rounded-full bg-gray-200 flex items-center justify-center">
                <span className="font-medium text-gray-600">
                  {business.owner?.firstName?.[0]}{business.owner?.lastName?.[0]}
                </span>
              </div>
              <div>
                <p className="font-medium">{business.owner?.firstName} {business.owner?.lastName}</p>
                <p className="text-sm text-gray-500">{business.owner?.phoneNumber}</p>
              </div>
            </div>
          </div>

          <div className="card">
            <h2 className="text-lg font-semibold mb-4">Timeline</h2>
            <dl className="space-y-3 text-sm">
              <div className="flex justify-between">
                <dt className="text-gray-500">Created</dt>
                <dd>{format(new Date(business.createdAt), 'MMM d, yyyy')}</dd>
              </div>
              <div className="flex justify-between">
                <dt className="text-gray-500">Updated</dt>
                <dd>{format(new Date(business.updatedAt), 'MMM d, yyyy')}</dd>
              </div>
            </dl>
          </div>
        </div>
      </div>
    </div>
  );
}
