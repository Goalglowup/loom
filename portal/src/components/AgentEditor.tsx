import { useState, useEffect } from 'react';
import { api } from '../lib/api';
import type { Agent, AgentInput, AgentMergePolicies, Skill, McpEndpoint, ResolvedAgentConfig } from '../lib/api';
import { getToken } from '../lib/auth';
import ModelListEditor from './ModelListEditor';
import { COMMON_MODELS } from '../lib/models';

interface AgentEditorProps {
  agent: Agent | null; // null = create mode
  onSave: (agent: Agent) => void;
  onCancel: () => void;
}

const DEFAULT_MERGE: AgentMergePolicies = {
  system_prompt: 'prepend',
  skills: 'merge',
  mcp_endpoints: 'merge',
};

export default function AgentEditor({ agent, onSave, onCancel }: AgentEditorProps) {
  const token = getToken()!;

  const [name, setName] = useState(agent?.name ?? '');
  const [systemPrompt, setSystemPrompt] = useState(agent?.systemPrompt ?? '');
  const [mergePolicies, setMergePolicies] = useState<AgentMergePolicies>(
    agent?.mergePolicies ?? DEFAULT_MERGE
  );
  const [skills, setSkills] = useState<Skill[]>(agent?.skills ?? []);
  const [mcpEndpoints, setMcpEndpoints] = useState<McpEndpoint[]>(agent?.mcpEndpoints ?? []);
  const [availableModels, setAvailableModels] = useState<string[] | null>(agent?.availableModels ?? null);
  const [conversationsEnabled, setConversationsEnabled] = useState(agent?.conversations_enabled ?? false);
  const [conversationTokenLimit, setConversationTokenLimit] = useState<number>(agent?.conversation_token_limit ?? 4000);
  const [conversationSummaryModel, setConversationSummaryModel] = useState(agent?.conversation_summary_model ?? '');

  const [saving, setSaving] = useState(false);
  const [error, setError] = useState('');

  // Resolved config state
  const [showResolved, setShowResolved] = useState(false);
  const [resolved, setResolved] = useState<ResolvedAgentConfig | null>(null);
  const [loadingResolved, setLoadingResolved] = useState(false);

  // Add skill inline form
  const [showAddSkill, setShowAddSkill] = useState(false);
  const [skillName, setSkillName] = useState('');
  const [skillDesc, setSkillDesc] = useState('');
  const [skillParams, setSkillParams] = useState('');

  // Add endpoint inline form
  const [showAddEndpoint, setShowAddEndpoint] = useState(false);
  const [endpointName, setEndpointName] = useState('');
  const [endpointUrl, setEndpointUrl] = useState('');
  const [endpointAuth, setEndpointAuth] = useState('');

  useEffect(() => {
    if (agent) {
      setName(agent.name);
      setSystemPrompt(agent.systemPrompt ?? '');
      setMergePolicies(agent.mergePolicies ?? DEFAULT_MERGE);
      setSkills(agent.skills ?? []);
      setMcpEndpoints(agent.mcpEndpoints ?? []);
      setAvailableModels(agent.availableModels ?? null);
      setConversationsEnabled(agent.conversations_enabled ?? false);
      setConversationTokenLimit(agent.conversation_token_limit ?? 4000);
      setConversationSummaryModel(agent.conversation_summary_model ?? '');
    }
  }, [agent]);

  async function handleSave(e: React.FormEvent) {
    e.preventDefault();
    if (!name.trim()) return;
    setSaving(true);
    setError('');
    try {
      const data: AgentInput = {
        name: name.trim(),
        systemPrompt: systemPrompt.trim() || null,
        skills: skills.length ? skills : null,
        mcpEndpoints: mcpEndpoints.length ? mcpEndpoints : null,
        availableModels,
        mergePolicies,
        conversations_enabled: conversationsEnabled,
        conversation_token_limit: conversationsEnabled ? conversationTokenLimit : null,
        conversation_summary_model: conversationsEnabled && conversationSummaryModel.trim() ? conversationSummaryModel.trim() : null,
      };
      let saved: Agent;
      if (agent) {
        const res = await api.updateAgent(token, agent.id, data);
        saved = res.agent;
      } else {
        const res = await api.createAgent(token, data);
        saved = res.agent;
      }
      onSave(saved);
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Failed to save agent');
    } finally {
      setSaving(false);
    }
  }

  function addSkill() {
    if (!skillName.trim()) return;
    let params: Record<string, unknown> | undefined;
    if (skillParams.trim()) {
      try { params = JSON.parse(skillParams); } catch { setError('Invalid JSON in skill parameters'); return; }
    }
    setSkills(s => [...s, { name: skillName.trim(), description: skillDesc.trim(), ...(params ? { parameters: params } : {}) }]);
    setSkillName(''); setSkillDesc(''); setSkillParams('');
    setShowAddSkill(false);
  }

  function addEndpoint() {
    if (!endpointName.trim() || !endpointUrl.trim()) return;
    setMcpEndpoints(s => [...s, { name: endpointName.trim(), url: endpointUrl.trim(), ...(endpointAuth.trim() ? { auth: endpointAuth.trim() } : {}) }]);
    setEndpointName(''); setEndpointUrl(''); setEndpointAuth('');
    setShowAddEndpoint(false);
  }

  async function handleShowResolved() {
    if (!agent) return;
    setShowResolved(v => !v);
    if (!resolved && !showResolved) {
      setLoadingResolved(true);
      try {
        const { resolved: r } = await api.getResolvedAgentConfig(token, agent.id);
        setResolved(r);
      } catch (err) {
        setError(err instanceof Error ? err.message : 'Failed to load resolved config');
      } finally {
        setLoadingResolved(false);
      }
    }
  }

  const inputCls = 'w-full bg-gray-950 border border-gray-700 rounded-lg px-3 py-2 text-gray-100 placeholder-gray-600 focus:outline-none focus:border-indigo-500 text-sm';
  const selectCls = 'bg-gray-950 border border-gray-700 rounded-lg px-2 py-1.5 text-gray-200 text-xs focus:outline-none focus:border-indigo-500';
  const labelCls = 'block text-sm text-gray-400 mb-1';

  return (
    <form onSubmit={handleSave} className="space-y-8">
      {error && (
        <div className="bg-red-950/30 border border-red-800 rounded-lg px-4 py-3 text-red-400 text-sm">
          {error}
          <button type="button" onClick={() => setError('')} className="ml-3 text-red-600 hover:text-red-400">✕</button>
        </div>
      )}

      {/* Basic */}
      <section className="space-y-3">
        <h3 className="text-sm font-semibold text-gray-300 uppercase tracking-wide">Basic</h3>
        <div>
          <label className={labelCls}>Name <span className="text-red-500">*</span></label>
          <input
            type="text"
            value={name}
            onChange={e => setName(e.target.value)}
            placeholder="e.g. customer-support-agent"
            required
            className={inputCls}
          />
        </div>
      </section>

      {/* System Prompt */}
      <section className="space-y-3">
        <h3 className="text-sm font-semibold text-gray-300 uppercase tracking-wide">System Prompt</h3>
        <div>
          <textarea
            value={systemPrompt}
            onChange={e => setSystemPrompt(e.target.value)}
            placeholder="Leave blank to inherit from org"
            rows={4}
            className={`${inputCls} resize-y`}
          />
        </div>
        <div className="flex items-center gap-3">
          <span className="text-xs text-gray-400 whitespace-nowrap">When request also has a system message:</span>
          <select
            value={mergePolicies.system_prompt}
            onChange={e => setMergePolicies(p => ({ ...p, system_prompt: e.target.value as AgentMergePolicies['system_prompt'] }))}
            className={selectCls}
          >
            <option value="prepend">Prepend (add before request's system message)</option>
            <option value="append">Append (add after request's system message)</option>
            <option value="overwrite">Overwrite (replace request's system message)</option>
            <option value="ignore">Ignore (don't inject — pass request through)</option>
          </select>
        </div>
      </section>

      {/* Skills */}
      <section className="space-y-3">
        <h3 className="text-sm font-semibold text-gray-300 uppercase tracking-wide">Skills / Tool Definitions</h3>
        <p className="text-xs text-gray-500">JSON tool definitions injected into requests (OpenAI tools format)</p>

        {skills.length > 0 && (
          <div className="bg-gray-900 border border-gray-700 rounded-xl overflow-hidden">
            {skills.map((skill, i) => (
              <div key={i} className="flex items-center justify-between px-4 py-3 border-b border-gray-800 last:border-0">
                <div>
                  <span className="text-gray-200 text-sm font-medium">{skill.name}</span>
                  {skill.description && <span className="text-gray-500 text-xs ml-2">— {skill.description}</span>}
                </div>
                <button
                  type="button"
                  onClick={() => setSkills(s => s.filter((_, j) => j !== i))}
                  className="text-xs text-red-500 hover:text-red-400 transition-colors"
                >
                  Remove
                </button>
              </div>
            ))}
          </div>
        )}

        {showAddSkill ? (
          <div className="bg-gray-900 border border-gray-700 rounded-xl p-4 space-y-3">
            <div className="grid grid-cols-2 gap-3">
              <div>
                <label className={labelCls}>Name</label>
                <input type="text" value={skillName} onChange={e => setSkillName(e.target.value)} placeholder="get_weather" className={inputCls} />
              </div>
              <div>
                <label className={labelCls}>Description</label>
                <input type="text" value={skillDesc} onChange={e => setSkillDesc(e.target.value)} placeholder="Get the current weather" className={inputCls} />
              </div>
            </div>
            <div>
              <label className={labelCls}>Parameters (JSON, optional)</label>
              <textarea value={skillParams} onChange={e => setSkillParams(e.target.value)} placeholder='{"type":"object","properties":{...}}' rows={3} className={`${inputCls} resize-y font-mono text-xs`} />
            </div>
            <div className="flex gap-3">
              <button type="button" onClick={addSkill} className="px-3 py-1.5 text-sm bg-indigo-600 hover:bg-indigo-500 text-white rounded-lg transition-colors">Add</button>
              <button type="button" onClick={() => { setShowAddSkill(false); setSkillName(''); setSkillDesc(''); setSkillParams(''); }} className="text-sm text-gray-400 hover:text-gray-200 transition-colors">Cancel</button>
            </div>
          </div>
        ) : (
          <button type="button" onClick={() => setShowAddSkill(true)} className="text-sm text-indigo-400 hover:text-indigo-300 transition-colors">
            + Add Skill
          </button>
        )}

        <div className="flex items-center gap-3">
          <span className="text-xs text-gray-400 whitespace-nowrap">When request also has tools:</span>
          <select
            value={mergePolicies.skills}
            onChange={e => setMergePolicies(p => ({ ...p, skills: e.target.value as AgentMergePolicies['skills'] }))}
            className={selectCls}
          >
            <option value="merge">Merge (union)</option>
            <option value="overwrite">Overwrite</option>
            <option value="ignore">Ignore</option>
          </select>
        </div>
      </section>

      {/* MCP Endpoints */}
      <section className="space-y-3">
        <h3 className="text-sm font-semibold text-gray-300 uppercase tracking-wide">MCP Endpoints</h3>
        <p className="text-xs text-gray-500">External tool servers the gateway will route tool calls to</p>

        {mcpEndpoints.length > 0 && (
          <div className="bg-gray-900 border border-gray-700 rounded-xl overflow-hidden">
            {mcpEndpoints.map((ep, i) => (
              <div key={i} className="flex items-center justify-between px-4 py-3 border-b border-gray-800 last:border-0">
                <div>
                  <span className="text-gray-200 text-sm font-medium">{ep.name}</span>
                  <span className="text-gray-500 text-xs ml-2 font-mono">{ep.url}</span>
                </div>
                <button
                  type="button"
                  onClick={() => setMcpEndpoints(s => s.filter((_, j) => j !== i))}
                  className="text-xs text-red-500 hover:text-red-400 transition-colors"
                >
                  Remove
                </button>
              </div>
            ))}
          </div>
        )}

        {showAddEndpoint ? (
          <div className="bg-gray-900 border border-gray-700 rounded-xl p-4 space-y-3">
            <div className="grid grid-cols-2 gap-3">
              <div>
                <label className={labelCls}>Name</label>
                <input type="text" value={endpointName} onChange={e => setEndpointName(e.target.value)} placeholder="my-tools-server" className={inputCls} />
              </div>
              <div>
                <label className={labelCls}>URL</label>
                <input type="url" value={endpointUrl} onChange={e => setEndpointUrl(e.target.value)} placeholder="https://tools.example.com/mcp" className={inputCls} />
              </div>
            </div>
            <div>
              <label className={labelCls}>Auth (optional)</label>
              <input type="text" value={endpointAuth} onChange={e => setEndpointAuth(e.target.value)} placeholder="Bearer sk-..." className={inputCls} />
            </div>
            <div className="flex gap-3">
              <button type="button" onClick={addEndpoint} className="px-3 py-1.5 text-sm bg-indigo-600 hover:bg-indigo-500 text-white rounded-lg transition-colors">Add</button>
              <button type="button" onClick={() => { setShowAddEndpoint(false); setEndpointName(''); setEndpointUrl(''); setEndpointAuth(''); }} className="text-sm text-gray-400 hover:text-gray-200 transition-colors">Cancel</button>
            </div>
          </div>
        ) : (
          <button type="button" onClick={() => setShowAddEndpoint(true)} className="text-sm text-indigo-400 hover:text-indigo-300 transition-colors">
            + Add Endpoint
          </button>
        )}

        <div className="flex items-center gap-3">
          <span className="text-xs text-gray-400 whitespace-nowrap">When request also has tools:</span>
          <select
            value={mergePolicies.mcp_endpoints}
            onChange={e => setMergePolicies(p => ({ ...p, mcp_endpoints: e.target.value as AgentMergePolicies['mcp_endpoints'] }))}
            className={selectCls}
          >
            <option value="merge">Merge</option>
            <option value="overwrite">Overwrite</option>
            <option value="ignore">Ignore</option>
          </select>
        </div>
      </section>

      {/* Available Models */}
      <section className="space-y-3">
        <ModelListEditor
          models={availableModels}
          onChange={setAvailableModels}
          defaultModels={COMMON_MODELS}
          label="Available Models"
        />
      </section>

      {/* Conversations & Memory */}
      <section className="space-y-4">
        <h3 className="text-sm font-semibold text-gray-300 uppercase tracking-wide">Conversations &amp; Memory</h3>
        <div className="flex items-center justify-between">
          <div>
            <span className="text-sm text-gray-200">Enable conversations</span>
            <p className="text-xs text-gray-500 mt-0.5">Store and resume conversation history for this agent</p>
          </div>
          <button
            type="button"
            role="switch"
            aria-checked={conversationsEnabled}
            onClick={() => setConversationsEnabled(v => !v)}
            className={`relative inline-flex h-6 w-11 items-center rounded-full transition-colors focus:outline-none focus:ring-2 focus:ring-indigo-500 focus:ring-offset-2 focus:ring-offset-gray-950 ${conversationsEnabled ? 'bg-indigo-600' : 'bg-gray-700'}`}
          >
            <span
              className={`inline-block h-4 w-4 transform rounded-full bg-white transition-transform ${conversationsEnabled ? 'translate-x-6' : 'translate-x-1'}`}
            />
          </button>
        </div>
        {conversationsEnabled && (
          <>
            <div>
              <label className={labelCls}>Memory threshold (tokens)</label>
              <input
                type="number"
                value={conversationTokenLimit}
                onChange={e => setConversationTokenLimit(Number(e.target.value))}
                min={100}
                step={100}
                className={inputCls}
              />
              <p className="text-xs text-gray-500 mt-1">When conversation history exceeds this token estimate, it will be automatically summarized.</p>
            </div>
            <div>
              <label className={labelCls}>Summary model (optional)</label>
              <input
                type="text"
                value={conversationSummaryModel}
                onChange={e => setConversationSummaryModel(e.target.value)}
                placeholder="Uses request model if not set"
                className={inputCls}
              />
              <p className="text-xs text-gray-500 mt-1">Model used to generate conversation summaries. Defaults to the request model.</p>
            </div>
          </>
        )}
      </section>

      {/* Inherited Values — only show when editing */}
      {agent && (
        <section>
          <button
            type="button"
            onClick={handleShowResolved}
            className="text-sm text-gray-400 hover:text-gray-200 transition-colors"
          >
            {showResolved ? '▾' : '▸'} View inherited config
          </button>
          {showResolved && (
            <div className="mt-3 bg-gray-900 border border-gray-700 rounded-xl p-4 space-y-3 text-sm">
              {loadingResolved ? (
                <p className="text-gray-500 animate-pulse">Loading…</p>
              ) : resolved ? (
                <>
                  {resolved.inheritanceChain.length > 0 && (
                    <div>
                      <span className="text-xs text-gray-500 uppercase tracking-wide">Inheritance chain</span>
                      <div className="mt-1 flex gap-2 flex-wrap">
                        {resolved.inheritanceChain.map((c, i) => (
                          <span key={i} className="text-xs bg-gray-800 px-2 py-0.5 rounded text-gray-300">
                            {c.level}: {c.name}
                          </span>
                        ))}
                      </div>
                    </div>
                  )}
                  <div className="grid grid-cols-2 gap-4 text-xs text-gray-400">
                    <div>
                      <span className="text-gray-500 uppercase tracking-wide block mb-1">Effective provider</span>
                      <span className="text-gray-300">{resolved.providerConfig ? JSON.stringify(resolved.providerConfig) : '—'}</span>
                    </div>
                    <div>
                      <span className="text-gray-500 uppercase tracking-wide block mb-1">Total skills</span>
                      <span className="text-gray-300">{resolved.skills.length}</span>
                    </div>
                    <div>
                      <span className="text-gray-500 uppercase tracking-wide block mb-1">Total MCP endpoints</span>
                      <span className="text-gray-300">{resolved.mcpEndpoints.length}</span>
                    </div>
                    <div>
                      <span className="text-gray-500 uppercase tracking-wide block mb-1">Effective system prompt</span>
                      <span className="text-gray-300 line-clamp-2">{resolved.systemPrompt ?? '—'}</span>
                    </div>
                  </div>
                </>
              ) : null}
            </div>
          )}
        </section>
      )}

      {/* Actions */}
      <div className="flex gap-3 pt-2 border-t border-gray-800">
        <button
          type="submit"
          disabled={saving || !name.trim()}
          className="px-4 py-2 text-sm bg-indigo-600 hover:bg-indigo-500 disabled:opacity-50 text-white rounded-lg transition-colors"
        >
          {saving ? 'Saving…' : agent ? 'Save changes' : 'Create agent'}
        </button>
        <button
          type="button"
          onClick={onCancel}
          className="px-4 py-2 text-sm text-gray-400 hover:text-gray-200 transition-colors"
        >
          Cancel
        </button>
      </div>
    </form>
  );
}
