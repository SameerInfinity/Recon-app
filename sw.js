/* ═══════════════════════════════════════════════════════
   SERVICE WORKER v9
   ─────────────────────────────────────────────────────
   Strategy:
   - JS / CSS  → Network-First (always try live, cache as backup)
   - HTML       → Network-First
   - Images/icons/manifest → Cache-First (stable assets)
   - Supabase / CDN API calls → Network-only (never cache)

   Bump CACHE_VERSION whenever you deploy new code.
   ═══════════════════════════════════════════════════════ */

const CACHE_VERSION = 'v9';
const STATIC_CACHE  = `recon-static-${CACHE_VERSION}`;
const DYNAMIC_CACHE = `recon-dynamic-${CACHE_VERSION}`;

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
          .filter(k => k !== STATIC_CACHE && k !== DYNAMIC_CACHE)
          .map(k => {
            console.log('[SW] Deleting old cache:', k);
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
      caches.match(event.request).then(cached => cached || fetchAndCache(event.request, STATIC_CACHE))
    );
    return;
  }

  // Everything else (HTML, JS, CSS) → Network-First
  event.respondWith(networkFirst(event.request));
});

async function networkFirst(request) {
  try {
    const response = await fetch(request);
    if (response && response.status === 200 && response.type === 'basic') {
      const cache = await caches.open(DYNAMIC_CACHE);
      cache.put(request, response.clone());
    }
    return response;
  } catch (err) {
    // Network failed — serve from cache if available
    const cached = await caches.match(request);
    if (cached) return cached;
    // If it's a navigation request and nothing cached, return offline fallback
    if (request.mode === 'navigate') {
      return caches.match('/index.html');
    }
    throw err;
  }
}

async function fetchAndCache(request, cacheName) {
  const response = await fetch(request);
  const cache = await caches.open(cacheName);
  cache.put(request, response.clone());
  return response;
}
