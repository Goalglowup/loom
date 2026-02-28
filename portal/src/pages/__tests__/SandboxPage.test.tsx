import { render, screen, waitFor } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { MemoryRouter } from 'react-router-dom';
import { describe, it, expect, vi, beforeEach } from 'vitest';
import SandboxPage from '../SandboxPage';

vi.mock('../../lib/api', () => ({
  api: {
    listAgents: vi.fn(),
    sandboxChat: vi.fn(),
  },
}));

vi.mock('../../lib/auth', () => ({
  getToken: vi.fn().mockReturnValue('tok'),
}));

// Mock AgentSandbox to keep tests focused on SandboxPage logic
vi.mock('../../components/AgentSandbox', () => ({
  default: ({ agent }: { agent: { name: string } }) => (
    <div data-testid="agent-sandbox">{agent.name}</div>
  ),
}));

import { api } from '../../lib/api';

const mockAgents = [
  { id: 'a1', name: 'Alpha', systemPrompt: 'Be helpful', availableModels: null, skills: [], mcpEndpoints: [], mergePolicies: null, conversations_enabled: false, conversation_token_limit: 4000, conversation_summary_model: null },
  { id: 'a2', name: 'Beta', systemPrompt: 'Be concise', availableModels: null, skills: [], mcpEndpoints: [], mergePolicies: null, conversations_enabled: false, conversation_token_limit: 4000, conversation_summary_model: null },
];

function renderPage() {
  return render(
    <MemoryRouter>
      <SandboxPage />
    </MemoryRouter>
  );
}

describe('SandboxPage', () => {
  beforeEach(() => {
    vi.resetAllMocks();
  });

  it('shows loading state initially', () => {
    vi.mocked(api.listAgents).mockImplementation(() => new Promise(() => {}));
    renderPage();
    expect(screen.getByText(/loading agents/i)).toBeInTheDocument();
  });

  it('shows empty state when no agents', async () => {
    vi.mocked(api.listAgents).mockResolvedValue({ agents: [] });
    renderPage();
    await waitFor(() => expect(screen.getByText(/no agents yet/i)).toBeInTheDocument());
    expect(screen.getByRole('link', { name: /go to agents/i })).toBeInTheDocument();
  });

  it('renders agent list when agents exist', async () => {
    vi.mocked(api.listAgents).mockResolvedValue({ agents: mockAgents });
    renderPage();
    await waitFor(() => expect(screen.getAllByText('Alpha').length).toBeGreaterThan(0));
    expect(screen.getAllByText('Beta').length).toBeGreaterThan(0);
  });

  it('selects first agent by default and shows sandbox', async () => {
    vi.mocked(api.listAgents).mockResolvedValue({ agents: mockAgents });
    renderPage();
    await waitFor(() => expect(screen.getByTestId('agent-sandbox')).toBeInTheDocument());
    expect(screen.getByTestId('agent-sandbox')).toHaveTextContent('Alpha');
  });

  it('switches selected agent when a different agent button is clicked', async () => {
    vi.mocked(api.listAgents).mockResolvedValue({ agents: mockAgents });
    const user = userEvent.setup();
    renderPage();
    await waitFor(() => expect(screen.getByText('Beta')).toBeInTheDocument());

    // Click Beta in the agent selector list
    const buttons = screen.getAllByRole('button');
    const betaButton = buttons.find(b => b.textContent?.includes('Beta'))!;
    await user.click(betaButton);

    expect(screen.getByTestId('agent-sandbox')).toHaveTextContent('Beta');
  });

  it('shows page title "Sandbox"', async () => {
    vi.mocked(api.listAgents).mockResolvedValue({ agents: [] });
    renderPage();
    await waitFor(() => expect(screen.getByRole('heading', { name: /sandbox/i })).toBeInTheDocument());
  });
});
