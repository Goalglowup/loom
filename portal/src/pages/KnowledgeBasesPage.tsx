import { useState, useEffect, useCallback } from 'react';
import { api } from '../lib/api';
import type { KnowledgeBase } from '../lib/api';
import { getToken } from '../lib/auth';

function formatDate(iso: string) {
  return new Date(iso).toLocaleString('en-US', {
    month: 'short', day: 'numeric', year: 'numeric',
    hour: '2-digit', minute: '2-digit',
  });
}

export default function KnowledgeBasesPage() {
  const [kbs, setKbs] = useState<KnowledgeBase[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState('');
  const [deleting, setDeleting] = useState<Record<string, boolean>>({});

  const token = getToken()!;

  const loadKbs = useCallback(async () => {
    try {
      const { knowledgeBases } = await api.listKnowledgeBases(token);
      setKbs(knowledgeBases);
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Failed to load knowledge bases');
    } finally {
      setLoading(false);
    }
  }, [token]);

  useEffect(() => { loadKbs(); }, [loadKbs]);

  async function handleDelete(id: string) {
    if (!confirm('Delete this knowledge base? This cannot be undone.')) return;
    setDeleting(s => ({ ...s, [id]: true }));
    try {
      await api.deleteKnowledgeBase(token, id);
      setKbs(s => s.filter(kb => kb.id !== id));
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Failed to delete knowledge base');
    } finally {
      setDeleting(s => ({ ...s, [id]: false }));
    }
  }

  return (
    <div className="p-8 max-w-5xl space-y-6">
      <div>
        <h1 className="text-2xl font-bold text-white">Knowledge Bases</h1>
        <p className="text-gray-400 text-sm mt-1">
          Vectorized document collections available for agent retrieval
        </p>
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
              <th className="px-4 py-3 text-xs uppercase tracking-wide text-gray-500 font-medium">Name</th>
              <th className="px-4 py-3 text-xs uppercase tracking-wide text-gray-500 font-medium">Org</th>
              <th className="px-4 py-3 text-xs uppercase tracking-wide text-gray-500 font-medium">Version</th>
              <th className="px-4 py-3 text-xs uppercase tracking-wide text-gray-500 font-medium text-right">Chunks</th>
              <th className="px-4 py-3 text-xs uppercase tracking-wide text-gray-500 font-medium">Vector Space</th>
              <th className="px-4 py-3 text-xs uppercase tracking-wide text-gray-500 font-medium">Created</th>
              <th className="px-4 py-3 text-xs uppercase tracking-wide text-gray-500 font-medium">Actions</th>
            </tr>
          </thead>
          <tbody>
            {loading ? (
              Array.from({ length: 4 }, (_, i) => (
                <tr key={i} className="border-b border-gray-800 animate-pulse">
                  {Array.from({ length: 7 }, (_, j) => (
                    <td key={j} className="px-4 py-3">
                      <div className="h-4 bg-gray-800 rounded w-3/4" />
                    </td>
                  ))}
                </tr>
              ))
            ) : kbs.length === 0 ? (
              <tr>
                <td colSpan={7} className="px-4 py-12 text-center text-gray-500">
                  No knowledge bases yet. Use the Arachne CLI to weave and push your first knowledge base.
                </td>
              </tr>
            ) : (
              kbs.map(kb => (
                <tr key={kb.id} className="border-b border-gray-800 last:border-0 hover:bg-gray-800/50 transition-colors">
                  <td className="px-4 py-3 text-gray-100 font-medium">{kb.name}</td>
                  <td className="px-4 py-3 text-gray-400 text-xs font-mono">{kb.org}</td>
                  <td className="px-4 py-3 text-gray-400 text-xs font-mono">{kb.version}</td>
                  <td className="px-4 py-3 text-gray-300 text-right tabular-nums">{kb.chunkCount.toLocaleString()}</td>
                  <td className="px-4 py-3 text-gray-400 text-xs font-mono">{kb.vectorSpace}</td>
                  <td className="px-4 py-3 text-gray-400 text-xs">{formatDate(kb.createdAt)}</td>
                  <td className="px-4 py-3">
                    <button
                      onClick={() => handleDelete(kb.id)}
                      disabled={deleting[kb.id]}
                      className="text-xs text-red-500 hover:text-red-400 disabled:opacity-40 transition-colors"
                    >
                      {deleting[kb.id] ? 'Deleting…' : 'Delete'}
                    </button>
                  </td>
                </tr>
              ))
            )}
          </tbody>
        </table>
      </div>
    </div>
  );
}
