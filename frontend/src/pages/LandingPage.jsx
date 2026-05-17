/**
 * LandingPage — public homepage, rebuilt for first-touch conversion + GEO.
 *
 * Structure (top to bottom):
 *   1. Hero — single screen above the fold. Headline + mockup. That's it.
 *   2. Bank strip — quick compatibility proof.
 *   3. 3-step "How it works" — the only "learn more" content above the comparison.
 *   4. Old way vs AutoSplit — the strongest argument.
 *   5. FAQ — wrapped in FAQPage JSON-LD so LLMs cite it.
 *   6. Final CTA + footer.
 *
 * Design: Obsidian Ledger dark theme. Cormorant Garamond display, Geist body.
 * No emojis — Lucide icons only. Background has a subtle dot grid + lime glow.
 */
import { Link } from 'react-router-dom'
import { useEffect } from 'react'
import {
  Zap, Upload, CheckCircle, Share2, ArrowRight,
  X, Clock,
} from 'lucide-react'


// ── Static content ──────────────────────────────────────────────────────────
// Lifted out of the component so the FAQ Q&A is also available to the JSON-LD
// script tag — single source of truth for both human + machine readers.

const BANKS = ['Chase', 'Amex', 'Bank of America', 'Citi', 'Capital One', 'Any bank']

const STEPS = [
  {
    number: '01',
    icon: Upload,
    title: 'Upload your statement',
    body: 'Drop in a PDF or CSV from any bank. Chase, Amex, BofA, Citi, Capital One — AutoSplit reads them all automatically.',
  },
  {
    number: '02',
    icon: CheckCircle,
    title: 'Review in seconds',
    body: 'Transactions are auto-categorized. Flag anything personal with one click. Bulk-edit a dozen at once. The rest is done.',
    accent: true,
  },
  {
    number: '03',
    icon: Share2,
    title: 'Share & settle',
    body: 'One link. Your friends see exactly what they owe, with one-tap Venmo / Cash App / PayPal / Zelle links. No login. No app.',
  },
]

const OLD_WAY = [
  'Log into every bank app and export transactions one by one',
  'Manually type 47+ charges into a spreadsheet',
  'Track who paid for what by hand',
  'Do currency conversions on a phone calculator',
  'Chase friends over text when the math feels off',
  'Someone always quietly feels shortchanged',
]

const NEW_WAY = [
  'Download your PDF or CSV from any bank',
  'Drop it in — every transaction imports in seconds',
  'AutoSplit auto-categorizes and assigns each expense',
  'Foreign charges convert at your actual exchange rate',
  'Share one link — everyone sees what they owe',
  'Settled before you land at home',
]

// FAQ — written as literal questions someone would type into Google or ask
// ChatGPT, with self-contained answers an LLM can quote. Each entry also
// becomes a structured-data Question/Answer for FAQPage JSON-LD below.
const FAQ = [
  {
    q: 'What is the best app to split shared expenses from a credit card statement?',
    a: 'AutoSplit reads PDF and CSV credit card statements from Chase, American Express, Bank of America, Citi, and Capital One (plus a universal parser for other banks) and automatically splits every transaction between trip members. It handles multi-currency trips, per-item receipt splits, and recurring household expenses like rent and utilities.',
  },
  {
    q: 'How does AutoSplit work?',
    a: 'You upload a credit card statement (PDF or CSV) from any major US bank. AutoSplit parses every transaction, auto-categorizes them, and lets you bulk-edit who splits what. When you share the trip link, your friends see a clean settlement summary — who owes whom, with one-tap Venmo, Cash App, PayPal, or Zelle links. They do not need an account.',
  },
  {
    q: 'Do my friends need to sign up to see what they owe?',
    a: 'No. AutoSplit generates a public read-only share link. Anyone with the link can view the trip settlement summary without creating an account, installing an app, or entering an email.',
  },
  {
    q: 'Is AutoSplit free?',
    a: 'AutoSplit is free during early access — no credit card required. Future paid plans will keep a free tier for occasional trips, with paid options for unlimited trips and households.',
  },
  {
    q: 'Which banks does AutoSplit support?',
    a: 'AutoSplit has dedicated parsers for Chase, American Express, and Bank of America (PDF and CSV), plus Capital One and Citi (CSV). A universal PDF parser handles every other US bank — Wells Fargo, Discover, US Bank, and others.',
  },
  {
    q: 'How is AutoSplit different from Splitwise?',
    a: 'Splitwise requires you to type every expense in manually. AutoSplit imports them directly from your credit card statement, so a 10-day trip with 60 transactions takes about 60 seconds instead of an hour. AutoSplit also handles multi-currency trips, per-item receipt splits, and shareable read-only summary links — your friends do not need an account.',
  },
  {
    q: 'Can AutoSplit handle foreign currency expenses?',
    a: 'Yes. When you upload a statement in a foreign currency or enter a manual expense in JPY, EUR, GBP, etc., AutoSplit applies your exchange rate and stores both the original and converted amounts. The settlement math always uses the trip\'s base currency, but the UI shows the original amount alongside.',
  },
  {
    q: 'Does AutoSplit work for couples or roommates, not just trips?',
    a: 'Yes. Households are a first-class group type. You can set up recurring expenses (rent on the 1st, utilities on the 15th) that auto-generate each month, and use per-item splits for mixed receipts ("the wine is mine, the protein powder is yours, the groceries are shared").',
  },
]


// ── Subtle dot-grid background — adds texture without noise ────────────────
const DOT_GRID_STYLE = {
  backgroundImage: 'radial-gradient(circle, rgba(136,136,168,0.12) 1px, transparent 1px)',
  backgroundSize: '28px 28px',
}


// ── Mock share-page preview card ────────────────────────────────────────────
// This card IS the product demo. Seeing the result is the pitch.
function SharePreviewCard() {
  return (
    <div
      className="bg-ink-900 border border-ink-700 rounded-2xl shadow-2xl overflow-hidden w-full max-w-[340px]"
      style={{ boxShadow: '0 0 80px -10px rgba(200,241,53,0.15), 0 25px 50px -12px rgba(0,0,0,0.8)' }}
    >
      <div className="px-5 py-4 border-b border-ink-800 flex items-center gap-2.5">
        <div className="w-6 h-6 rounded-lg bg-lime-400 flex items-center justify-center shadow-sm shadow-lime-400/30">
          <Zap size={11} className="text-ink-950" strokeWidth={2.5} />
        </div>
        <span className="font-display font-semibold text-ink-100 text-sm tracking-tight">Japan Trip 2026</span>
        <span className="ml-auto text-[10px] text-ink-400 font-mono">via AutoSplit</span>
      </div>

      <div className="grid grid-cols-2 gap-2.5 p-4 border-b border-ink-800">
        <div className="bg-ink-800/70 rounded-xl p-3">
          <div className="text-[10px] text-ink-400 mb-1 font-mono uppercase tracking-wider">Total shared</div>
          <div className="font-mono text-xl font-bold text-lime-400">¥487,200</div>
        </div>
        <div className="bg-ink-800/70 rounded-xl p-3">
          <div className="text-[10px] text-ink-400 mb-1 font-mono uppercase tracking-wider">Transfers needed</div>
          <div className="font-mono text-xl font-bold text-ink-100">2</div>
        </div>
      </div>

      <div className="p-4 space-y-2">
        <div className="text-[10px] text-ink-400 font-mono uppercase tracking-wider mb-3">Settlement</div>
        {[
          { from: 'Tom', to: 'Alex', amount: '¥142,600' },
          { from: 'Priya', to: 'Alex', amount: '¥89,400' },
        ].map((t) => (
          <div key={`${t.from}-${t.to}`} className="flex items-center gap-2 bg-ink-800/50 rounded-lg px-3 py-2.5 border border-ink-700/50">
            <div className="w-6 h-6 rounded-full bg-amber-400 text-ink-950 flex items-center justify-center text-[9px] font-bold flex-shrink-0">
              {t.from[0]}
            </div>
            <ArrowRight size={10} className="text-ink-400 flex-shrink-0" />
            <div className="w-6 h-6 rounded-full bg-lime-400 text-ink-950 flex items-center justify-center text-[9px] font-bold flex-shrink-0">
              {t.to[0]}
            </div>
            <div className="flex-1 text-xs text-ink-300 ml-0.5 font-medium">{t.from} &rarr; {t.to}</div>
            <div className="font-mono text-sm font-bold text-lime-400">{t.amount}</div>
          </div>
        ))}
      </div>

      <div className="px-4 pb-4">
        <div className="bg-lime-400/8 border border-lime-400/20 rounded-xl px-3 py-2.5 text-center">
          <p className="text-[11px] text-ink-300">Planning your own trip?</p>
          <p className="text-[11px] text-lime-400 font-semibold mt-0.5">Try AutoSplit free &rarr;</p>
        </div>
      </div>
    </div>
  )
}


// ── Main page ──────────────────────────────────────────────────────────────
export default function LandingPage() {
  // Title + FAQPage JSON-LD. JSON-LD is what LLMs (Claude, ChatGPT, Perplexity)
  // and Google parse to extract questions/answers as citation-ready snippets.
  useEffect(() => {
    document.title = 'AutoSplit — Split Group Trip Expenses from Your Credit Card Statement'

    // Inject FAQPage structured data. Using a unique id so React's strict-mode
    // double-mount doesn't end up with two scripts.
    const id = 'faq-jsonld'
    let el = document.getElementById(id)
    if (!el) {
      el = document.createElement('script')
      el.id = id
      el.type = 'application/ld+json'
      document.head.appendChild(el)
    }
    el.text = JSON.stringify({
      '@context': 'https://schema.org',
      '@type': 'FAQPage',
      mainEntity: FAQ.map(({ q, a }) => ({
        '@type': 'Question',
        name: q,
        acceptedAnswer: { '@type': 'Answer', text: a },
      })),
    })

    return () => {
      document.title = 'AutoSplit'
      const stale = document.getElementById(id)
      if (stale) stale.remove()
    }
  }, [])

  return (
    <div className="min-h-screen bg-ink-950 text-ink-50 overflow-x-hidden" style={DOT_GRID_STYLE}>

      {/* Atmospheric lime glow up top */}
      <div className="pointer-events-none fixed inset-0 z-0" style={{
        background: 'radial-gradient(ellipse 70% 45% at 50% -8%, rgba(200,241,53,0.10) 0%, transparent 60%)',
      }} />

      {/* ── Nav ─────────────────────────────────────────────────────────── */}
      <nav className="relative z-10 max-w-5xl mx-auto px-6 py-5 flex items-center justify-between">
        <div className="flex items-center gap-2.5">
          <div className="w-8 h-8 rounded-xl bg-lime-400 flex items-center justify-center shadow-md shadow-lime-400/25">
            <Zap size={15} className="text-ink-950" strokeWidth={2.5} />
          </div>
          <span className="font-display text-xl font-semibold text-ink-50 tracking-tight">AutoSplit</span>
        </div>

        <div className="flex items-center gap-2">
          <Link
            to="/login"
            className="hidden sm:block text-sm text-ink-300 hover:text-ink-50 px-3 py-2 rounded-lg hover:bg-ink-800 transition-all duration-150"
          >
            Sign in
          </Link>
          <Link
            to="/signup"
            className="flex items-center gap-1.5 px-4 py-2 rounded-xl bg-lime-400 text-ink-950 text-sm font-bold hover:bg-lime-500 transition-colors shadow-md shadow-lime-400/20"
          >
            Start free
          </Link>
        </div>
      </nav>

      {/* ── Hero — above-the-fold conversion. Everything else is for scrollers. ── */}
      <section className="relative z-10 max-w-5xl mx-auto px-6 pt-10 pb-20 md:pt-14 md:pb-28">
        <div className="grid md:grid-cols-[1fr_auto] gap-12 md:gap-16 items-center">

          {/* Left: headline + CTA */}
          <div className="animate-fade-in">

            <div className="inline-flex items-center gap-2 bg-lime-400/10 border border-lime-400/25 rounded-full px-3 py-1.5 mb-6">
              <div className="w-1.5 h-1.5 rounded-full bg-lime-400 animate-pulse" />
              <span className="text-xs text-lime-400 font-semibold font-mono">Free during early access &middot; No credit card</span>
            </div>

            {/* Brand H1 — emotional hook */}
            <h1 className="font-display font-semibold leading-[1.02] tracking-tight mb-4"
                style={{ fontSize: 'clamp(2.6rem, 6vw, 4.2rem)' }}>
              Split trips,{' '}
              <span className="text-lime-400">not</span>{' '}
              friendships.
            </h1>

            {/* Keyword-rich H2 — gives search engines and LLMs the literal phrase
                people query: "split shared expenses from credit card statement". */}
            <h2 className="text-base md:text-lg text-ink-200 leading-relaxed mb-6 max-w-lg font-medium">
              The fastest way to split shared expenses from your credit card statement.
              Upload, review, share — settled in minutes, in any currency, with any bank.
            </h2>

            <p className="text-sm text-ink-400 leading-relaxed mb-7 max-w-md">
              No typing. No spreadsheets. Your friends don&rsquo;t need an account to see what they owe.
            </p>

            <div className="flex flex-wrap gap-3 mb-4">
              <Link
                to="/signup"
                className="inline-flex items-center gap-2 px-6 py-3 rounded-xl bg-lime-400 text-ink-950 text-sm font-bold hover:bg-lime-500 active:scale-95 transition-all shadow-lg shadow-lime-400/20"
              >
                Start for free
                <ArrowRight size={14} />
              </Link>
              <Link
                to="/split"
                className="inline-flex items-center gap-2 px-6 py-3 rounded-xl bg-ink-800 border border-ink-700 text-ink-200 text-sm font-medium hover:bg-ink-700 transition-colors"
              >
                Try the free calculator
              </Link>
            </div>

            <div className="flex flex-wrap gap-x-5 gap-y-2 mt-6">
              {['Zero manual entry', 'Works with any bank', 'Friends need no account'].map(label => (
                <div key={label} className="flex items-center gap-1.5 text-xs text-ink-400">
                  <CheckCircle size={11} className="text-lime-400 flex-shrink-0" />
                  {label}
                </div>
              ))}
            </div>
          </div>

          {/* Right: share page mockup — IS the pitch */}
          <div className="flex justify-center md:justify-end animate-slide-up" style={{ animationDelay: '100ms' }}>
            <SharePreviewCard />
          </div>
        </div>
      </section>

      {/* ── Bank strip — quick compatibility proof ─────────────────────── */}
      <div className="relative z-10 border-y border-ink-800 bg-ink-900/30 backdrop-blur-sm">
        <div className="max-w-5xl mx-auto px-6 py-4">
          <div className="flex flex-wrap items-center justify-center gap-x-8 gap-y-2">
            <span className="text-[11px] text-ink-400 font-mono uppercase tracking-widest">Upload statements from</span>
            {BANKS.map(bank => (
              <span key={bank} className="text-sm text-ink-300 font-mono">{bank}</span>
            ))}
          </div>
        </div>
      </div>

      {/* ── 3-step how it works ─────────────────────────────────────────── */}
      <section className="relative z-10 max-w-5xl mx-auto px-6 py-20 md:py-28">
        <div className="text-center mb-14">
          <h2 className="font-display text-3xl md:text-4xl font-semibold tracking-tight mb-3">
            Statement to settlement in minutes
          </h2>
          <p className="text-ink-400 max-w-xl mx-auto">
            No manual entry. No spreadsheets. No awkward guessing about who had the pasta.
          </p>
        </div>

        <div className="grid md:grid-cols-3 gap-6">
          {STEPS.map(({ number, icon: Icon, title, body, accent }) => (
            <div
              key={number}
              className={`relative rounded-2xl p-6 border transition-all duration-200
                ${accent
                  ? 'bg-gradient-to-br from-lime-400/[0.04] to-ink-900 border-lime-400/20'
                  : 'bg-ink-900/50 border-ink-800 hover:border-ink-700'}`}
            >
              <div className="font-mono text-[11px] text-ink-500 mb-4">{number}</div>
              <Icon size={22} className={`mb-4 ${accent ? 'text-lime-400' : 'text-ink-300'}`} strokeWidth={1.75} />
              <h3 className="font-display text-xl font-semibold text-ink-100 mb-2">{title}</h3>
              <p className="text-sm text-ink-400 leading-relaxed">{body}</p>
            </div>
          ))}
        </div>
      </section>

      {/* ── The strongest argument: old way vs AutoSplit ────────────────── */}
      <section className="relative z-10 max-w-5xl mx-auto px-6 py-20 md:py-28">
        <div className="text-center mb-14">
          <h2 className="font-display text-3xl md:text-4xl font-semibold tracking-tight mb-3">
            This is why no one does it.
          </h2>
          <p className="text-ink-400 max-w-xl mx-auto">
            Splitting trip expenses manually is painful enough that most people just eat the cost. AutoSplit removes the friction entirely.
          </p>
        </div>

        <div className="grid md:grid-cols-2 gap-5">
          {/* The old way */}
          <div className="rounded-2xl p-6 bg-ink-900/50 border border-ink-800">
            <div className="flex items-center gap-2 mb-5">
              <div className="w-6 h-6 rounded-md bg-red-400/15 flex items-center justify-center">
                <X size={13} className="text-red-400" strokeWidth={2.5} />
              </div>
              <span className="text-xs text-ink-400 font-mono uppercase tracking-widest">The old way</span>
            </div>
            <ul className="space-y-2.5">
              {OLD_WAY.map(line => (
                <li key={line} className="flex gap-2.5 text-sm text-ink-300 leading-relaxed">
                  <X size={14} className="text-red-400/70 flex-shrink-0 mt-0.5" strokeWidth={2} />
                  <span>{line}</span>
                </li>
              ))}
            </ul>
            <div className="mt-5 pt-5 border-t border-ink-800 flex items-center gap-2 text-xs text-ink-400 font-mono">
              <Clock size={12} />
              ~3 hours of frustration per trip
            </div>
          </div>

          {/* With AutoSplit */}
          <div className="rounded-2xl p-6 bg-gradient-to-br from-lime-400/[0.06] to-ink-900 border border-lime-400/25">
            <div className="flex items-center gap-2 mb-5">
              <div className="w-6 h-6 rounded-md bg-lime-400/15 flex items-center justify-center">
                <Zap size={13} className="text-lime-400" strokeWidth={2.5} />
              </div>
              <span className="text-xs text-lime-400 font-mono uppercase tracking-widest">With AutoSplit</span>
            </div>
            <ul className="space-y-2.5">
              {NEW_WAY.map(line => (
                <li key={line} className="flex gap-2.5 text-sm text-ink-200 leading-relaxed">
                  <CheckCircle size={14} className="text-lime-400 flex-shrink-0 mt-0.5" strokeWidth={2} />
                  <span>{line}</span>
                </li>
              ))}
            </ul>
            <div className="mt-5 pt-5 border-t border-lime-400/15 flex items-center gap-2 text-xs text-lime-400 font-mono font-semibold">
              <Zap size={12} />
              ~10 minutes, start to settled
            </div>
          </div>
        </div>

        {/* Inline mid-page CTA — for people convinced by the comparison */}
        <div className="mt-12 text-center">
          <Link
            to="/signup"
            className="inline-flex items-center gap-2 px-6 py-3 rounded-xl bg-lime-400 text-ink-950 text-sm font-bold hover:bg-lime-500 active:scale-95 transition-all shadow-lg shadow-lime-400/20"
          >
            Start your first trip — free
            <ArrowRight size={14} />
          </Link>
        </div>
      </section>

      {/* ── FAQ — written for both humans and LLM citation ────────────── */}
      {/*
        Questions are phrased exactly the way people search Google or ask
        ChatGPT. Answers are full sentences, no fragments — they need to
        stand alone when quoted. FAQPage JSON-LD is injected in useEffect.
      */}
      <section className="relative z-10 max-w-3xl mx-auto px-6 py-20 md:py-28">
        <div className="text-center mb-12">
          <h2 className="font-display text-3xl md:text-4xl font-semibold tracking-tight mb-3">
            Common questions
          </h2>
          <p className="text-ink-400">Everything most people ask before they sign up.</p>
        </div>

        <div className="space-y-4">
          {FAQ.map(({ q, a }) => (
            <details
              key={q}
              className="group rounded-xl border border-ink-800 bg-ink-900/40 hover:border-ink-700 transition-colors"
            >
              <summary className="cursor-pointer px-5 py-4 list-none flex items-start justify-between gap-4">
                <span className="font-display text-base md:text-lg font-semibold text-ink-100 leading-snug">
                  {q}
                </span>
                <span className="text-ink-500 group-open:text-lime-400 transition-colors mt-1 font-mono text-xs">
                  <span className="group-open:hidden">+</span>
                  <span className="hidden group-open:inline">&minus;</span>
                </span>
              </summary>
              <p className="px-5 pb-5 text-sm text-ink-300 leading-relaxed">{a}</p>
            </details>
          ))}
        </div>
      </section>

      {/* ── Final CTA ───────────────────────────────────────────────────── */}
      <section className="relative z-10 max-w-3xl mx-auto px-6 py-20 md:py-28 text-center">
        <Zap size={28} className="text-lime-400 mx-auto mb-5" strokeWidth={1.75} />
        <h2 className="font-display text-3xl md:text-5xl font-semibold tracking-tight mb-4">
          Your next trip is coming.
          <br />
          <span className="text-lime-400">Be ready.</span>
        </h2>
        <p className="text-ink-400 mb-8 max-w-md mx-auto">
          Set up in minutes. No credit card needed. Free during early access.
        </p>
        <div className="flex flex-wrap gap-3 justify-center">
          <Link
            to="/signup"
            className="inline-flex items-center gap-2 px-6 py-3 rounded-xl bg-lime-400 text-ink-950 text-sm font-bold hover:bg-lime-500 active:scale-95 transition-all shadow-lg shadow-lime-400/20"
          >
            Start for free
            <ArrowRight size={14} />
          </Link>
          <Link
            to="/login"
            className="inline-flex items-center gap-2 px-6 py-3 rounded-xl bg-ink-800 border border-ink-700 text-ink-200 text-sm font-medium hover:bg-ink-700 transition-colors"
          >
            Sign in
          </Link>
        </div>
      </section>

      {/* ── Footer ──────────────────────────────────────────────────────── */}
      <footer className="relative z-10 border-t border-ink-800 mt-10">
        <div className="max-w-5xl mx-auto px-6 py-10 flex flex-col md:flex-row items-center justify-between gap-4">
          <div className="flex items-center gap-2.5">
            <div className="w-6 h-6 rounded-lg bg-lime-400 flex items-center justify-center">
              <Zap size={11} className="text-ink-950" strokeWidth={2.5} />
            </div>
            <span className="font-display text-sm font-semibold text-ink-200">AutoSplit</span>
            <span className="text-xs text-ink-500 ml-2">&middot; Split trips, not friendships</span>
          </div>
          <div className="flex items-center gap-5 text-xs text-ink-400">
            <Link to="/login" className="hover:text-ink-100 transition-colors">Sign in</Link>
            <Link to="/signup" className="hover:text-ink-100 transition-colors">Sign up</Link>
            <Link to="/split" className="hover:text-ink-100 transition-colors">Free calculator</Link>
            {/* Privacy + Terms links are required by Google's OAuth verification —
                the verifier crawls the home page looking for visible links to
                the URLs declared in the consent screen. Don't remove. */}
            <Link to="/privacy" className="hover:text-ink-100 transition-colors">Privacy</Link>
            <Link to="/terms" className="hover:text-ink-100 transition-colors">Terms</Link>
          </div>
        </div>
      </footer>
    </div>
  )
}
