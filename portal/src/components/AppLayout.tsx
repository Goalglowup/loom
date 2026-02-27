import { useEffect, useState } from 'react';
import { Outlet, NavLink, useNavigate } from 'react-router-dom';
import { getToken, clearToken } from '../lib/auth';
import { api } from '../lib/api';
import type { User, TenantDetail } from '../lib/api';

export default function AppLayout() {
  const navigate = useNavigate();
  const [user, setUser] = useState<User | null>(null);
  const [tenant, setTenant] = useState<TenantDetail | null>(null);

  useEffect(() => {
    const token = getToken();
    if (!token) return;
    api.me(token).then(({ user, tenant }) => {
      setUser(user);
      setTenant(tenant);
    }).catch(() => {
      clearToken();
      navigate('/login');
    });
  }, [navigate]);

  function handleLogout() {
    clearToken();
    navigate('/');
  }

  const navLinkClass = ({ isActive }: { isActive: boolean }) =>
    `flex items-center gap-2 px-3 py-2 rounded-lg text-sm transition-colors ${
      isActive
        ? 'bg-indigo-600 text-white'
        : 'text-gray-400 hover:text-gray-100 hover:bg-gray-800'
    }`;

  return (
    <div className="flex h-screen bg-gray-950 text-gray-100">
      {/* Sidebar */}
      <aside className="w-60 flex flex-col bg-gray-900 border-r border-gray-700">
        {/* Branding */}
        <div className="px-5 py-5 border-b border-gray-700">
          <span className="text-xl font-bold tracking-tight text-white">⧖ Loom</span>
          {tenant && (
            <p className="text-xs text-gray-400 mt-1 truncate">{tenant.name}</p>
          )}
        </div>

        {/* Nav */}
        <nav className="flex-1 px-3 py-4 space-y-1">
          <NavLink to="/app" end className={navLinkClass}>
            🏠 <span>Home</span>
          </NavLink>
          <NavLink to="/app/traces" className={navLinkClass}>
            📋 <span>Traces</span>
          </NavLink>
          <NavLink to="/app/analytics" className={navLinkClass}>
            📊 <span>Analytics</span>
          </NavLink>
          <NavLink to="/app/settings" className={navLinkClass}>
            ⚙️ <span>Settings</span>
          </NavLink>
          <NavLink to="/app/api-keys" className={navLinkClass}>
            🔑 <span>API Keys</span>
          </NavLink>
        </nav>

        {/* Footer */}
        <div className="px-4 py-4 border-t border-gray-700">
          {user && (
            <p className="text-xs text-gray-400 truncate mb-2">{user.email}</p>
          )}
          <button
            onClick={handleLogout}
            className="text-xs text-gray-500 hover:text-red-400 transition-colors"
          >
            Sign out
          </button>
        </div>
      </aside>

      {/* Main content */}
      <main className="flex-1 overflow-auto">
        <Outlet />
      </main>
    </div>
  );
}
