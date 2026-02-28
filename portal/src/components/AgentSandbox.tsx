import { useState, useRef, useEffect } from 'react';
import { api } from '../lib/api';
import type { Agent } from '../lib/api';
import { getToken } from '../lib/auth';
import { COMMON_MODELS } from '../lib/models';
import ModelCombobox from './ModelCombobox';

interface Message {
  role: 'user' | 'assistant';
  content: string;
  reasoning?: string;
  usage?: { prompt_tokens: number; completion_tokens: number; total_tokens: number };
  latencyMs?: number;
}

interface AgentSandboxProps {
  agent: Agent;
  onClose?: () => void;
}

export default function AgentSandbox({ agent, onClose }: AgentSandboxProps) {
  const [messages, setMessages] = useState<Message[]>([]);
  const [input, setInput] = useState('');
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState('');
  const [model, setModel] = useState('gpt-4o-mini');
  const scrollRef = useRef<HTMLDivElement>(null);
  const token = getToken()!;

  const modelOptions = (agent.availableModels && agent.availableModels.length > 0)
    ? agent.availableModels
    : COMMON_MODELS;

  const activeModel = model || 'gpt-4o-mini';

  useEffect(() => {
    if (scrollRef.current) {
      scrollRef.current.scrollTop = scrollRef.current.scrollHeight;
    }
  }, [messages, loading]);

  async function handleSend() {
    const content = input.trim();
    if (!content || loading) return;

    const userMessage: Message = { role: 'user', content };
    const next = [...messages, userMessage];
    setMessages(next);
    setInput('');
    setLoading(true);
    setError('');

    try {
      const startMs = Date.now();
      const res = await api.sandboxChat(token, agent.id, next.map(m => ({ role: m.role, content: m.content })), activeModel);
      const latencyMs = Date.now() - startMs;
      const reasoning = (res.message as any).reasoning_content ?? (res.message as any).reasoning ?? undefined;
      setMessages(prev => [
        ...prev,
        { role: 'assistant', content: res.message.content, usage: res.usage, latencyMs, reasoning },
      ]);
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Request failed');
    } finally {
      setLoading(false);
    }
  }

  function handleKeyDown(e: React.KeyboardEvent<HTMLInputElement>) {
    if (e.key === 'Enter' && !e.shiftKey) {
      e.preventDefault();
      handleSend();
    }
  }

  return (
    <div className="bg-gray-900 border border-gray-700 rounded-xl overflow-hidden">
      {/* Header */}
      <div className="flex items-center justify-between px-4 py-3 border-b border-gray-700 gap-3 flex-wrap">
        <span className="text-sm font-semibold text-gray-100 shrink-0">
          Sandbox — <span className="text-indigo-400">{agent.name}</span>
        </span>
        <div className="flex items-center gap-2 flex-1 min-w-0 justify-end">
          <ModelCombobox
            value={model}
            onChange={setModel}
            options={modelOptions}
            placeholder="e.g. gpt-4o"
            disabled={loading}
          />
        </div>
        {onClose && (
          <button
            onClick={onClose}
            className="text-gray-500 hover:text-gray-300 text-sm transition-colors shrink-0"
            aria-label="Close sandbox"
          >
            ✕
          </button>
        )}
      </div>

      {/* Message list */}
      <div
        ref={scrollRef}
        className="max-h-80 overflow-y-auto px-4 py-4 space-y-3"
      >
        {messages.length === 0 && !loading ? (
          <p className="text-gray-500 text-sm italic text-center py-6">
            Say something to test this agent…
          </p>
        ) : (
          messages.map((msg, i) => (
            <div key={i} className={`flex ${msg.role === 'user' ? 'justify-end' : 'justify-start'}`}>
              <div className={`max-w-[75%] ${msg.role === 'user' ? 'items-end' : 'items-start'} flex flex-col gap-1`}>
                <div
                  className={`px-3 py-2 rounded-xl text-sm leading-relaxed ${
                    msg.role === 'user'
                      ? 'bg-indigo-600 text-white'
                      : 'bg-gray-800 text-gray-100'
                  }`}
                >
                  {msg.reasoning && (
                    <details className="mb-2 text-xs text-gray-400">
                      <summary className="cursor-pointer select-none text-indigo-400 hover:text-indigo-300">
                        Reasoning
                      </summary>
                      <p className="mt-1 whitespace-pre-wrap leading-relaxed">{msg.reasoning}</p>
                    </details>
                  )}
                  {msg.content}
                </div>
                {msg.usage && (
                  <span className="text-xs text-gray-500 px-1 flex gap-2 flex-wrap">
                    <span title="Prompt tokens">↑{msg.usage.prompt_tokens}</span>
                    <span title="Completion tokens">↓{msg.usage.completion_tokens}</span>
                    <span title="Total tokens">∑{msg.usage.total_tokens}</span>
                    {msg.latencyMs !== undefined && (
                      <span title="Response latency">{msg.latencyMs}ms</span>
                    )}
                  </span>
                )}
              </div>
            </div>
          ))
        )}
        {loading && (
          <div className="flex justify-start">
            <div className="bg-gray-800 text-gray-400 text-sm px-3 py-2 rounded-xl animate-pulse">
              thinking…
            </div>
          </div>
        )}
      </div>

      {/* Error */}
      {error && (
        <div className="mx-4 mb-2 bg-red-950/30 border border-red-800 rounded-lg px-3 py-2 text-red-400 text-xs flex items-center justify-between">
          {error}
          <button onClick={() => setError('')} className="ml-2 text-red-600 hover:text-red-400">✕</button>
        </div>
      )}

      {/* Input row */}
      <div className="px-4 pb-4 flex gap-2">
        <input
          type="text"
          value={input}
          onChange={e => setInput(e.target.value)}
          onKeyDown={handleKeyDown}
          disabled={loading}
          placeholder="Type a message…"
          className="flex-1 bg-gray-800 border border-gray-700 rounded-lg px-3 py-2 text-sm text-gray-100 placeholder-gray-500 focus:outline-none focus:border-indigo-500 disabled:opacity-50"
        />
        <button
          onClick={handleSend}
          disabled={loading || !input.trim()}
          className="bg-indigo-600 hover:bg-indigo-500 disabled:opacity-40 text-white text-sm px-4 py-2 rounded-lg transition-colors"
        >
          Send
        </button>
      </div>
    </div>
  );
}
