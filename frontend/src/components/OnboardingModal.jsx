/**
 * OnboardingModal — shown once to first-time users.
 *
 * Step 0: Name capture — "What should we call you?"
 *   For Google users, we pre-fill from user_metadata.full_name.
 *   The name is stored in localStorage (autosplit_display_name) so the rest
 *   of the app can use it (e.g. pre-fill "Add member" fields with the user's name).
 *
 * Steps 1-3: How-it-works carousel (unchanged).
 *
 * Once dismissed, 'autosplit_onboarded' in localStorage prevents it from showing again.
 */
import { useState } from 'react'
import { Map, Upload, Zap, X, ArrowRight, ChevronLeft, User } from 'lucide-react'
import { useAuth } from '../contexts/AuthContext'
import { supabase } from '../lib/supabase'

// The how-it-works carousel steps (shown after the name step)
const HOW_IT_WORKS = [
  {
    icon: Map,
    heading: 'Create your trip',
    body: 'Add your trip name, travel dates, and the names of everyone going. Takes 30 seconds.',
  },
  {
    icon: Upload,
    heading: 'Import your card statement',
    body: 'Upload a PDF or CSV from Chase, Amex, Bank of America, Citi, Capital One, or Discover. AutoSplit reads every transaction automatically.',
  },
  {
    icon: Zap,
    heading: 'Settle up in one tap',
    body: "AutoSplit figures out the fairest split. Share a link — your group sees what they owe and can pay via Venmo without signing up.",
  },
]

export default function OnboardingModal({ onClose }) {
  const { user } = useAuth()

  // Step -1 = name capture; steps 0-2 = how-it-works carousel
  const [step, setStep] = useState(-1)

  // Pre-fill from Google user metadata if available
  const googleName = user?.user_metadata?.full_name || user?.user_metadata?.name || ''
  const [displayName, setDisplayName] = useState(googleName)

  // Dismiss — save flags and close
  function dismiss() {
    localStorage.setItem('autosplit_onboarded', 'true')
    onClose()
  }

  // Save the user's name, then advance to the how-it-works carousel
  async function saveName() {
    const trimmed = displayName.trim()
    if (trimmed) {
      // Store in localStorage so the rest of the app can read it immediately
      localStorage.setItem('autosplit_display_name', trimmed)
      // Also save to Supabase user metadata so it persists across devices
      // (fire-and-forget — we don't block on this)
      supabase.auth.updateUser({ data: { display_name: trimmed } }).catch(() => {})
    }
    setStep(0)
  }

  function goNext() {
    if (step < HOW_IT_WORKS.length - 1) {
      setStep(step + 1)
    } else {
      dismiss()
    }
  }

  function goBack() {
    if (step > 0) setStep(step - 1)
    else setStep(-1) // back to name step
  }

  const isNameStep = step === -1
  const isLastStep = step === HOW_IT_WORKS.length - 1
  const currentHowTo = isNameStep ? null : HOW_IT_WORKS[step]
  const Icon = currentHowTo?.icon

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center px-4 bg-ink-950/90 backdrop-blur-sm animate-fade-in">
      <div className="relative w-full max-w-md bg-ink-900 border border-ink-700 rounded-2xl p-8 shadow-2xl animate-slide-up">

        {/* X button — skip entirely */}
        <button
          onClick={dismiss}
          className="absolute top-4 right-4 text-ink-500 hover:text-ink-300 transition-colors p-1 rounded-lg hover:bg-ink-800"
          aria-label="Skip"
        >
          <X size={16} />
        </button>

        {isNameStep ? (
          /* ── Name capture step ───────────────────────────────────────────── */
          <div className="text-center">
            <div className="inline-flex items-center justify-center w-16 h-16 rounded-2xl bg-lime-400/10 border border-lime-400/20 mb-6">
              <User size={28} className="text-lime-400" strokeWidth={1.5} />
            </div>
            <h2 className="font-display text-2xl font-semibold text-ink-50 mb-2 leading-tight">
              What's your name?
            </h2>
            <p className="text-sm text-ink-400 mb-6 leading-relaxed">
              Your friends will see this when they get payment requests from AutoSplit.
            </p>
            <input
              type="text"
              className="input w-full text-center text-base mb-4"
              placeholder="e.g. Alex"
              value={displayName}
              onChange={e => setDisplayName(e.target.value)}
              onKeyDown={e => e.key === 'Enter' && saveName()}
              autoFocus
            />
            <div className="flex gap-3">
              <button onClick={dismiss} className="btn-ghost flex-1">Skip</button>
              <button onClick={saveName} className="btn-primary flex-1">
                Continue <ArrowRight size={14} />
              </button>
            </div>
          </div>
        ) : (
          /* ── How-it-works carousel ───────────────────────────────────────── */
          <>
            <div className="text-center mb-8">
              <div className="inline-flex items-center justify-center w-16 h-16 rounded-2xl bg-lime-400/10 border border-lime-400/20 mb-6">
                <Icon size={28} className="text-lime-400" strokeWidth={1.5} />
              </div>
              <h2 className="font-display text-2xl font-semibold text-ink-50 mb-3 leading-tight">
                {currentHowTo.heading}
              </h2>
              <p className="text-sm text-ink-400 leading-relaxed max-w-xs mx-auto">
                {currentHowTo.body}
              </p>
            </div>

            {/* Progress dots — 3 dots for the 3 how-it-works steps */}
            <div className="flex items-center justify-center gap-2 mb-8">
              {HOW_IT_WORKS.map((_, i) => (
                <button
                  key={i}
                  onClick={() => setStep(i)}
                  className={`w-2 h-2 rounded-full transition-all duration-200 ${
                    i === step ? 'bg-lime-400 w-4' : 'bg-ink-600 hover:bg-ink-500'
                  }`}
                />
              ))}
            </div>

            <div className="flex items-center gap-3">
              <button onClick={goBack} className="btn-ghost flex items-center gap-1.5">
                <ChevronLeft size={14} />
                Back
              </button>
              <button onClick={goNext} className="btn-primary ml-auto flex items-center gap-2">
                {isLastStep ? 'Start splitting' : 'Next'}
                <ArrowRight size={14} />
              </button>
            </div>
          </>
        )}
      </div>
    </div>
  )
}
