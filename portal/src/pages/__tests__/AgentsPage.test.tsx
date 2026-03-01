import { render, screen, waitFor } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { MemoryRouter } from 'react-router-dom';
import { describe, it, expect, vi, beforeEach } from 'vitest';
import AgentsPage from '../AgentsPage';

vi.mock('../../lib/api', () => ({
  api: {
    listAgents: vi.fn(),
    deleteAgent: vi.fn(),
  },
}));

vi.mock('../../lib/auth', () => ({
  getToken: vi.fn(),
}));

vi.mock('../../components/AgentEditor', () => ({
  default: ({ onSave, onCancel }: any) => (
    <div data-testid="agent-editor">
      <button onClick={() => onSave({ id: 'new', name: 'TestAgent', systemPrompt: '', skills: [], mcpEndpoints: [] })}>Save</button>
      <button onClick={onCancel}>Cancel</button>
    </div>
  ),
}));

vi.mock('../../components/AgentSandbox', () => ({
  default: ({ agent, onClose }: any) => (
    <div data-testid="agent-sandbox">
      Sandbox for {agent.name}
      <button onClick={onClose}>Close</button>
    </div>
  ),
}));

import { api } from '../../lib/api';
import { getToken } from '../../lib/auth';

const mockAgents = [
  { id: 'a1', name: 'Alpha', systemPrompt: 'Be helpful', skills: [], mcpEndpoints: [], availableModels: null, mergePolicies: null, conversations_enabled: false, conversation_token_limit: 4000, conversation_summary_model: null },
  { id: 'a2', name: 'Beta', systemPrompt: 'Be concise', skills: ['skill1'], mcpEndpoints: ['endpoint1'], availableModels: null, mergePolicies: null, conversations_enabled: false, conversation_token_limit: 4000, conversation_summary_model: null },
];

function renderPage() {
  return render(
    <MemoryRouter>
      <AgentsPage />
    </MemoryRouter>
  );
}

describe('AgentsPage', () => {
  beforeEach(() => {
    vi.resetAllMocks();
    vi.mocked(getToken).mockReturnValue('tok');
  });

  it('shows loading state initially', () => {
    vi.mocked(api.listAgents).mockImplementation(() => new Promise(() => {}));
    renderPage();
    expect(screen.getByText(/loading/i)).toBeInTheDocument();
  });

  it('renders agent list on success', async () => {
    vi.mocked(api.listAgents).mockResolvedValue({ agents: mockAgents });
    renderPage();
    await waitFor(() => expect(screen.getByText('Alpha')).toBeInTheDocument());
    expect(screen.getByText('Beta')).toBeInTheDocument();
    expect(screen.getByText('Be concise')).toBeInTheDocument();
  });

  it('shows empty state when no agents', async () => {
    vi.mocked(api.listAgents).mockResolvedValue({ agents: [] });
    renderPage();
    await waitFor(() => expect(screen.getByText(/no agents yet/i)).toBeInTheDocument());
  });

  it('shows error message on fetch failure', async () => {
    vi.mocked(api.listAgents).mockRejectedValue(new Error('Network error'));
    renderPage();
    await waitFor(() => expect(screen.getByText('Network error')).toBeInTheDocument());
  });

  it('opens AgentEditor when + New Agent is clicked', async () => {
    vi.mocked(api.listAgents).mockResolvedValue({ agents: mockAgents });
    const user = userEvent.setup();
    renderPage();
    await waitFor(() => expect(screen.getByText('Alpha')).toBeInTheDocument());
    
    const newButton = screen.getByRole('button', { name: /\+ New Agent/i });
    await user.click(newButton);
    
    expect(screen.getByTestId('agent-editor')).toBeInTheDocument();
  });

  it('deletes agent when delete button is clicked and confirmed', async () => {
    vi.mocked(api.listAgents).mockResolvedValue({ agents: mockAgents });
    vi.mocked(api.deleteAgent).mockResolvedValue({ success: true });
    global.confirm = vi.fn(() => true);
    const user = userEvent.setup();
    renderPage();
    await waitFor(() => expect(screen.getByText('Alpha')).toBeInTheDocument());
    
    const deleteButtons = screen.getAllByRole('button', { name: /delete/i });
    await user.click(deleteButtons[0]);
    
    await waitFor(() => expect(api.deleteAgent).toHaveBeenCalledWith('tok', 'a1'));
  });
});
