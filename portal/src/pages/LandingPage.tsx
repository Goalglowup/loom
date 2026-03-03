import { Link } from 'react-router-dom';
import { useState } from 'react';

const API_BASE = import.meta.env.VITE_API_BASE_URL ?? '';

export default function LandingPage() {
  const [email, setEmail] = useState('');
  const [name, setName] = useState('');
  const [signupState, setSignupState] = useState<'idle' | 'loading' | 'success' | 'error'>('idle');
  const [errorMessage, setErrorMessage] = useState('');

  async function handleSignup(e: React.FormEvent) {
    e.preventDefault();
    setSignupState('loading');
    setErrorMessage('');
    try {
      const res = await fetch(`${API_BASE}/v1/beta/signup`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ email, name: name || undefined }),
      });
      if (!res.ok) {
        const data = await res.json().catch(() => ({}));
        throw new Error(data.error || `Request failed (${res.status})`);
      }
      setSignupState('success');
    } catch (err) {
      setErrorMessage((err as Error).message);
      setSignupState('error');
    }
  }

  return (
    <div className="min-h-screen bg-gray-950 text-gray-100 flex flex-col">
      {/* Nav */}
      <header className="flex items-center justify-between px-8 py-5 border-b border-gray-800">
        <span className="text-xl font-bold tracking-tight">⧖ Arachne</span>
        <div className="flex items-center gap-4">
          <Link to="/login" className="text-sm text-gray-400 hover:text-gray-100 transition-colors">
            Sign in
          </Link>
          <Link
            to="/signup"
            className="text-sm px-4 py-2 bg-indigo-600 hover:bg-indigo-500 text-white rounded-lg transition-colors"
          >
            Get started free
          </Link>
        </div>
      </header>

      {/* Hero */}
      <main className="flex-1 flex flex-col items-center px-8 py-20">
        <div className="max-w-2xl mx-auto space-y-6 text-center">
          <div className="inline-flex items-center gap-2 text-xs font-medium bg-indigo-950 border border-indigo-800 text-indigo-300 px-3 py-1 rounded-full">
            Now in Beta · OpenAI-Compatible · Multi-Tenant
          </div>

          <h1 className="text-5xl font-bold tracking-tight bg-gradient-to-br from-white to-gray-400 bg-clip-text text-transparent">
            The AI runtime built for builders who ship.
          </h1>

          <p className="text-xl text-gray-400 leading-relaxed">
            Arachne is a multi-tenant AI proxy with full observability. Drop-in OpenAI-compatible
            API — add streaming, audit traces, KnowledgeBase RAG, and per-tenant controls without
            changing your client code.
          </p>

          <div className="flex items-center justify-center gap-4 pt-2">
            <a
              href="#beta-signup"
              className="px-6 py-3 bg-indigo-600 hover:bg-indigo-500 text-white font-medium rounded-lg transition-colors"
            >
              Join the Beta
            </a>
            <Link
              to="/login"
              className="px-6 py-3 border border-gray-700 hover:border-gray-500 text-gray-300 font-medium rounded-lg transition-colors"
            >
              Sign in
            </Link>
          </div>
        </div>

        {/* Features */}
        <div className="mt-20 grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-6 max-w-5xl w-full">
          {[
            {
              icon: '📋',
              title: 'Full audit traces',
              desc: 'Every request and response recorded with encryption at rest. Search, replay, and debug any conversation.',
            },
            {
              icon: '⚡',
              title: 'Streaming support',
              desc: 'First-class SSE streaming across all providers. Real-time responses with no extra configuration.',
            },
            {
              icon: '🏢',
              title: 'Multi-tenant proxy',
              desc: 'Isolate workloads by tenant. Issue and revoke scoped API keys with full lifecycle management.',
            },
            {
              icon: '🗄️',
              title: 'KnowledgeBase RAG',
              desc: 'Attach vector knowledge bases to your agents. Retrieval-augmented generation without the plumbing.',
            },
          ].map(f => (
            <div
              key={f.title}
              className="bg-gray-900 border border-gray-800 rounded-xl p-5 text-left space-y-2"
            >
              <div className="text-2xl">{f.icon}</div>
              <h3 className="font-semibold text-gray-100">{f.title}</h3>
              <p className="text-sm text-gray-400">{f.desc}</p>
            </div>
          ))}
        </div>

        {/* Beta signup */}
        <section id="beta-signup" className="mt-24 w-full max-w-md mx-auto text-center space-y-6">
          <h2 className="text-2xl font-bold text-gray-100">Get early access</h2>
          <p className="text-gray-400 text-sm">Join the waitlist and we'll reach out when your spot is ready.</p>

          {signupState === 'success' ? (
            <div className="bg-green-900/40 border border-green-700 text-green-300 rounded-xl px-6 py-5 text-sm font-medium">
              🎉 You're on the list! We'll be in touch soon.
            </div>
          ) : (
            <form onSubmit={handleSignup} className="space-y-3">
              <input
                type="text"
                placeholder="Name (optional)"
                value={name}
                onChange={e => setName(e.target.value)}
                className="w-full px-4 py-3 bg-gray-900 border border-gray-700 rounded-lg text-gray-100 placeholder-gray-500 focus:outline-none focus:border-indigo-500 text-sm"
              />
              <input
                type="email"
                placeholder="Email address"
                required
                value={email}
                onChange={e => setEmail(e.target.value)}
                className="w-full px-4 py-3 bg-gray-900 border border-gray-700 rounded-lg text-gray-100 placeholder-gray-500 focus:outline-none focus:border-indigo-500 text-sm"
              />
              {signupState === 'error' && (
                <p className="text-red-400 text-xs text-left">{errorMessage}</p>
              )}
              <button
                type="submit"
                disabled={signupState === 'loading'}
                className="w-full px-6 py-3 bg-indigo-600 hover:bg-indigo-500 disabled:opacity-60 disabled:cursor-not-allowed text-white font-medium rounded-lg transition-colors text-sm"
              >
                {signupState === 'loading' ? 'Joining…' : 'Join the Beta Waitlist'}
              </button>
            </form>
          )}
        </section>
      </main>

      <footer className="text-center text-xs text-gray-600 py-6 border-t border-gray-800 space-y-1">
        <div>© 2026 Synaptic Weave, Inc. All rights reserved.</div>
        <div className="flex items-center justify-center gap-4">
          <Link to="/about" className="hover:text-gray-400 transition-colors">About</Link>
          <Link to="/privacy" className="hover:text-gray-400 transition-colors">Privacy Policy</Link>
        </div>
      </footer>
    </div>
  );
}
