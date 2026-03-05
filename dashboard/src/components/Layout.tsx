import { Link, useLocation } from 'react-router-dom';
import './Layout.css';

interface LayoutProps {
  children: React.ReactNode;
}

function Layout({ children }: LayoutProps) {
  const location = useLocation();

  return (
    <div className="layout">
      <header className="header">
        <div className="header-content">
          <h1 className="logo">Arachne</h1>
          <p className="subtitle">Observability Dashboard</p>
        </div>
      </header>
      
      <nav className="nav">
        <Link
          to="/"
          className={`nav-link ${location.pathname === '/' ? 'active' : ''}`}
        >
          Traces
        </Link>
        <Link
          to="/analytics"
          className={`nav-link ${location.pathname === '/analytics' ? 'active' : ''}`}
        >
          Analytics
        </Link>
        <Link
          to="/admin"
          className={`nav-link ${location.pathname === '/admin' ? 'active' : ''}`}
        >
          Admin
        </Link>
        <Link
          to="/settings"
          className={`nav-link ${location.pathname === '/settings' ? 'active' : ''}`}
        >
          Settings
        </Link>
        <Link
          to="/beta-signups"
          className={`nav-link ${location.pathname === '/beta-signups' ? 'active' : ''}`}
        >
          Beta Signups
        </Link>
      </nav>

      <main className="content">
        {children}
      </main>
    </div>
  );
}

export default Layout;
