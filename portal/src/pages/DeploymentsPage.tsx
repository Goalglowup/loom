import { useState, useEffect, useCallback } from 'react';
import { api } from '../lib/api';
import type { Deployment } from '../lib/api';
import { getToken } from '../lib/auth';
import { useAuth } from '../context/AuthContext';

function formatDate(iso: string) {
  return new Date(iso).toLocaleString('en-US', {
    month: 'short', day: 'numeric', year: 'numeric',
    hour: '2-digit', minute: '2-digit',
  });
}

function statusBadge(status: string) {
  switch (status) {
    case 'active':
    case 'running':
      return 'bg-green-900 text-green-300';
    case 'failed':
    case 'error':
      return 'bg-red-900 text-red-300';
    case 'pending':
    case 'deploying':
      return 'bg-yellow-900 text-yellow-300';
    default:
      return 'bg-gray-700 text-gray-300';
  }
}

interface DeployFormState {
  org: string;
  name: string;
  tag: string;
  env: string;
}

export default function DeploymentsPage() {
  const [deployments, setDeployments] = useState<Deployment[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState('');
  const [deleting, setDeleting] = useState<Record<string, boolean>>({});
  const [showModal, setShowModal] = useState(false);
  const [deploying, setDeploying] = useState(false);
  const [formError, setFormError] = useState('');

  const { tenant } = useAuth();
  const token = getToken()!;

  const [form, setForm] = useState<DeployFormState>({
    org: tenant?.name ?? '',
    name: '',
    tag: 'latest',
    env: 'prod',
  });

  const loadDeployments = useCallback(async () => {
    try {
      const { deployments } = await api.listDeployments(token);
      setDeployments(deployments);
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Failed to load deployments');
    } finally {
      setLoading(false);
    }
  }, [token]);

  useEffect(() => { loadDeployments(); }, [loadDeployments]);

  // Sync org with tenant once tenant loads
  useEffect(() => {
    if (tenant?.name && !form.org) {
      setForm(f => ({ ...f, org: tenant.name }));
    }
  }, [tenant?.name]); // eslint-disable-line react-hooks/exhaustive-deps

  async function handleUndeploy(id: string) {
    if (!confirm('Undeploy this deployment? This cannot be undone.')) return;
    setDeleting(s => ({ ...s, [id]: true }));
    try {
      await api.deleteDeployment(token, id);
      setDeployments(s => s.filter(d => d.id !== id));
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Failed to undeploy');
    } finally {
      setDeleting(s => ({ ...s, [id]: false }));
    }
  }

  async function handleDeploy(e: React.FormEvent) {
    e.preventDefault();
    if (!form.org.trim() || !form.name.trim() || !form.tag.trim() || !form.env.trim()) return;
    setDeploying(true);
    setFormError('');
    try {
      const { deployment } = await api.deployArtifact(token, {
        org: form.org.trim(),
        name: form.name.trim(),
        tag: form.tag.trim(),
        env: form.env.trim(),
      });
      setDeployments(prev => [deployment, ...prev]);
      setShowModal(false);
      setForm(f => ({ ...f, name: '', tag: 'latest' }));
    } catch (err) {
      setFormError(err instanceof Error ? err.message : 'Failed to deploy');
    } finally {
      setDeploying(false);
    }
  }

  function openModal() {
    setForm({ org: tenant?.name ?? '', name: '', tag: 'latest', env: 'prod' });
    setFormError('');
    setShowModal(true);
  }

  const inputCls = 'w-full bg-gray-950 border border-gray-700 rounded-lg px-3 py-2 text-gray-100 placeholder-gray-600 focus:outline-none focus:border-indigo-500 text-sm';
  const labelCls = 'block text-sm text-gray-400 mb-1';

  return (
    <div className="p-8 max-w-5xl space-y-6">
      <div className="flex items-start justify-between">
        <div>
          <h1 className="text-2xl font-bold text-white">Deployments</h1>
          <p className="text-gray-400 text-sm mt-1">
            Active artifact deployments across environments
          </p>
        </div>
        <button
          onClick={openModal}
          className="text-sm bg-indigo-600 hover:bg-indigo-500 text-white px-3 py-1.5 rounded-lg transition-colors"
        >
          + Deploy new
        </button>
      </div>

      {error && (
        <div className="bg-red-950/30 border border-red-800 rounded-lg px-4 py-3 text-red-400 text-sm">
          {error}
          <button onClick={() => setError('')} className="ml-3 text-red-600 hover:text-red-400">✕</button>
        </div>
      )}

      <div className="bg-gray-900 border border-gray-700 rounded-xl overflow-hidden">
        <table className="w-full text-sm">
          <thead>
            <tr className="border-b border-gray-700 text-left">
              <th className="px-4 py-3 text-xs uppercase tracking-wide text-gray-500 font-medium">Artifact</th>
              <th className="px-4 py-3 text-xs uppercase tracking-wide text-gray-500 font-medium">Env</th>
              <th className="px-4 py-3 text-xs uppercase tracking-wide text-gray-500 font-medium">Status</th>
              <th className="px-4 py-3 text-xs uppercase tracking-wide text-gray-500 font-medium">Deployed</th>
              <th className="px-4 py-3 text-xs uppercase tracking-wide text-gray-500 font-medium">Actions</th>
            </tr>
          </thead>
          <tbody>
            {loading ? (
              Array.from({ length: 4 }, (_, i) => (
                <tr key={i} className="border-b border-gray-800 animate-pulse">
                  {Array.from({ length: 5 }, (_, j) => (
                    <td key={j} className="px-4 py-3">
                      <div className="h-4 bg-gray-800 rounded w-3/4" />
                    </td>
                  ))}
                </tr>
              ))
            ) : deployments.length === 0 ? (
              <tr>
                <td colSpan={5} className="px-4 py-12 text-center text-gray-500">
                  No deployments yet. Click <span className="text-indigo-400">+ Deploy new</span> to deploy an artifact.
                </td>
              </tr>
            ) : (
              deployments.map(dep => (
                <tr key={dep.id} className="border-b border-gray-800 last:border-0 hover:bg-gray-800/50 transition-colors">
                  <td className="px-4 py-3 text-gray-100 font-medium font-mono text-xs">
                    {dep.artifact.org}/{dep.artifact.name}:{dep.artifact.version}
                  </td>
                  <td className="px-4 py-3">
                    <span className="text-xs bg-gray-800 px-2 py-0.5 rounded text-gray-300 font-mono">{dep.env}</span>
                  </td>
                  <td className="px-4 py-3">
                    <span className={`inline-block px-2 py-0.5 rounded text-xs font-medium ${statusBadge(dep.status)}`}>
                      {dep.status}
                    </span>
                  </td>
                  <td className="px-4 py-3 text-gray-400 text-xs">{formatDate(dep.deployedAt)}</td>
                  <td className="px-4 py-3">
                    <button
                      onClick={() => handleUndeploy(dep.id)}
                      disabled={deleting[dep.id]}
                      className="text-xs text-red-500 hover:text-red-400 disabled:opacity-40 transition-colors"
                    >
                      {deleting[dep.id] ? 'Undeploying…' : 'Undeploy'}
                    </button>
                  </td>
                </tr>
              ))
            )}
          </tbody>
        </table>
      </div>

      {/* Deploy modal */}
      {showModal && (
        <div
          className="fixed inset-0 bg-black/60 z-50 flex items-center justify-center"
          onClick={() => setShowModal(false)}
          role="dialog"
          aria-modal="true"
          aria-label="Deploy artifact"
        >
          <div
            className="w-full max-w-md bg-gray-900 border border-gray-700 rounded-xl p-6 space-y-5"
            onClick={e => e.stopPropagation()}
          >
            <div className="flex items-center justify-between">
              <h2 className="text-lg font-semibold text-white">Deploy artifact</h2>
              <button
                onClick={() => setShowModal(false)}
                className="text-gray-400 hover:text-white text-xl leading-none"
                aria-label="Close"
              >
                ✕
              </button>
            </div>

            {formError && (
              <div className="bg-red-950/30 border border-red-800 rounded-lg px-4 py-3 text-red-400 text-sm">
                {formError}
              </div>
            )}

            <form onSubmit={handleDeploy} className="space-y-4">
              <div>
                <label className={labelCls}>Org</label>
                <input
                  type="text"
                  value={form.org}
                  onChange={e => setForm(f => ({ ...f, org: e.target.value }))}
                  placeholder="your-org"
                  required
                  className={inputCls}
                />
              </div>
              <div>
                <label className={labelCls}>Artifact name</label>
                <input
                  type="text"
                  value={form.name}
                  onChange={e => setForm(f => ({ ...f, name: e.target.value }))}
                  placeholder="my-agent"
                  required
                  className={inputCls}
                />
              </div>
              <div>
                <label className={labelCls}>Tag / version</label>
                <input
                  type="text"
                  value={form.tag}
                  onChange={e => setForm(f => ({ ...f, tag: e.target.value }))}
                  placeholder="latest"
                  required
                  className={inputCls}
                />
              </div>
              <div>
                <label className={labelCls}>Environment</label>
                <select
                  value={form.env}
                  onChange={e => setForm(f => ({ ...f, env: e.target.value }))}
                  className="w-full bg-gray-950 border border-gray-700 rounded-lg px-3 py-2 text-gray-100 focus:outline-none focus:border-indigo-500 text-sm"
                >
                  <option value="prod">prod</option>
                  <option value="staging">staging</option>
                  <option value="dev">dev</option>
                </select>
              </div>
              <div className="flex gap-3 pt-2">
                <button
                  type="submit"
                  disabled={deploying}
                  className="px-4 py-2 text-sm bg-indigo-600 hover:bg-indigo-500 disabled:opacity-50 text-white rounded-lg transition-colors"
                >
                  {deploying ? 'Deploying…' : 'Deploy'}
                </button>
                <button
                  type="button"
                  onClick={() => setShowModal(false)}
                  className="px-4 py-2 text-sm text-gray-400 hover:text-gray-200 transition-colors"
                >
                  Cancel
                </button>
              </div>
            </form>
          </div>
        </div>
      )}
    </div>
  );
}
