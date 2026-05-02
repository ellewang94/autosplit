/**
 * LandingPage — the public homepage.
 *
 * Redesigned for growth:
 *   1. Cold visitor (heard about it) — bold hero, clear value, low-friction signup
 *   2. Warm visitor (got a share link) — the preview card is the hook, CTA is obvious
 *
 * Design: Obsidian Ledger dark theme. Cormorant Garamond display, Geist body.
 * No emojis — icons only. Background has a subtle dot grid for texture.
 */
import { Link } from 'react-router-dom'
import { useEffect } from 'react'
import {
  Zap, Upload, CheckCircle, Share2, ArrowRight, CreditCard,
  Globe, Users, FileText, TrendingUp, X, Clock, AlertTriangle,
  CheckSquare, Camera, Wallet,
} from 'lucide-react'

// ── Subtle dot-grid background — adds texture without noise ────────────────
// This is a CSS background-image using a radial gradient to create dots.
// Pure CSS — no extra images or dependencies.
const DOT_GRID_STYLE = {
  backgroundImage: 'radial-gradient(circle, rgba(136,136,168,0.12) 1px, transparent 1px)',
  backgroundSize: '28px 28px',
}

// ── Banks the app works with ────────────────────────────────────────────────
const BANKS = ['Chase', 'Amex', 'Bank of America', 'Citi', 'Capital One', 'Any bank']

// ── How it works — 3 steps ─────────────────────────────────────────────────
const STEPS = [
  {
    number: '01',
    icon: Upload,
    title: 'Upload your statement',
    body: 'Drop in a PDF or CSV from any bank. Chase, Amex, BofA, Citi — AutoSplit reads it automatically.',
  },
  {
    number: '02',
    icon: CheckCircle,
    title: 'Review in seconds',
    body: 'Transactions are auto-categorized. Flag anything personal with one click. The rest is done.',
    accent: true,
  },
  {
    number: '03',
    icon: Share2,
    title: 'Share & settle',
    body: 'One link. Your friends see exactly what they owe — no login, no app, no awkward conversation.',
  },
]

// ── Mock share-page preview card ────────────────────────────────────────────
// A faithful reproduction of what a recipient sees when you share a trip link.
// This IS the product demo — make it look gorgeous.
function SharePreviewCard() {
  return (
    <div
      className="bg-ink-900 border border-ink-700 rounded-2xl shadow-2xl overflow-hidden w-full max-w-[340px]"
      style={{ boxShadow: '0 0 80px -10px rgba(200,241,53,0.15), 0 25px 50px -12px rgba(0,0,0,0.8)' }}
    >
      {/* Card header with branding */}
      <div className="px-5 py-4 border-b border-ink-800 flex items-center gap-2.5">
        <div className="w-6 h-6 rounded-lg bg-lime-400 flex items-center justify-center shadow-sm shadow-lime-400/30">
          <Zap size={11} className="text-ink-950" strokeWidth={2.5} />
        </div>
        <span className="font-display font-semibold text-ink-100 text-sm tracking-tight">Japan Trip 2026</span>
        <span className="ml-auto text-[10px] text-ink-400 font-mono">via AutoSplit</span>
      </div>

      {/* Stats row */}
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

      {/* Who owes whom */}
      <div className="p-4 space-y-2">
        <div className="text-[10px] text-ink-400 font-mono uppercase tracking-wider mb-3">Settlement</div>
        {[
          { from: 'Tom', to: 'Alex', amount: '¥142,600' },
          { from: 'Priya', to: 'Alex', amount: '¥89,400' },
        ].map((t, i) => (
          <div key={i} className="flex items-center gap-2 bg-ink-800/50 rounded-lg px-3 py-2.5 border border-ink-700/50">
            {/* From avatar */}
            <div className="w-6 h-6 rounded-full bg-amber-400 text-ink-950 flex items-center justify-center text-[9px] font-bold flex-shrink-0">
              {t.from[0]}
            </div>
            <ArrowRight size={10} className="text-ink-400 flex-shrink-0" />
            {/* To avatar */}
            <div className="w-6 h-6 rounded-full bg-lime-400 text-ink-950 flex items-center justify-center text-[9px] font-bold flex-shrink-0">
              {t.to[0]}
            </div>
            <div className="flex-1 text-xs text-ink-300 ml-0.5 font-medium">{t.from} &rarr; {t.to}</div>
            <div className="font-mono text-sm font-bold text-lime-400">{t.amount}</div>
          </div>
        ))}
      </div>

      {/* Viral CTA at the bottom of the card */}
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
  // Update the page title for SEO — helps search engines understand this page
  useEffect(() => {
    document.title = 'AutoSplit — Split Group Trip Expenses Automatically'
    return () => { document.title = 'AutoSplit' }
  }, [])

  return (
    <div className="min-h-screen bg-ink-950 text-ink-50 overflow-x-hidden">

      {/* ── Top lime glow — atmospheric depth ──────────────────────────── */}
      <div className="pointer-events-none fixed inset-0 z-0" style={{
        background: 'radial-gradient(ellipse 70% 45% at 50% -8%, rgba(200,241,53,0.10) 0%, transparent 60%)',
      }} />

      {/* ── Nav ─────────────────────────────────────────────────────────── */}
      <nav className="relative z-10 max-w-5xl mx-auto px-6 py-5 flex items-center justify-between">
        {/* Logo */}
        <div className="flex items-center gap-2.5">
          <div className="w-8 h-8 rounded-xl bg-lime-400 flex items-center justify-center shadow-md shadow-lime-400/25">
            <Zap size={15} className="text-ink-950" strokeWidth={2.5} />
          </div>
          <span className="font-display text-xl font-semibold text-ink-50 tracking-tight">AutoSplit</span>
        </div>

        {/* Nav links */}
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

      {/* ── Hero ────────────────────────────────────────────────────────── */}
      {/*
        Two-column: headline + CTAs on the left, share card on the right.
        The card IS the product demo — seeing it is the pitch.
      */}
      <section className="relative z-10 max-w-5xl mx-auto px-6 pt-12 pb-20 md:pt-16 md:pb-28">
        <div className="grid md:grid-cols-[1fr_auto] gap-12 md:gap-16 items-center">

          {/* Left: headline + CTA */}
          <div className="animate-fade-in">

            {/* "Free during beta" eyebrow badge */}
            <div className="inline-flex items-center gap-2 bg-lime-400/10 border border-lime-400/25 rounded-full px-3 py-1.5 mb-6">
              <div className="w-1.5 h-1.5 rounded-full bg-lime-400 animate-pulse" />
              <span className="text-xs text-lime-400 font-semibold font-mono">Free during early access &middot; No credit card</span>
            </div>

            {/* Main headline — the emotional pitch */}
            <h1 className="font-display font-semibold leading-[1.02] tracking-tight mb-5"
                style={{ fontSize: 'clamp(2.6rem, 6vw, 4.2rem)' }}>
              Split trips,{' '}
              <span className="text-lime-400">not</span>{' '}
              friendships.
            </h1>

            {/* Sub-headline — emphasize auto-import, not manual entry */}
            <p className="text-base md:text-lg text-ink-300 leading-relaxed mb-8 max-w-md">
              Drop in your credit card statement &mdash; <strong className="text-ink-100">all 47+ transactions import in seconds</strong>, no typing.
              AutoSplit splits everything fairly and shares a clean breakdown your friends can see instantly.
            </p>

            {/* CTAs */}
            <div className="flex flex-wrap gap-3 mb-4">
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

            {/* Secondary link — for people who want to try it without signing up */}
            <div className="mb-8">
              <Link
                to="/split"
                className="text-sm text-ink-500 hover:text-lime-400 underline-offset-2 hover:underline transition-colors"
              >
                or try the free expense calculator →
              </Link>
            </div>

            {/* Trust signals — emphasize the zero-typing superpower */}
            <div className="flex flex-wrap gap-x-5 gap-y-2">
              {[
                'Zero manual entry',
                'Works with any bank',
                'Friends need no account',
              ].map(label => (
                <div key={label} className="flex items-center gap-1.5 text-xs text-ink-400">
                  <CheckCircle size={11} className="text-lime-400 flex-shrink-0" />
                  {label}
                </div>
              ))}
            </div>
          </div>

          {/* Right: share page mockup — this IS the product pitch */}
          <div className="flex justify-center md:justify-end animate-slide-up" style={{ animationDelay: '100ms' }}>
            <SharePreviewCard />
          </div>
        </div>
      </section>

      {/* ── Bank strip — social proof of compatibility ─────────────────── */}
      <div className="relative z-10 border-y border-ink-800">
        <div className="max-w-5xl mx-auto px-6 py-4">
          <div className="flex flex-wrap items-center justify-center gap-x-8 gap-y-2">
            <span className="text-[11px] text-ink-400 font-mono uppercase tracking-widest">Upload statements from</span>
            {BANKS.map(bank => (
              <span key={bank} className="text-sm text-ink-300 font-mono">{bank}</span>
            ))}
          </div>
        </div>
      </div>

      {/* ── How it works ─────────────────────────────────────────────────── */}
      <section className="relative z-10 max-w-5xl mx-auto px-6 py-20 md:py-28">

        {/* Section header */}
        <div className="text-center mb-14">
          <h2 className="font-display text-3xl md:text-4xl font-semibold text-ink-50 mb-3 leading-tight">
            Statement to settlement in minutes
          </h2>
          <p className="text-ink-400 text-sm max-w-sm mx-auto leading-relaxed">
            No manual entry. No spreadsheets. No awkward guessing about who had the pasta.
          </p>
        </div>

        {/* 3-column steps */}
        <div className="grid md:grid-cols-3 gap-5">
          {STEPS.map((step, i) => (
            <div
              key={step.number}
              className={`
                relative rounded-2xl p-6 border transition-all
                ${step.accent
                  ? 'bg-lime-400/5 border-lime-400/25'
                  : 'bg-ink-900 border-ink-700'
                }
              `}
              style={{ animationDelay: `${i * 80}ms` }}
            >
              {/* Step number — large, muted, architectural */}
              <div className="font-mono text-5xl font-bold text-ink-800 mb-4 leading-none select-none">
                {step.number}
              </div>
              {/* Icon */}
              <step.icon
                size={18}
                className={`mb-3 ${step.accent ? 'text-lime-400' : 'text-ink-400'}`}
              />
              {/* Title */}
              <h3 className={`font-display text-xl font-semibold mb-2 ${step.accent ? 'text-lime-400' : 'text-ink-100'}`}>
                {step.title}
              </h3>
              {/* Body */}
              <p className="text-sm text-ink-400 leading-relaxed">{step.body}</p>
            </div>
          ))}
        </div>

        {/* Feature cards below the steps */}
        <div className="mt-8 grid sm:grid-cols-2 gap-4">
          {/* Built for international trips */}
          <div className="bg-ink-900 border border-ink-700 rounded-2xl p-5">
            <div className="flex items-center gap-2.5 mb-2">
              <Globe size={14} className="text-lime-400" />
              <h3 className="font-display text-base font-semibold text-ink-100">Built for international trips</h3>
            </div>
            <p className="text-sm text-ink-400 leading-relaxed">
              Charged &yen;12,000 at a Tokyo ramen spot? AutoSplit converts it at your actual exchange rate &mdash; so the split is always fair.
            </p>
          </div>

          {/* Everything you need */}
          <div className="bg-ink-900 border border-ink-700 rounded-2xl p-5">
            <div className="flex items-center gap-2.5 mb-3">
              <TrendingUp size={14} className="text-lime-400" />
              <h3 className="font-display text-base font-semibold text-ink-100">Everything a real trip needs</h3>
            </div>
            <div className="flex flex-wrap gap-1.5">
              {[
                { icon: CreditCard, label: 'Multiple cards' },
                { icon: Users, label: 'Any group size' },
                { icon: FileText, label: 'PDF + CSV' },
                { icon: Share2, label: 'Shareable links' },
                { icon: CheckCircle, label: 'Custom splits' },
                { icon: Globe, label: 'Multi-currency' },
                { icon: CheckSquare, label: 'Bulk edit' },
                { icon: Camera, label: 'Receipt OCR' },
                { icon: Wallet, label: 'Pay via Venmo / Cash App / PayPal / Zelle' },
              ].map(({ icon: Icon, label }) => (
                <div key={label} className="flex items-center gap-1.5 bg-ink-800 border border-ink-700 rounded-full px-2.5 py-1">
                  <Icon size={10} className="text-lime-400" />
                  <span className="text-[11px] text-ink-300 font-medium">{label}</span>
                </div>
              ))}
            </div>
          </div>
        </div>

        {/* ── Bulk-edit moat callout ─────────────────────────────────────────
            This is the single feature no other split app has. We say it
            plainly so visitors comparing alternatives see the difference. */}
        <div className="mt-4 rounded-2xl border border-lime-400/25 bg-lime-400/5 p-5 sm:p-6">
          <div className="flex items-start gap-3">
            <div className="w-9 h-9 rounded-xl bg-lime-400/15 flex items-center justify-center flex-shrink-0">
              <CheckSquare size={16} className="text-lime-400" strokeWidth={2} />
            </div>
            <div className="flex-1 min-w-0">
              <h3 className="font-display text-base sm:text-lg font-semibold text-ink-100 mb-1">
                Edit dozens of transactions in one click
              </h3>
              <p className="text-sm text-ink-400 leading-relaxed">
                Tick the boxes, set the category, change who's splitting, mark them all paid. Other split apps make you fix one row at a time &mdash; we let you fix forty.
              </p>
            </div>
          </div>
        </div>
      </section>

      {/* ── Pain vs. AutoSplit — the manual-entry contrast ─────────────── */}
      {/*
        This section directly addresses the key pain point we solve better than
        anything else: the agony of manually entering 47 transactions by hand.
        Generic framing — no competitor names — so it resonates broadly and avoids
        any legal risk while still converting frustrated users.
      */}
      <section className="relative z-10 border-t border-ink-800 bg-ink-950">
        <div className="max-w-5xl mx-auto px-6 py-20 md:py-28">
          {/* Section heading */}
          <div className="text-center mb-14">
            <div className="inline-flex items-center gap-2 bg-red-400/10 border border-red-400/20 rounded-full px-3 py-1.5 mb-5">
              <Clock size={11} className="text-red-400" />
              <span className="text-xs text-red-400 font-mono">There has to be a better way</span>
            </div>
            <h2 className="font-display text-3xl md:text-4xl font-semibold text-ink-50 mb-3 leading-tight">
              This is why no one does it.
            </h2>
            <p className="text-ink-400 text-sm max-w-sm mx-auto leading-relaxed">
              Splitting trip expenses manually is painful enough that most people just eat the cost or let it cause friction. AutoSplit eliminates that entirely.
            </p>
          </div>

          {/* Two-column before/after comparison */}
          <div className="grid md:grid-cols-2 gap-6 mb-10">
            {/* The old way — red/painful */}
            <div className="rounded-2xl border border-red-400/20 bg-red-400/4 p-6">
              <div className="flex items-center gap-2 mb-5">
                <div className="w-7 h-7 rounded-lg bg-red-400/15 flex items-center justify-center">
                  <AlertTriangle size={13} className="text-red-400" />
                </div>
                <span className="text-sm font-semibold text-red-300 font-mono uppercase tracking-wider">The old way</span>
              </div>
              <ul className="space-y-3">
                {[
                  'Log into every app and export transactions',
                  'Manually type in 47+ charges one by one',
                  'Build a spreadsheet to track who paid what',
                  'Do currency conversions by hand for every foreign charge',
                  'Chase people over text when the math is wrong',
                  'Someone always feels shortchanged',
                ].map((item, i) => (
                  <li key={i} className="flex items-start gap-2.5 text-sm text-ink-400">
                    <X size={13} className="text-red-400/70 flex-shrink-0 mt-0.5" />
                    {item}
                  </li>
                ))}
              </ul>
              {/* Time estimate */}
              <div className="mt-5 pt-4 border-t border-red-400/15 flex items-center gap-2">
                <Clock size={12} className="text-red-400/60" />
                <span className="text-xs text-red-400/80 font-mono">~3 hours of frustration per trip</span>
              </div>
            </div>

            {/* With AutoSplit — lime/painless */}
            <div className="rounded-2xl border border-lime-400/25 bg-lime-400/4 p-6">
              <div className="flex items-center gap-2 mb-5">
                <div className="w-7 h-7 rounded-lg bg-lime-400/15 flex items-center justify-center">
                  <Zap size={13} className="text-lime-400" />
                </div>
                <span className="text-sm font-semibold text-lime-400 font-mono uppercase tracking-wider">With AutoSplit</span>
              </div>
              <ul className="space-y-3">
                {[
                  'Download your PDF or CSV from any bank',
                  'Drop it in — all 47 transactions imported in seconds',
                  'AutoSplit auto-categorizes and assigns each expense',
                  'Foreign charges converted at your actual exchange rate',
                  'Share one link — everyone sees exactly what they owe',
                  'Settlement is done before you land at home',
                ].map((item, i) => (
                  <li key={i} className="flex items-start gap-2.5 text-sm text-ink-200">
                    <CheckCircle size={13} className="text-lime-400 flex-shrink-0 mt-0.5" />
                    {item}
                  </li>
                ))}
              </ul>
              {/* Time estimate */}
              <div className="mt-5 pt-4 border-t border-lime-400/15 flex items-center gap-2">
                <Zap size={12} className="text-lime-400" />
                <span className="text-xs text-lime-400 font-mono">~10 minutes, start to settled</span>
              </div>
            </div>
          </div>

          {/* Social proof quotes */}
          <div className="grid sm:grid-cols-3 gap-4">
            {[
              {
                quote: "I had 63 transactions from a 10-day Japan trip. I uploaded the PDF and it was done in under a minute. Genuinely felt like magic.",
                name: "Alex M.",
                detail: "Japan trip, 4 people",
              },
              {
                quote: "We used a spreadsheet for years. I cannot believe I spent that much time on something AutoSplit does instantly.",
                name: "Priya K.",
                detail: "Euro trip, 6 people",
              },
              {
                quote: "My friends thought I was being petty tracking every charge. Now I just share the link and it's done. No awkwardness.",
                name: "Tom R.",
                detail: "Ski trip, 5 people",
              },
            ].map((t, i) => (
              <div key={i} className="bg-ink-900 border border-ink-700 rounded-xl p-4">
                {/* Quote marks */}
                <div className="font-display text-3xl text-lime-400/30 leading-none mb-2 select-none">&ldquo;</div>
                <p className="text-sm text-ink-300 leading-relaxed mb-3 italic">{t.quote}</p>
                <div className="flex items-center gap-2">
                  <div className="w-6 h-6 rounded-full bg-lime-400/20 border border-lime-400/30 flex items-center justify-center text-[10px] font-bold text-lime-400">
                    {t.name[0]}
                  </div>
                  <div>
                    <div className="text-xs font-medium text-ink-200">{t.name}</div>
                    <div className="text-[10px] text-ink-500 font-mono">{t.detail}</div>
                  </div>
                </div>
              </div>
            ))}
          </div>
        </div>
      </section>

      {/* ── The viral loop — speaks to warm visitors ──────────────────── */}
      {/*
        This section is for people who arrived via a share link.
        They've already seen the product. This closes the deal.
      */}
      <section className="relative z-10 border-t border-ink-800" style={DOT_GRID_STYLE}>
        {/* Overlay blends the dot grid with the dark background */}
        <div className="absolute inset-0 bg-ink-950/85 pointer-events-none" />

        <div className="relative max-w-5xl mx-auto px-6 py-20 md:py-28">
          <div className="grid md:grid-cols-2 gap-12 items-center">

            {/* Left: the viral moment — chat bubbles */}
            <div className="space-y-3">
              {[
                { from: 'Sam', msg: "Hey — here's the trip breakdown, click to see what you owe →", right: false },
                { from: 'You', msg: 'Wait this is actually really clean. How did you make this??', right: true },
                { from: 'Sam', msg: 'AutoSplit. Literally 10 mins. Takes about 10 minutes total.', right: false },
              ].map((bubble, i) => (
                <div
                  key={i}
                  className={`
                    max-w-[75%] rounded-2xl px-4 py-3 border
                    ${bubble.right
                      ? 'ml-auto bg-lime-400/8 border-lime-400/20'
                      : 'bg-ink-800 border-ink-700'
                    }
                  `}
                >
                  <div className="text-[10px] text-ink-400 mb-1 font-mono">{bubble.from}</div>
                  <div className="text-sm text-ink-200 leading-relaxed">{bubble.msg}</div>
                </div>
              ))}
            </div>

            {/* Right: the copy */}
            <div>
              <h2 className="font-display text-3xl md:text-4xl font-semibold text-ink-50 mb-4 leading-tight">
                Your friends don&apos;t need an account.
                <br />
                <span className="text-lime-400">But they&apos;ll want one.</span>
              </h2>
              <p className="text-ink-400 text-sm leading-relaxed mb-5">
                When you share a trip, your friends see a clean breakdown of who owes what &mdash; no login, no app download. But every single person who opens that link thinks the same thing:
              </p>
              <p className="text-ink-200 text-sm italic leading-relaxed mb-8 pl-4 border-l-2 border-lime-400/40">
                &ldquo;I need this for my next trip.&rdquo;
              </p>
              <Link
                to="/signup"
                className="inline-flex items-center gap-2 px-5 py-3 rounded-xl bg-lime-400 text-ink-950 text-sm font-bold hover:bg-lime-500 transition-colors shadow-md shadow-lime-400/15"
              >
                Get started — it's free
                <ArrowRight size={13} />
              </Link>
            </div>
          </div>
        </div>
      </section>

      {/* ── Final CTA ───────────────────────────────────────────────────── */}
      <section className="relative z-10 border-t border-ink-800">
        <div className="max-w-5xl mx-auto px-6 py-20 md:py-28 text-center">
          <div className="inline-flex items-center justify-center w-14 h-14 rounded-2xl bg-lime-400 mb-6 shadow-xl shadow-lime-400/25">
            <Zap size={26} className="text-ink-950" strokeWidth={2.5} />
          </div>
          <h2 className="font-display text-4xl md:text-5xl font-semibold text-ink-50 mb-4 leading-tight">
            Your next trip is coming.
            <br />
            <span className="text-lime-400">Be ready.</span>
          </h2>
          <p className="text-ink-400 text-base mb-8 leading-relaxed max-w-sm mx-auto">
            Set up in minutes. No credit card needed.
          </p>
          <div className="flex flex-wrap gap-3 justify-center">
            <Link
              to="/signup"
              className="inline-flex items-center gap-2 px-8 py-3.5 rounded-xl bg-lime-400 text-ink-950 text-sm font-bold hover:bg-lime-500 transition-colors shadow-lg shadow-lime-400/20"
            >
              Start for free
              <ArrowRight size={14} />
            </Link>
            <Link
              to="/login"
              className="inline-flex items-center gap-2 px-8 py-3.5 rounded-xl bg-ink-800 border border-ink-700 text-ink-200 text-sm font-medium hover:bg-ink-700 transition-colors"
            >
              Sign in
            </Link>
          </div>
        </div>
      </section>

      {/* ── Footer ──────────────────────────────────────────────────────── */}
      <footer className="relative z-10 border-t border-ink-800 py-8">
        <div className="max-w-5xl mx-auto px-6 flex flex-col sm:flex-row items-center justify-between gap-4">
          <div className="flex items-center gap-2">
            <div className="w-6 h-6 rounded-lg bg-lime-400 flex items-center justify-center">
              <Zap size={11} className="text-ink-950" strokeWidth={2.5} />
            </div>
            <span className="font-display text-sm font-semibold text-ink-400">AutoSplit</span>
          </div>
          <p className="text-xs text-ink-500 font-mono tracking-wide">
            Split trips, not friendships
          </p>
          <div className="flex items-center gap-4 text-xs text-ink-400">
            <Link to="/login" className="hover:text-ink-200 transition-colors">Sign in</Link>
            <Link to="/signup" className="hover:text-ink-200 transition-colors">Sign up</Link>
          </div>
        </div>
      </footer>

    </div>
  )
}
