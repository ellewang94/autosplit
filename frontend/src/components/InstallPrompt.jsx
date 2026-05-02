import { useEffect, useState } from 'react'
import { Download, Share, Plus, X, Zap } from 'lucide-react'

/**
 * InstallPrompt — encourages mobile users to "Add to Home Screen"
 * so AutoSplit feels like a native app on their phone.
 *
 * Two paths, very different mechanics:
 *
 * 1. Android Chrome / Edge / Brave — fire `beforeinstallprompt` once the PWA
 *    install criteria are met. We capture the event, show a one-tap
 *    "Install" button, and call `prompt()` when tapped.
 *
 * 2. iOS Safari — Apple does NOT support programmatic install. We have to
 *    show the user written/illustrated steps: Share → "Add to Home Screen".
 *
 * The banner is dismissible (via localStorage) and never shows on desktop
 * or when the app is already installed and running standalone. We also
 * gate it on first useful page (after sign-in) so we're not yelling at
 * a brand-new visitor on the landing page.
 */
const DISMISS_KEY = 'autosplit_install_dismissed_v1'
const DISMISS_DAYS = 14

function isMobileUA() {
  // Coarse check — fine for "are you on a phone?". We pair this with
  // matchMedia for display-mode below to avoid showing on installed PWAs.
  return /iPhone|iPad|iPod|Android/i.test(navigator.userAgent)
}

function isIOS() {
  return /iPhone|iPad|iPod/i.test(navigator.userAgent) && !window.MSStream
}

function isStandalone() {
  // matchMedia for Chrome/Edge, navigator.standalone for iOS Safari
  return (
    window.matchMedia?.('(display-mode: standalone)').matches ||
    window.navigator.standalone === true
  )
}

function wasRecentlyDismissed() {
  try {
    const raw = localStorage.getItem(DISMISS_KEY)
    if (!raw) return false
    const ts = parseInt(raw, 10)
    if (Number.isNaN(ts)) return false
    const days = (Date.now() - ts) / (1000 * 60 * 60 * 24)
    return days < DISMISS_DAYS
  } catch {
    return false
  }
}

export default function InstallPrompt() {
  // Stored beforeinstallprompt event — only Chromium fires this
  const [deferredEvent, setDeferredEvent] = useState(null)
  // iOS-Safari custom instructions banner
  const [showIOSInstructions, setShowIOSInstructions] = useState(false)
  // Once the user installs successfully, hide for the rest of the session
  const [installed, setInstalled] = useState(false)

  useEffect(() => {
    if (isStandalone() || !isMobileUA() || wasRecentlyDismissed()) return

    // Chromium: capture the install event so we can fire it later
    function onBeforeInstall(e) {
      e.preventDefault()
      setDeferredEvent(e)
    }
    function onInstalled() {
      setInstalled(true)
      setDeferredEvent(null)
    }
    window.addEventListener('beforeinstallprompt', onBeforeInstall)
    window.addEventListener('appinstalled', onInstalled)

    // iOS Safari: there's no event. Show the custom banner after a small
    // delay so it doesn't pop in instantly and feel spammy.
    let iosTimer
    if (isIOS()) {
      iosTimer = setTimeout(() => setShowIOSInstructions(true), 4000)
    }

    return () => {
      window.removeEventListener('beforeinstallprompt', onBeforeInstall)
      window.removeEventListener('appinstalled', onInstalled)
      if (iosTimer) clearTimeout(iosTimer)
    }
  }, [])

  function dismiss() {
    try {
      localStorage.setItem(DISMISS_KEY, String(Date.now()))
    } catch {
      /* private browsing — best effort */
    }
    setDeferredEvent(null)
    setShowIOSInstructions(false)
  }

  async function handleAndroidInstall() {
    if (!deferredEvent) return
    deferredEvent.prompt()
    try {
      const { outcome } = await deferredEvent.userChoice
      if (outcome !== 'accepted') {
        dismiss() // they said no — don't keep nagging
      }
    } finally {
      setDeferredEvent(null)
    }
  }

  if (installed) return null

  // ── Android / Chromium banner ────────────────────────────────────
  if (deferredEvent) {
    return (
      <div
        className="fixed inset-x-0 bottom-0 z-30 px-3 pb-3 md:hidden"
        style={{ paddingBottom: 'calc(0.75rem + env(safe-area-inset-bottom))' }}
      >
        <div className="bg-ink-800 border border-lime-400/30 rounded-2xl shadow-2xl
                        flex items-center gap-3 px-4 py-3 animate-slide-up">
          <div className="w-9 h-9 rounded-xl bg-lime-400/15 flex items-center justify-center flex-shrink-0">
            <Zap size={16} className="text-lime-400" strokeWidth={2.5} />
          </div>
          <div className="flex-1 min-w-0">
            <div className="text-sm font-semibold text-ink-100">Install AutoSplit</div>
            <div className="text-[11px] text-ink-400 leading-tight">
              Add to your home screen — opens like a native app.
            </div>
          </div>
          <button
            onClick={handleAndroidInstall}
            className="flex items-center gap-1 px-3 py-1.5 rounded-lg bg-lime-400 text-ink-950 font-semibold text-xs hover:bg-lime-500 transition-colors"
          >
            <Download size={12} strokeWidth={2.5} />
            Install
          </button>
          <button
            onClick={dismiss}
            aria-label="Dismiss install prompt"
            className="p-1 text-ink-500 hover:text-ink-300 transition-colors"
          >
            <X size={15} />
          </button>
        </div>
      </div>
    )
  }

  // ── iOS Safari instructions banner ───────────────────────────────
  if (showIOSInstructions) {
    return (
      <div
        className="fixed inset-x-0 bottom-0 z-30 px-3 pb-3 md:hidden"
        style={{ paddingBottom: 'calc(0.75rem + env(safe-area-inset-bottom))' }}
      >
        <div className="bg-ink-800 border border-lime-400/30 rounded-2xl shadow-2xl
                        px-4 py-3 animate-slide-up">
          <div className="flex items-start gap-3">
            <div className="w-9 h-9 rounded-xl bg-lime-400/15 flex items-center justify-center flex-shrink-0 mt-0.5">
              <Zap size={16} className="text-lime-400" strokeWidth={2.5} />
            </div>
            <div className="flex-1 min-w-0">
              <div className="text-sm font-semibold text-ink-100 mb-0.5">Add AutoSplit to your home screen</div>
              <div className="text-[11px] text-ink-400 leading-relaxed">
                Tap <Share size={11} className="inline -mt-0.5 text-blue-400" /> at the bottom of Safari, then
                <span className="font-semibold text-ink-200"> Add to Home Screen <Plus size={11} className="inline -mt-0.5" /></span>.
              </div>
            </div>
            <button
              onClick={dismiss}
              aria-label="Dismiss"
              className="p-1 text-ink-500 hover:text-ink-300 transition-colors -mt-0.5"
            >
              <X size={15} />
            </button>
          </div>
        </div>
      </div>
    )
  }

  return null
}
