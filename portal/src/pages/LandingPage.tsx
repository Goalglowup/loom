import { Link } from 'react-router-dom';

export default function LandingPage() {
  return (
    <div className="min-h-screen bg-gray-950 text-gray-100 flex flex-col">
      {/* Nav */}
      <header className="flex items-center justify-between px-8 py-5 border-b border-gray-800">
        <span className="text-xl font-bold tracking-tight">⧖ Loom</span>
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
      <main className="flex-1 flex flex-col items-center justify-center px-8 py-20 text-center">
        <div className="max-w-2xl mx-auto space-y-6">
          <div className="inline-flex items-center gap-2 text-xs font-medium bg-indigo-950 border border-indigo-800 text-indigo-300 px-3 py-1 rounded-full">
            AI Gateway · Provider-Agnostic · Open Source
          </div>

          <h1 className="text-5xl font-bold tracking-tight bg-gradient-to-br from-white to-gray-400 bg-clip-text text-transparent">
            ⧖ Loom
          </h1>

          <p className="text-xl text-gray-400 leading-relaxed">
            Provider-agnostic AI gateway with full observability.
            Route requests across OpenAI and Azure with encrypted trace recording and per-tenant controls.
          </p>

          <div className="flex items-center justify-center gap-4 pt-2">
            <Link
              to="/signup"
              className="px-6 py-3 bg-indigo-600 hover:bg-indigo-500 text-white font-medium rounded-lg transition-colors"
            >
              Get started free
            </Link>
            <Link
              to="/login"
              className="px-6 py-3 border border-gray-700 hover:border-gray-500 text-gray-300 font-medium rounded-lg transition-colors"
            >
              Sign in
            </Link>
          </div>
        </div>

        {/* Features */}
        <div className="mt-20 grid grid-cols-1 sm:grid-cols-3 gap-6 max-w-3xl w-full">
          {[
            {
              icon: '🔀',
              title: 'Multi-provider routing',
              desc: 'Route to OpenAI or Azure with a single unified API. Switch providers without changing client code.',
            },
            {
              icon: '🔐',
              title: 'Encrypted trace recording',
              desc: 'Every request and response is recorded with encryption at rest. Full audit trail out of the box.',
            },
            {
              icon: '🔑',
              title: 'Per-tenant API keys',
              desc: 'Issue and revoke API keys scoped to your tenant. Full key lifecycle management.',
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
      </main>

      <footer className="text-center text-xs text-gray-600 py-6 border-t border-gray-800">
        © {new Date().getFullYear()} Loom — AI Runtime Control Plane
      </footer>
    </div>
  );
}
