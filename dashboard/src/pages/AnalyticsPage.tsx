import { useState } from 'react';
import { getApiKey } from '../utils/api';
import ApiKeyPrompt from '../components/ApiKeyPrompt';
import AnalyticsSummary, { type WindowHours } from '../components/AnalyticsSummary';
import TimeseriesCharts from '../components/TimeseriesCharts';
import './AnalyticsPage.css';

function AnalyticsPage() {
  const [hasKey, setHasKey] = useState(() => !!getApiKey());
  const [win, setWin] = useState<WindowHours>(24);

  if (!hasKey) {
    return <ApiKeyPrompt onSaved={() => setHasKey(true)} />;
  }

  return (
    <div className="page">
      <div className="page-header">
        <h2 className="page-title">Analytics</h2>
      </div>

      <div className="analytics-sections">
        <AnalyticsSummary win={win} onWinChange={setWin} />
        <TimeseriesCharts win={win} />
      </div>
    </div>
  );
}

export default AnalyticsPage;
