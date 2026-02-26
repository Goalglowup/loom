import { useEffect, useState } from 'react';
import { Link } from 'react-router-dom';
import { api } from '../lib/api';
import type { User, TenantDetail } from '../lib/api';
import { getToken } from '../lib/auth';

export default function DashboardHome() {
  const [user, setUser] = useState<User | null>(null);
  const [tenant, setTenant] = useState<TenantDetail | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState('');

  useEffect(() => {
    const token = getToken();
    if (!token) return;
    api.me(token)
      .then(({ user, tenant }) => {
        setUser(user);
        setTenant(tenant);
      })
      .catch(err => setError(err.message))
      .finally(() => setLoading(false));
  }, []);

  if (loading) {
    return (
      <div className="p-8 text-gray-500 animate-pulse">Loading…</div>
    );
  }

  if (error) {
    return (
      <div className="p-8 text-red-400">{error}</div>
    );
  }

  const providerConfigured = tenant?.providerConfig?.provider != null;

  return (
    <div className="p-8 space-y-6 max-w-3xl">
      {/* Welcome */}
      <div className="bg-gray-900 border border-gray-700 rounded-xl p-6">
        <h1 className="text-2xl font-bold text-white">
          Welcome{tenant ? `, ${tenant.name}` : ''}
        </h1>
        {user && (
          <p className="text-gray-400 text-sm mt-1">Signed in as {user.email}</p>
        )}
      </div>

      {/* Status cards */}
      <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
        <div className="bg-gray-900 border border-gray-700 rounded-xl p-5 space-y-2">
          <p className="text-xs uppercase tracking-wide text-gray-500">Provider</p>
          <div className="flex items-center gap-2">
            <span className="text-xl">{providerConfigured ? '✅' : '⚠️'}</span>
            <span className="text-gray-100 font-medium">
              {providerConfigured
                ? `${tenant!.providerConfig.provider} configured`
                : 'Not configured'}
            </span>
          </div>
          {!providerConfigured && (
            <p className="text-xs text-yellow-400">
              Configure a provider to start routing requests.
            </p>
          )}
        </div>

        <div className="bg-gray-900 border border-gray-700 rounded-xl p-5 space-y-2">
          <p className="text-xs uppercase tracking-wide text-gray-500">API Keys</p>
          <div className="flex items-center gap-2">
            <span className="text-xl">🔑</span>
            <span className="text-gray-100 font-medium">Active keys</span>
          </div>
          <Link
            to="/app/api-keys"
            className="text-xs text-indigo-400 hover:text-indigo-300"
          >
            Manage keys →
          </Link>
        </div>
      </div>

      {/* Quick links */}
      <div className="space-y-2">
        <h2 className="text-sm font-semibold text-gray-400 uppercase tracking-wide">Quick links</h2>
        <div className="flex gap-3">
          <Link
            to="/app/settings"
            className="px-4 py-2 bg-gray-800 hover:bg-gray-700 border border-gray-700 text-sm text-gray-200 rounded-lg transition-colors"
          >
            ⚙️ Provider settings
          </Link>
          <Link
            to="/app/api-keys"
            className="px-4 py-2 bg-gray-800 hover:bg-gray-700 border border-gray-700 text-sm text-gray-200 rounded-lg transition-colors"
          >
            🔑 API keys
          </Link>
        </div>
      </div>
    </div>
  );
}
