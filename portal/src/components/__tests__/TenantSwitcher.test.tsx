import { render, screen, waitFor } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { describe, it, expect, vi, beforeEach } from 'vitest';
import TenantSwitcher from '../TenantSwitcher';

const mockSwitchTenant = vi.fn();

vi.mock('../../context/AuthContext', () => ({
  useAuth: vi.fn(),
}));

import { useAuth } from '../../context/AuthContext';

const tenant1 = { id: 't1', name: 'Acme', role: 'owner' };
const tenant2 = { id: 't2', name: 'Globex', role: 'admin' };

function setup(overrides: object = {}) {
  vi.mocked(useAuth).mockReturnValue({
    tenant: tenant1,
    tenants: [tenant1, tenant2],
    switchTenant: mockSwitchTenant,
    ...overrides,
  } as any);
}

describe('TenantSwitcher', () => {
  beforeEach(() => {
    vi.resetAllMocks();
    mockSwitchTenant.mockResolvedValue(undefined);
  });

  it('renders nothing when no tenant', () => {
    vi.mocked(useAuth).mockReturnValue({ tenant: null, tenants: [], switchTenant: mockSwitchTenant } as any);
    const { container } = render(<TenantSwitcher />);
    expect(container).toBeEmptyDOMElement();
  });

  it('renders tenant name as static text when only one tenant', () => {
    vi.mocked(useAuth).mockReturnValue({ tenant: tenant1, tenants: [tenant1], switchTenant: mockSwitchTenant } as any);
    render(<TenantSwitcher />);
    expect(screen.getByText('Acme')).toBeInTheDocument();
    expect(screen.queryByRole('combobox')).not.toBeInTheDocument();
  });

  it('renders a select when multiple tenants', () => {
    setup();
    render(<TenantSwitcher />);
    expect(screen.getByRole('combobox', { name: /switch tenant/i })).toBeInTheDocument();
  });

  it('select has current tenant selected', () => {
    setup();
    render(<TenantSwitcher />);
    expect(screen.getByRole('combobox')).toHaveValue('t1');
  });

  it('calls switchTenant when a different tenant is selected', async () => {
    setup();
    const user = userEvent.setup();
    render(<TenantSwitcher />);
    await user.selectOptions(screen.getByRole('combobox'), 't2');
    expect(mockSwitchTenant).toHaveBeenCalledWith('t2');
  });

  it('does not call switchTenant when same tenant is selected', async () => {
    setup();
    const user = userEvent.setup();
    render(<TenantSwitcher />);
    await user.selectOptions(screen.getByRole('combobox'), 't1');
    expect(mockSwitchTenant).not.toHaveBeenCalled();
  });

  it('disables select and shows switching indicator while switching', async () => {
    // switchTenant that never resolves during the test assertion window
    let resolveSwitchTenant!: () => void;
    mockSwitchTenant.mockImplementation(() => new Promise(res => { resolveSwitchTenant = res; }));

    setup();
    const user = userEvent.setup();
    render(<TenantSwitcher />);

    const select = screen.getByRole('combobox');
    // Fire the change but don't await it
    user.selectOptions(select, 't2');

    await waitFor(() => expect(screen.getByText(/Switching/i)).toBeInTheDocument());
    expect(screen.getByRole('combobox')).toBeDisabled();

    // Resolve and check switching indicator gone
    resolveSwitchTenant();
    await waitFor(() => expect(screen.queryByText(/Switching/i)).not.toBeInTheDocument());
  });
});
