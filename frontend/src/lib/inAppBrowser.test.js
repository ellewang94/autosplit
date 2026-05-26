/**
 * Tests for the in-app-browser detection + "open in real browser" URL builder.
 *
 * These are pure functions (string in, string/boolean out), so we can verify
 * them with plain Node + assert — no browser or test framework needed.
 * Run:  node src/lib/inAppBrowser.test.js   (from frontend/)
 */
import assert from 'node:assert/strict'
import { isInAppBrowser, buildOpenInBrowserUrl } from './inAppBrowser.js'

// ── Sample user-agent strings ────────────────────────────────────────────────
const UA = {
  instagramIOS:
    'Mozilla/5.0 (iPhone; CPU iPhone OS 17_4 like Mac OS X) AppleWebKit/605.1.15 (KHTML, like Gecko) Mobile/15E148 Instagram 312.0.0.0 (iPhone; iOS 17_4; en_US)',
  messengerAndroid:
    'Mozilla/5.0 (Linux; Android 14; Pixel 8) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/124.0.0.0 Mobile Safari/537.36 [FB_IAB/Orca-Android;FBAV/452.0.0.0;]',
  androidWebView:
    'Mozilla/5.0 (Linux; Android 13; SM-S911B; wv) AppleWebKit/537.36 (KHTML, like Gecko) Version/4.0 Chrome/124.0.0.0 Mobile Safari/537.36',
  tiktokIOS:
    'Mozilla/5.0 (iPhone; CPU iPhone OS 17_0 like Mac OS X) AppleWebKit/605.1.15 Mobile/15E148 musical_ly_30.1.0 BytedanceWebview/d8a21c',
  safariIOS:
    'Mozilla/5.0 (iPhone; CPU iPhone OS 17_4 like Mac OS X) AppleWebKit/605.1.15 (KHTML, like Gecko) Version/17.4 Mobile/15E148 Safari/604.1',
  chromeAndroid:
    'Mozilla/5.0 (Linux; Android 14; Pixel 8) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/124.0.0.0 Mobile Safari/537.36',
  chromeDesktop:
    'Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/124.0.0.0 Safari/537.36',
}

// ── isInAppBrowser ───────────────────────────────────────────────────────────
assert.equal(isInAppBrowser(UA.instagramIOS), true, 'Instagram iOS is an in-app browser')
assert.equal(isInAppBrowser(UA.messengerAndroid), true, 'Messenger (FB_IAB) is an in-app browser')
assert.equal(isInAppBrowser(UA.androidWebView), true, 'Android "; wv" is a webview')
assert.equal(isInAppBrowser(UA.tiktokIOS), true, 'TikTok/Bytedance is an in-app browser')
assert.equal(isInAppBrowser(UA.safariIOS), false, 'Real iOS Safari is NOT an in-app browser')
assert.equal(isInAppBrowser(UA.chromeAndroid), false, 'Real Android Chrome is NOT an in-app browser')
assert.equal(isInAppBrowser(UA.chromeDesktop), false, 'Desktop Chrome is NOT an in-app browser')

// ── buildOpenInBrowserUrl ────────────────────────────────────────────────────
const href = 'https://autosplit.co/join/ABC123?ref=ig'

// Android → an intent:// URL that opens Chrome on the same page
const androidUrl = buildOpenInBrowserUrl(href, UA.messengerAndroid)
assert.ok(androidUrl.startsWith('intent://autosplit.co/join/ABC123'), 'Android builds an intent:// on the same host/path')
assert.ok(androidUrl.includes('scheme=https'), 'Android intent declares https scheme')
assert.ok(androidUrl.includes('package=com.android.chrome'), 'Android intent targets Chrome')
assert.ok(androidUrl.includes('browser_fallback_url='), 'Android intent has a fallback url')

// iOS → the x-safari-https:// scheme on the same page
const iosUrl = buildOpenInBrowserUrl(href, UA.instagramIOS)
assert.equal(iosUrl, 'x-safari-' + href, 'iOS prefixes x-safari- to open Safari on the same page')

// Anything else → unchanged
assert.equal(buildOpenInBrowserUrl(href, UA.chromeDesktop), href, 'Non-mobile returns the href unchanged')

console.log('✓ all inAppBrowser tests passed')
