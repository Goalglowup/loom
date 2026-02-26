import { useState } from 'react';
import { Link, useNavigate } from 'react-router-dom';
import { api } from '../lib/api';
import type { ApiKeyCreated } from '../lib/api';
import { setToken } from '../lib/auth';
import ApiKeyReveal from '../components/ApiKeyReveal';

export default function SignupPage() {
  const navigate = useNavigate();
  const [tenantName, setTenantName] = useState('');
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState('');
  const [newKey, setNewKey] = useState<ApiKeyCreated | null>(null);

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    setLoading(true);
    setError('');
    try {
      const result = await api.signup({ tenantName, email, password });
      setToken(result.token);
      // Build a fake ApiKeyCreated shape for the reveal component
      setNewKey({
        id: '',
        name: 'Default',
        key: result.apiKey,
        keyPrefix: result.apiKey.slice(0, 12),
        status: 'active',
        createdAt: new Date().toISOString(),
        revokedAt: null,
      });
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Signup failed');
    } finally {
      setLoading(false);
    }
  }

  if (newKey) {
    return (
      <div className="min-h-screen bg-gray-950 flex items-center justify-center px-4">
        <div className="w-full max-w-md space-y-4">
          <div className="text-center">
            <p className="text-2xl font-bold text-white">⧖ Loom</p>
            <p className="text-gray-400 mt-2 text-sm">Account created — save your API key</p>
          </div>
          <ApiKeyReveal keyData={newKey} onDismiss={() => navigate('/app')} />
        </div>
      </div>
    );
  }

  return (
    <div className="min-h-screen bg-gray-950 flex items-center justify-center px-4">
      <div className="w-full max-w-sm space-y-6">
        {/* Logo */}
        <div className="text-center">
          <Link to="/" className="text-2xl font-bold text-white">⧖ Loom</Link>
          <p className="text-gray-400 mt-2 text-sm">Create your account</p>
        </div>

        {/* Form */}
        <form
          onSubmit={handleSubmit}
          className="bg-gray-900 border border-gray-700 rounded-xl p-6 space-y-4"
        >
          <div>
            <label className="block text-sm text-gray-400 mb-1">Organization name</label>
            <input
              type="text"
              required
              autoFocus
              value={tenantName}
              onChange={e => setTenantName(e.target.value)}
              className="w-full bg-gray-950 border border-gray-700 rounded-lg px-3 py-2 text-gray-100 placeholder-gray-600 focus:outline-none focus:border-indigo-500"
              placeholder="Acme Corp"
            />
          </div>

          <div>
            <label className="block text-sm text-gray-400 mb-1">Email</label>
            <input
              type="email"
              required
              value={email}
              onChange={e => setEmail(e.target.value)}
              className="w-full bg-gray-950 border border-gray-700 rounded-lg px-3 py-2 text-gray-100 placeholder-gray-600 focus:outline-none focus:border-indigo-500"
              placeholder="you@example.com"
            />
          </div>

          <div>
            <label className="block text-sm text-gray-400 mb-1">Password</label>
            <input
              type="password"
              required
              minLength={8}
              value={password}
              onChange={e => setPassword(e.target.value)}
              className="w-full bg-gray-950 border border-gray-700 rounded-lg px-3 py-2 text-gray-100 placeholder-gray-600 focus:outline-none focus:border-indigo-500"
              placeholder="Min. 8 characters"
            />
          </div>

          {error && (
            <p className="text-sm text-red-400 bg-red-950/30 border border-red-800 rounded-lg px-3 py-2">
              {error}
            </p>
          )}

          <button
            type="submit"
            disabled={loading}
            className="w-full py-2.5 bg-indigo-600 hover:bg-indigo-500 disabled:opacity-50 text-white font-medium rounded-lg transition-colors"
          >
            {loading ? 'Creating account…' : 'Create account'}
          </button>
        </form>

        <p className="text-center text-sm text-gray-500">
          Already have an account?{' '}
          <Link to="/login" className="text-indigo-400 hover:text-indigo-300">
            Sign in
          </Link>
        </p>
      </div>
    </div>
  );
}
