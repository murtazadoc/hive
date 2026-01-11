import { useState } from 'react';
import { useForm } from 'react-hook-form';
import toast from 'react-hot-toast';
import { useAuthStore } from '../store/authStore';

interface ProfileForm {
  firstName: string;
  lastName: string;
  email: string;
}

interface PasswordForm {
  currentPassword: string;
  newPassword: string;
  confirmPassword: string;
}

export default function SettingsPage() {
  const { user } = useAuthStore();
  const [activeTab, setActiveTab] = useState('profile');

  const profileForm = useForm<ProfileForm>({
    defaultValues: {
      firstName: user?.firstName || '',
      lastName: user?.lastName || '',
      email: user?.email || '',
    },
  });

  const passwordForm = useForm<PasswordForm>();

  const handleProfileSubmit = (data: ProfileForm) => {
    // API call would go here
    toast.success('Profile updated');
  };

  const handlePasswordSubmit = (data: PasswordForm) => {
    if (data.newPassword !== data.confirmPassword) {
      toast.error('Passwords do not match');
      return;
    }
    // API call would go here
    toast.success('Password changed');
    passwordForm.reset();
  };

  return (
    <div className="space-y-6">
      <div>
        <h1 className="text-2xl font-bold text-gray-900">Settings</h1>
        <p className="text-gray-500">Manage your account settings</p>
      </div>

      {/* Tabs */}
      <div className="border-b border-gray-200">
        <nav className="flex gap-8">
          {['profile', 'security', 'notifications', 'system'].map((tab) => (
            <button
              key={tab}
              onClick={() => setActiveTab(tab)}
              className={`py-4 px-1 text-sm font-medium border-b-2 -mb-px transition-colors ${
                activeTab === tab
                  ? 'border-honey-500 text-honey-600'
                  : 'border-transparent text-gray-500 hover:text-gray-700'
              }`}
            >
              {tab.charAt(0).toUpperCase() + tab.slice(1)}
            </button>
          ))}
        </nav>
      </div>

      {/* Profile Tab */}
      {activeTab === 'profile' && (
        <div className="card max-w-2xl">
          <h2 className="text-lg font-semibold mb-6">Profile Information</h2>
          <form onSubmit={profileForm.handleSubmit(handleProfileSubmit)} className="space-y-6">
            <div className="grid grid-cols-2 gap-4">
              <div>
                <label className="block text-sm font-medium text-gray-700 mb-1">
                  First Name
                </label>
                <input
                  {...profileForm.register('firstName')}
                  className="input"
                />
              </div>
              <div>
                <label className="block text-sm font-medium text-gray-700 mb-1">
                  Last Name
                </label>
                <input
                  {...profileForm.register('lastName')}
                  className="input"
                />
              </div>
            </div>

            <div>
              <label className="block text-sm font-medium text-gray-700 mb-1">
                Email Address
              </label>
              <input
                {...profileForm.register('email')}
                type="email"
                className="input"
              />
            </div>

            <div className="flex justify-end">
              <button type="submit" className="btn-primary">
                Save Changes
              </button>
            </div>
          </form>
        </div>
      )}

      {/* Security Tab */}
      {activeTab === 'security' && (
        <div className="card max-w-2xl">
          <h2 className="text-lg font-semibold mb-6">Change Password</h2>
          <form onSubmit={passwordForm.handleSubmit(handlePasswordSubmit)} className="space-y-6">
            <div>
              <label className="block text-sm font-medium text-gray-700 mb-1">
                Current Password
              </label>
              <input
                {...passwordForm.register('currentPassword', { required: true })}
                type="password"
                className="input"
              />
            </div>

            <div>
              <label className="block text-sm font-medium text-gray-700 mb-1">
                New Password
              </label>
              <input
                {...passwordForm.register('newPassword', { required: true, minLength: 8 })}
                type="password"
                className="input"
              />
              <p className="text-sm text-gray-500 mt-1">Minimum 8 characters</p>
            </div>

            <div>
              <label className="block text-sm font-medium text-gray-700 mb-1">
                Confirm New Password
              </label>
              <input
                {...passwordForm.register('confirmPassword', { required: true })}
                type="password"
                className="input"
              />
            </div>

            <div className="flex justify-end">
              <button type="submit" className="btn-primary">
                Update Password
              </button>
            </div>
          </form>
        </div>
      )}

      {/* Notifications Tab */}
      {activeTab === 'notifications' && (
        <div className="card max-w-2xl">
          <h2 className="text-lg font-semibold mb-6">Notification Preferences</h2>
          <div className="space-y-4">
            {[
              { id: 'email_new_business', label: 'New business registrations', description: 'Get notified when a new business registers' },
              { id: 'email_pending', label: 'Pending approvals', description: 'Daily digest of businesses awaiting approval' },
              { id: 'email_reports', label: 'Weekly reports', description: 'Receive weekly analytics summary' },
              { id: 'email_alerts', label: 'System alerts', description: 'Important system notifications' },
            ].map((item) => (
              <div key={item.id} className="flex items-center justify-between py-3 border-b border-gray-100 last:border-0">
                <div>
                  <p className="font-medium text-gray-900">{item.label}</p>
                  <p className="text-sm text-gray-500">{item.description}</p>
                </div>
                <label className="relative inline-flex items-center cursor-pointer">
                  <input type="checkbox" defaultChecked className="sr-only peer" />
                  <div className="w-11 h-6 bg-gray-200 peer-focus:outline-none peer-focus:ring-4 peer-focus:ring-honey-100 rounded-full peer peer-checked:after:translate-x-full peer-checked:after:border-white after:content-[''] after:absolute after:top-[2px] after:left-[2px] after:bg-white after:border-gray-300 after:border after:rounded-full after:h-5 after:w-5 after:transition-all peer-checked:bg-honey-500"></div>
                </label>
              </div>
            ))}
          </div>
        </div>
      )}

      {/* System Tab */}
      {activeTab === 'system' && (
        <div className="space-y-6 max-w-2xl">
          <div className="card">
            <h2 className="text-lg font-semibold mb-4">System Information</h2>
            <dl className="space-y-3">
              <div className="flex justify-between py-2 border-b border-gray-100">
                <dt className="text-gray-500">Version</dt>
                <dd className="font-medium">1.0.0</dd>
              </div>
              <div className="flex justify-between py-2 border-b border-gray-100">
                <dt className="text-gray-500">Environment</dt>
                <dd className="font-medium">Production</dd>
              </div>
              <div className="flex justify-between py-2 border-b border-gray-100">
                <dt className="text-gray-500">API Status</dt>
                <dd className="badge-success">Operational</dd>
              </div>
              <div className="flex justify-between py-2">
                <dt className="text-gray-500">Last Updated</dt>
                <dd className="font-medium">Dec 28, 2025</dd>
              </div>
            </dl>
          </div>

          <div className="card border-red-200 bg-red-50">
            <h2 className="text-lg font-semibold text-red-800 mb-4">Danger Zone</h2>
            <p className="text-sm text-red-600 mb-4">
              These actions are irreversible. Please proceed with caution.
            </p>
            <div className="flex gap-4">
              <button className="btn-danger">Clear Cache</button>
              <button className="btn-danger">Reset Analytics</button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
