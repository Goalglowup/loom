import { render, screen, waitFor } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { describe, it, expect, vi, beforeEach } from 'vitest';
import AgentSandbox from '../AgentSandbox';

vi.mock('../../lib/api', () => ({
  api: {
    sandboxChat: vi.fn(),
  },
}));

vi.mock('../../lib/auth', () => ({
  getToken: vi.fn().mockReturnValue('tok'),
}));

// Mock ModelCombobox to simplify model selection in tests
vi.mock('../ModelCombobox', () => ({
  default: ({ value, onChange, options }: { value: string; onChange: (v: string) => void; options: string[] }) => (
    <select data-testid="model-select" value={value} onChange={e => onChange(e.target.value)}>
      {options.map(o => <option key={o} value={o}>{o}</option>)}
    </select>
  ),
}));

import { api } from '../../lib/api';

const mockAgent = {
  id: 'a1',
  name: 'Test Agent',
  systemPrompt: 'Be helpful',
  availableModels: null,
  skills: [],
  mcpEndpoints: [],
  mergePolicies: null,
  conversations_enabled: false,
  conversation_token_limit: 4000,
  conversation_summary_model: null,
};

describe('AgentSandbox', () => {
  beforeEach(() => {
    vi.resetAllMocks();
  });

  it('renders agent name header', () => {
    render(<AgentSandbox agent={mockAgent} />);
    expect(screen.getByText('Test Agent')).toBeInTheDocument();
  });

  it('renders message input and Send button', () => {
    render(<AgentSandbox agent={mockAgent} />);
    expect(screen.getByPlaceholderText(/type a message/i)).toBeInTheDocument();
    expect(screen.getByRole('button', { name: /send/i })).toBeInTheDocument();
  });

  it('shows empty state message when no messages', () => {
    render(<AgentSandbox agent={mockAgent} />);
    expect(screen.getByText(/say something to test this agent/i)).toBeInTheDocument();
  });

  it('Send button is disabled when input is empty', () => {
    render(<AgentSandbox agent={mockAgent} />);
    expect(screen.getByRole('button', { name: /send/i })).toBeDisabled();
  });

  it('sends message and displays user and assistant messages', async () => {
    vi.mocked(api.sandboxChat).mockResolvedValue({
      message: { role: 'assistant', content: 'Hello! How can I help?' },
      usage: { prompt_tokens: 10, completion_tokens: 8, total_tokens: 18 },
      conversation_id: null,
    });
    const user = userEvent.setup();
    render(<AgentSandbox agent={mockAgent} />);

    await user.type(screen.getByPlaceholderText(/type a message/i), 'Hello!');
    await user.click(screen.getByRole('button', { name: /send/i }));

    await waitFor(() => expect(screen.getByText('Hello! How can I help?')).toBeInTheDocument());
    expect(screen.getByText('Hello!')).toBeInTheDocument();
  });

  it('shows thinking indicator while loading', async () => {
    let resolveChat!: (v: any) => void;
    vi.mocked(api.sandboxChat).mockImplementation(() => new Promise(res => { resolveChat = res; }));

    const user = userEvent.setup();
    render(<AgentSandbox agent={mockAgent} />);

    await user.type(screen.getByPlaceholderText(/type a message/i), 'Hi');
    await user.click(screen.getByRole('button', { name: /send/i }));

    await waitFor(() => expect(screen.getByText(/thinking/i)).toBeInTheDocument());

    resolveChat({
      message: { role: 'assistant', content: 'Done' },
      usage: null,
      conversation_id: null,
    });
    await waitFor(() => expect(screen.queryByText(/thinking/i)).not.toBeInTheDocument());
  });

  it('shows error message when chat fails', async () => {
    vi.mocked(api.sandboxChat).mockRejectedValue(new Error('Rate limited'));
    const user = userEvent.setup();
    render(<AgentSandbox agent={mockAgent} />);

    await user.type(screen.getByPlaceholderText(/type a message/i), 'Hi');
    await user.click(screen.getByRole('button', { name: /send/i }));

    expect(await screen.findByText('Rate limited')).toBeInTheDocument();
  });

  it('sends message via Enter key', async () => {
    vi.mocked(api.sandboxChat).mockResolvedValue({
      message: { role: 'assistant', content: 'Reply' },
      usage: null,
      conversation_id: null,
    });
    const user = userEvent.setup();
    render(<AgentSandbox agent={mockAgent} />);

    await user.type(screen.getByPlaceholderText(/type a message/i), 'Hello{Enter}');
    await waitFor(() => expect(screen.getByText('Reply')).toBeInTheDocument());
  });

  it('clears input after sending', async () => {
    vi.mocked(api.sandboxChat).mockResolvedValue({
      message: { role: 'assistant', content: 'Hi!' },
      usage: null,
      conversation_id: null,
    });
    const user = userEvent.setup();
    render(<AgentSandbox agent={mockAgent} />);

    await user.type(screen.getByPlaceholderText(/type a message/i), 'Hello');
    await user.click(screen.getByRole('button', { name: /send/i }));
    await waitFor(() => expect(screen.getByPlaceholderText(/type a message/i)).toHaveValue(''));
  });

  it('uses agent availableModels when provided', () => {
    const agentWithModels = { ...mockAgent, availableModels: ['claude-3', 'gpt-4o'] };
    render(<AgentSandbox agent={agentWithModels} />);
    // The mock ModelCombobox renders options from the models list
    const select = screen.getByTestId('model-select') as HTMLSelectElement;
    const options = Array.from(select.options).map(o => o.value);
    expect(options).toContain('claude-3');
    expect(options).toContain('gpt-4o');
  });
});
