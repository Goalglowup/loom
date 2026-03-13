import { Routes, Route } from 'react-router-dom';
import Layout from './components/Layout';
import TracesPage from './pages/TracesPage';
import AnalyticsPage from './pages/AnalyticsPage';
import AdminPage from './pages/AdminPage';
import SettingsPage from './pages/SettingsPage';
import BetaSignupsPage from './pages/BetaSignupsPage';
import SmokeTestsPage from './pages/SmokeTestsPage';

function App() {
  return (
    <Layout>
      <Routes>
        <Route path="/" element={<TracesPage />} />
        <Route path="/analytics" element={<AnalyticsPage />} />
        <Route path="/admin" element={<AdminPage />} />
        <Route path="/settings" element={<SettingsPage />} />
        <Route path="/beta-signups" element={<BetaSignupsPage />} />
        <Route path="/smoke-tests" element={<SmokeTestsPage />} />
      </Routes>
    </Layout>
  );
}

export default App;
