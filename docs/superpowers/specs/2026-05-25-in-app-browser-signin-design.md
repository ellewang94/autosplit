# In-app browser sign-in — design

**Date:** 2026-05-25
**Status:** Approved (verbal), ready for implementation

## Problem

When someone opens an AutoSplit link from inside another app's in-app browser
(Instagram, Messenger, TikTok, etc.), Google's "Sign in with Google" is blocked
by Google with `Error 403: disallowed_useragent` ("use secure browsers"). New
users hit a dead end at the most important moment — joining a trip.

Two distinct issues surfaced:
1. **In-app browsers (webviews)** block Google OAuth. Unfixable in-place — Google
   forbids OAuth in embedded webviews and won't change that.
2. **Google OAuth app is in "Testing" mode**, so even in a real browser only
   pre-approved Google accounts can sign in.

## Goals

- A stranger can always complete sign-in, regardless of how they opened the link.
- Keep the one-tap "Sign in with Google" experience for the majority (real browsers).
- No new infrastructure for Elle to run or maintain (no email-sending service).

## Non-goals

- Passwordless email codes / magic links (rejected: requires an email-delivery
  service to set up and maintain). Existing email+password signup stays as the
  universal fallback, and already works without sending any email.
- Making Google OAuth work *inside* a webview (impossible).

## Solution

### Part 1 — Publish the Google OAuth app to Production (manual, Elle)

Flip the OAuth consent screen from "Testing" to "In production" in Google Cloud
Console. AutoSplit requests only non-sensitive scopes (email, profile, openid),
so this needs **no Google verification review and shows no warning screens**.
Effect: Google sign-in works for *any* user in a real browser, not just test users.

### Part 2 — "Open in browser" banner for in-app browsers (build)

A small, on-brand banner shown only when the app detects it is running inside an
in-app browser. Google and email sign-in remain fully visible and unchanged — the
banner is additive.

**Detection** — pure function `isInAppBrowser(userAgent)`:
- Match known in-app-browser UA tokens: `FBAN`/`FBAV`/`FB_IAB` (Facebook/Messenger),
  `Instagram`, `Line`, `Twitter`, `musical_ly`/`BytedanceWebview`/`TikTok`,
  `Snapchat`, `LinkedInApp`.
- Generic heuristics: Android `; wv)`; iOS (mobile, not Safari, not Chrome/Firefox
  iOS, not standalone PWA).

**One-tap "Open in browser"** — pure function `buildOpenInBrowserUrl(href, ua)`:
- **Android:** an `intent://` URL targeting Chrome with a generic-browser fallback
  → opens the real browser on the same page. Reliable.
- **iOS:** the `x-safari-https://…` scheme (prepend `x-safari-` to the https URL)
  → opens Safari on the same page in most in-app browsers. Apple forbids a hard
  guarantee, so a fallback is required.
- The button uses `window.location.href` (current page) as the target, so the
  destination loads with no copy-paste.

**Fallback (quiet):** a small "Didn't open? Tap ••• → Open in Safari, or copy the
link" line + a copy-link button, shown beneath the primary button. Secondary, not
the headline.

**Placement:** a single `<OpenInBrowserBanner />` component rendered at the top of
`LoginPage`, `SignupPage`, and `JoinPage` (where invited friends land). Renders
nothing when `isInAppBrowser()` is false.

## Testing

- `isInAppBrowser` and `buildOpenInBrowserUrl` are pure functions covered by a
  standalone Node test script using representative UA strings (Instagram iOS,
  Messenger Android, real Safari, real Chrome). Frontend has no test runner today;
  a Node script keeps the logic verified without adding a framework.
- Live verification after deploy: confirm the banner appears under a spoofed
  in-app-browser UA and is absent in a normal browser; confirm the Android intent
  and iOS scheme URLs are well-formed.

## Rollout

1. Build Part 2, build the frontend, deploy via push to `main` (Vercel).
2. Walk Elle through Part 1 (publish Google OAuth) — ~5 clicks, verified live.
3. Existing email+password remains the guaranteed fallback throughout.
