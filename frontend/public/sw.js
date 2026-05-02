// AutoSplit service worker — minimal viable shell.
//
// Chrome requires a service worker for the install prompt to fire reliably.
// We're deliberately not caching API responses or app assets aggressively
// here: AutoSplit deals with money and we'd rather show fresh data than a
// stale-and-misleading screen. This SW exists primarily to make the app
// installable, not to be a real offline strategy.
//
// One thing it DOES do well: bump CACHE_VERSION on each release to
// guarantee old shells get torn down — important so users don't see a
// stale UI after we ship a fix.

const CACHE_VERSION = 'autosplit-shell-v1'

self.addEventListener('install', (event) => {
  // Activate the new SW as soon as it's installed instead of waiting
  // for all tabs to close.
  self.skipWaiting()
})

self.addEventListener('activate', (event) => {
  event.waitUntil(
    (async () => {
      // Wipe any stale cache from a previous version
      const keys = await caches.keys()
      await Promise.all(
        keys.filter((k) => k !== CACHE_VERSION).map((k) => caches.delete(k))
      )
      // Take control of all open tabs immediately
      await self.clients.claim()
    })()
  )
})

// Pass-through fetch handler. We're not caching anything yet — but we
// need the listener to exist for Chrome to consider this a "real" SW
// for install-prompt purposes.
self.addEventListener('fetch', (event) => {
  // No-op — let the network handle it.
  return
})
