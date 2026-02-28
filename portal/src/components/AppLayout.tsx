import { Outlet, NavLink, useNavigate } from 'react-router-dom';
import { useAuth } from '../context/AuthContext';
import TenantSwitcher from './TenantSwitcher';

export default function AppLayout() {
  const navigate = useNavigate();
  const { user, logout, currentRole } = useAuth();

  function handleLogout() {
    logout();
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
        {/* Branding + Tenant Switcher */}
        <div className="px-5 py-5 border-b border-gray-700">
          <span className="text-xl font-bold tracking-tight text-white">⧖ Loom</span>
          <TenantSwitcher />
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
          {currentRole === 'owner' && (
            <NavLink to="/app/members" className={navLinkClass}>
              👥 <span>Members</span>
            </NavLink>
          )}
          {currentRole === 'owner' && (
            <NavLink to="/app/subtenants" className={navLinkClass}>
              🏢 <span>Subtenants</span>
            </NavLink>
          )}
          <NavLink to="/app/agents" className={navLinkClass}>
            🤖 <span>Agents</span>
          </NavLink>
          <NavLink to="/app/conversations" className={navLinkClass}>
            💬 <span>Conversations</span>
          </NavLink>
          <NavLink to="/app/sandbox" className={navLinkClass}>
            🧪 <span>Sandbox</span>
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
