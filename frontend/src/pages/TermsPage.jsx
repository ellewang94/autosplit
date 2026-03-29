/**
 * TermsPage — /terms
 *
 * Terms of Service for AutoSplit. Written in clear language — not designed to
 * hide things, but to actually inform users. Key protections included:
 * - Limitation of liability (caps what users can sue for)
 * - No-warranty clause (we don't guarantee accuracy)
 * - Governing law (California)
 * - Payment terms for future paid tiers
 *
 * Last updated: March 2026
 */
import { Link } from 'react-router-dom'
import { Zap, ArrowLeft, FileText } from 'lucide-react'

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

export default function TermsPage() {
  return (
    <div className="min-h-screen bg-ink-950 px-6 py-12">
      <div className="max-w-2xl mx-auto">

        {/* Back link */}
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
            <FileText size={16} className="text-ink-400" />
            <span className="text-xs text-ink-500 font-mono uppercase tracking-widest">Terms of Service</span>
          </div>
        </div>
        <h1 className="font-display text-3xl font-bold text-ink-50 mb-2">
          Fair terms for everyone.
        </h1>
        <p className="text-sm text-ink-400 mb-10">
          Effective date: March 28, 2026 · AutoSplit, operated by AutoSplit
        </p>

        <Section title="1. Acceptance of these terms">
          <p>
            By creating an account or using AutoSplit ("the Service"), you agree to be bound by these Terms of Service.
            If you don't agree, please don't use the Service.
          </p>
          <p>
            We may update these terms from time to time. If we make material changes, we'll notify you by email
            (if you have an account) and update the effective date above. Continued use after changes constitutes acceptance.
          </p>
        </Section>

        <Section title="2. What AutoSplit does">
          <p>
            AutoSplit is a web application that helps groups of people split shared trip expenses. You upload your bank
            or credit card statements, the app parses the transactions, and it calculates who owes whom and how much.
          </p>
          <p>
            AutoSplit is a <strong className="text-ink-200">calculation tool</strong>. It does math for you — it does not
            move money, initiate payments, or connect to your bank account. All actual payments are made outside the app
            (e.g., via Venmo, Zelle, or cash).
          </p>
        </Section>

        <Section title="3. Eligibility">
          <p>You must be at least 13 years old to use AutoSplit. By using the Service, you represent that you meet this requirement.</p>
        </Section>

        <Section title="4. Your account">
          <p>
            You are responsible for keeping your account credentials secure. Don't share your password.
            Notify us immediately at <a href="mailto:hello@autosplit.co" className="text-lime-400 hover:underline">hello@autosplit.co</a> if
            you believe your account has been compromised.
          </p>
          <p>
            You're responsible for all activity that occurs under your account. We're not liable for losses caused by
            unauthorized use of your account.
          </p>
        </Section>

        <Section title="5. Acceptable use">
          <p>You agree not to:</p>
          <ul className="list-disc list-inside space-y-1.5 text-ink-300 ml-2">
            <li>Use the Service for any unlawful purpose</li>
            <li>Upload bank statements or financial data that belong to someone else without their consent</li>
            <li>Attempt to reverse-engineer, scrape, or disrupt the Service</li>
            <li>Use the Service to harass, deceive, or defraud other people</li>
            <li>Upload malicious files or content</li>
          </ul>
          <p>We reserve the right to suspend or terminate accounts that violate these rules.</p>
        </Section>

        <Section title="6. Data and privacy">
          <p>
            How we handle your data is described in our <Link to="/privacy" className="text-lime-400 hover:underline">Privacy Policy</Link>,
            which is incorporated into these terms by reference. The short version: we parse your statements for transactions,
            then discard the raw file immediately. We store only the extracted transaction data needed to run the Service.
            We never sell your data.
          </p>
        </Section>

        <Section title="7. Payments and free tier">
          <p>
            AutoSplit currently offers a free tier. Future paid features may be introduced. If and when we introduce
            paid plans, we will give you clear advance notice and never charge you without your explicit consent.
          </p>
          <p>
            If paid tiers are introduced: all fees will be listed clearly before purchase. Refunds for annual subscriptions
            are available within 14 days of payment if you haven't used any paid features. Monthly subscriptions are
            non-refundable after the billing date.
          </p>
        </Section>

        <Section title="8. Intellectual property">
          <p>
            AutoSplit and its contents (design, code, copy) are owned by AutoSplit. You may not reproduce, distribute,
            or create derivative works without permission.
          </p>
          <p>
            You retain ownership of your data. By using the Service, you grant us a limited license to process your
            data solely to provide the Service to you.
          </p>
        </Section>

        <Section title="9. Disclaimer of warranties">
          <p>
            <strong className="text-ink-200">THE SERVICE IS PROVIDED "AS IS" AND "AS AVAILABLE" WITHOUT WARRANTIES OF ANY KIND,
            EXPRESS OR IMPLIED.</strong> We don't guarantee that the Service will be error-free, uninterrupted, or that
            our parsing of bank statements will be perfectly accurate.
          </p>
          <p>
            Bank statement formats vary between institutions and change over time. You should always verify the parsed
            transactions against your original statement before relying on the calculated splits for real payments.
            We are not responsible for errors in settlement amounts arising from parsing inaccuracies.
          </p>
        </Section>

        <Section title="10. Limitation of liability">
          <p>
            <strong className="text-ink-200">TO THE MAXIMUM EXTENT PERMITTED BY LAW, AUTOSPLIT SHALL NOT BE
            LIABLE FOR ANY INDIRECT, INCIDENTAL, SPECIAL, CONSEQUENTIAL, OR PUNITIVE DAMAGES, INCLUDING BUT NOT LIMITED
            TO LOSS OF MONEY, GOODWILL, OR DATA, ARISING FROM YOUR USE OF THE SERVICE.</strong>
          </p>
          <p>
            In no event shall our total liability to you for any claims arising from your use of the Service exceed
            the greater of (a) the amount you paid to use the Service in the 12 months preceding the claim, or
            (b) $50 USD.
          </p>
        </Section>

        <Section title="11. Indemnification">
          <p>
            You agree to indemnify and hold harmless AutoSplit, AutoSplit, and its affiliates from any claims, damages,
            or expenses (including reasonable legal fees) arising from your use of the Service or your violation of
            these terms.
          </p>
        </Section>

        <Section title="12. Termination">
          <p>
            We may suspend or terminate your account at any time if you violate these terms. You may delete your account
            at any time by emailing <a href="mailto:hello@autosplit.co" className="text-lime-400 hover:underline">hello@autosplit.co</a>.
          </p>
          <p>
            Upon termination, your right to use the Service ceases immediately. We'll delete your data within 30 days,
            per our Privacy Policy.
          </p>
        </Section>

        <Section title="13. Governing law">
          <p>
            These terms are governed by the laws of the State of California, without regard to its conflict of law
            provisions. Any disputes shall be resolved in the courts located in San Mateo County, California.
          </p>
        </Section>

        <Section title="14. Contact">
          <p>
            Questions about these terms? Email{' '}
            <a href="mailto:hello@autosplit.co" className="text-lime-400 hover:underline">hello@autosplit.co</a>.
          </p>
        </Section>

        {/* Footer */}
        <div className="mt-12 pt-6 border-t border-ink-800 flex gap-6 text-xs text-ink-600 font-mono">
          <Link to="/privacy" className="hover:text-ink-400 transition-colors">Privacy Policy</Link>
          <Link to="/" className="hover:text-ink-400 transition-colors">AutoSplit Home</Link>
        </div>

      </div>
    </div>
  )
}
