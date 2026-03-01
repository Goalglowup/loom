import { render, screen, waitFor } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { MemoryRouter } from 'react-router-dom';
import { describe, it, expect, vi, beforeEach } from 'vitest';
import SettingsPage from '../SettingsPage';

vi.mock('../../lib/api', () => ({
  api: {
    me: vi.fn(),
    updateSettings: vi.fn(),
  },
}));

vi.mock('../../lib/auth', () => ({
  getToken: vi.fn(),
}));

vi.mock('../../components/ProviderConfigForm', () => ({
  default: ({ onSave }: any) => (
    <div data-testid="provider-config-form">
      <button onClick={() => onSave({ provider: 'openai', apiKey: 'sk-test' })}>Save Provider</button>
    </div>
  ),
}));

vi.mock('../../components/ModelListEditor', () => ({
  default: ({ onChange }: any) => (
    <div data-testid="model-list-editor">
      <button onClick={() => onChange(['gpt-4o', 'gpt-4o-mini'])}>Change Models</button>
    </div>
  ),
}));

import { api } from '../../lib/api';
import { getToken } from '../../lib/auth';

function renderPage() {
  return render(
    <MemoryRouter>
      <SettingsPage />
    </MemoryRouter>
  );
}

describe('SettingsPage', () => {
  beforeEach(() => {
    vi.resetAllMocks();
    vi.mocked(getToken).mockReturnValue('tok');
  });

  it('shows loading state initially', () => {
    vi.mocked(api.me).mockImplementation(() => new Promise(() => {}));
    renderPage();
    expect(screen.getByText(/loading/i)).toBeInTheDocument();
  });

  it('renders ProviderConfigForm and ModelListEditor on success', async () => {
    vi.mocked(api.me).mockResolvedValue({
      user: { id: 'u1', email: 'alice@example.com', role: 'admin' },
      tenant: {
        id: 't1',
        name: 'Acme',
        providerConfig: { provider: 'openai', baseUrl: null, deployment: null, apiVersion: null, hasApiKey: true },
        availableModels: ['gpt-4o'],
      },
      tenants: [],
    });
    renderPage();
    await waitFor(() => expect(screen.getByTestId('provider-config-form')).toBeInTheDocument());
    expect(screen.getByTestId('model-list-editor')).toBeInTheDocument();
  });

  it('shows current provider summary when configured', async () => {
    vi.mocked(api.me).mockResolvedValue({
      user: { id: 'u1', email: 'alice@example.com', role: 'admin' },
      tenant: {
        id: 't1',
        name: 'Acme',
        providerConfig: { provider: 'openai', baseUrl: null, deployment: null, apiVersion: null, hasApiKey: true },
        availableModels: null,
      },
      tenants: [],
    });
    renderPage();
    await waitFor(() => expect(screen.getByText(/currently using/i)).toBeInTheDocument());
    expect(screen.getByText(/openai/i)).toBeInTheDocument();
  });

  it('shows error message on fetch failure', async () => {
    vi.mocked(api.me).mockRejectedValue(new Error('Auth failed'));
    renderPage();
    await waitFor(() => expect(screen.getByText('Auth failed')).toBeInTheDocument());
  });

  it('saves provider config when ProviderConfigForm triggers onSave', async () => {
    vi.mocked(api.me).mockResolvedValue({
      user: { id: 'u1', email: 'alice@example.com', role: 'admin' },
      tenant: {
        id: 't1',
        name: 'Acme',
        providerConfig: null,
        availableModels: null,
      },
      tenants: [],
    });
    vi.mocked(api.updateSettings).mockResolvedValue({
      providerConfig: { provider: 'openai', baseUrl: null, deployment: null, apiVersion: null, hasApiKey: true },
    });
    const user = userEvent.setup();
    renderPage();
    await waitFor(() => expect(screen.getByTestId('provider-config-form')).toBeInTheDocument());
    
    await user.click(screen.getByRole('button', { name: /save provider/i }));
    
    await waitFor(() => expect(api.updateSettings).toHaveBeenCalledWith('tok', expect.objectContaining({ provider: 'openai' })));
  });

  it('saves model list when ModelListEditor triggers onChange', async () => {
    vi.mocked(api.me).mockResolvedValue({
      user: { id: 'u1', email: 'alice@example.com', role: 'admin' },
      tenant: {
        id: 't1',
        name: 'Acme',
        providerConfig: { provider: 'openai', baseUrl: null, deployment: null, apiVersion: null, hasApiKey: true },
        availableModels: ['gpt-4o'],
      },
      tenants: [],
    });
    vi.mocked(api.updateSettings).mockResolvedValue({ providerConfig: null });
    const user = userEvent.setup();
    renderPage();
    await waitFor(() => expect(screen.getByTestId('model-list-editor')).toBeInTheDocument());
    
    await user.click(screen.getByRole('button', { name: /change models/i }));
    
    await waitFor(() => expect(api.updateSettings).toHaveBeenCalledWith('tok', expect.objectContaining({ availableModels: ['gpt-4o', 'gpt-4o-mini'] })));
  });
});
