import { render, screen, waitFor } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { describe, it, expect, vi, beforeEach } from 'vitest';
import AgentEditor from '../AgentEditor';

vi.mock('../../lib/api', () => ({
  api: {
    createAgent: vi.fn(),
    updateAgent: vi.fn(),
    getResolvedAgentConfig: vi.fn(),
  },
}));

vi.mock('../../lib/auth', () => ({
  getToken: vi.fn(),
}));

vi.mock('../ModelListEditor', () => ({
  default: ({ label }: { label?: string }) => <div data-testid="model-list-editor">{label ?? 'Models'}</div>,
}));

import { api } from '../../lib/api';
import { getToken } from '../../lib/auth';

const mockAgent = {
  id: 'a1',
  name: 'Support Bot',
  systemPrompt: 'Be helpful',
  skills: [],
  mcpEndpoints: [],
  availableModels: null,
  mergePolicies: { system_prompt: 'prepend', skills: 'merge', mcp_endpoints: 'merge' },
  conversations_enabled: false,
  conversation_token_limit: 4000,
  conversation_summary_model: null,
};

describe('AgentEditor', () => {
  let onSave: ReturnType<typeof vi.fn>;
  let onCancel: ReturnType<typeof vi.fn>;

  beforeEach(() => {
    onSave = vi.fn();
    onCancel = vi.fn();
    vi.resetAllMocks();
    vi.mocked(getToken).mockReturnValue('tok');
    vi.mocked(api.createAgent).mockResolvedValue({ agent: { ...mockAgent, id: 'new-id' } });
    vi.mocked(api.updateAgent).mockResolvedValue({ agent: mockAgent });
    vi.mocked(api.getResolvedAgentConfig).mockResolvedValue({
      resolved: {
        inheritanceChain: [],
        providerConfig: null,
        skills: [],
        mcpEndpoints: [],
        systemPrompt: 'Be helpful',
      },
    });
  });

  describe('create mode (agent=null)', () => {
    it('renders empty name field and Create agent button', () => {
      render(<AgentEditor agent={null} onSave={onSave} onCancel={onCancel} />);
      expect(screen.getByPlaceholderText(/customer-support-agent/i)).toBeInTheDocument();
      expect(screen.getByRole('button', { name: /create agent/i })).toBeInTheDocument();
    });

    it('create button is disabled when name is empty', () => {
      render(<AgentEditor agent={null} onSave={onSave} onCancel={onCancel} />);
      expect(screen.getByRole('button', { name: /create agent/i })).toBeDisabled();
    });

    it('calls api.createAgent and onSave on submit', async () => {
      const user = userEvent.setup();
      render(<AgentEditor agent={null} onSave={onSave} onCancel={onCancel} />);
      await user.type(screen.getByPlaceholderText(/customer-support-agent/i), 'My Agent');
      await user.click(screen.getByRole('button', { name: /create agent/i }));
      await waitFor(() => expect(api.createAgent).toHaveBeenCalledWith('tok', expect.objectContaining({ name: 'My Agent' })));
      expect(onSave).toHaveBeenCalled();
    });

    it('shows error message when api.createAgent fails', async () => {
      vi.mocked(api.createAgent).mockRejectedValue(new Error('Name taken'));
      const user = userEvent.setup();
      render(<AgentEditor agent={null} onSave={onSave} onCancel={onCancel} />);
      await user.type(screen.getByPlaceholderText(/customer-support-agent/i), 'My Agent');
      await user.click(screen.getByRole('button', { name: /create agent/i }));
      expect(await screen.findByText('Name taken')).toBeInTheDocument();
    });

    it('calls onCancel when Cancel button is clicked', async () => {
      const user = userEvent.setup();
      render(<AgentEditor agent={null} onSave={onSave} onCancel={onCancel} />);
      await user.click(screen.getByRole('button', { name: /cancel/i }));
      expect(onCancel).toHaveBeenCalled();
    });
  });

  describe('edit mode (agent provided)', () => {
    it('prefills name and shows Save changes button', () => {
      render(<AgentEditor agent={mockAgent} onSave={onSave} onCancel={onCancel} />);
      expect(screen.getByDisplayValue('Support Bot')).toBeInTheDocument();
      expect(screen.getByRole('button', { name: /save changes/i })).toBeInTheDocument();
    });

    it('prefills system prompt', () => {
      render(<AgentEditor agent={mockAgent} onSave={onSave} onCancel={onCancel} />);
      expect(screen.getByDisplayValue('Be helpful')).toBeInTheDocument();
    });

    it('calls api.updateAgent on submit', async () => {
      const user = userEvent.setup();
      render(<AgentEditor agent={mockAgent} onSave={onSave} onCancel={onCancel} />);
      await user.click(screen.getByRole('button', { name: /save changes/i }));
      await waitFor(() => expect(api.updateAgent).toHaveBeenCalledWith('tok', 'a1', expect.any(Object)));
      expect(onSave).toHaveBeenCalled();
    });

    it('shows "View inherited config" button for existing agent', () => {
      render(<AgentEditor agent={mockAgent} onSave={onSave} onCancel={onCancel} />);
      expect(screen.getByText(/view inherited config/i)).toBeInTheDocument();
    });

    it('expands inherited config panel on click and loads resolved config', async () => {
      const user = userEvent.setup();
      render(<AgentEditor agent={mockAgent} onSave={onSave} onCancel={onCancel} />);
      await user.click(screen.getByText(/view inherited config/i));
      await waitFor(() => expect(api.getResolvedAgentConfig).toHaveBeenCalledWith('tok', 'a1'));
    });
  });

  describe('add skill', () => {
    it('shows add skill form when Add skill button is clicked', async () => {
      const user = userEvent.setup();
      render(<AgentEditor agent={null} onSave={onSave} onCancel={onCancel} />);
      await user.click(screen.getByRole('button', { name: /\+ add skill/i }));
      expect(screen.getByPlaceholderText(/get_weather/i)).toBeInTheDocument();
    });
  });

  describe('conversation memory', () => {
    it('shows memory fields when conversations toggle is enabled', async () => {
      const user = userEvent.setup();
      render(<AgentEditor agent={null} onSave={onSave} onCancel={onCancel} />);
      // The toggle is a button[role="switch"] with aria-checked
      const toggle = screen.getByRole('switch');
      await user.click(toggle);
      expect(screen.getByText(/memory threshold/i)).toBeInTheDocument();
    });
  });
});
