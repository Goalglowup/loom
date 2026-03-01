import { render, screen, waitFor } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { MemoryRouter } from 'react-router-dom';
import { describe, it, expect, vi, beforeEach } from 'vitest';
import ConversationsPage from '../ConversationsPage';

vi.mock('../../lib/api', () => ({
  api: {
    getPartitions: vi.fn(),
    getConversations: vi.fn(),
    getConversation: vi.fn(),
  },
}));

vi.mock('../../lib/auth', () => ({
  getToken: vi.fn(),
}));

import { api } from '../../lib/api';
import { getToken } from '../../lib/auth';

const mockPartitions = [
  { id: 'p1', external_id: 'partition-1', title: 'Support', parent_id: null, children: [] },
  { id: 'p2', external_id: 'partition-2', title: 'Sales', parent_id: null, children: [] },
];

const mockConversations = [
  { id: 'c1', external_id: 'conv-1', last_active_at: '2024-01-01T12:00:00Z', message_count: 5 },
  { id: 'c2', external_id: 'conv-2', last_active_at: '2024-01-02T12:00:00Z', message_count: 3 },
];

const mockConversationDetail = {
  id: 'c1',
  external_id: 'conv-1',
  last_active_at: '2024-01-01T12:00:00Z',
  messages: [
    { id: 'm1', role: 'user', content: 'Hello', token_estimate: 10 },
    { id: 'm2', role: 'assistant', content: 'Hi there', token_estimate: 15 },
  ],
  snapshots: [],
};

function renderPage() {
  return render(
    <MemoryRouter>
      <ConversationsPage />
    </MemoryRouter>
  );
}

describe('ConversationsPage', () => {
  beforeEach(() => {
    vi.resetAllMocks();
    vi.mocked(getToken).mockReturnValue('tok');
  });

  it('shows loading state for partitions initially', () => {
    vi.mocked(api.getPartitions).mockImplementation(() => new Promise(() => {}));
    vi.mocked(api.getConversations).mockResolvedValue({ conversations: [] });
    renderPage();
    expect(screen.getByText('Conversations')).toBeInTheDocument();
  });

  it('renders partition list on success', async () => {
    vi.mocked(api.getPartitions).mockResolvedValue({ partitions: mockPartitions });
    vi.mocked(api.getConversations).mockResolvedValue({ conversations: [] });
    renderPage();
    await waitFor(() => expect(screen.getByText('Support')).toBeInTheDocument());
    expect(screen.getByText('Sales')).toBeInTheDocument();
  });

  it('renders conversations list on success', async () => {
    vi.mocked(api.getPartitions).mockResolvedValue({ partitions: [] });
    vi.mocked(api.getConversations).mockResolvedValue({ conversations: mockConversations });
    renderPage();
    await waitFor(() => expect(screen.getByText('conv-1')).toBeInTheDocument());
    expect(screen.getByText('conv-2')).toBeInTheDocument();
  });

  it('shows empty state when no conversations', async () => {
    vi.mocked(api.getPartitions).mockResolvedValue({ partitions: [] });
    vi.mocked(api.getConversations).mockResolvedValue({ conversations: [] });
    renderPage();
    await waitFor(() => expect(screen.getByText(/no conversations yet/i)).toBeInTheDocument());
  });

  it('shows error message on fetch failure', async () => {
    vi.mocked(api.getPartitions).mockRejectedValue(new Error('Network error'));
    vi.mocked(api.getConversations).mockResolvedValue({ conversations: [] });
    renderPage();
    await waitFor(() => expect(screen.getByText('Network error')).toBeInTheDocument());
  });

  it('loads conversation detail when conversation is clicked', async () => {
    vi.mocked(api.getPartitions).mockResolvedValue({ partitions: [] });
    vi.mocked(api.getConversations).mockResolvedValue({ conversations: mockConversations });
    vi.mocked(api.getConversation).mockResolvedValue({ conversation: mockConversationDetail });
    const user = userEvent.setup();
    renderPage();
    await waitFor(() => expect(screen.getByText('conv-1')).toBeInTheDocument());
    
    await user.click(screen.getByText('conv-1'));
    
    await waitFor(() => expect(screen.getByText('Hello')).toBeInTheDocument());
    expect(screen.getByText('Hi there')).toBeInTheDocument();
  });

  it('filters conversations by selected partition', async () => {
    vi.mocked(api.getPartitions).mockResolvedValue({ partitions: mockPartitions });
    vi.mocked(api.getConversations).mockResolvedValue({ conversations: mockConversations });
    const user = userEvent.setup();
    renderPage();
    await waitFor(() => expect(screen.getByText('Support')).toBeInTheDocument());
    
    await user.click(screen.getByText('Support'));
    
    await waitFor(() => expect(api.getConversations).toHaveBeenCalledWith('tok', 'p1'));
  });
});
