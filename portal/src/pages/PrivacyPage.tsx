import { Link } from 'react-router-dom';

export default function PrivacyPage() {
  return (
    <div className="min-h-screen bg-gray-950 text-gray-100 flex flex-col">
      <header className="flex items-center justify-between px-8 py-5 border-b border-gray-800">
        <Link to="/" className="text-xl font-bold tracking-tight">⧖ Arachne</Link>
      </header>

      <main className="flex-1 px-8 py-16 max-w-2xl mx-auto w-full space-y-10">
        <div>
          <h1 className="text-3xl font-bold text-gray-100">Privacy Policy</h1>
          <p className="text-sm text-gray-500 mt-1">Last updated: March 2026</p>
        </div>

        <section className="space-y-3">
          <h2 className="text-lg font-semibold text-gray-200">Data We Collect</h2>
          <p className="text-gray-400 text-sm leading-relaxed">
            During the beta, we collect the email address and optional name you provide when
            signing up for the waitlist. If you create an account, we also collect your email and
            a hashed password. For tenants using the Arachne gateway, we store encrypted request
            and response traces to power the observability features of the platform.
          </p>
        </section>

        <section className="space-y-3">
          <h2 className="text-lg font-semibold text-gray-200">How We Use It</h2>
          <p className="text-gray-400 text-sm leading-relaxed">
            We use your information solely to operate the Arachne service — sending beta access
            invitations, authenticating your account, and providing audit traces for your
            workloads. We do not sell, rent, or share your personal data with third parties for
            advertising or marketing purposes.
          </p>
        </section>

        <section className="space-y-3">
          <h2 className="text-lg font-semibold text-gray-200">Contact</h2>
          <p className="text-gray-400 text-sm leading-relaxed">
            Questions about your data? Reach us at{' '}
            <a
              href="mailto:privacy@arachne-ai.com"
              className="text-indigo-400 hover:text-indigo-300 transition-colors"
            >
              privacy@arachne-ai.com
            </a>.
          </p>
        </section>
      </main>

      <footer className="text-center text-xs text-gray-600 py-6 border-t border-gray-800">
        <div>© 2026 Synaptic Weave, Inc. All rights reserved.</div>
      </footer>
    </div>
  );
}
