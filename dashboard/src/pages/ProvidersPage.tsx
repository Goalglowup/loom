import { useState, useEffect, useCallback } from 'react';
import {
  listGatewayProviders,
  createGatewayProvider,
  updateGatewayProvider,
  deleteGatewayProvider,
  setGatewayDefault,
  updateProviderAvailability,
  listProviderTenants,
  grantProviderTenantAccess,
  revokeProviderTenantAccess,
  listAdminTenants,
  type GatewayProvider,
  type ProviderType,
  type CreateGatewayProviderDto,
  type UpdateGatewayProviderDto,
  type ProviderTenantAccessEntry,
  type AdminTenant,
} from '../utils/adminApi';
import './ProvidersPage.css';

type EditMode = { mode: 'closed' } | { mode: 'create' } | { mode: 'edit'; provider: GatewayProvider };
type TenantAccessMode = { mode: 'closed' } | { mode: 'open'; providerId: string; providerName: string };

function ProvidersPage() {
  const [providers, setProviders] = useState<GatewayProvider[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [successMessage, setSuccessMessage] = useState<string | null>(null);
  const [editMode, setEditMode] = useState<EditMode>({ mode: 'closed' });
  const [deleting, setDeleting] = useState<Record<string, boolean>>({});

  // Form state
  const [formName, setFormName] = useState('');
  const [formType, setFormType] = useState<ProviderType>('openai');
  const [formDescription, setFormDescription] = useState('');
  const [formApiKey, setFormApiKey] = useState('');
  const [formBaseUrl, setFormBaseUrl] = useState('');
  const [formDeployment, setFormDeployment] = useState('');
  const [formApiVersion, setFormApiVersion] = useState('');
  const [formModels, setFormModels] = useState('');
  const [saving, setSaving] = useState(false);

  // Tenant access panel
  const [tenantAccessMode, setTenantAccessMode] = useState<TenantAccessMode>({ mode: 'closed' });
  const [tenantAccessList, setTenantAccessList] = useState<ProviderTenantAccessEntry[]>([]);
  const [allTenants, setAllTenants] = useState<AdminTenant[]>([]);
  const [selectedTenantId, setSelectedTenantId] = useState('');
  const [loadingTenants, setLoadingTenants] = useState(false);

  const loadProviders = useCallback(async () => {
    try {
      setLoading(true);
      setError(null);
      const data = await listGatewayProviders();
      setProviders(data);
    } catch (err: any) {
      setError(err.message || 'Failed to load providers');
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => { loadProviders(); }, [loadProviders]);

  function showSuccess(msg: string) {
    setSuccessMessage(msg);
    setTimeout(() => setSuccessMessage(null), 3000);
  }

  function resetForm() {
    setFormName('');
    setFormType('openai');
    setFormDescription('');
    setFormApiKey('');
    setFormBaseUrl('');
    setFormDeployment('');
    setFormApiVersion('');
    setFormModels('');
  }

  function openCreate() {
    resetForm();
    setEditMode({ mode: 'create' });
  }

  function openEdit(provider: GatewayProvider) {
    setFormName(provider.name);
    setFormType(provider.type);
    setFormDescription(provider.description ?? '');
    setFormApiKey('');
    setFormBaseUrl(provider.baseUrl ?? '');
    setFormDeployment(provider.deployment ?? '');
    setFormApiVersion(provider.apiVersion ?? '');
    setFormModels(provider.availableModels.join(', '));
    setEditMode({ mode: 'edit', provider });
  }

  async function handleSave(e: React.FormEvent) {
    e.preventDefault();
    if (!formName.trim()) return;
    setSaving(true);
    setError(null);

    const models = formModels.split(',').map(m => m.trim()).filter(Boolean);

    try {
      if (editMode.mode === 'create') {
        const dto: CreateGatewayProviderDto = {
          name: formName.trim(),
          type: formType,
          apiKey: formApiKey,
          ...(formDescription && { description: formDescription }),
          ...(formBaseUrl && { baseUrl: formBaseUrl }),
          ...(formDeployment && { deployment: formDeployment }),
          ...(formApiVersion && { apiVersion: formApiVersion }),
          ...(models.length > 0 && { availableModels: models }),
        };
        await createGatewayProvider(dto);
        showSuccess('Provider created successfully');
      } else if (editMode.mode === 'edit') {
        const dto: UpdateGatewayProviderDto = {
          name: formName.trim(),
          ...(formDescription !== undefined && { description: formDescription }),
          ...(formApiKey && { apiKey: formApiKey }),
          ...(formBaseUrl !== undefined && { baseUrl: formBaseUrl }),
          ...(formDeployment !== undefined && { deployment: formDeployment }),
          ...(formApiVersion !== undefined && { apiVersion: formApiVersion }),
          availableModels: models,
        };
        await updateGatewayProvider(editMode.provider.id, dto);
        showSuccess('Provider updated successfully');
      }
      setEditMode({ mode: 'closed' });
      resetForm();
      await loadProviders();
    } catch (err: any) {
      setError(err.message || 'Failed to save provider');
    } finally {
      setSaving(false);
    }
  }

  async function handleDelete(id: string) {
    if (!confirm('Delete this provider? This cannot be undone.')) return;
    setDeleting(s => ({ ...s, [id]: true }));
    try {
      await deleteGatewayProvider(id);
      setProviders(s => s.filter(p => p.id !== id));
      showSuccess('Provider deleted');
    } catch (err: any) {
      setError(err.message || 'Failed to delete provider');
    } finally {
      setDeleting(s => ({ ...s, [id]: false }));
    }
  }

  async function handleSetDefault(id: string) {
    try {
      await setGatewayDefault(id);
      await loadProviders();
      showSuccess('Default provider updated');
    } catch (err: any) {
      setError(err.message || 'Failed to set default');
    }
  }

  async function handleToggleAvailability(id: string, current: boolean) {
    try {
      await updateProviderAvailability(id, !current);
      await loadProviders();
    } catch (err: any) {
      setError(err.message || 'Failed to update availability');
    }
  }

  // Tenant access management
  async function openTenantAccess(providerId: string, providerName: string) {
    setTenantAccessMode({ mode: 'open', providerId, providerName });
    setLoadingTenants(true);
    try {
      const [accessList, { tenants }] = await Promise.all([
        listProviderTenants(providerId),
        listAdminTenants(),
      ]);
      setTenantAccessList(accessList);
      setAllTenants(tenants);
    } catch (err: any) {
      setError(err.message || 'Failed to load tenant access');
    } finally {
      setLoadingTenants(false);
    }
  }

  async function handleGrantAccess() {
    if (!selectedTenantId || tenantAccessMode.mode !== 'open') return;
    try {
      await grantProviderTenantAccess(tenantAccessMode.providerId, selectedTenantId);
      const accessList = await listProviderTenants(tenantAccessMode.providerId);
      setTenantAccessList(accessList);
      setSelectedTenantId('');
      showSuccess('Access granted');
    } catch (err: any) {
      setError(err.message || 'Failed to grant access');
    }
  }

  async function handleRevokeAccess(tenantId: string) {
    if (tenantAccessMode.mode !== 'open') return;
    try {
      await revokeProviderTenantAccess(tenantAccessMode.providerId, tenantId);
      setTenantAccessList(s => s.filter(t => t.id !== tenantId));
      showSuccess('Access revoked');
    } catch (err: any) {
      setError(err.message || 'Failed to revoke access');
    }
  }

  const isEditing = editMode.mode !== 'closed';
  const accessedTenantIds = new Set(tenantAccessList.map(t => t.id));
  const availableTenants = allTenants.filter(t => !accessedTenantIds.has(t.id));

  return (
    <div className="providers-page">
      <div className="providers-header">
        <h1>Gateway Providers</h1>
        {!isEditing && (
          <button onClick={openCreate} className="btn-primary">
            + New Provider
          </button>
        )}
      </div>

      {successMessage && <div className="success-message">{successMessage}</div>}
      {error && <div className="error-message">{error} <button onClick={() => setError(null)} className="dismiss-btn">x</button></div>}

      {/* Create/Edit form */}
      {isEditing && (
        <div className="provider-form-panel">
          <h2>{editMode.mode === 'create' ? 'New Provider' : `Edit: ${editMode.provider.name}`}</h2>
          <form onSubmit={handleSave}>
            <div className="form-row">
              <div className="form-group">
                <label>Name *</label>
                <input type="text" value={formName} onChange={e => setFormName(e.target.value)} required />
              </div>
              <div className="form-group">
                <label>Type *</label>
                <select value={formType} onChange={e => setFormType(e.target.value as ProviderType)} disabled={editMode.mode === 'edit'}>
                  <option value="openai">OpenAI</option>
                  <option value="azure">Azure OpenAI</option>
                  <option value="ollama">Ollama</option>
                </select>
              </div>
            </div>
            <div className="form-group">
              <label>Description</label>
              <input type="text" value={formDescription} onChange={e => setFormDescription(e.target.value)} placeholder="Optional description" />
            </div>
            <div className="form-group">
              <label>API Key {editMode.mode === 'create' ? '*' : '(leave blank to keep current)'}</label>
              <input type="password" value={formApiKey} onChange={e => setFormApiKey(e.target.value)} required={editMode.mode === 'create'} />
            </div>
            {(formType === 'openai' || formType === 'azure' || formType === 'ollama') && (
              <div className="form-group">
                <label>Base URL {formType === 'ollama' ? '*' : '(optional)'}</label>
                <input type="text" value={formBaseUrl} onChange={e => setFormBaseUrl(e.target.value)} placeholder={formType === 'ollama' ? 'http://localhost:11434' : 'https://api.openai.com'} required={formType === 'ollama'} />
              </div>
            )}
            {formType === 'azure' && (
              <>
                <div className="form-row">
                  <div className="form-group">
                    <label>Deployment *</label>
                    <input type="text" value={formDeployment} onChange={e => setFormDeployment(e.target.value)} required />
                  </div>
                  <div className="form-group">
                    <label>API Version *</label>
                    <input type="text" value={formApiVersion} onChange={e => setFormApiVersion(e.target.value)} placeholder="2024-02-01" required />
                  </div>
                </div>
              </>
            )}
            <div className="form-group">
              <label>Available Models (comma-separated)</label>
              <input type="text" value={formModels} onChange={e => setFormModels(e.target.value)} placeholder="gpt-4o, gpt-4o-mini, gpt-3.5-turbo" />
            </div>
            <div className="form-actions">
              <button type="submit" disabled={saving} className="btn-primary">
                {saving ? 'Saving...' : editMode.mode === 'create' ? 'Create' : 'Save'}
              </button>
              <button type="button" onClick={() => { setEditMode({ mode: 'closed' }); resetForm(); }} className="btn-secondary">
                Cancel
              </button>
            </div>
          </form>
        </div>
      )}

      {/* Tenant access panel */}
      {tenantAccessMode.mode === 'open' && (
        <div className="provider-form-panel">
          <div className="panel-header">
            <h2>Tenant Access: {tenantAccessMode.providerName}</h2>
            <button onClick={() => setTenantAccessMode({ mode: 'closed' })} className="btn-secondary">Close</button>
          </div>
          {loadingTenants ? (
            <p className="loading-text">Loading...</p>
          ) : (
            <>
              <div className="tenant-add-row">
                <select value={selectedTenantId} onChange={e => setSelectedTenantId(e.target.value)}>
                  <option value="">Select a tenant...</option>
                  {availableTenants.map(t => (
                    <option key={t.id} value={t.id}>{t.name}</option>
                  ))}
                </select>
                <button onClick={handleGrantAccess} disabled={!selectedTenantId} className="btn-primary btn-small">
                  Grant Access
                </button>
              </div>
              {tenantAccessList.length === 0 ? (
                <p className="empty-text">No specific tenant access grants. Use "Available to all" toggle instead.</p>
              ) : (
                <table className="tenant-access-table">
                  <thead>
                    <tr>
                      <th>Tenant</th>
                      <th>Granted</th>
                      <th>Actions</th>
                    </tr>
                  </thead>
                  <tbody>
                    {tenantAccessList.map(t => (
                      <tr key={t.id}>
                        <td>{t.name}</td>
                        <td>{new Date(t.createdAt).toLocaleDateString()}</td>
                        <td>
                          <button onClick={() => handleRevokeAccess(t.id)} className="btn-danger btn-small">Revoke</button>
                        </td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              )}
            </>
          )}
        </div>
      )}

      {/* Provider list */}
      {loading ? (
        <div className="loading-text">Loading providers...</div>
      ) : providers.length === 0 ? (
        <div className="empty-state">
          <p>No gateway providers configured. Create one to get started.</p>
        </div>
      ) : (
        <div className="providers-table-wrapper">
          <table className="providers-table">
            <thead>
              <tr>
                <th>Name</th>
                <th>Type</th>
                <th>Models</th>
                <th>Default</th>
                <th>Tenant Access</th>
                <th>Actions</th>
              </tr>
            </thead>
            <tbody>
              {providers.map(p => (
                <tr key={p.id}>
                  <td>
                    <strong>{p.name}</strong>
                    {p.description && <span className="provider-desc">{p.description}</span>}
                  </td>
                  <td><span className={`type-badge type-${p.type}`}>{p.type}</span></td>
                  <td className="models-cell">
                    {p.availableModels.length > 0
                      ? p.availableModels.slice(0, 3).join(', ') + (p.availableModels.length > 3 ? ` +${p.availableModels.length - 3}` : '')
                      : '—'}
                  </td>
                  <td>
                    {p.isDefault ? (
                      <span className="default-badge">Default</span>
                    ) : (
                      <button onClick={() => handleSetDefault(p.id)} className="btn-link">Set default</button>
                    )}
                  </td>
                  <td>
                    <div className="availability-cell">
                      <label className="toggle-switch-small">
                        <input
                          type="checkbox"
                          checked={p.tenantAvailable}
                          onChange={() => handleToggleAvailability(p.id, p.tenantAvailable)}
                        />
                        <span className="toggle-slider-small"></span>
                      </label>
                      <span className="availability-label">{p.tenantAvailable ? 'All' : 'Selected'}</span>
                      {!p.tenantAvailable && (
                        <button onClick={() => openTenantAccess(p.id, p.name)} className="btn-link btn-small">Manage</button>
                      )}
                    </div>
                  </td>
                  <td className="actions-cell">
                    <button onClick={() => openEdit(p)} disabled={isEditing} className="btn-link">Edit</button>
                    <button onClick={() => handleDelete(p.id)} disabled={deleting[p.id] || isEditing} className="btn-link btn-danger-text">
                      {deleting[p.id] ? 'Deleting...' : 'Delete'}
                    </button>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}
    </div>
  );
}

export default ProvidersPage;
