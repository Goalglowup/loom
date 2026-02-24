import './TracesPage.css';

interface Trace {
  id: string;
  timestamp: string;
  tenant: string;
  model: string;
  provider: string;
  latency: number;
  tokens: number;
  cost: number;
}

const MOCK_TRACES: Trace[] = [
  {
    id: '1',
    timestamp: '2024-12-25T14:32:15Z',
    tenant: 'acme-corp',
    model: 'gpt-4',
    provider: 'openai',
    latency: 1234,
    tokens: 856,
    cost: 0.0342
  },
  {
    id: '2',
    timestamp: '2024-12-25T14:31:48Z',
    tenant: 'beta-labs',
    model: 'gpt-3.5-turbo',
    provider: 'azure-openai',
    latency: 567,
    tokens: 423,
    cost: 0.0012
  },
  {
    id: '3',
    timestamp: '2024-12-25T14:30:22Z',
    tenant: 'acme-corp',
    model: 'gpt-4-turbo',
    provider: 'openai',
    latency: 2103,
    tokens: 1245,
    cost: 0.0498
  },
  {
    id: '4',
    timestamp: '2024-12-25T14:29:55Z',
    tenant: 'gamma-inc',
    model: 'gpt-3.5-turbo',
    provider: 'openai',
    latency: 489,
    tokens: 312,
    cost: 0.0009
  },
  {
    id: '5',
    timestamp: '2024-12-25T14:28:33Z',
    tenant: 'beta-labs',
    model: 'gpt-4',
    provider: 'azure-openai',
    latency: 1567,
    tokens: 934,
    cost: 0.0374
  },
  {
    id: '6',
    timestamp: '2024-12-25T14:27:10Z',
    tenant: 'acme-corp',
    model: 'gpt-3.5-turbo',
    provider: 'openai',
    latency: 421,
    tokens: 289,
    cost: 0.0008
  },
  {
    id: '7',
    timestamp: '2024-12-25T14:25:42Z',
    tenant: 'gamma-inc',
    model: 'gpt-4-turbo',
    provider: 'openai',
    latency: 1876,
    tokens: 1102,
    cost: 0.0441
  },
  {
    id: '8',
    timestamp: '2024-12-25T14:24:18Z',
    tenant: 'beta-labs',
    model: 'gpt-3.5-turbo',
    provider: 'azure-openai',
    latency: 534,
    tokens: 387,
    cost: 0.0011
  }
];

function formatTimestamp(isoString: string): string {
  const date = new Date(isoString);
  return date.toLocaleString('en-US', {
    month: 'short',
    day: 'numeric',
    hour: '2-digit',
    minute: '2-digit',
    second: '2-digit'
  });
}

function formatCost(cost: number): string {
  return `$${cost.toFixed(4)}`;
}

function formatLatency(ms: number): string {
  return `${ms}ms`;
}

function TracesPage() {
  return (
    <div className="page">
      <div className="page-header">
        <h2 className="page-title">Traces</h2>
        <p className="page-subtitle">Mock data — API integration coming in Wave 3</p>
      </div>

      <div className="traces-table-container">
        <table className="traces-table">
          <thead>
            <tr>
              <th>Timestamp</th>
              <th>Tenant</th>
              <th>Model</th>
              <th>Provider</th>
              <th className="align-right">Latency</th>
              <th className="align-right">Tokens</th>
              <th className="align-right">Cost</th>
            </tr>
          </thead>
          <tbody>
            {MOCK_TRACES.map((trace) => (
              <tr key={trace.id}>
                <td className="timestamp">{formatTimestamp(trace.timestamp)}</td>
                <td className="tenant">{trace.tenant}</td>
                <td className="model">{trace.model}</td>
                <td className="provider">{trace.provider}</td>
                <td className="align-right">{formatLatency(trace.latency)}</td>
                <td className="align-right">{trace.tokens.toLocaleString()}</td>
                <td className="align-right cost">{formatCost(trace.cost)}</td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    </div>
  );
}

export default TracesPage;
