/**
 * OpenInBrowserBanner — shown only when the app is running inside an in-app
 * browser (Instagram / Messenger / TikTok webviews, etc.), where Google
 * Sign-In is blocked.
 *
 * It offers a one-tap "Open in browser" button that reopens the SAME page in
 * the device's real browser (Chrome on Android, Safari on iOS), where one-tap
 * Google works normally. A quiet fallback (menu hint + copy link) covers the
 * rare in-app browser that blocks the jump.
 *
 * Renders nothing in a normal browser, so it's safe to drop onto any auth page.
 */
import { useState } from 'react'
import { ExternalLink, Copy, Check } from 'lucide-react'
import { isInAppBrowser, buildOpenInBrowserUrl } from '../lib/inAppBrowser'

export default function OpenInBrowserBanner() {
  const [copied, setCopied] = useState(false)

  // Only in-app browsers see this. Normal browsers get nothing.
  if (!isInAppBrowser()) return null

  const href = typeof window !== 'undefined' ? window.location.href : ''
  const ua = typeof navigator !== 'undefined' ? navigator.userAgent : ''
  const browserName = /iphone|ipad|ipod/i.test(ua)
    ? 'Safari'
    : /android/i.test(ua)
      ? 'Chrome'
      : 'your browser'

  const openInBrowser = () => {
    // Navigating here hands the page to the real browser (Android intent / iOS
    // x-safari scheme). If the webview blocks it, nothing happens and the user
    // falls back to the hint below.
    window.location.href = buildOpenInBrowserUrl(href)
  }

  const copyLink = async () => {
    try {
      await navigator.clipboard.writeText(href)
      setCopied(true)
      setTimeout(() => setCopied(false), 2000)
    } catch {
      // Clipboard can be blocked inside webviews — the visible URL hint covers it.
    }
  }

  return (
    <div className="mb-5 rounded-xl border border-lime-400/30 bg-lime-400/10 p-4">
      <div className="flex items-start gap-3">
        <ExternalLink size={16} className="mt-0.5 flex-shrink-0 text-lime-400" />
        <div className="min-w-0">
          <p className="font-display text-base font-semibold text-ink-50">
            Open in {browserName} to sign in
          </p>
          <p className="mt-1 text-xs leading-relaxed text-ink-300">
            You opened this inside an app's built-in browser, where Google
            sign-in is blocked. Tap below to continue in {browserName} — you'll
            land on this same page.
          </p>
        </div>
      </div>

      {/* Primary action — the lime CTA. */}
      <button
        onClick={openInBrowser}
        className="mt-3 flex w-full items-center justify-center gap-2 rounded-xl
                   bg-lime-400 px-4 py-2.5 text-sm font-semibold text-ink-950
                   transition-all duration-150 hover:bg-lime-300 active:bg-lime-500"
      >
        <ExternalLink size={15} />
        Open in {browserName}
      </button>

      {/* Quiet fallback for the rare webview that blocks the jump. */}
      <div className="mt-2 flex items-center justify-center gap-1.5 text-[11px] text-ink-500">
        <span>Didn't open? Use the</span>
        <span className="font-mono text-ink-400">•••</span>
        <span>menu → "Open in browser", or</span>
        <button
          onClick={copyLink}
          className="inline-flex items-center gap-1 font-medium text-lime-400/80 transition-colors hover:text-lime-300"
        >
          {copied ? <Check size={11} /> : <Copy size={11} />}
          {copied ? 'Copied' : 'copy link'}
        </button>
      </div>
    </div>
  )
}
