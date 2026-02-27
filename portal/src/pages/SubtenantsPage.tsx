import { useState, useEffect, useCallback } from 'react';
import { api } from '../lib/api';
import type { Subtenant } from '../lib/api';
import { getToken } from '../lib/auth';
import { useAuth } from '../context/AuthContext';

function formatDate(iso: string): string {
  return new Date(iso).toLocaleDateString(undefined, { year: 'numeric', month: 'short', day: 'numeric' });
}

export default function SubtenantsPage() {
  const { currentRole } = useAuth();
  const isOwner = currentRole === 'owner';

  const [subtenants, setSubtenants] = useState<Subtenant[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState('');

  const [showCreate, setShowCreate] = useState(false);
  const [newName, setNewName] = useState('');
  const [creating, setCreating] = useState(false);

  const token = getToken()!;

  const loadSubtenants = useCallback(async () => {
    try {
      const { subtenants } = await api.listSubtenants(token);
      setSubtenants(subtenants);
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Failed to load subtenants');
    } finally {
      setLoading(false);
    }
  }, [token]);

  useEffect(() => { loadSubtenants(); }, [loadSubtenants]);

  async function handleCreate(e: React.FormEvent) {
    e.preventDefault();
    if (!newName.trim()) return;
    setCreating(true);
    try {
      const { subtenant } = await api.createSubtenant(token, newName.trim());
      setSubtenants(s => [subtenant, ...s]);
      setNewName('');
      setShowCreate(false);
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Failed to create subtenant');
    } finally {
      setCreating(false);
    }
  }

  return (
    <div className="p-8 max-w-4xl space-y-6">
      <div className="flex items-start justify-between">
        <div>
          <h1 className="text-2xl font-bold text-white">Subtenants</h1>
          <p className="text-gray-400 text-sm mt-1">Organisations nested under this tenant</p>
        </div>
        {isOwner && !showCreate && (
          <button
            onClick={() => setShowCreate(true)}
            className="text-sm bg-indigo-600 hover:bg-indigo-500 text-white px-3 py-1.5 rounded-lg transition-colors"
          >
            + Create Subtenant
          </button>
        )}
      </div>

      {error && (
        <div className="bg-red-950/30 border border-red-800 rounded-lg px-4 py-3 text-red-400 text-sm">
          {error}
          <button onClick={() => setError('')} className="ml-3 text-red-600 hover:text-red-400">✕</button>
        </div>
      )}

      {showCreate && (
        <div className="bg-gray-900 border border-gray-700 rounded-xl p-5">
          <form onSubmit={handleCreate} className="space-y-4">
            <div>
              <label className="block text-sm text-gray-400 mb-1">Name</label>
              <input
                type="text"
                value={newName}
                onChange={e => setNewName(e.target.value)}
                placeholder="e.g. Engineering Team"
                autoFocus
                className="w-full bg-gray-950 border border-gray-700 rounded-lg px-3 py-2 text-gray-100 placeholder-gray-600 focus:outline-none focus:border-indigo-500"
              />
            </div>
            <div className="flex gap-3">
              <button
                type="submit"
                disabled={creating || !newName.trim()}
                className="px-4 py-2 text-sm bg-indigo-600 hover:bg-indigo-500 disabled:opacity-50 text-white rounded-lg transition-colors"
              >
                {creating ? 'Creating…' : 'Create'}
              </button>
              <button
                type="button"
                onClick={() => { setShowCreate(false); setNewName(''); }}
                className="px-4 py-2 text-sm text-gray-400 hover:text-gray-200 transition-colors"
              >
                Cancel
              </button>
            </div>
          </form>
        </div>
      )}

      {loading ? (
        <p className="text-gray-500 animate-pulse">Loading…</p>
      ) : subtenants.length === 0 ? (
        <div className="bg-gray-900 border border-gray-700 rounded-xl px-6 py-10 text-center">
          <p className="text-gray-500 text-sm">No subtenants yet. Create one to organise teams at a sub-org level.</p>
        </div>
      ) : (
        <div className="bg-gray-900 border border-gray-700 rounded-xl overflow-hidden">
          <table className="w-full text-sm">
            <thead>
              <tr className="border-b border-gray-700 text-gray-400 text-left">
                <th className="px-4 py-3 font-medium">Name</th>
                <th className="px-4 py-3 font-medium">Status</th>
                <th className="px-4 py-3 font-medium">Created</th>
              </tr>
            </thead>
            <tbody>
              {subtenants.map(st => (
                <tr key={st.id} className="border-b border-gray-800 last:border-0">
                  <td className="px-4 py-3 text-gray-100">{st.name}</td>
                  <td className="px-4 py-3">
                    <span className={`inline-block px-2 py-0.5 rounded text-xs font-medium
                      ${st.status === 'active'
                        ? 'bg-green-900/50 text-green-400'
                        : 'bg-yellow-900/50 text-yellow-400'}`}>
                      {st.status}
                    </span>
                  </td>
                  <td className="px-4 py-3 text-gray-400">{formatDate(st.createdAt)}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}
    </div>
  );
}
