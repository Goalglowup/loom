import { useState, useEffect } from 'react';
import { Link } from 'react-router-dom';
import { api } from '../lib/api';
import type { Agent } from '../lib/api';
import { getToken } from '../lib/auth';
import AgentSandbox from '../components/AgentSandbox';

export default function SandboxPage() {
  const [agents, setAgents] = useState<Agent[]>([]);
  const [loading, setLoading] = useState(true);
  const [selectedAgent, setSelectedAgent] = useState<Agent | null>(null);
  const token = getToken()!;

  useEffect(() => {
    api.listAgents(token)
      .then(res => {
        setAgents(res.agents);
        if (res.agents.length > 0) setSelectedAgent(res.agents[0]);
      })
      .finally(() => setLoading(false));
  }, [token]);

  return (
    <div className="flex flex-col h-full px-8 py-8 gap-6">
      {/* Header */}
      <div>
        <h1 className="text-2xl font-bold text-gray-100">Sandbox</h1>
        <p className="text-sm text-gray-400 mt-1">Chat with your agents</p>
      </div>

      {loading ? (
        <div className="flex items-center justify-center flex-1 text-gray-500 text-sm">Loading agents…</div>
      ) : agents.length === 0 ? (
        <div className="flex flex-col items-center justify-center flex-1 gap-3 text-center">
          <p className="text-gray-400 text-sm">No agents yet — create one on the Agents page</p>
          <Link to="/app/agents" className="text-indigo-400 hover:text-indigo-300 text-sm underline">
            Go to Agents
          </Link>
        </div>
      ) : (
        <div className="flex gap-6 flex-1 min-h-0">
          {/* Agent selector */}
          <div className="w-1/3 flex flex-col gap-2 overflow-y-auto">
            {agents.map(agent => (
              <button
                key={agent.id}
                onClick={() => setSelectedAgent(agent)}
                className={`text-left px-4 py-3 rounded-xl border transition-colors ${
                  selectedAgent?.id === agent.id
                    ? 'bg-indigo-600 border-indigo-500 text-white'
                    : 'bg-gray-900 border-gray-700 text-gray-300 hover:border-indigo-500 hover:text-gray-100'
                }`}
              >
                <p className="font-medium text-sm">{agent.name}</p>
                {agent.description && (
                  <p className="text-xs mt-0.5 opacity-70 truncate">{agent.description}</p>
                )}
              </button>
            ))}
          </div>

          {/* Chat panel */}
          <div className="flex-1 min-h-0 flex flex-col">
            {selectedAgent && (
              <AgentSandbox key={selectedAgent.id} agent={selectedAgent} />
            )}
          </div>
        </div>
      )}
    </div>
  );
}
