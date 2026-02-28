import { render, screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { describe, it, expect, vi, beforeAll, beforeEach } from 'vitest';
import ApiKeyReveal from '../ApiKeyReveal';
import type { ApiKeyCreated } from '../../lib/api';

const mockKeyData: ApiKeyCreated = {
  id: 'key-123',
  key: 'loom_sk_abcdefghijklmnop',
  name: 'My Test Key',
  keyPrefix: 'loom_sk_abc',
  status: 'active',
  createdAt: '2024-01-01T00:00:00Z',
  revokedAt: null,
};

const clipboardMock = { writeText: vi.fn().mockResolvedValue(undefined) };

beforeAll(() => {
  Object.defineProperty(globalThis.navigator, 'clipboard', {
    value: clipboardMock,
    configurable: true,
  });
});

describe('ApiKeyReveal', () => {
  const onDismiss = vi.fn();

  beforeEach(() => {
    vi.resetAllMocks();
    clipboardMock.writeText.mockResolvedValue(undefined);
  });

  it('displays the full API key', () => {
    render(<ApiKeyReveal keyData={mockKeyData} onDismiss={onDismiss} />);
    expect(screen.getByText('loom_sk_abcdefghijklmnop')).toBeInTheDocument();
  });

  it('shows the key name and prefix', () => {
    render(<ApiKeyReveal keyData={mockKeyData} onDismiss={onDismiss} />);
    expect(screen.getByText('My Test Key')).toBeInTheDocument();
    expect(screen.getByText('loom_sk_abc')).toBeInTheDocument();
  });

  it('shows Copy button with initial label before clicking', () => {
    render(<ApiKeyReveal keyData={mockKeyData} onDismiss={onDismiss} />);
    expect(screen.getByRole('button', { name: 'Copy' })).toBeInTheDocument();
  });

  it('shows copied state after clicking copy', async () => {
    const user = userEvent.setup();
    render(<ApiKeyReveal keyData={mockKeyData} onDismiss={onDismiss} />);
    await user.click(screen.getByRole('button', { name: /copy/i }));
    expect(await screen.findByText(/copied/i)).toBeInTheDocument();
  });

  it('calls onDismiss when dismiss button clicked', async () => {
    const user = userEvent.setup();
    render(<ApiKeyReveal keyData={mockKeyData} onDismiss={onDismiss} />);
    await user.click(screen.getByRole('button', { name: /i've saved it/i }));
    expect(onDismiss).toHaveBeenCalledOnce();
  });
});
