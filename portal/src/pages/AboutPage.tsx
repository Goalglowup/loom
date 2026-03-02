import { Link } from 'react-router-dom';

export default function AboutPage() {
  return (
    <div className="min-h-screen bg-gray-950 text-gray-100 flex flex-col">
      <header className="flex items-center justify-between px-8 py-5 border-b border-gray-800">
        <Link to="/" className="text-xl font-bold tracking-tight">⧖ Arachne</Link>
      </header>

      <main className="flex-1 px-8 py-16 max-w-2xl mx-auto w-full space-y-10">
        <h1 className="text-3xl font-bold text-gray-100">About Arachne</h1>

        <section className="space-y-3">
          <h2 className="text-lg font-semibold text-gray-200">The myth</h2>
          <p className="text-gray-400 text-sm leading-relaxed">
            In Greek mythology, Arachne was a mortal weaver of extraordinary skill — so gifted
            that she dared challenge the goddess Athena herself. Her tapestries told true stories
            with breathtaking precision, weaving countless threads into a single, coherent whole.
            Transformed into the first spider, she continued to weave — forever.
          </p>
          <p className="text-gray-400 text-sm leading-relaxed">
            We named our platform Arachne because we believe AI applications are woven from many
            threads — providers, models, contexts, and conversations — and someone needs to hold
            the loom.
          </p>
        </section>

        <section className="space-y-3">
          <h2 className="text-lg font-semibold text-gray-200">The platform</h2>
          <p className="text-gray-400 text-sm leading-relaxed">
            Arachne is an AI runtime control plane built for teams who ship production AI. It
            provides a drop-in OpenAI-compatible proxy with multi-tenant isolation, full audit
            traces, streaming support, and KnowledgeBase-powered RAG — all without rewriting your
            application code.
          </p>
          <p className="text-gray-400 text-sm leading-relaxed">
            We built Arachne for engineers who need observability and control as their AI workloads
            grow beyond a single model and a single team. Route requests, inspect every token,
            and manage access — all from one place.
          </p>
        </section>

        <section className="space-y-3">
          <h2 className="text-lg font-semibold text-gray-200">The company</h2>
          <p className="text-gray-400 text-sm leading-relaxed">
            Arachne is built by{' '}
            <span className="text-gray-200 font-medium">Synaptic Weave, Inc.</span> — a company
            dedicated to making AI infrastructure observable, auditable, and production-ready.
          </p>
        </section>
      </main>

      <footer className="text-center text-xs text-gray-600 py-6 border-t border-gray-800">
        <div>© 2026 Synaptic Weave, Inc. All rights reserved.</div>
      </footer>
    </div>
  );
}
