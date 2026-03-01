import { render, screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { describe, it, expect, vi } from 'vitest';
import TenantSelector from '@shared/analytics/TenantSelector';
import type { Tenant } from '@shared/analytics/types';

const mockTenants: Tenant[] = [
  { id: 'tenant-1', name: 'Acme Corp' },
  { id: 'tenant-2', name: 'Beta Inc' },
  { id: 'tenant-3', name: 'Gamma Ltd' },
];

describe('TenantSelector', () => {
  it('renders tenant label', () => {
    render(<TenantSelector tenants={[]} tenantId="" onChange={vi.fn()} />);
    expect(screen.getByLabelText('Tenant')).toBeInTheDocument();
  });

  it('renders "All tenants" option', () => {
    render(<TenantSelector tenants={mockTenants} tenantId="" onChange={vi.fn()} />);
    expect(screen.getByRole('option', { name: 'All tenants' })).toBeInTheDocument();
  });

  it('renders tenant options from tenants prop', () => {
    render(<TenantSelector tenants={mockTenants} tenantId="" onChange={vi.fn()} />);
    expect(screen.getByRole('option', { name: 'Acme Corp' })).toBeInTheDocument();
    expect(screen.getByRole('option', { name: 'Beta Inc' })).toBeInTheDocument();
    expect(screen.getByRole('option', { name: 'Gamma Ltd' })).toBeInTheDocument();
  });

  it('shows current tenantId as selected', () => {
    render(<TenantSelector tenants={mockTenants} tenantId="tenant-2" onChange={vi.fn()} />);
    const select = screen.getByLabelText('Tenant') as HTMLSelectElement;
    expect(select.value).toBe('tenant-2');
  });

  it('calls onChange when selection changes', async () => {
    const user = userEvent.setup();
    const onChange = vi.fn();
    render(<TenantSelector tenants={mockTenants} tenantId="" onChange={onChange} />);
    
    const select = screen.getByLabelText('Tenant');
    await user.selectOptions(select, 'tenant-1');
    
    expect(onChange).toHaveBeenCalledWith('tenant-1');
  });

  it('calls onChange with empty string when "All tenants" is selected', async () => {
    const user = userEvent.setup();
    const onChange = vi.fn();
    render(<TenantSelector tenants={mockTenants} tenantId="tenant-1" onChange={onChange} />);
    
    const select = screen.getByLabelText('Tenant');
    await user.selectOptions(select, '');
    
    expect(onChange).toHaveBeenCalledWith('');
  });

  it('renders correctly with empty tenants array', () => {
    render(<TenantSelector tenants={[]} tenantId="" onChange={vi.fn()} />);
    expect(screen.getByRole('option', { name: 'All tenants' })).toBeInTheDocument();
    expect(screen.getAllByRole('option')).toHaveLength(1);
  });
});
