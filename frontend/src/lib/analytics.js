/**
 * analytics.js — thin wrapper around PostHog.
 *
 * WHY A WRAPPER: If VITE_POSTHOG_KEY is missing (local dev, CI), every call
 * silently no-ops instead of throwing. You can call track() anywhere without
 * guarding — it just won't fire until a real key is present.
 *
 * HOW TO ADD YOUR KEY:
 *   1. Sign up at https://app.posthog.com
 *   2. Create a project called "AutoSplit"
 *   3. Copy the Project API Key (starts with "phc_")
 *   4. Add to .env.local:  VITE_POSTHOG_KEY=phc_xxxxxxxxxxxx
 *   5. Restart the dev server
 *
 * Session recording is enabled automatically by PostHog once the key is set.
 * Sensitive text (amounts, names) on upload/transaction pages is masked.
 */
import posthog from 'posthog-js'

const KEY = import.meta.env.VITE_POSTHOG_KEY
const HOST = 'https://us.i.posthog.com'

// Only initialize if a real key is configured.
// This prevents accidental tracking in local dev or CI.
if (KEY) {
  posthog.init(KEY, {
    api_host: HOST,
    // Session recording — automatically captures user journeys.
    // Masked selectors protect financial data on sensitive pages.
    session_recording: {
      maskAllInputs: true,           // Never record what users type
      maskInputFn: () => '***',      // Extra safety for inputs
    },
    // Mask all text on upload/transaction pages — they contain real financial data.
    // PostHog will still capture clicks and navigation, just not the text content.
    __add_tracing_headers: false,
    // Don't capture automatically captured events we don't need
    capture_pageleave: true,
    capture_pageview: true,          // Auto-track every page navigation
    autocapture: false,              // We fire custom events — no auto-click capture
    persistence: 'localStorage',    // Don't use cookies (simpler privacy story)
  })

  // Mask text on pages that show real financial data.
  // This means session recordings on these pages show placeholders, not real amounts.
  const SENSITIVE_PATH_PATTERNS = ['/transactions', '/settlement', '/upload']
  const isSensitive = SENSITIVE_PATH_PATTERNS.some(p => window.location.pathname.includes(p))
  if (isSensitive) {
    posthog.config.session_recording = {
      ...posthog.config.session_recording,
      maskAllText: true,
    }
  }
}

// ── Typed event helpers ───────────────────────────────────────────────────────
// Call these from any component. They no-op if PostHog isn't initialized.

/**
 * Track when a user successfully signs up.
 * @param {'google'|'email'} method - How they signed up
 */
export function trackSignup(method) {
  if (!KEY) return
  posthog.capture('user_signed_up', { method })
}

/**
 * Track when a user successfully imports a bank statement.
 * @param {object} opts
 * @param {string} opts.bank - Detected bank name (chase/amex/bofa/universal)
 * @param {'pdf'|'csv'} opts.fileType
 * @param {number} opts.transactionCount
 * @param {number} opts.needsReviewCount
 */
export function trackStatementUploaded({ bank, fileType, transactionCount, needsReviewCount }) {
  if (!KEY) return
  posthog.capture('statement_uploaded', { bank, fileType, transactionCount, needsReviewCount })
}

/**
 * Track when a settlement is computed.
 * @param {object} opts
 * @param {number} opts.memberCount
 * @param {number} opts.transferCount
 * @param {number} opts.totalAmount
 */
export function trackSettlementComputed({ memberCount, transferCount, totalAmount }) {
  if (!KEY) return
  posthog.capture('settlement_computed', { memberCount, transferCount, totalAmount })
}

/**
 * Track when a share link is created (this is the viral moment).
 */
export function trackShareCreated(groupId) {
  if (!KEY) return
  posthog.capture('share_link_created', { groupId })
}

/**
 * Track when a new trip/group is created.
 */
export function trackTripCreated() {
  if (!KEY) return
  posthog.capture('trip_created')
}

/**
 * Identify the signed-in user so session recordings and events are linked to them.
 * Call this after login/signup.
 * @param {string} userId - Supabase user ID (not email — we don't send PII to PostHog)
 */
export function identifyUser(userId) {
  if (!KEY) return
  posthog.identify(userId)
}

/**
 * Reset identity on sign-out so the next user gets a fresh anonymous session.
 */
export function resetIdentity() {
  if (!KEY) return
  posthog.reset()
}

export default posthog
