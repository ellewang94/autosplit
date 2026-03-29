/**
 * OnboardingModal — a 3-step carousel shown to first-time users.
 *
 * HOW IT WORKS:
 * - Checks localStorage before showing. If 'autosplit_onboarded' is set, it never shows.
 * - When the user finishes (clicks "Start splitting") or skips (X button), it sets
 *   'autosplit_onboarded' = 'true' in localStorage so it never appears again.
 * - The parent component (GroupsPage) controls whether this is rendered via the
 *   `onClose` prop callback.
 *
 * DESIGN: Full-screen dark overlay with a centered card. 3 steps with dot progress
 * indicators. Lime-400 icons for each step. Display font headings.
 */
import { useState } from 'react'
import { Map, Upload, Zap, X, ArrowRight, ChevronLeft } from 'lucide-react'

// Each step in the onboarding carousel — icon, heading, and body copy
const STEPS = [
  {
    icon: Map,
    heading: 'Create your trip',
    body: 'Add your trip name, travel dates, and the names of everyone going. Takes 30 seconds.',
  },
  {
    icon: Upload,
    heading: 'Import your card statement',
    body: 'Upload a PDF or CSV from Chase, Amex, Bank of America, Citi, Capital One, or Discover. AutoSplit reads every transaction automatically — no manual entry.',
  },
  {
    icon: Zap,
    heading: 'Settle up in one tap',
    body: "AutoSplit figures out the fairest way to settle. Share a link with your group — they see exactly what they owe and can pay via Venmo or PayPal without signing up.",
  },
]

export default function OnboardingModal({ onClose }) {
  // Track which step (0, 1, or 2) is currently shown
  const [step, setStep] = useState(0)

  // When the modal is dismissed (either via X or "Start splitting"), mark as onboarded
  // in localStorage so this modal never shows up again for this user.
  function dismiss() {
    localStorage.setItem('autosplit_onboarded', 'true')
    onClose()
  }

  function goNext() {
    if (step < STEPS.length - 1) {
      setStep(step + 1)
    } else {
      // On the last step, "Start splitting" closes the modal
      dismiss()
    }
  }

  function goBack() {
    if (step > 0) setStep(step - 1)
  }

  const currentStep = STEPS[step]
  const Icon = currentStep.icon
  const isLastStep = step === STEPS.length - 1

  return (
    // Full-screen overlay — clicking outside does nothing (intentional, forces engagement)
    <div className="fixed inset-0 z-50 flex items-center justify-center px-4 bg-ink-950/90 backdrop-blur-sm animate-fade-in">

      {/* Modal card */}
      <div className="relative w-full max-w-md bg-ink-900 border border-ink-700 rounded-2xl p-8 shadow-2xl animate-slide-up">

        {/* X button — skip the onboarding entirely */}
        <button
          onClick={dismiss}
          className="absolute top-4 right-4 text-ink-500 hover:text-ink-300 transition-colors p-1 rounded-lg hover:bg-ink-800"
          aria-label="Skip onboarding"
        >
          <X size={16} />
        </button>

        {/* Step content — the icon, heading, and description */}
        <div className="text-center mb-8">
          {/* Large icon in a lime-tinted rounded square */}
          <div className="inline-flex items-center justify-center w-16 h-16 rounded-2xl bg-lime-400/10 border border-lime-400/20 mb-6">
            <Icon size={28} className="text-lime-400" strokeWidth={1.5} />
          </div>

          {/* Display font heading — big and commanding */}
          <h2 className="font-display text-2xl font-semibold text-ink-50 mb-3 leading-tight">
            {currentStep.heading}
          </h2>

          {/* Body copy — explains what this step does */}
          <p className="text-sm text-ink-400 leading-relaxed max-w-xs mx-auto">
            {currentStep.body}
          </p>
        </div>

        {/* Progress dots — shows which step you're on */}
        <div className="flex items-center justify-center gap-2 mb-8">
          {STEPS.map((_, i) => (
            <button
              key={i}
              onClick={() => setStep(i)}
              // Current step is lime-400, others are muted ink-600
              className={`w-2 h-2 rounded-full transition-all duration-200 ${
                i === step ? 'bg-lime-400 w-4' : 'bg-ink-600 hover:bg-ink-500'
              }`}
              aria-label={`Go to step ${i + 1}`}
            />
          ))}
        </div>

        {/* Navigation buttons — Back / Next (or Start splitting on last step) */}
        <div className="flex items-center gap-3">
          {/* Back button — hidden on first step */}
          {step > 0 ? (
            <button
              onClick={goBack}
              className="btn-ghost flex items-center gap-1.5"
            >
              <ChevronLeft size={14} />
              Back
            </button>
          ) : (
            // Placeholder so the Next button stays on the right
            <div />
          )}

          {/* Next / Start splitting button */}
          <button
            onClick={goNext}
            className="btn-primary ml-auto flex items-center gap-2"
          >
            {isLastStep ? 'Start splitting' : 'Next'}
            <ArrowRight size={14} />
          </button>
        </div>

      </div>
    </div>
  )
}
