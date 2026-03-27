/**
 * LandingPage — the public homepage.
 *
 * Growth-optimized for two visitor types:
 *   1. Cold visitor (typed the URL, heard about it) — convince them to sign up
 *   2. Warm visitor (got a share link, saw a trip) — they've seen the product, lower the friction
 *
 * Design: Obsidian Ledger dark theme. Cormorant Garamond display, Geist body.
 * No emojis — icons only.
 */
import { Link } from 'react-router-dom'
import {
  Zap, Upload, CheckCircle, Share2, ArrowRight, CreditCard,
  Globe, Users, FileText, TrendingUp, ChevronRight,
} from 'lucide-react'

// ── Inline bank logos as simple text badges ───────────────────────────────────
const BANKS = ['Chase', 'Amex', 'Bank of America', 'Citi', 'Capital One', 'Discover', 'Any bank']

// ── Step card used in "How it works" ──────────────────────────────────────────
function Step({ number, icon: Icon, title, description, accent }) {
  return (
    <div className="relative">
      {/* Connector line between steps (hidden on last) */}
      <div className="flex items-start gap-5">
        {/* Number badge */}
        <div className={`
          w-10 h-10 rounded-xl flex items-center justify-center flex-shrink-0 font-mono font-bold text-sm
          ${accent ? 'bg-lime-400 text-ink-950' : 'bg-ink-800 border border-ink-700 text-ink-400'}
        `}>
          {number}
        </div>
        <div className="pt-1.5">
          <div className="flex items-center gap-2 mb-1.5">
            <Icon size={15} className={accent ? 'text-lime-400' : 'text-ink-500'} />
            <h3 className="font-display text-lg font-semibold text-ink-100">{title}</h3>
          </div>
          <p className="text-sm text-ink-400 leading-relaxed">{description}</p>
        </div>
      </div>
    </div>
  )
}

// ── Feature pill ──────────────────────────────────────────────────────────────
function FeaturePill({ icon: Icon, label }) {
  return (
    <div className="flex items-center gap-2 bg-ink-800/60 border border-ink-700 rounded-full px-3 py-1.5">
      <Icon size={12} className="text-lime-400" />
      <span className="text-xs text-ink-300">{label}</span>
    </div>
  )
}

// ── Mock "share page" preview card ────────────────────────────────────────────
// A stylized representation of what a recipient sees when they open a share link.
// Uses real UI patterns from SharePage.jsx for authenticity.
function SharePreviewCard() {
  return (
    <div className="bg-ink-900 border border-ink-700 rounded-2xl shadow-2xl overflow-hidden max-w-sm w-full">
      {/* Header */}
      <div className="px-5 py-4 border-b border-ink-800 flex items-center gap-2.5">
        <div className="w-6 h-6 rounded-lg bg-lime-400 flex items-center justify-center">
          <Zap size={11} className="text-ink-950" strokeWidth={2.5} />
        </div>
        <span className="font-display font-semibold text-ink-100 text-sm">Japan Trip 2026</span>
        <span className="ml-auto text-[10px] text-ink-600 font-mono">Shared via AutoSplit</span>
      </div>
      {/* Stats row */}
      <div className="grid grid-cols-2 gap-3 p-4 border-b border-ink-800">
        <div className="bg-ink-800/60 rounded-xl p-3">
          <div className="text-[10px] text-ink-500 mb-1">Total shared</div>
          <div className="font-mono text-xl font-bold text-lime-400">¥487,200</div>
        </div>
        <div className="bg-ink-800/60 rounded-xl p-3">
          <div className="text-[10px] text-ink-500 mb-1">Transfers needed</div>
          <div className="font-mono text-xl font-bold text-ink-100">2</div>
        </div>
      </div>
      {/* Transfers */}
      <div className="p-4 space-y-2">
        <div className="text-[10px] text-ink-500 font-medium mb-2">Who owes whom</div>
        {[
          { from: 'Tom', to: 'Elle', amount: '¥142,600', color: 'text-lime-400' },
          { from: 'Priya', to: 'Elle', amount: '¥89,400', color: 'text-lime-400' },
        ].map((t, i) => (
          <div key={i} className="flex items-center gap-2 bg-ink-800/40 rounded-lg px-3 py-2.5">
            <div className="w-6 h-6 rounded-full bg-amber-400 text-ink-950 flex items-center justify-center text-[9px] font-bold">{t.from[0]}</div>
            <ArrowRight size={10} className="text-ink-600" />
            <div className="w-6 h-6 rounded-full bg-lime-400 text-ink-950 flex items-center justify-center text-[9px] font-bold">{t.to[0]}</div>
            <div className="flex-1 text-xs text-ink-300 ml-0.5">{t.from} pays {t.to}</div>
            <div className={`font-mono text-sm font-bold ${t.color}`}>{t.amount}</div>
          </div>
        ))}
      </div>
      {/* CTA at bottom */}
      <div className="px-4 pb-4">
        <div className="bg-lime-400/8 border border-lime-400/20 rounded-xl px-3 py-2.5 text-center">
          <p className="text-[11px] text-ink-300">Planning your own trip?</p>
          <p className="text-[11px] text-lime-400 font-medium mt-0.5">Try AutoSplit free →</p>
        </div>
      </div>
    </div>
  )
}


// ── Main landing page ─────────────────────────────────────────────────────────
export default function LandingPage() {
  return (
    <div className="min-h-screen bg-ink-950 text-ink-50 overflow-x-hidden">

      {/* ── Background glow ────────────────────────────────────────────────── */}
      <div className="pointer-events-none fixed inset-0" style={{
        background: 'radial-gradient(ellipse 80% 50% at 50% -5%, rgba(200,241,53,0.09) 0%, transparent 65%)'
      }} />

      {/* ── Nav ────────────────────────────────────────────────────────────── */}
      <nav className="relative z-10 max-w-6xl mx-auto px-5 py-5 flex items-center justify-between">
        <div className="flex items-center gap-2.5">
          <div className="w-8 h-8 rounded-xl bg-lime-400 flex items-center justify-center shadow-md shadow-lime-400/25">
            <Zap size={15} className="text-ink-950" strokeWidth={2.5} />
          </div>
          <span className="font-display text-xl font-semibold text-ink-50">AutoSplit</span>
        </div>
        <div className="flex items-center gap-3">
          <Link
            to="/login"
            className="text-sm text-ink-400 hover:text-ink-200 transition-colors hidden sm:block"
          >
            Sign in
          </Link>
          <Link
            to="/signup"
            className="flex items-center gap-1.5 px-4 py-2 rounded-xl bg-lime-400 text-ink-950 text-sm font-semibold hover:bg-lime-500 transition-colors shadow-sm"
          >
            Start free
          </Link>
        </div>
      </nav>

      {/* ── Hero ───────────────────────────────────────────────────────────── */}
      <section className="relative max-w-6xl mx-auto px-5 pt-16 pb-20 md:pt-24 md:pb-28">
        <div className="grid md:grid-cols-2 gap-12 items-center">

          {/* Left: copy */}
          <div className="animate-fade-in">
            {/* Eyebrow badge */}
            <div className="inline-flex items-center gap-2 bg-lime-400/10 border border-lime-400/25 rounded-full px-3 py-1.5 mb-6">
              <div className="w-1.5 h-1.5 rounded-full bg-lime-400 animate-pulse" />
              <span className="text-xs text-lime-400 font-medium font-mono">First trip free</span>
            </div>

            <h1 className="font-display text-5xl md:text-6xl font-semibold leading-[1.05] tracking-tight mb-5">
              Split trips,{' '}
              <span className="text-lime-400">not</span>{' '}
              friendships.
            </h1>

            <p className="text-lg text-ink-400 leading-relaxed mb-8 max-w-md">
              Upload your credit card statement. AutoSplit figures out who owes what.
              Share one link — your friends see the breakdown and can pay you back.
            </p>

            <div className="flex flex-wrap gap-3">
              <Link
                to="/signup"
                className="flex items-center gap-2 px-6 py-3 rounded-xl bg-lime-400 text-ink-950 text-sm font-semibold hover:bg-lime-500 active:bg-lime-600 transition-colors shadow-lg shadow-lime-400/20"
              >
                Start for free
                <ArrowRight size={14} />
              </Link>
              <Link
                to="/login"
                className="flex items-center gap-2 px-6 py-3 rounded-xl bg-ink-800 border border-ink-700 text-ink-200 text-sm font-medium hover:bg-ink-700 hover:border-ink-600 transition-colors"
              >
                Sign in
              </Link>
            </div>

            {/* Trust signals */}
            <div className="flex flex-wrap gap-4 mt-8">
              {[
                { icon: CheckCircle, label: 'No credit card required' },
                { icon: CheckCircle, label: 'Works with any bank' },
                { icon: CheckCircle, label: 'Free first trip' },
              ].map(({ icon: Icon, label }) => (
                <div key={label} className="flex items-center gap-1.5 text-xs text-ink-500">
                  <Icon size={12} className="text-lime-400" />
                  {label}
                </div>
              ))}
            </div>
          </div>

          {/* Right: share page mockup */}
          <div className="flex justify-center md:justify-end animate-slide-up">
            <div className="relative">
              {/* Glow behind the card */}
              <div className="absolute inset-0 bg-lime-400/5 blur-3xl rounded-full scale-110" />
              <SharePreviewCard />
            </div>
          </div>
        </div>
      </section>

      {/* ── Bank logos strip ──────────────────────────────────────────────── */}
      <section className="relative border-y border-ink-800 bg-ink-900/40 py-4">
        <div className="max-w-6xl mx-auto px-5">
          <div className="flex flex-wrap items-center gap-x-6 gap-y-2 justify-center">
            <span className="text-xs text-ink-600 font-mono">Imports from</span>
            {BANKS.map(bank => (
              <span key={bank} className="text-xs text-ink-500 font-mono">{bank}</span>
            ))}
          </div>
        </div>
      </section>

      {/* ── How it works ─────────────────────────────────────────────────────── */}
      <section className="relative max-w-6xl mx-auto px-5 py-20 md:py-28">
        <div className="grid md:grid-cols-2 gap-16 items-start">

          {/* Left: steps */}
          <div>
            <h2 className="font-display text-3xl md:text-4xl font-semibold text-ink-50 mb-3 leading-tight">
              From statement to settlement in minutes
            </h2>
            <p className="text-ink-400 text-sm mb-10 leading-relaxed">
              No manual entry. No spreadsheets. No awkward conversations about who ate what.
            </p>

            <div className="space-y-8">
              <Step
                number="1"
                icon={Upload}
                title="Upload your statement"
                description="Drop in a PDF or CSV from any bank — Chase, Amex, BofA, Citi, or anything else. AutoSplit reads it automatically."
                accent={false}
              />
              <Step
                number="2"
                icon={CheckCircle}
                title="Review & categorize"
                description="Transactions are auto-categorized and split between your travel group. Flag anything personal with one click."
                accent={false}
              />
              <Step
                number="3"
                icon={TrendingUp}
                title="Settle up"
                description="AutoSplit calculates the minimum number of transfers to balance everyone out. Share the link — done."
                accent={true}
              />
            </div>
          </div>

          {/* Right: feature pills grid */}
          <div className="space-y-4">
            <div className="bg-ink-900 border border-ink-700 rounded-2xl p-6">
              <h3 className="font-display text-lg font-semibold text-ink-100 mb-4">
                Everything a real trip needs
              </h3>
              <div className="flex flex-wrap gap-2">
                <FeaturePill icon={Globe} label="Multi-currency (USD, EUR, JPY, GBP…)" />
                <FeaturePill icon={CreditCard} label="Multiple cards per trip" />
                <FeaturePill icon={Users} label="Any group size" />
                <FeaturePill icon={FileText} label="PDF + CSV import" />
                <FeaturePill icon={TrendingUp} label="Debt-minimization algorithm" />
                <FeaturePill icon={Share2} label="Shareable read-only links" />
                <FeaturePill icon={CheckCircle} label="Manual expense entry" />
                <FeaturePill icon={CheckCircle} label="Export to CSV" />
                <FeaturePill icon={CheckCircle} label="Custom splits (%, exact)" />
                <FeaturePill icon={CheckCircle} label="Chase, Amex, BofA, Citi…" />
              </div>
            </div>

            {/* Multi-currency callout */}
            <div className="bg-ink-900 border border-ink-700 rounded-2xl p-6">
              <div className="flex items-center gap-3 mb-3">
                <Globe size={16} className="text-lime-400" />
                <h3 className="font-display text-lg font-semibold text-ink-100">Built for international trips</h3>
              </div>
              <p className="text-sm text-ink-400 leading-relaxed">
                Charged ¥12,000 at a Tokyo restaurant? AutoSplit converts it to your base currency using your actual exchange rate — so the split is always fair.
              </p>
            </div>
          </div>
        </div>
      </section>

      {/* ── The viral loop section ─────────────────────────────────────────── */}
      {/*
        This section speaks directly to the warm visitor — someone who opened a
        share link and wants to use AutoSplit for their own trip next.
      */}
      <section className="relative border-t border-ink-800 bg-ink-900/30 py-20 md:py-28">
        <div className="max-w-6xl mx-auto px-5">
          <div className="grid md:grid-cols-2 gap-12 items-center">

            {/* Left: share flow diagram */}
            <div className="space-y-3">
              {[
                { from: 'Your organizer', msg: 'Hey, here\'s the trip link to see what you owe →', role: 'sender', color: 'bg-ink-700' },
                { from: 'You', msg: 'Whoa this is so clean. How did you make this?', role: 'receiver', color: 'bg-lime-400/15 border-lime-400/20' },
                { from: 'Your organizer', msg: 'AutoSplit. Free for your first trip 😎', role: 'sender', color: 'bg-ink-700' },
              ].map((bubble, i) => (
                <div
                  key={i}
                  className={`max-w-xs rounded-2xl px-4 py-3 border text-sm ${bubble.color} ${bubble.role === 'receiver' ? 'ml-auto' : ''}`}
                  style={{ animationDelay: `${i * 120}ms` }}
                >
                  <div className="text-[10px] text-ink-500 mb-1 font-mono">{bubble.from}</div>
                  <div className="text-ink-200 leading-relaxed">{bubble.msg}</div>
                </div>
              ))}
            </div>

            {/* Right: copy */}
            <div>
              <h2 className="font-display text-3xl md:text-4xl font-semibold text-ink-50 mb-4 leading-tight">
                Your friends don't need an account.
                <br />
                <span className="text-lime-400">But they'll want one.</span>
              </h2>
              <p className="text-ink-400 text-sm leading-relaxed mb-6">
                When you share a trip, your friends see a beautiful breakdown of who owes what — no login required. But every person who opens that link thinks the same thing: <em className="text-ink-300">"I need this for my next trip."</em>
              </p>
              <p className="text-ink-400 text-sm leading-relaxed mb-8">
                That's how AutoSplit grows. Not ads — just people sharing trips and their friends wanting the same.
              </p>
              <Link
                to="/signup"
                className="inline-flex items-center gap-2 px-5 py-2.5 rounded-xl bg-lime-400 text-ink-950 text-sm font-semibold hover:bg-lime-500 transition-colors"
              >
                Create your first trip free
                <ArrowRight size={13} />
              </Link>
            </div>
          </div>
        </div>
      </section>

      {/* ── Final CTA ─────────────────────────────────────────────────────── */}
      <section className="relative max-w-6xl mx-auto px-5 py-20 md:py-28 text-center">
        <div className="max-w-xl mx-auto">
          <div className="inline-flex items-center justify-center w-16 h-16 rounded-2xl bg-lime-400 mb-6 shadow-xl shadow-lime-400/20">
            <Zap size={28} className="text-ink-950" strokeWidth={2.5} />
          </div>
          <h2 className="font-display text-4xl md:text-5xl font-semibold text-ink-50 mb-4 leading-tight">
            Your next trip is coming.
            <br />
            <span className="text-lime-400">Be ready.</span>
          </h2>
          <p className="text-ink-400 text-base mb-8 leading-relaxed">
            Set up in minutes. First trip completely free. No credit card needed.
          </p>
          <div className="flex flex-wrap gap-3 justify-center">
            <Link
              to="/signup"
              className="flex items-center gap-2 px-8 py-3.5 rounded-xl bg-lime-400 text-ink-950 text-sm font-semibold hover:bg-lime-500 transition-colors shadow-lg shadow-lime-400/20"
            >
              Start for free
              <ArrowRight size={14} />
            </Link>
            <Link
              to="/login"
              className="flex items-center gap-2 px-8 py-3.5 rounded-xl bg-ink-800 border border-ink-700 text-ink-200 text-sm font-medium hover:bg-ink-700 transition-colors"
            >
              Sign in
            </Link>
          </div>
        </div>
      </section>

      {/* ── Footer ────────────────────────────────────────────────────────── */}
      <footer className="border-t border-ink-800 py-8">
        <div className="max-w-6xl mx-auto px-5 flex flex-col sm:flex-row items-center justify-between gap-4">
          <div className="flex items-center gap-2">
            <div className="w-6 h-6 rounded-lg bg-lime-400 flex items-center justify-center">
              <Zap size={11} className="text-ink-950" strokeWidth={2.5} />
            </div>
            <span className="font-display text-sm font-semibold text-ink-400">AutoSplit</span>
          </div>
          <p className="text-xs text-ink-700 font-mono tracking-wide">
            Split trips, not friendships
          </p>
          <div className="flex items-center gap-4 text-xs text-ink-600">
            <Link to="/login" className="hover:text-ink-400 transition-colors">Sign in</Link>
            <Link to="/signup" className="hover:text-ink-400 transition-colors">Sign up</Link>
          </div>
        </div>
      </footer>

    </div>
  )
}
