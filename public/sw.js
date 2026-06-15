/* ═══════════════════════════════════════════════════════
   SERVICE WORKER v10
   ─────────────────────────────────────────────────────
   Strategy:
   - JS / CSS  → Network-Only (always fetch fresh, never cache)
   - HTML       → Network-Only (always fetch fresh, never cache)
   - Images/icons/manifest → Cache-First (stable assets)
   - Supabase / CDN API calls → Network-only (pass-through, never intercept)

   Bump CACHE_VERSION whenever you deploy new code.
   ═══════════════════════════════════════════════════════ */

const CACHE_VERSION = 'v10';
const STATIC_CACHE  = `recon-static-${CACHE_VERSION}`;

// Only these stable assets go into Cache-First
const STATIC_ASSETS = [
  '/manifest.json',
  '/icons/icon.svg',
];

// ── Install: pre-cache only static assets ──────────────
self.addEventListener('install', event => {
  self.skipWaiting();
  event.waitUntil(
    caches.open(STATIC_CACHE).then(cache => cache.addAll(STATIC_ASSETS))
  );
});

// ── Activate: delete ALL old caches ────────────────────
self.addEventListener('activate', event => {
  event.waitUntil(
    caches.keys().then(keys =>
      Promise.all(
        keys
          .filter(k => k !== STATIC_CACHE)
          .map(k => {
            console.log('[SW] Deleting cache:', k);
            return caches.delete(k);
          })
      )
    ).then(() => self.clients.claim())
  );
});

// ── Fetch ───────────────────────────────────────────────
self.addEventListener('fetch', event => {
  const url = new URL(event.request.url);

  // Never intercept non-GET
  if (event.request.method !== 'GET') return;

  // Only intercept HTTP/HTTPS schemes (avoid capacitor://, file://, etc.)
  if (url.protocol !== 'http:' && url.protocol !== 'https:') return;

  // Never intercept: Supabase, CDN API calls, /api/ routes, auth calls
  if (
    url.hostname.includes('supabase.co') ||
    url.hostname.includes('cdn.jsdelivr') ||
    url.hostname.includes('cdnjs.cloudflare.com') ||
    url.pathname.startsWith('/api/')
  ) return;

  // Static assets (manifest, icons) → Cache-First
  if (STATIC_ASSETS.includes(url.pathname)) {
    event.respondWith(
      caches.match(event.request).then(cached => cached || fetch(event.request))
    );
    return;
  }

  // JS, CSS, HTML → Network-First (always try fetch fresh first, fallback to cache if offline)
  if (
    url.pathname.endsWith('.js') ||
    url.pathname.endsWith('.css') ||
    url.pathname === '/' ||
    url.pathname === '/index.html' ||
    url.pathname === '/auth.html'
  ) {
    event.respondWith(
      fetch(event.request)
        .then(response => {
          if (response && response.status === 200 && response.type === 'basic') {
            const cacheCopy = response.clone();
            caches.open(STATIC_CACHE).then(cache => cache.put(event.request, cacheCopy));
          }
          return response;
        })
        .catch(() => caches.match(event.request))
    );
    return;
  }

  // Everything else (e.g. fonts, other assets) → Network-Only, no caching
  event.respondWith(fetch(event.request));
});
