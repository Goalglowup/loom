import type { Tenant } from './types';

interface TenantSelectorProps {
  tenants: Tenant[];
  tenantId: string;
  onChange: (id: string) => void;
}

function TenantSelector({ tenants, tenantId, onChange }: TenantSelectorProps) {
  return (
    <div className="shared-analytics-tenant-row">
      <label htmlFor="tenant-filter-analytics" className="shared-analytics-tenant-label">
        Tenant
      </label>
      <select
        id="tenant-filter-analytics"
        className="filter-select"
        value={tenantId}
        onChange={e => onChange(e.target.value)}
      >
        <option value="">All tenants</option>
        {tenants.map(t => (
          <option key={t.id} value={t.id}>{t.name}</option>
        ))}
      </select>
    </div>
  );
}

export default TenantSelector;
