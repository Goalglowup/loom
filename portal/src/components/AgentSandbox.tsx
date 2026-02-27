import { useState, useRef, useEffect } from 'react';
import { api } from '../lib/api';
import type { Agent } from '../lib/api';
import { getToken } from '../lib/auth';

interface Message {
  role: 'user' | 'assistant';
  content: string;
  usage?: { total_tokens: number };
}

const COMMON_MODELS = [
  'gpt-4o-mini',
  'gpt-4o',
  'gpt-4-turbo',
  'gpt-3.5-turbo',
  'claude-3-5-sonnet-latest',
  'claude-3-haiku-20240307',
  'ollama/llama3',
];

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
  const [customModel, setCustomModel] = useState('');
  const [useCustom, setUseCustom] = useState(false);
  const scrollRef = useRef<HTMLDivElement>(null);
  const token = getToken()!;

  const activeModel = useCustom ? customModel.trim() || 'gpt-4o-mini' : model;

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
      const res = await api.sandboxChat(token, agent.id, next.map(m => ({ role: m.role, content: m.content })), activeModel);
      setMessages(prev => [
        ...prev,
        { role: 'assistant', content: res.message.content, usage: res.usage },
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
          {useCustom ? (
            <input
              type="text"
              value={customModel}
              onChange={e => setCustomModel(e.target.value)}
              placeholder="e.g. gpt-4o"
              className="bg-gray-800 border border-gray-700 rounded px-2 py-1 text-xs text-gray-200 focus:outline-none focus:border-indigo-500 w-40"
            />
          ) : (
            <select
              value={model}
              onChange={e => setModel(e.target.value)}
              className="bg-gray-800 border border-gray-700 rounded px-2 py-1 text-xs text-gray-200 focus:outline-none focus:border-indigo-500"
            >
              {COMMON_MODELS.map(m => (
                <option key={m} value={m}>{m}</option>
              ))}
            </select>
          )}
          <button
            onClick={() => setUseCustom(v => !v)}
            className="text-xs text-gray-500 hover:text-gray-300 transition-colors shrink-0"
            title={useCustom ? 'Pick from list' : 'Enter custom model'}
          >
            {useCustom ? '← list' : 'custom'}
          </button>
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
                  {msg.content}
                </div>
                {msg.usage && (
                  <span className="text-xs text-gray-500 px-1">
                    {msg.usage.total_tokens} tokens
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
