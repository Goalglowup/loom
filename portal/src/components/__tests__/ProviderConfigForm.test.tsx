import { render, screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { describe, it, expect, vi, beforeEach } from 'vitest';
import ProviderConfigForm from '../ProviderConfigForm';
import type { ProviderConfigSafe, ProviderConfig } from '../../lib/api';

const emptyConfig: ProviderConfigSafe = {
  provider: 'openai',
  baseUrl: null,
  deployment: null,
  apiVersion: null,
  hasApiKey: false,
};

describe('ProviderConfigForm', () => {
  let onSave: ReturnType<typeof vi.fn>;

  beforeEach(() => {
    onSave = vi.fn().mockResolvedValue(undefined);
  });

  it('renders provider select and base url field', () => {
    render(<ProviderConfigForm initialConfig={emptyConfig} onSave={onSave} />);
    expect(screen.getByRole('combobox')).toBeInTheDocument();
    expect(screen.getByPlaceholderText(/https:\/\/api\.openai\.com/i)).toBeInTheDocument();
  });

  it('shows API key field for openai provider', () => {
    render(<ProviderConfigForm initialConfig={emptyConfig} onSave={onSave} />);
    expect(screen.getByPlaceholderText(/enter api key/i)).toBeInTheDocument();
  });

  it('hides API key field when ollama is selected', async () => {
    const user = userEvent.setup();
    render(<ProviderConfigForm initialConfig={emptyConfig} onSave={onSave} />);
    await user.selectOptions(screen.getByRole('combobox'), 'ollama');
    expect(screen.queryByLabelText(/api key/i)).not.toBeInTheDocument();
  });

  it('shows azure-specific fields when azure is selected', async () => {
    const user = userEvent.setup();
    render(<ProviderConfigForm initialConfig={emptyConfig} onSave={onSave} />);
    await user.selectOptions(screen.getByRole('combobox'), 'azure');
    expect(screen.getByPlaceholderText(/gpt-4/i)).toBeInTheDocument();
    expect(screen.getByPlaceholderText(/2024-02-15-preview/i)).toBeInTheDocument();
  });

  it('calls onSave with correct data on submit', async () => {
    const user = userEvent.setup();
    render(<ProviderConfigForm initialConfig={emptyConfig} onSave={onSave} />);
    await user.type(screen.getByPlaceholderText(/enter api key/i), 'sk-test123');
    await user.click(screen.getByRole('button', { name: /save settings/i }));
    expect(onSave).toHaveBeenCalledWith(
      expect.objectContaining({ provider: 'openai', apiKey: 'sk-test123' })
    );
  });

  it('shows success message after save', async () => {
    const user = userEvent.setup();
    render(<ProviderConfigForm initialConfig={emptyConfig} onSave={onSave} />);
    await user.click(screen.getByRole('button', { name: /save settings/i }));
    expect(await screen.findByText(/settings saved/i)).toBeInTheDocument();
  });

  it('shows error message when save fails', async () => {
    onSave.mockRejectedValue(new Error('Server error'));
    const user = userEvent.setup();
    render(<ProviderConfigForm initialConfig={emptyConfig} onSave={onSave} />);
    await user.click(screen.getByRole('button', { name: /save settings/i }));
    expect(await screen.findByText('Server error')).toBeInTheDocument();
  });
});
