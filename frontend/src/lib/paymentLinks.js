// Payment-app deep-link helpers.
//
// Each function takes a payee handle + amount + optional memo and returns a
// URL the browser can open. On mobile most of these resolve directly into
// the native app (e.g. venmo://). On desktop they fall back to the web app
// (e.g. https://venmo.com/...).
//
// We intentionally don't try to detect mobile vs desktop here — the web URLs
// work in both contexts (the OS handles the protocol negotiation), and that
// keeps this module dependency-free + side-effect-free + easy to test.
//
// Currency note: Venmo, Cash App, PayPal handle USD natively. The amount we
// pass should already be in USD (we send the converted amount, not the
// foreign currency). Cash App and PayPal don't pre-fill memos in their URL
// schemes — only Venmo does.

const SUPPORTED = ['venmo', 'cashapp', 'paypal', 'zelle']

/**
 * Sanitises an amount for URL embedding. We always send 2-decimal-place
 * USD values; weird inputs (NaN, negative) get coerced to "0.00" so we never
 * accidentally compose a malformed URL.
 */
function fmtAmount(amount) {
  const n = Number(amount)
  if (!Number.isFinite(n) || n < 0) return '0.00'
  return n.toFixed(2)
}

/**
 * Venmo: officially-documented URL scheme (works app + web).
 *
 * Mobile: opens the Venmo app pre-filled with recipient + amount + memo.
 * Desktop: opens venmo.com profile with the same query params.
 *
 * Note: Venmo treats the recipient as a username (no @). We strip @ defensively.
 */
export function venmoUrl({ handle, amount, memo }) {
  if (!handle) return null
  const user = encodeURIComponent(String(handle).trim().replace(/^@/, ''))
  const a = encodeURIComponent(fmtAmount(amount))
  const m = encodeURIComponent(memo || '')
  // Web URL works on mobile too — Venmo's universal links route to the app.
  return `https://venmo.com/${user}?txn=pay&amount=${a}&note=${m}`
}

/**
 * Cash App: pay-to-cashtag URL with amount appended as a path segment.
 *
 * Format: https://cash.app/$cashtag/AMOUNT (e.g. https://cash.app/$elle/47)
 * Cash App's URL spec doesn't support a memo field, so we drop it silently.
 */
export function cashappUrl({ handle, amount }) {
  if (!handle) return null
  const tag = encodeURIComponent(String(handle).trim().replace(/^\$/, ''))
  const a = fmtAmount(amount)
  return `https://cash.app/$${tag}/${a}`
}

/**
 * PayPal: paypal.me handle. Amount embedded as a path segment.
 *
 * Format: https://paypal.me/handle/amount  (USD by default)
 * If the handle looks like an email we still wrap it as paypal.me/email,
 * which PayPal accepts and routes to the right account.
 */
export function paypalUrl({ handle, amount }) {
  if (!handle) return null
  const h = encodeURIComponent(String(handle).trim())
  const a = fmtAmount(amount)
  return `https://paypal.me/${h}/${a}`
}

/**
 * Zelle: there's no public deep-link API. Zelle is bank-app-integrated;
 * each bank rolls their own UX. We return null here so the UI can render
 * a "Copy recipient + how to pay" helper instead of a clickable link.
 */
export function zelleUrl() {
  return null
}

/**
 * Build the set of payment-link options available for a given payee.
 * Returns an array of { app, label, url, copyValue } objects ready to render.
 *
 *   handles      Member.payment_handles object (may be null / partial)
 *   amount       Settlement amount in USD
 *   memo         Optional payment memo (Venmo only)
 *
 * Apps without a handle are omitted from the result. Zelle gets a special
 * shape (`url: null`, `copyValue: handle`) so the UI knows to render a
 * copy-helper instead of a link.
 */
export function buildPaymentOptions({ handles, amount, memo }) {
  if (!handles) return []
  const opts = []

  if (handles.venmo) {
    opts.push({
      app: 'venmo',
      label: 'Venmo',
      handle: handles.venmo,
      url: venmoUrl({ handle: handles.venmo, amount, memo }),
      copyValue: `@${handles.venmo}`,
    })
  }
  if (handles.cashapp) {
    opts.push({
      app: 'cashapp',
      label: 'Cash App',
      handle: handles.cashapp,
      url: cashappUrl({ handle: handles.cashapp, amount }),
      copyValue: `$${handles.cashapp}`,
    })
  }
  if (handles.paypal) {
    opts.push({
      app: 'paypal',
      label: 'PayPal',
      handle: handles.paypal,
      url: paypalUrl({ handle: handles.paypal, amount }),
      copyValue: handles.paypal,
    })
  }
  if (handles.zelle) {
    opts.push({
      app: 'zelle',
      label: 'Zelle',
      handle: handles.zelle,
      url: null,                  // no deep link — UI shows copy helper
      copyValue: handles.zelle,
    })
  }
  return opts
}

export const SUPPORTED_PAYMENT_APPS = SUPPORTED
