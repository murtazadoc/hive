// UserDetailPage.tsx
import { useParams, Link } from 'react-router-dom';
import { useQuery } from '@tanstack/react-query';
import { usersApi } from '../api/client';
import { ArrowLeftIcon } from '@heroicons/react/24/outline';
import { format } from 'date-fns';

export default function UserDetailPage() {
  const { id } = useParams<{ id: string }>();

  const { data: user, isLoading } = useQuery({
    queryKey: ['user', id],
    queryFn: () => usersApi.getById(id!),
    enabled: !!id,
  });

  if (isLoading) {
    return (
      <div className="flex items-center justify-center h-64">
        <div className="animate-spin h-8 w-8 border-2 border-honey-500 border-t-transparent rounded-full"></div>
      </div>
    );
  }

  if (!user) {
    return <div className="text-center py-12 text-gray-500">User not found</div>;
  }

  return (
    <div className="space-y-6">
      <div className="flex items-center gap-4">
        <Link to="/users" className="p-2 hover:bg-gray-100 rounded-lg">
          <ArrowLeftIcon className="h-5 w-5" />
        </Link>
        <div>
          <h1 className="text-2xl font-bold text-gray-900">
            {user.firstName} {user.lastName}
          </h1>
          <p className="text-gray-500">{user.phoneNumber}</p>
        </div>
      </div>

      <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
        <div className="card">
          <h2 className="text-lg font-semibold mb-4">User Information</h2>
          <dl className="space-y-3">
            <div className="flex justify-between">
              <dt className="text-gray-500">Phone</dt>
              <dd className="font-medium">{user.phoneNumber}</dd>
            </div>
            <div className="flex justify-between">
              <dt className="text-gray-500">Email</dt>
              <dd className="font-medium">{user.email || '-'}</dd>
            </div>
            <div className="flex justify-between">
              <dt className="text-gray-500">Verified</dt>
              <dd>{user.isVerified ? <span className="badge-success">Yes</span> : <span className="badge-gray">No</span>}</dd>
            </div>
            <div className="flex justify-between">
              <dt className="text-gray-500">Status</dt>
              <dd>{user.isBanned ? <span className="badge-danger">Banned</span> : <span className="badge-success">Active</span>}</dd>
            </div>
            <div className="flex justify-between">
              <dt className="text-gray-500">Joined</dt>
              <dd className="font-medium">{format(new Date(user.createdAt), 'PPP')}</dd>
            </div>
          </dl>
        </div>

        <div className="card">
          <h2 className="text-lg font-semibold mb-4">Businesses</h2>
          <p className="text-gray-500">User owns {user._count?.businesses || 0} businesses</p>
        </div>
      </div>
    </div>
  );
}
