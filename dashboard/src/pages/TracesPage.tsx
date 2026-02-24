import { useState } from 'react';
import { getApiKey } from '../utils/api';
import ApiKeyPrompt from '../components/ApiKeyPrompt';
import TracesTable, { type Trace } from '../components/TracesTable';
import TraceDetails from '../components/TraceDetails';
import './TracesPage.css';

function TracesPage() {
  const [hasKey, setHasKey] = useState(() => !!getApiKey());
  const [selectedTrace, setSelectedTrace] = useState<Trace | null>(null);

  if (!hasKey) {
    return <ApiKeyPrompt onSaved={() => setHasKey(true)} />;
  }

  return (
    <div className="page">
      <div className="page-header">
        <h2 className="page-title">Traces</h2>
        <p className="page-subtitle">Live API traces — scroll to load more</p>
      </div>

      <TracesTable onRowClick={setSelectedTrace} />

      <TraceDetails trace={selectedTrace} onClose={() => setSelectedTrace(null)} />
    </div>
  );
}

export default TracesPage;
