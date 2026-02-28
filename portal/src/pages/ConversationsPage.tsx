import { useState, useEffect, useCallback } from 'react';
import { api } from '../lib/api';
import type { Partition, Conversation, ConversationDetail } from '../lib/api';
import { getToken } from '../lib/auth';

function timeAgo(date: string): string {
  const seconds = (Date.now() - new Date(date).getTime()) / 1000;
  if (seconds < 60) return 'just now';
  if (seconds < 3600) return `${Math.floor(seconds / 60)} mins ago`;
  if (seconds < 86400) return `${Math.floor(seconds / 3600)} hours ago`;
  return `${Math.floor(seconds / 86400)} days ago`;
}

interface PartitionNodeProps {
  partition: Partition;
  depth: number;
  selectedId: string | null;
  onSelect: (id: string | null) => void;
}

function PartitionNode({ partition, depth, selectedId, onSelect }: PartitionNodeProps) {
  const [expanded, setExpanded] = useState(false);
  const hasChildren = (partition.children ?? []).length > 0;
  const isSelected = selectedId === partition.id;

  return (
    <div>
      <button
        type="button"
        onClick={() => {
          onSelect(isSelected ? null : partition.id);
          if (hasChildren) setExpanded(v => !v);
        }}
        className={`w-full flex items-center gap-1.5 px-3 py-1.5 text-left text-sm rounded-lg transition-colors ${
          isSelected ? 'bg-indigo-600 text-white' : 'text-gray-300 hover:bg-gray-800 hover:text-gray-100'
        }`}
        style={{ paddingLeft: `${12 + depth * 16}px` }}
      >
        {hasChildren && (
          <span className="text-xs shrink-0">{expanded ? '▾' : '▸'}</span>
        )}
        {!hasChildren && <span className="w-3 shrink-0" />}
        <span className="truncate font-mono text-xs">{partition.title ?? partition.external_id}</span>
      </button>
      {expanded && hasChildren && (
        <div>
          {(partition.children ?? []).map(child => (
            <PartitionNode
              key={child.id}
              partition={child}
              depth={depth + 1}
              selectedId={selectedId}
              onSelect={onSelect}
            />
          ))}
        </div>
      )}
    </div>
  );
}

export default function ConversationsPage() {
  const [partitions, setPartitions] = useState<Partition[]>([]);
  const [loadingPartitions, setLoadingPartitions] = useState(true);
  const [selectedPartitionId, setSelectedPartitionId] = useState<string | null>(null);

  const [conversations, setConversations] = useState<Conversation[]>([]);
  const [loadingConversations, setLoadingConversations] = useState(false);
  const [nextOffset, setNextOffset] = useState<number>(0);
  const [hasMore, setHasMore] = useState(false);
  const [loadingMore, setLoadingMore] = useState(false);

  const [selectedConversation, setSelectedConversation] = useState<ConversationDetail | null>(null);
  const [loadingDetail, setLoadingDetail] = useState(false);

  const [error, setError] = useState('');

  const buildTree = useCallback((flat: Partition[]): Partition[] => {
    const map = new Map<string, Partition>();
    flat.forEach(p => map.set(p.id, { ...p, children: [] }));
    const roots: Partition[] = [];
    map.forEach(p => {
      if (p.parent_id && map.has(p.parent_id)) {
        map.get(p.parent_id)!.children!.push(p);
      } else {
        roots.push(p);
      }
    });
    return roots;
  }, []);

  const fetchPartitions = useCallback(async () => {
    const token = getToken();
    if (!token) return;
    setLoadingPartitions(true);
    try {
      const { partitions: flat } = await api.getPartitions(token);
      setPartitions(buildTree(flat));
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Failed to load partitions');
    } finally {
      setLoadingPartitions(false);
    }
  }, [buildTree]);

  const fetchConversations = useCallback(async (partitionId: string | null, append = false) => {
    const token = getToken();
    if (!token) return;
    if (append) setLoadingMore(true); else setLoadingConversations(true);
    try {
      const { conversations: data } = await api.getConversations(token, partitionId ?? undefined);
      setConversations(prev => append ? [...prev, ...data] : data);
      // Simple pagination: if full page returned, assume more exist
      setHasMore(data.length === 50);
      setNextOffset(append ? nextOffset + data.length : data.length);
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Failed to load conversations');
    } finally {
      if (append) setLoadingMore(false); else setLoadingConversations(false);
    }
  }, [nextOffset]);

  const fetchConversationDetail = useCallback(async (id: string) => {
    const token = getToken();
    if (!token) return;
    setLoadingDetail(true);
    try {
      const { conversation } = await api.getConversation(token, id);
      setSelectedConversation(conversation);
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Failed to load conversation');
    } finally {
      setLoadingDetail(false);
    }
  }, []);

  useEffect(() => { fetchPartitions(); }, [fetchPartitions]);

  useEffect(() => {
    setSelectedConversation(null);
    setNextOffset(0);
    fetchConversations(selectedPartitionId);
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [selectedPartitionId]);

  function handleSelectPartition(id: string | null) {
    setSelectedPartitionId(id);
  }

  function handleSelectConversation(conv: Conversation) {
    if (selectedConversation?.id === conv.id) {
      setSelectedConversation(null);
    } else {
      fetchConversationDetail(conv.id);
    }
  }

  // Find snapshot positions for a conversation detail
  function getSnapshotSet(detail: ConversationDetail): Set<string> {
    if (!detail.snapshots?.length) return new Set();
    // Snapshots mark a boundary — show indicator before the message at snapshot boundary
    return new Set(detail.snapshots.map(s => s.id));
  }

  return (
    <div className="flex flex-col h-full">
      {/* Header */}
      <div className="px-8 py-6 border-b border-gray-800 flex items-center justify-between shrink-0">
        <div>
          <h1 className="text-2xl font-bold text-white">Conversations</h1>
          <p className="text-gray-400 text-sm mt-1">Browse agent conversation history</p>
        </div>
        <button
          onClick={() => {
            fetchPartitions();
            fetchConversations(selectedPartitionId);
          }}
          className="px-3 py-1.5 text-sm bg-gray-800 hover:bg-gray-700 border border-gray-600 text-gray-300 rounded-lg transition-colors"
          aria-label="Refresh"
        >
          ↻ Refresh
        </button>
      </div>

      {error && (
        <div className="mx-8 mt-4 bg-red-950/30 border border-red-800 rounded-lg px-4 py-3 text-red-400 text-sm flex items-center justify-between">
          {error}
          <button type="button" onClick={() => setError('')} className="text-red-600 hover:text-red-400 ml-3">✕</button>
        </div>
      )}

      {/* Body */}
      <div className="flex flex-1 min-h-0">
        {/* Partition tree */}
        <aside className="w-56 shrink-0 border-r border-gray-800 flex flex-col overflow-y-auto">
          <div className="px-3 pt-4 pb-2">
            <span className="text-xs uppercase tracking-wide text-gray-500 font-medium px-3">Partitions</span>
          </div>
          <div className="flex-1 px-1 pb-4 space-y-0.5">
            {/* "All" option */}
            <button
              type="button"
              onClick={() => handleSelectPartition(null)}
              className={`w-full flex items-center gap-2 px-3 py-1.5 text-left text-sm rounded-lg transition-colors ${
                selectedPartitionId === null ? 'bg-indigo-600 text-white' : 'text-gray-400 hover:bg-gray-800 hover:text-gray-100'
              }`}
            >
              <span className="w-3 shrink-0" />
              <span className="text-xs">All</span>
            </button>

            {loadingPartitions ? (
              <div className="px-3 py-4 space-y-2">
                {Array.from({ length: 4 }, (_, i) => (
                  <div key={i} className="h-4 bg-gray-800 rounded animate-pulse" />
                ))}
              </div>
            ) : partitions.length === 0 ? (
              <p className="px-3 py-4 text-xs text-gray-600">No partitions yet</p>
            ) : (
              partitions.map(p => (
                <PartitionNode
                  key={p.id}
                  partition={p}
                  depth={0}
                  selectedId={selectedPartitionId}
                  onSelect={handleSelectPartition}
                />
              ))
            )}
          </div>
        </aside>

        {/* Main panel */}
        <div className="flex-1 flex flex-col min-w-0 overflow-y-auto">
          {/* Conversation list */}
          <div className="flex-1">
            <div className="bg-gray-900 border-b border-gray-800 overflow-x-auto">
              <table className="w-full text-sm">
                <thead>
                  <tr className="border-b border-gray-700 text-left">
                    <th className="px-4 py-3 text-xs uppercase tracking-wide text-gray-500 font-medium">External ID</th>
                    <th className="px-4 py-3 text-xs uppercase tracking-wide text-gray-500 font-medium">Last Active</th>
                    <th className="px-4 py-3 text-xs uppercase tracking-wide text-gray-500 font-medium text-right">Messages</th>
                  </tr>
                </thead>
                <tbody>
                  {loadingConversations ? (
                    Array.from({ length: 5 }, (_, i) => (
                      <tr key={i} className="border-b border-gray-800 animate-pulse">
                        {Array.from({ length: 3 }, (_, j) => (
                          <td key={j} className="px-4 py-3">
                            <div className="h-4 bg-gray-800 rounded w-3/4" />
                          </td>
                        ))}
                      </tr>
                    ))
                  ) : conversations.length === 0 ? (
                    <tr>
                      <td colSpan={3} className="px-4 py-12 text-center text-gray-500">
                        No conversations yet
                      </td>
                    </tr>
                  ) : (
                    conversations.map(conv => (
                      <tr
                        key={conv.id}
                        className={`border-b border-gray-800 cursor-pointer transition-colors ${
                          selectedConversation?.id === conv.id
                            ? 'bg-indigo-950/40'
                            : 'hover:bg-gray-800'
                        }`}
                        onClick={() => handleSelectConversation(conv)}
                        tabIndex={0}
                        onKeyDown={e => e.key === 'Enter' && handleSelectConversation(conv)}
                        role="button"
                        aria-label={`View conversation ${conv.external_id}`}
                      >
                        <td className="px-4 py-3 text-gray-200 font-mono text-xs">{conv.external_id}</td>
                        <td className="px-4 py-3 text-gray-400 text-xs">{timeAgo(conv.last_active_at)}</td>
                        <td className="px-4 py-3 text-gray-400 text-xs text-right tabular-nums">
                          {conv.message_count ?? '—'}
                        </td>
                      </tr>
                    ))
                  )}
                </tbody>
              </table>
            </div>

            {hasMore && (
              <div className="px-4 py-3 border-b border-gray-800 text-center bg-gray-900">
                <button
                  onClick={() => fetchConversations(selectedPartitionId, true)}
                  disabled={loadingMore}
                  className="px-4 py-2 bg-gray-800 hover:bg-gray-700 disabled:opacity-50 border border-gray-600 text-sm text-gray-300 rounded-lg transition-colors"
                >
                  {loadingMore ? 'Loading…' : 'Load more'}
                </button>
              </div>
            )}
          </div>

          {/* Message thread */}
          {selectedConversation || loadingDetail ? (
            <div className="border-t border-gray-700 bg-gray-950">
              <div className="px-6 py-3 border-b border-gray-800 flex items-center justify-between">
                <h2 className="text-sm font-semibold text-gray-300">
                  {loadingDetail ? 'Loading messages…' : `Thread — ${selectedConversation?.external_id}`}
                </h2>
                <button
                  type="button"
                  onClick={() => setSelectedConversation(null)}
                  className="text-gray-500 hover:text-gray-300 text-sm"
                  aria-label="Close thread"
                >
                  ✕
                </button>
              </div>
              <div className="px-6 py-4 space-y-3 max-h-96 overflow-y-auto">
                {loadingDetail ? (
                  <div className="space-y-3">
                    {Array.from({ length: 4 }, (_, i) => (
                      <div key={i} className={`flex ${i % 2 === 0 ? 'justify-start' : 'justify-end'}`}>
                        <div className="h-12 w-64 bg-gray-800 rounded-xl animate-pulse" />
                      </div>
                    ))}
                  </div>
                ) : selectedConversation && selectedConversation.messages.length === 0 ? (
                  <p className="text-gray-500 text-sm text-center py-6">No messages in this conversation</p>
                ) : selectedConversation ? (() => {
                  const snapshotSet = getSnapshotSet(selectedConversation);
                  let snapshotShown = false;
                  return selectedConversation.messages.map((msg, idx) => {
                    // Show summary checkpoint before first message after a snapshot boundary
                    // Since we don't have per-message snapshot linkage, show it once in middle if snapshots exist
                    const showCheckpoint = !snapshotShown && idx > 0 && snapshotSet.size > 0 && idx === Math.floor(selectedConversation.messages.length / 2);
                    if (showCheckpoint) snapshotShown = true;
                    return (
                      <div key={msg.id}>
                        {showCheckpoint && (
                          <div className="flex items-center gap-3 my-2">
                            <div className="flex-1 border-t border-dashed border-gray-700" />
                            <span className="text-xs text-gray-500 bg-gray-900 px-2 py-0.5 rounded-full border border-gray-700">
                              📝 Summary checkpoint
                            </span>
                            <div className="flex-1 border-t border-dashed border-gray-700" />
                          </div>
                        )}
                        <div className={`flex ${msg.role === 'user' ? 'justify-end' : 'justify-start'}`}>
                          <div
                            className={`max-w-xl px-4 py-2.5 rounded-2xl text-sm whitespace-pre-wrap break-words ${
                              msg.role === 'user'
                                ? 'bg-indigo-600 text-white rounded-br-sm'
                                : 'bg-gray-800 text-gray-100 rounded-bl-sm'
                            }`}
                          >
                            <div className={`text-xs mb-1 font-medium ${msg.role === 'user' ? 'text-indigo-200' : 'text-gray-400'}`}>
                              {msg.role}
                            </div>
                            {msg.content}
                            {msg.token_estimate != null && (
                              <div className={`text-xs mt-1 ${msg.role === 'user' ? 'text-indigo-300' : 'text-gray-500'}`}>
                                ~{msg.token_estimate} tokens
                              </div>
                            )}
                          </div>
                        </div>
                      </div>
                    );
                  });
                })() : null}
              </div>
            </div>
          ) : conversations.length > 0 ? (
            <div className="border-t border-gray-800 px-6 py-8 text-center text-gray-500 text-sm bg-gray-950">
              Select a conversation to view messages
            </div>
          ) : null}
        </div>
      </div>
    </div>
  );
}
