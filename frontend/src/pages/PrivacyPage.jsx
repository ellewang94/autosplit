/**
 * PrivacyPage — /privacy
 *
 * Written to be readable, not legalese. Tells users exactly what happens
 * to their bank statements and transaction data — the number one concern
 * people have before uploading financial documents.
 *
 * Last updated: March 2026
 */
import { Link } from 'react-router-dom'
import { Zap, ArrowLeft, Shield } from 'lucide-react'

// ── Section heading component ──────────────────────────────────────────────
function Section({ title, children }) {
  return (
    <section className="mb-10">
      <h2 className="font-display text-xl font-semibold text-ink-100 mb-3 pb-2 border-b border-ink-800">
        {title}
      </h2>
      <div className="space-y-3 text-sm text-ink-300 leading-relaxed">
        {children}
      </div>
    </section>
  )
}

export default function PrivacyPage() {
  return (
    <div className="min-h-screen bg-ink-950 px-6 py-12">
      <div className="max-w-2xl mx-auto">

        {/* Header */}
        <Link to="/" className="inline-flex items-center gap-2 text-xs text-ink-500 hover:text-ink-300 transition-colors mb-10">
          <ArrowLeft size={12} />
          Back to AutoSplit
        </Link>

        {/* Brand + title */}
        <div className="flex items-center gap-3 mb-2">
          <div className="w-9 h-9 rounded-xl bg-lime-400 flex items-center justify-center">
            <Zap size={16} className="text-ink-950" strokeWidth={2.5} />
          </div>
          <div className="flex items-center gap-2">
            <Shield size={16} className="text-ink-400" />
            <span className="text-xs text-ink-500 font-mono uppercase tracking-widest">Privacy Policy</span>
          </div>
        </div>
        <h1 className="font-display text-3xl font-bold text-ink-50 mb-2">
          Your data, your control.
        </h1>
        <p className="text-sm text-ink-400 mb-10">
          Effective date: March 28, 2026 · AutoSplit, operated by Elle Wang
        </p>

        {/* TL;DR — the most important part, shown first */}
        <div className="card mb-10 border-lime-400/20 bg-lime-400/5">
          <p className="text-xs font-mono text-lime-400 uppercase tracking-widest mb-3">The short version</p>
          <ul className="space-y-2 text-sm text-ink-200">
            <li className="flex items-start gap-2">
              <span className="text-lime-400 mt-0.5 flex-shrink-0">→</span>
              Your bank statement is parsed for transactions and then the file is discarded. We don't keep the raw PDF or CSV.
            </li>
            <li className="flex items-start gap-2">
              <span className="text-lime-400 mt-0.5 flex-shrink-0">→</span>
              We store only the extracted transaction data (date, merchant, amount, category) — not your account numbers, balances, or personal financial history.
            </li>
            <li className="flex items-start gap-2">
              <span className="text-lime-400 mt-0.5 flex-shrink-0">→</span>
              We never sell your data. We never share it with advertisers. We never will.
            </li>
            <li className="flex items-start gap-2">
              <span className="text-lime-400 mt-0.5 flex-shrink-0">→</span>
              You can delete your account and all associated data at any time by emailing us.
            </li>
          </ul>
        </div>

        <Section title="1. Who we are">
          <p>
            AutoSplit ("we," "us," "our") is a web application that helps friend groups split shared trip expenses.
            It is operated by Elle Wang, based in San Mateo, California.
            You can reach us at <a href="mailto:hello@autosplit.co" className="text-lime-400 hover:underline">hello@autosplit.co</a>.
          </p>
        </Section>

        <Section title="2. What data we collect">
          <p><strong className="text-ink-200">Account information:</strong> When you sign up, we collect your email address (and name if you use Google OAuth). This is stored in Supabase, our authentication provider.</p>
          <p><strong className="text-ink-200">Transaction data from bank statements:</strong> When you upload a statement, our servers parse it and extract: transaction date, merchant name, and amount. We do not store your account number, card number, available credit, payment history, or any other account-level data. The raw uploaded file (PDF or CSV) is processed in memory and immediately discarded — it is never written to disk or stored in our database.</p>
          <p><strong className="text-ink-200">Trip data:</strong> We store the trip name, date range, member names you enter, and how you categorize and split expenses. This is the core data the service needs to function.</p>
          <p><strong className="text-ink-200">Usage analytics:</strong> We use PostHog to understand how people use the app (e.g., which pages are visited, which features are used). This data is anonymized — we do not send your email, name, or financial data to PostHog. Session recordings may capture your interactions with the interface; we mask all form inputs and financial figures in recordings.</p>
          <p><strong className="text-ink-200">Error reports:</strong> We use Sentry to automatically capture JavaScript errors so we can fix bugs. Error reports do not include your email or financial data.</p>
          <p><strong className="text-ink-200">Feedback:</strong> If you submit in-app feedback, we store your message and optional email address.</p>
        </Section>

        <Section title="3. How we use your data">
          <p>We use your data solely to provide the AutoSplit service:</p>
          <ul className="list-disc list-inside space-y-1.5 text-ink-300 ml-2">
            <li>Parsing your bank statements to extract transactions</li>
            <li>Calculating how expenses should be split among your group</li>
            <li>Generating settlement amounts and payment requests</li>
            <li>Sending you product updates if you opt in (you can opt out anytime)</li>
            <li>Improving the app based on aggregated, anonymized usage patterns</li>
          </ul>
          <p>We do <strong className="text-ink-200">not</strong> use your data for advertising, sell it to third parties, use it to train AI models, or share it with anyone except the service providers listed below.</p>
        </Section>

        <Section title="4. Third-party services">
          <p>We use the following services to operate AutoSplit. Each has its own privacy policy:</p>
          <ul className="list-disc list-inside space-y-1.5 text-ink-300 ml-2">
            <li><strong className="text-ink-200">Supabase</strong> — database and authentication (supabase.com/privacy)</li>
            <li><strong className="text-ink-200">Railway</strong> — backend server hosting (railway.app/legal/privacy)</li>
            <li><strong className="text-ink-200">Vercel</strong> — frontend hosting (vercel.com/legal/privacy-policy)</li>
            <li><strong className="text-ink-200">PostHog</strong> — anonymized usage analytics and session recording (posthog.com/privacy)</li>
            <li><strong className="text-ink-200">Sentry</strong> — error monitoring (sentry.io/privacy)</li>
          </ul>
          <p>All data is stored in the United States.</p>
        </Section>

        <Section title="5. Data retention">
          <p>We retain your account and trip data for as long as your account is active. Raw uploaded statement files are never stored — they are processed and discarded immediately.</p>
          <p>If you delete your account, all associated data (trips, transactions, member lists) is permanently deleted within 30 days.</p>
        </Section>

        <Section title="6. Security">
          <p>All data is transmitted over HTTPS (TLS 1.2+). Your data at rest is encrypted using AES-256 encryption provided by Supabase's PostgreSQL database. We use Supabase's row-level security to ensure users can only access their own data.</p>
          <p>We take security seriously, but no system is perfect. If you discover a security issue, please email us immediately at <a href="mailto:hello@autosplit.co" className="text-lime-400 hover:underline">hello@autosplit.co</a>.</p>
        </Section>

        <Section title="7. Your rights">
          <p>You have the right to:</p>
          <ul className="list-disc list-inside space-y-1.5 text-ink-300 ml-2">
            <li><strong className="text-ink-200">Access</strong> — request a copy of all data we hold about you</li>
            <li><strong className="text-ink-200">Correction</strong> — ask us to correct inaccurate data</li>
            <li><strong className="text-ink-200">Deletion</strong> — delete your account and all associated data</li>
            <li><strong className="text-ink-200">Portability</strong> — request your data in a machine-readable format (CSV)</li>
          </ul>
          <p>To exercise any of these rights, email <a href="mailto:hello@autosplit.co" className="text-lime-400 hover:underline">hello@autosplit.co</a>. We respond within 30 days.</p>
        </Section>

        <Section title="8. Children">
          <p>AutoSplit is not directed at children under 13. We do not knowingly collect data from anyone under 13. If you believe a child has provided us their information, please contact us and we will delete it.</p>
        </Section>

        <Section title="9. Changes to this policy">
          <p>If we make material changes to this policy, we will notify you by email (if you have an account) and update the effective date above. Continued use of AutoSplit after changes constitutes acceptance of the updated policy.</p>
        </Section>

        <Section title="10. Contact">
          <p>
            Questions about this policy? Email <a href="mailto:hello@autosplit.co" className="text-lime-400 hover:underline">hello@autosplit.co</a>.
          </p>
        </Section>

        {/* Footer */}
        <div className="mt-12 pt-6 border-t border-ink-800 flex gap-6 text-xs text-ink-600 font-mono">
          <Link to="/terms" className="hover:text-ink-400 transition-colors">Terms of Service</Link>
          <Link to="/" className="hover:text-ink-400 transition-colors">AutoSplit Home</Link>
        </div>

      </div>
    </div>
  )
}
