import { Routes, Route } from 'react-router-dom';
import Layout from './components/Layout';
import TracesPage from './pages/TracesPage';
import AnalyticsPage from './pages/AnalyticsPage';

function App() {
  return (
    <Layout>
      <Routes>
        <Route path="/" element={<TracesPage />} />
        <Route path="/analytics" element={<AnalyticsPage />} />
      </Routes>
    </Layout>
  );
}

export default App;
