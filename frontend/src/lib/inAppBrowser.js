/**
 * In-app browser (webview) detection + "open in the real browser" helper.
 *
 * WHY THIS EXISTS
 * ---------------
 * Google blocks "Sign in with Google" inside in-app browsers — the embedded
 * web views you get when you tap a link from inside Instagram, Messenger,
 * TikTok, etc. (Error 403: disallowed_useragent). New users hit a dead end.
 *
 * We can't make Google work in there, so instead we detect the situation and
 * offer a one-tap way to reopen the SAME page in the device's real browser,
 * where one-tap Google works normally.
 */

// User-agent substrings that host apps inject into their webviews. Matching one
// of these is the most reliable signal that we're inside an in-app browser.
const IN_APP_TOKENS = [
  'FBAN', 'FBAV', 'FB_IAB', 'FBIOS', // Facebook / Messenger
  'Instagram',
  'Line/',
  'Twitter',
  'musical_ly', 'Bytedance', 'TikTok', // TikTok
  'Snapchat',
  'LinkedInApp',
  'Pinterest',
  'MicroMessenger', // WeChat
  'GSA/', // the Google app's in-app browser
]

const currentUA = () =>
  typeof navigator !== 'undefined' && navigator.userAgent ? navigator.userAgent : ''

/**
 * Is the current page running inside an in-app browser (webview)?
 * @param {string} [ua] user-agent string (defaults to the live one)
 * @returns {boolean}
 */
export function isInAppBrowser(ua = currentUA()) {
  if (!ua) return false
  const lower = ua.toLowerCase()

  // 1) Known host-app tokens — most reliable.
  if (IN_APP_TOKENS.some((t) => lower.includes(t.toLowerCase()))) return true

  // 2) Android System WebView advertises "; wv" in its UA.
  if (/\bwv\b/.test(ua) && /android/i.test(ua)) return true

  // 3) iOS heuristic: an in-app WKWebView usually lacks the "Safari" token that
  //    genuine Mobile Safari always carries. Chrome/Firefox on iOS use
  //    "CriOS"/"FxiOS", so we exclude those. Deliberately conservative to avoid
  //    misfiring inside real Safari.
  const isIOS = /iphone|ipad|ipod/i.test(ua)
  if (isIOS && !/safari/i.test(ua) && !/crios|fxios/i.test(ua)) return true

  return false
}

/**
 * Build a URL that, when navigated to, reopens `href` in the device's real
 * browser from inside an in-app browser.
 *
 * - Android: an intent:// URL that hands the page to Chrome, with a fallback to
 *   the default browser if Chrome isn't installed. Reliable.
 * - iOS: the x-safari-https:// scheme, which opens Safari on the same page in
 *   most in-app browsers. Apple offers no guaranteed API, so the UI keeps a
 *   visible fallback (copy link / "tap ••• → Open in Safari").
 * - Anything else: returns href unchanged.
 *
 * @param {string} href the page to open (usually window.location.href)
 * @param {string} [ua] user-agent string (defaults to the live one)
 * @returns {string}
 */
export function buildOpenInBrowserUrl(href, ua = currentUA()) {
  if (/android/i.test(ua)) {
    const withoutScheme = href.replace(/^https?:\/\//, '') // host + path + query
    const fallback = encodeURIComponent(href)
    return `intent://${withoutScheme}#Intent;scheme=https;package=com.android.chrome;S.browser_fallback_url=${fallback};end`
  }

  if (/iphone|ipad|ipod/i.test(ua)) {
    return 'x-safari-' + href
  }

  return href
}
