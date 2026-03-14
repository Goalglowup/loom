import { useState, useRef, useEffect } from 'react';
import Markdown from 'react-markdown';
import type { ArachneChatProps, ChatMessage, RagSource } from './types.js';
import { sendChatCompletion } from './client.js';
import ModelPicker from './ModelPicker.js';

export function ArachneChat({
  apiKey,
  baseUrl = '',
  model: initialModel = 'gpt-4o-mini',
  models = [],
  title = 'Chat',
  memory = false,
  conversationId: initialConversationId,
  partitionId,
  showModelPicker = true,
  showUsage = true,
  showSources = true,
  placeholder = 'Type a message…',
  className,
  onMessage,
  onError,
}: ArachneChatProps) {
  const [messages, setMessages] = useState<ChatMessage[]>([]);
  const [input, setInput] = useState('');
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState('');
  const [model, setModel] = useState(initialModel);
  const [conversationId, setConversationId] = useState<string | null>(
    initialConversationId ?? null,
  );
  const scrollRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    if (scrollRef.current) {
      scrollRef.current.scrollTop = scrollRef.current.scrollHeight;
    }
  }, [messages, loading]);

  async function handleSend() {
    const content = input.trim();
    if (!content || loading) return;

    const userMessage: ChatMessage = { role: 'user', content };
    const next = [...messages, userMessage];
    setMessages(next);
    setInput('');
    setLoading(true);
    setError('');

    try {
      const startMs = Date.now();
      const res = await sendChatCompletion(baseUrl, apiKey, {
        model,
        messages: next.map(m => ({ role: m.role, content: m.content })),
        stream: false,
        ...(memory && conversationId ? { conversation_id: conversationId } : {}),
        ...(partitionId ? { partition_id: partitionId } : {}),
      });
      const latencyMs = Date.now() - startMs;

      const choice = res.choices?.[0];
      if (!choice) throw new Error('No response from model');

      const reasoning =
        choice.message.reasoning_content ?? choice.message.reasoning ?? undefined;

      const assistantMessage: ChatMessage = {
        role: 'assistant',
        content: choice.message.content,
        usage: res.usage,
        latencyMs,
        reasoning,
        ragSources: res.rag_sources,
      };

      setMessages(prev => [...prev, assistantMessage]);
      onMessage?.(assistantMessage);

      if (memory && res.conversation_id && !conversationId) {
        setConversationId(res.conversation_id);
      }
    } catch (err) {
      const msg = err instanceof Error ? err.message : 'Request failed';
      setError(msg);
      onError?.(msg);
    } finally {
      setLoading(false);
    }
  }

  function handleKeyDown(e: React.KeyboardEvent) {
    if (e.key === 'Enter' && !e.shiftKey) {
      e.preventDefault();
      handleSend();
    }
  }

  function handleClear() {
    setMessages([]);
    setConversationId(initialConversationId ?? null);
  }

  return (
    <div className={`arachne-chat ${className ?? ''}`}>
      {/* Header */}
      <div className="arachne-chat-header">
        <div className="arachne-chat-header-row">
          <span className="arachne-chat-title">{title}</span>
          <div className="arachne-chat-controls">
            {showModelPicker && (
              <ModelPicker
                value={model}
                onChange={setModel}
                options={models}
                disabled={loading}
              />
            )}
            {messages.length > 0 && (
              <button
                onClick={handleClear}
                disabled={loading}
                className="arachne-chat-clear-btn"
                title="Clear conversation"
              >
                Clear
              </button>
            )}
          </div>
        </div>
        {memory && conversationId && (
          <div className="arachne-chat-conversation-id">
            {conversationId.substring(0, 8)}…
          </div>
        )}
      </div>

      {/* Messages */}
      <div ref={scrollRef} className="arachne-chat-messages">
        {messages.length === 0 && !loading ? (
          <p className="arachne-chat-empty">{placeholder}</p>
        ) : (
          messages.map((msg, i) => (
            <div
              key={i}
              className={`arachne-chat-bubble-row ${msg.role === 'user' ? 'user' : 'assistant'}`}
            >
              <div className="arachne-chat-bubble-wrapper">
                <div className={`arachne-chat-bubble ${msg.role}`}>
                  {msg.reasoning && (
                    <details className="arachne-chat-reasoning">
                      <summary>Reasoning</summary>
                      <p>{msg.reasoning}</p>
                    </details>
                  )}
                  {msg.role === 'assistant' ? (
                    <div className="arachne-chat-markdown">
                      <Markdown>{msg.content}</Markdown>
                    </div>
                  ) : (
                    msg.content
                  )}
                </div>

                {showSources && msg.ragSources && msg.ragSources.length > 0 && (
                  <details className="arachne-chat-sources">
                    <summary>Sources ({msg.ragSources.length})</summary>
                    <div className="arachne-chat-sources-list">
                      {msg.ragSources.map((src: RagSource) => (
                        <div key={src.rank} className="arachne-chat-source">
                          <span className="arachne-chat-source-rank">[{src.rank}]</span>
                          {src.sourcePath && (
                            <span className="arachne-chat-source-path">{src.sourcePath}</span>
                          )}
                          <span className="arachne-chat-source-score">
                            ({(src.similarityScore * 100).toFixed(1)}%)
                          </span>
                          <p className="arachne-chat-source-preview">{src.contentPreview}</p>
                        </div>
                      ))}
                    </div>
                  </details>
                )}

                {showUsage && msg.usage && (
                  <div className="arachne-chat-usage">
                    <span title="Prompt tokens">{msg.usage.prompt_tokens} in</span>
                    <span title="Completion tokens">{msg.usage.completion_tokens} out</span>
                    {msg.latencyMs !== undefined && (
                      <span title="Latency">{msg.latencyMs}ms</span>
                    )}
                  </div>
                )}
              </div>
            </div>
          ))
        )}
        {loading && (
          <div className="arachne-chat-bubble-row assistant">
            <div className="arachne-chat-bubble assistant arachne-chat-loading">
              thinking…
            </div>
          </div>
        )}
      </div>

      {/* Error */}
      {error && (
        <div className="arachne-chat-error">
          {error}
          <button onClick={() => setError('')}>×</button>
        </div>
      )}

      {/* Input */}
      <div className="arachne-chat-input-row">
        <input
          type="text"
          value={input}
          onChange={e => setInput(e.target.value)}
          onKeyDown={handleKeyDown}
          disabled={loading}
          placeholder={placeholder}
          className="arachne-chat-input"
        />
        <button
          onClick={handleSend}
          disabled={loading || !input.trim()}
          className="arachne-chat-send-btn"
        >
          Send
        </button>
      </div>
    </div>
  );
}
