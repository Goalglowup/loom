import { Routes, Route, Navigate } from 'react-router-dom';
import { AuthProvider } from './context/AuthContext';
import LandingPage from './pages/LandingPage';
import LoginPage from './pages/LoginPage';
import SignupPage from './pages/SignupPage';
import AppLayout from './components/AppLayout';
import DashboardHome from './pages/DashboardHome';
import SettingsPage from './pages/SettingsPage';
import ApiKeysPage from './pages/ApiKeysPage';
import TracesPage from './pages/TracesPage';
import AnalyticsPage from './pages/AnalyticsPage';
import MembersPage from './pages/MembersPage';
import SubtenantsPage from './pages/SubtenantsPage';
import AgentsPage from './pages/AgentsPage';
import SandboxPage from './pages/SandboxPage';
import AuthGuard from './components/AuthGuard';

export default function App() {
  return (
    <AuthProvider>
      <Routes>
        <Route path="/" element={<LandingPage />} />
        <Route path="/login" element={<LoginPage />} />
        <Route path="/signup" element={<SignupPage />} />
        <Route path="/app" element={<AuthGuard><AppLayout /></AuthGuard>}>
          <Route index element={<DashboardHome />} />
          <Route path="settings" element={<SettingsPage />} />
          <Route path="api-keys" element={<ApiKeysPage />} />
          <Route path="traces" element={<TracesPage />} />
          <Route path="analytics" element={<AnalyticsPage />} />
          <Route path="members" element={<MembersPage />} />
          <Route path="subtenants" element={<SubtenantsPage />} />
          <Route path="agents" element={<AgentsPage />} />
          <Route path="sandbox" element={<SandboxPage />} />
        </Route>
        <Route path="*" element={<Navigate to="/" replace />} />
      </Routes>
    </AuthProvider>
  );
}
