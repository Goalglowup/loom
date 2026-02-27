import { useState } from 'react';
import { useAuth } from '../context/AuthContext';

export default function TenantSwitcher() {
  const { tenant, tenants, switchTenant } = useAuth();
  const [switching, setSwitching] = useState(false);

  if (!tenant) return null;

  if (tenants.length <= 1) {
    return <p className="text-xs text-gray-400 mt-1 truncate">{tenant.name}</p>;
  }

  async function handleChange(e: React.ChangeEvent<HTMLSelectElement>) {
    const newId = e.target.value;
    if (newId === tenant?.id) return;
    setSwitching(true);
    try {
      await switchTenant(newId);
    } finally {
      setSwitching(false);
    }
  }

  return (
    <div className="mt-1 relative">
      <select
        value={tenant.id}
        onChange={handleChange}
        disabled={switching}
        aria-label="Switch tenant"
        className="w-full text-xs bg-gray-800 border border-gray-600 rounded px-2 py-1 text-gray-200
                   focus:outline-none focus:border-indigo-500 disabled:opacity-50 cursor-pointer
                   appearance-none pr-6"
      >
        {tenants.map(t => (
          <option key={t.id} value={t.id}>{t.name}</option>
        ))}
      </select>
      <span className="pointer-events-none absolute right-1.5 top-1/2 -translate-y-1/2 text-gray-400 text-xs">▾</span>
      {switching && (
        <p className="text-xs text-indigo-400 mt-0.5">Switching…</p>
      )}
    </div>
  );
}
