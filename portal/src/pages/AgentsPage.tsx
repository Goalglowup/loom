import { useState, useEffect, useCallback } from 'react';
import { api } from '../lib/api';
import type { Agent } from '../lib/api';
import { getToken } from '../lib/auth';
import AgentEditor from '../components/AgentEditor';

function truncate(str: string | null | undefined, len: number): string {
  if (!str) return '—';
  return str.length > len ? str.slice(0, len) + '…' : str;
}

type EditorState =
  | { mode: 'closed' }
  | { mode: 'create' }
  | { mode: 'edit'; agent: Agent };

export default function AgentsPage() {
  const [agents, setAgents] = useState<Agent[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState('');
  const [editor, setEditor] = useState<EditorState>({ mode: 'closed' });
  const [deleting, setDeleting] = useState<Record<string, boolean>>({});

  const token = getToken()!;

  const loadAgents = useCallback(async () => {
    try {
      const { agents } = await api.listAgents(token);
      setAgents(agents);
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Failed to load agents');
    } finally {
      setLoading(false);
    }
  }, [token]);

  useEffect(() => { loadAgents(); }, [loadAgents]);

  async function handleDelete(id: string) {
    if (!confirm('Delete this agent? This cannot be undone.')) return;
    setDeleting(s => ({ ...s, [id]: true }));
    try {
      await api.deleteAgent(token, id);
      setAgents(s => s.filter(a => a.id !== id));
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Failed to delete agent');
    } finally {
      setDeleting(s => ({ ...s, [id]: false }));
    }
  }

  function handleSaved(agent: Agent) {
    setAgents(prev => {
      const idx = prev.findIndex(a => a.id === agent.id);
      if (idx !== -1) {
        const next = [...prev];
        next[idx] = agent;
        return next;
      }
      return [agent, ...prev];
    });
    setEditor({ mode: 'closed' });
  }

  const isEditorOpen = editor.mode !== 'closed';

  return (
    <div className="p-8 max-w-5xl space-y-6">
      <div className="flex items-start justify-between">
        <div>
          <h1 className="text-2xl font-bold text-white">Agents</h1>
          <p className="text-gray-400 text-sm mt-1">
            Named LLM configurations with inherited provider settings, prompts, and tools
          </p>
        </div>
        {!isEditorOpen && (
          <button
            onClick={() => setEditor({ mode: 'create' })}
            className="text-sm bg-indigo-600 hover:bg-indigo-500 text-white px-3 py-1.5 rounded-lg transition-colors"
          >
            + New Agent
          </button>
        )}
      </div>

      {error && (
        <div className="bg-red-950/30 border border-red-800 rounded-lg px-4 py-3 text-red-400 text-sm">
          {error}
          <button onClick={() => setError('')} className="ml-3 text-red-600 hover:text-red-400">✕</button>
        </div>
      )}

      {/* Editor panel */}
      {isEditorOpen && (
        <div className="bg-gray-900 border border-gray-700 rounded-xl p-6 space-y-4">
          <h2 className="text-lg font-semibold text-gray-100">
            {editor.mode === 'create' ? 'New Agent' : `Edit: ${editor.agent.name}`}
          </h2>
          <AgentEditor
            agent={editor.mode === 'edit' ? editor.agent : null}
            onSave={handleSaved}
            onCancel={() => setEditor({ mode: 'closed' })}
          />
        </div>
      )}

      {/* Agents list */}
      {loading ? (
        <p className="text-gray-500 animate-pulse">Loading…</p>
      ) : agents.length === 0 && !isEditorOpen ? (
        <div className="bg-gray-900 border border-gray-700 rounded-xl px-6 py-10 text-center">
          <p className="text-gray-500 text-sm">
            No agents yet. Create one to define reusable LLM configurations.
          </p>
        </div>
      ) : agents.length > 0 ? (
        <div className="bg-gray-900 border border-gray-700 rounded-xl overflow-hidden">
          <table className="w-full text-sm">
            <thead>
              <tr className="border-b border-gray-700 text-gray-400 text-left">
                <th className="px-4 py-3 font-medium">Name</th>
                <th className="px-4 py-3 font-medium">System Prompt</th>
                <th className="px-4 py-3 font-medium">Skills</th>
                <th className="px-4 py-3 font-medium">MCP Endpoints</th>
                <th className="px-4 py-3 font-medium">Actions</th>
              </tr>
            </thead>
            <tbody>
              {agents.map(agent => (
                <tr key={agent.id} className="border-b border-gray-800 last:border-0">
                  <td className="px-4 py-3 text-gray-100 font-medium">{agent.name}</td>
                  <td className="px-4 py-3 text-gray-400 font-mono text-xs">
                    {truncate(agent.systemPrompt, 50)}
                  </td>
                  <td className="px-4 py-3 text-gray-400">{agent.skills?.length ?? 0}</td>
                  <td className="px-4 py-3 text-gray-400">{agent.mcpEndpoints?.length ?? 0}</td>
                  <td className="px-4 py-3 flex gap-3">
                    <button
                      onClick={() => setEditor({ mode: 'edit', agent })}
                      disabled={isEditorOpen}
                      className="text-xs text-indigo-400 hover:text-indigo-300 disabled:opacity-40 transition-colors"
                    >
                      Edit
                    </button>
                    <button
                      onClick={() => handleDelete(agent.id)}
                      disabled={deleting[agent.id] || isEditorOpen}
                      className="text-xs text-red-500 hover:text-red-400 disabled:opacity-40 transition-colors"
                    >
                      {deleting[agent.id] ? 'Deleting…' : 'Delete'}
                    </button>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      ) : null}
    </div>
  );
}
