# ARCONZA — AI Context File

> **Purpose:** Give any AI assistant full understanding of this project to work
> efficiently without breaking anything. Read this FIRST before touching code.

---

## 1. Project Overview

| Field | Value |
|---|---|
| **App Name** | ARCONZA — AI-Powered Construction Management & Dynamic Financial Ledger |
| **Package** | `recon-buildmanager` v2.0.0 |
| **Target Users** | Indian contractors, site builders, construction managers |
| **Currency** | INR (₹) — all financial figures in Indian Rupees |
| **Stack** | Node.js/Express backend + Vanilla JS frontend + Supabase + Capacitor Android |
| **Entry Point** | `server.js` (Express), `public/index.html` (frontend) |
| **Android App ID** | `com.recon.buildmanager` |
| **Current Render URL** | `https://recon-app.onrender.com` (placeholder — user must confirm) |

---

## 2. Architecture

> **Two-tier deployment (v2.1+).** The **web** app is served by Render and
> uses Render as its config/AI/delete proxy (unchanged). The **Android APK**
> is **fully standalone** — it never calls Render. It reads its Supabase
> credentials from a bundled `app-config.json`, talks to Supabase Auth + DB
> directly, and reaches the AI proxy + account-delete through Supabase Edge
> Functions. Both platforms share the SAME Supabase project, so the
> database is identical cross-platform.

```
┌─────────────────────────────────────────────────────────────────┐
│                  ANDROID APP (Capacitor) — STANDALONE            │
│  ┌───────────────────────────────────────────────────────────┐  │
│  │  WebView loads /public/ as local assets                    │  │
│  │  (NO Render server needed on device)                        │  │
│  │                                                             │  │
│  │  supabase-client.js reads BUNDLED app-config.json           │  │
│  │  → Supabase URL + anon key + Google client ID               │  │
│  │  capacitor-bridge.js → online/offline state only            │  │
│  └──────┬──────────────────────────────┬───────────────────────┘  │
│         │ state.js → Supabase DB       │ ai.js / bill-scanner.js   │
│         │ supabase-client → Supabase Auth │ deleteUser()           │
└─────────┼───────────────────────────────┼──────────────────────────┘
          │                               │
          │                  ┌────────────▼─────────────────────────┐
          │                  │        SUPABASE (shared backend)      │
          │                  │  • Auth (email/password + Google)     │
          │                  │  • Postgres DB (15 tables, RLS)       │
          │                  │  • Edge Functions:                     │
          │                  │      ai-chat     (Gemini proxy)        │
          │                  │      delete-user (admin delete)        │
          │                  │  Rate limiting via Upstash Redis       │
          │                  │  Secrets: GEMINI_API_KEY, UPSTASH_*    │
          │                  │  (SUPABASE_SERVICE_ROLE_KEY auto-      │
          │                  │   injected — never in the APK)         │
          └─────────────────►│                                        │
                             └────────────────────────────────────────┘

┌─────────────────────────────────────────────────────────────────┐
│                  WEB (browser) — Render-hosted                   │
│  ┌───────────────────────────────────────────────────────────┐  │
│  │  Express server.js serves /public/ + proxies:              │  │
│  │    /api/config      → Supabase creds to frontend           │  │
│  │    /api/health      → health check                         │  │
│  │    /api/ai/chat     → Gemini (GEMINI_API_KEY server-side)  │  │
│  │    /api/user/delete → admin delete (service key)           │  │
│  │  CORS + Helmet CSP configured for Supabase + CDN scripts   │  │
│  └──────────────────────────────┬─────────────────────────────┘  │
└─────────────────────────────────┼────────────────────────────────┘
                                  │ (same Supabase project as Android)
```

### Key Architecture Decisions

1. **Frontend talks to Supabase DIRECTLY** — not through any app server.
   - `supabase-client.js` initializes a client-side Supabase instance
   - `state.js` does all CRUD operations client-side via Supabase JS SDK
   - The Render server (web) / Edge Functions (Android) are ONLY for:
     config delivery, AI proxy, account deletion

2. **Android app = local assets, NEVER touches Render**
   - `capacitor.config.json` has NO `server.url` — app loads bundled assets
   - `supabase-client.js` reads `public/app-config.json` first on native
     (generated from `.env` at build time → see `scripts/build-native-config.js`)
   - Falls back to Render `/api/config` ONLY if the bundled file is missing
   - NEVER add `server.url` back to `capacitor.config.json` for production

3. **Single switch-point for native vs web endpoints**
   - `SupabaseClient.getAiChatUrl()` and `getDeleteUserUrl()` return
     `<supabaseUrl>/functions/v1/<name>` on native, `/api/...` on web
   - Migrating the web app off Render later = drop the `isNative` branch

4. **Dual persistence: localStorage + Supabase**
   - `state.js` always writes to localStorage first (instant, offline-capable)
   - Then syncs to Supabase if authenticated (async, can queue for retry)
   - localStorage key: `buildmanager_v2` (legacy name, never change it)

---

## 3. File Map & Responsibilities

### Server-Side (Node.js)

| File | Lines | Purpose | Key Rules |
|---|---|---|---|
| `server.js` | ~410 | Express server (WEB ONLY — Android does not use it) | Binds `0.0.0.0` (NOT `127.0.0.1` — Render needs this). Trust proxy in prod. HTTPS redirect in prod. |
| `package.json` | 30 | Dependencies & scripts | `start` → `node server.js`. `build:android` → config injection + cap sync. `deploy:functions` → push edge fns. |
| `.env.example` | 26 | Documents all env vars | NEVER commit actual `.env` |

### Supabase Edge Functions (Android AI + delete path)

| File | Purpose | Key Rules |
|---|---|---|
| `supabase/functions/ai-chat/index.ts` | Gemini AI proxy (chat + OCR) | Port of `server.js /api/ai/chat`. Hardcodes both CHAT + OCR system instructions (client-sent instruction used only as a *hint*). Reads `GEMINI_API_KEY` from env. Rate-limited 10/min via Upstash. Deployed with `--no-verify-jwt` (anonymous callers allowed; rate-limit falls back to IP). |
| `supabase/functions/delete-user/index.ts` | Account deletion (admin) | Port of `server.js /api/user/delete`. Verifies caller JWT → admin-deletes user. Uses auto-injected `SUPABASE_SERVICE_ROLE_KEY` (never in APK). Rate-limited per IP. |
| `supabase/functions/_shared/cors.ts` | CORS helpers | `*` origin (capacitor WebView origin is `https://localhost`). Handles OPTIONS preflight. |
| `supabase/functions/_shared/ratelimit.ts` | Upstash sliding-window limiter | 10 req / 60 s. Fails open if Upstash is down (matches server.js). |
| `supabase/functions/_shared/auth.ts` | JWT user-id extraction | Decodes `sub` for rate-limit bucketing only — RLS still enforces access independently. |

### Build-time Config (Android standalone bootstrap)

| File | Purpose | Key Rules |
|---|---|---|
| `scripts/build-native-config.js` | Generates `public/app-config.json` from `.env` | Run automatically by `npm run build:android` BEFORE `cap sync`. Validates required vars. Only writes the anon key + URL + Google client ID (all already public via `/api/config`). |
| `public/app-config.json` | Bundled config consumed by the APK | GITIGNORED. Contains the project ref — keep out of history (GAP-01 lesson). Regenerated on every Android build. |

### Frontend Core

| File | Size | Purpose | Key Rules |
|---|---|---|---|
| `public/js/capacitor-bridge.js` | 6K | Native env detection, API_BASE, offline/online | MUST load before `supabase-client.js`. Line 18: `PRODUCTION_SERVER_URL` must match actual Render URL. |
| `public/js/supabase-client.js` | 14K | Supabase init, auth, Google Sign-In, endpoint routing | **Native**: reads bundled `app-config.json` first, falls back to `API_BASE + '/api/config'`. **Web**: fetches `/api/config`. Exposes `getAiChatUrl()` + `getDeleteUserUrl()` (native → Supabase Edge Function, web → Render). Caches config in sessionStorage. Native Google sign-in uses `@capgo/capacitor-social-login`. |
| `public/js/state.js` | 108K | ALL data persistence + sync logic | THE MOST CRITICAL FILE. Contains: localStorage CRUD, Supabase CRUD, sync queue, dirty tracking. Never rename `STORAGE_KEY = 'buildmanager_v2'`. |
| `public/js/app.js` | 107K | Main app controller, bottom nav, modules | Loads/destroys module UIs. AI drawer. Logout handler. |
| `public/js/security.js` | 1.3K | `escapeHtml()` utility | Must load before any code that injects user content into DOM |

### Frontend Modules

| File | Size | Module | Key Tables |
|---|---|---|---|
| `public/js/dashboard.js` | 15K | Dashboard hub | reads from state |
| `public/js/phases.js` | 194K | Phase data entry | `phases` |
| `public/js/phases-new-core.js` | 110K | Phase editor core | `phases` |
| `public/js/financial.js` | 31K | Financial calculations | computed from phases |
| `public/js/estimation.js` | 26K | Pre-construction estimator | `phases` (sections: survey, earthwork, concrete, utility, temp_infra) |
| `public/js/labour-vendors.js` | 47K | Labour (Hajiri) + Vendors (Udhaar) | `labour`, `labour_logs`, `vendors`, `vendor_transactions` |
| `public/js/vendor-khata.js` | 22K | Vendor ledger (Khata) | `vendors`, `vendor_transactions` |
| `public/js/site-inventory.js` | 19K | Site stock/inventory | `materials`, `material_logs` |
| `public/js/ra-bills.js` | 38K | Running Account bills | `ra_bills` (with `boq_items` JSONB) |
| `public/js/flat-sales.js` | 33K | Flat/unit sales tracking | stored in phase data (GAP-05: needs migration) |
| `public/js/quick-leads.js` | 34K | CRM leads | `leads` |
| `public/js/site-photos.js` | 23K | Construction photo log | `site_photos` |
| `public/js/ai.js` | 22K | AI chat (Build Assistant) | calls `/api/ai/chat` via `CapacitorBridge.API_BASE` |
| `public/js/bill-scanner.js` | 29K | OCR bill scanning | calls `/api/ai/chat` via `CapacitorBridge.API_BASE` |
| `public/js/export.js` | 22K | PDF/CSV export | reads from state |
| `public/js/onboarding.js` | 7.8K | First-time user onboarding | creates default project |
| `public/js/icons.js` | 15K | SVG icon definitions | referenced by name strings |

### Frontend HTML

| File | Purpose |
|---|---|
| `public/index.html` | Main app SPA. Loads scripts in ORDER (security → cap-bridge → supabase → onboarding → icons → state → modules → app) |
| `public/auth.html` | Login/signup page. Brute-force lockout (5 attempts → 60s cooldown) in sessionStorage |
| `public/offline.html` | Shown when Capacitor app starts with no internet and no cached session |

### Android

| File | Purpose | Key Rules |
|---|---|---|
| `android/app/src/main/java/com/recon/buildmanager/MainActivity.java` | Main Activity | MUST implement `ModifiedMainActivityForSocialLoginPlugin` for Google Sign-In. Currently MISSING this — must be added before Google native sign-in works. Also registers `CallLogPlugin`. |
| `android/app/src/main/java/com/recon/buildmanager/CallLogPlugin.java` | Native call log plugin | READ_CALL_LOG permission with native dialog |
| `android/app/src/main/AndroidManifest.xml` | App manifest | `usesCleartextTraffic=true`, `networkSecurityConfig=@xml/network_security_config` |
| `android/app/src/main/res/xml/network_security_config.xml` | Network security | Allows Render, Supabase, Google, CDN domains. Must use `includeSubdomains` (NOT `includeSubmodules` — that was a typo that broke builds) |
| `android/app/build.gradle` | Build config | Signing via `keystore.properties` (NOT in capacitor.config.json). `minifyEnabled true` for release. |
| `android/keystore.properties` | Keystore passwords | `storeFile=../recon-release-key.jks` (relative to `android/app/`). GITIGNORED — never commit. |
| `android/recon-release-key.jks` | Release signing key | GITIGNORED. Password: `ARCONZA2024secure`. Alias: `recon`. IRREPLACEABLE — lose it = can't update Play Store listing. |
| `android/app/proguard-rules.pro` | ProGuard rules | Keeps Capacitor bridge, Supabase, Google Sign-In classes from obfuscation |

---

## 4. Environment Variables

### Required (server-side, in Render/.env)

| Variable | Purpose | Example |
|---|---|---|
| `NODE_ENV` | Must be `production` on Render | `production` |
| `PORT` | Auto-set by Render (default 10000) | Don't set manually |
| `SUPABASE_URL` | Supabase project URL | `https://xxxxx.supabase.co` |
| `SUPABASE_ANON_KEY` | Public anon key | `eyJ...` |
| `SUPABASE_SERVICE_KEY` | Admin key (for user deletion only) | `eyJ...` |
| `UPSTASH_REDIS_REST_URL` | Rate limiting | `https://xxxxx.upstash.io` |
| `UPSTASH_REDIS_REST_TOKEN` | Rate limiting | token |
| `GEMINI_API_KEY` | AI chat + OCR | `AIza...` |
| `GOOGLE_WEB_CLIENT_ID` | Native Google Sign-In | `xxxx.apps.googleusercontent.com` |
| `PRODUCTION_URL` | CORS — comma-separated domains | `https://recon-app.onrender.com,https://yourdomain.com` |

### Required (client-side, fetched from server)

The frontend fetches `SUPABASE_URL`, `SUPABASE_ANON_KEY`, and `GOOGLE_WEB_CLIENT_ID` from `/api/config` (web) or reads them from the bundled `app-config.json` (Android). These are NOT hardcoded in the JS.

### Required (Supabase Edge Functions — for Android's AI + delete path)

These must be set as Supabase project secrets (NOT in `.env` of the Render app — though you can copy the same values). Run once:
```bash
supabase secrets set GEMINI_API_KEY=AIza... UPSTASH_REDIS_REST_URL=https://... UPSTASH_REDIS_REST_TOKEN=...
```
- `GEMINI_API_KEY` — used by the `ai-chat` edge function
- `UPSTASH_REDIS_REST_URL` / `UPSTASH_REDIS_REST_TOKEN` — rate limiting for both edge functions
- `SUPABASE_SERVICE_ROLE_KEY` — **auto-injected by Supabase**, NEVER set it manually and NEVER ship it in the APK

---

## 5. Data Flow & Sync System

### localStorage Structure

```javascript
Key: 'buildmanager_v2'  // NEVER rename this — will orphan existing user data
Value: JSON {
  projects: [
    {
      id: "uuid-or-timestamp-id",
      name: "My Building",
      address: "...",
      client: "...",
      currency: "INR",
      phases: [ /* 10 phase objects */ ],
      labour: [ ... ],
      labourLogs: [ ... ],
      vendors: [ ... ],
      vendorTransactions: [ ... ],
      materials: [ ... ],
      materialLogs: [ ... ],
      raBills: [ ... ],
      leads: [ ... ],
      sitePhotos: [ ... ],
      // ...
    }
  ],
  currentProjectId: "uuid",
  version: 3
}
```

### Supabase Tables (15 tables)

| Table | Primary Key | RLS | Links To |
|---|---|---|---|
| `profiles` | user_id | yes | auth.users |
| `projects` | uuid | yes | profiles |
| `phases` | uuid | yes | projects |
| `subcontractors` | uuid | yes | projects |
| `invoices` | uuid | yes | subcontractors |
| `punch_items` | uuid | yes | projects |
| `labour` | uuid | yes | projects |
| `labour_logs` | uuid | yes | labour |
| `vendors` | uuid | yes | projects |
| `vendor_transactions` | uuid | yes | vendors |
| `materials` | uuid | yes | projects |
| `material_logs` | uuid | yes | materials |
| `ra_bills` | uuid | yes | projects |
| `leads` | uuid | yes | projects |
| `site_photos` | uuid | yes | projects |

### Sync Flow

```
User edits data
    ↓
state.js: markDirty('phase', phaseId) or markDirty('project')
    ↓
saveLocal() — debounced 120ms, writes to localStorage immediately
    ↓
saveToSupabase() — writes changed entity to Supabase directly
    ↓ (on failure)
enqueueMutation(operation, table, id, payload) — queued in localStorage
    ↓ (when back online)
replaySyncQueue() — replays all queued mutations
```

### Dirty Tracking (state.js)

- `_dirty.project = true` — project metadata changed
- `_dirty.phases = Set<phaseId>` — specific phase data changed
- `markDirty()` → dispatches `dirtychanged` CustomEvent → dashboard shows "Unsynced" badge
- System recalculations (Financial.updateAllTotals, recalcAllCompletions) do NOT mark dirty — they only call `saveLocal()`
- `clearDirty()` — called after successful sync

### Sync Queue (state.js)

- Stored in localStorage key: `recon_sync_queue`
- Each entry: `{ operation: 'insert'|'update'|'delete', table: string, id: string, payload: object|null, timestamp: number }`
- `_isReplaying` guard prevents concurrent replay attempts
- `replaySyncQueue()` processes entries sequentially

### ⚠️ KNOWN ISSUE: High Supabase request volume

During resync, the app generates ~247 requests/minute. This needs a delta-sync refactor:
- Only sync entities that actually changed (use dirty tracking)
- Batch upserts instead of individual row operations
- Only mark "unsynced" on real user changes, not system recalculations
- Status: NOT YET IMPLEMENTED (pending)

---

## 6. The 10 Construction Phases

These are standard Indian contractor workflow phases. NEVER change the IDs or order:

| ID | Name | Icon | Section Groups |
|---|---|---|---|
| 1 | Civil Work | pickaxe | survey, earthwork, concrete, temp_infra |
| 2 | Tiles & Flooring | ruler | — |
| 3 | Painting | paintbrush | — |
| 4 | Electrical Work | zap | — |
| 5 | Furniture & Fabrication | door | — |
| 6 | Plumbing Work | droplet | — |
| 7 | POP & False Ceiling | insulation | — |
| 8 | Lift (Elevator) | stairs | — |
| 9 | Other (Misc.) | listChecks | — |
| 10 | Interior | sofa | — |

Phase 1 has detailed sub-sections defined in `INPUT_SECTION_MAP` (state.js line 113-134).

---

## 7. Script Loading Order (CRITICAL)

In `index.html` and `auth.html`, scripts MUST load in this order:

```
1. security.js           — escapeHtml() utility
2. capacitor-bridge.js   — detects native env, sets API_BASE (MUST be before supabase-client.js)
3. supabase-client.js    — initializes Supabase (needs API_BASE from cap-bridge)
4. [index.html only] onboarding.js, icons.js
5. state.js              — data layer (needs SupabaseClient)
6. financial.js, dashboard.js, estimation.js, phases.js
7. ai.js, export.js, labour-vendors.js, vendor-khata.js, site-inventory.js
8. ra-bills.js, bill-scanner.js, phases-new-core.js, flat-sales.js
9. quick-leads.js, site-photos.js
10. app.js               — main controller (needs all modules loaded)
```

**NEVER** rearrange this order. Breaking it causes "Supabase not initialized" or "undefined is not a function" errors.

---

## 8. API Routes & Endpoint Routing

### Two distinct paths: native (Android) vs web

| Endpoint | Android (Capacitor) | Web (browser) |
|---|---|---|
| Config (Supabase creds) | bundled `public/app-config.json` | `GET /api/config` on Render |
| AI chat / OCR | `POST {supabaseUrl}/functions/v1/ai-chat` | `POST /api/ai/chat` on Render |
| Account delete | `POST {supabaseUrl}/functions/v1/delete-user` | `POST /api/user/delete` on Render |
| Data CRUD | **Supabase DB directly** (same on both platforms) | **Supabase DB directly** |
| Auth | **Supabase Auth directly** (same on both platforms) | **Supabase Auth directly** |

The split is decided by `SupabaseClient.getAiChatUrl()` and
`SupabaseClient.getDeleteUserUrl()` in `supabase-client.js` — they check
`CapacitorBridge.isNative` and pick the Edge Function URL vs the Render URL.
Config loading in `supabase-client.js init()` is native-first (bundled
`app-config.json`) with a Render fallback.

### Files that hit network endpoints

| File | Endpoint(s) | Notes |
|---|---|---|
| `supabase-client.js` | `app-config.json` (native) / `/api/config` (web) | Config bootstrap |
| `supabase-client.js` | `getDeleteUserUrl()` → edge fn OR `/api/user/delete` | Account deletion |
| `ai.js` | `SupabaseClient.getAiChatUrl()` → edge fn OR `/api/ai/chat` | Build Assistant chat |
| `bill-scanner.js` | `SupabaseClient.getAiChatUrl()` → edge fn OR `/api/ai/chat` | OCR bill scan |
| `state.js` | Supabase DB (`*.supabase.co/rest/v1/`, `realtime`) | All data CRUD — direct, no proxy |

### Pattern for any new API call

```javascript
// For AI-style calls (need a server-side secret): route through a resolver
const url = SupabaseClient.getAiChatUrl();   // native → edge fn, web → render

// For config: supabase-client.js already handles native vs web internally.
// For everything else: talk to Supabase directly — no proxy needed.
```

---

## 9. Auth System

### Login Methods
1. **Email + Password** — `SupabaseClient.signIn()` / `signUp()`
2. **Google OAuth (Web)** — Browser redirect via Supabase OAuth
3. **Google Native (Android)** — `@capgo/capacitor-social-login` plugin → native account picker → ID token → Supabase `signInWithIdToken()`

### Auth Flow
- Auth state changes redirect between `auth.html` and `index.html`
- In Capacitor: redirects use `/auth.html` and `/index.html` (explicit paths)
- In browser: redirects use `/auth.html` and `/`
- Token expiry (401/403) → auto sign-out → redirect to `auth.html?expired=1`
- `_isHandlingAuthError` guard prevents re-entrant sign-out loops

### ⚠️ CRITICAL: MainActivity.java must be updated

Current `MainActivity.java` does NOT implement `ModifiedMainActivityForSocialLoginPlugin`.
This means native Google Sign-In will NOT work. See `docs/GOOGLE_SIGNIN_NATIVE_SETUP.md`
for the required code. The `CallLogPlugin` registration must be preserved when merging.

---

## 10. Security Model

### CSP (Content Security Policy) — in server.js helmet()

```
scriptSrc: 'self', 'unsafe-inline', cdn.jsdelivr.net, cdnjs.cloudflare.com
styleSrc: 'self', 'unsafe-inline', fonts.googleapis.com
connectSrc: 'self', *.supabase.co, generativelanguage.googleapis.com, ws:, wss:
imgSrc: 'self', data:, blob:, *.supabase.co, *.googleusercontent.com
```

### CORS — in server.js

Allowed origins: `localhost:8080`, `localhost:3000`, `http://localhost`, `https://localhost`,
`capacitor://localhost`, `ionic://localhost`, + any URLs in `PRODUCTION_URL` env var.

### Rate Limiting

- AI chat: 10 requests/minute per user/IP (Upstash Redis)
- Account deletion: 10 requests/minute per IP (same limiter, keyed `delete:<ip>`)

### Row-Level Security (Supabase)

All 15 tables have RLS policies. Users can only access data in projects they own.
The `profiles` table is auto-created via trigger on `auth.users` signup.

---

## 11. Service Worker (`sw.js`)

- **Network-First** for JS/CSS/HTML (fetch fresh, fallback to cache)
- **Cache-First** for static assets (manifest, icons)
- **Network-Only** for Supabase, CDN APIs, /api/ routes
- Only registered on HTTPS (not localhost, not Capacitor)
- Cache version: `v10` (bump `CACHE_VERSION` on each deploy)
- Capacitor app does NOT use the service worker (local assets don't need it)

---

## 12. Build & Deploy

### Web (Render)

1. Push to GitHub → Render auto-deploys
2. Build command: `npm install`
3. Start command: `node server.js`
4. Must set ALL env vars in Render dashboard
5. `PRODUCTION_URL` must include the Render URL

### Android (Production APK) — STANDALONE

The build flow now regenerates the bundled config from `.env` before
syncing assets, so the APK never needs Render to bootstrap:

```bash
# 1. (one-time) Deploy the Edge Functions the APK will call:
npm run deploy:functions

# 2. Build the APK — generates public/app-config.json then syncs assets
npm run build:android
cd android
./gradlew assembleRelease     # Signed APK
# Output: android/app/build/outputs/apk/release/app-release.apk
```

### Android (Debug)

```bash
npm run build:android         # generates app-config.json + cap sync
cd android
./gradlew assembleDebug       # Debug APK (no signing needed)
npx cap run android           # Live reload on device
```

### Android (Live Reload during development)

For development ONLY, temporarily add to `capacitor.config.json`:
```json
"server": { "url": "http://YOUR_LOCAL_IP:8080", "androidScheme": "http", "cleartext": true }
```
**REMOVE THIS before production build** or the APK will need a local server.

---

## 13. Known Issues & Gotchas

### Critical

| ID | Issue | Status | Impact |
|---|---|---|---|
| GAP-05 | Flat buyers stored in phase data JSON, not separate table | Open | Can't query buyers across projects. Needs dedicated `buyers` + `buyer_payments` tables + UI rewrite in `flat-sales.js` |
| MAIN-01 | `MainActivity.java` doesn't implement `ModifiedMainActivityForSocialLoginPlugin` | Open | Native Google Sign-In broken on Android |
| SYNC-01 | Delta sync not implemented — resync sends ALL data, 247 req/min | Open | Supabase rate limits, wasted bandwidth |
| ICON-01 | `public/icons/icon.svg` is 0 bytes (empty file) | Open | No app icon shown in PWA, broken image references |

### Important

| ID | Issue | Status | Impact |
|---|---|---|---|
| GAP-01 | Supabase anon key was in git history | Partial fix | Key rotated? Must verify. Old key is compromised. |
| GAP-02 | `boq_items` column in `ra_bills` table | Needs action | User must run updated `sql/schema.sql` against Supabase |
| SEC-03 | CSP uses `'unsafe-inline'` | Open | XSS risk. Can't remove without refactoring hundreds of `onclick=` to event delegation |
| PERF-01 | Multi-project Supabase load not batched | Open | Slow initial load for users with many projects |

### Already Fixed (don't reintroduce)

| ID | What was fixed |
|---|---|
| STANDALONE-01 | Android APK no longer depends on Render — reads bundled `app-config.json`, calls Supabase Edge Functions for AI + account delete. Fixes the "Supabase not initialized" error on fresh installs. |
| BUG-03 | Auth sign-out re-entrancy loop (guard added) |
| BUG-04 | RA bills prevPaid inflation on reopen |
| BUG-05 | Labour log rate snapshot |
| BUG-06 | Brute-force lockout bypassed via page refresh |
| GAP-08 | Server binding — now `0.0.0.0` always (was `127.0.0.1` in prod, broke Render) |
| SYNC-DOUBLE | Double toast on sync (fixed in v2) |
| SYNC-REPLAY | `_isReplaying` stuck guard (fixed in v2) |

---

## 14. Conventions & Rules

### Code Style
- Vanilla JavaScript only — no React, no Vue, no framework
- IIFE module pattern: `const ModuleName = (() => { ... return { publicApi }; })();`
- No ES modules (`import`/`export`) — all scripts loaded via `<script>` tags
- CSS custom properties for theming (`--bg`, `--amber`, `--r-md`, etc.)
- Jost + IBM Plex Mono font families

### Data Conventions
- IDs: UUID strings when synced to Supabase, timestamp-based when offline
- `isUUID()` check determines if an entity exists in Supabase
- All monetary values in INR. Use `mul()`, `add()`, `sub()` from financial.js for precision
- Phase completion: 0-100 percentage per phase
- Labour attendance: 'full', 'half', 'absent' enum

### Naming Conventions
- localStorage key: `buildmanager_v2` (NEVER change — will orphan data)
- Supabase tables: snake_case (`vendor_transactions`, `material_logs`)
- JS object properties: camelCase (`vendorTransactions`, `materialLogs`)
- State.js maps between them: `boq_items` ↔ `boqItems`, `image_url` ↔ `imageUrl`

### Version Convention
- `versionCode` in `build.gradle`: increment for every Play Store upload
- `versionName`: semver (`2.0.0`)
- `CACHE_VERSION` in `sw.js`: increment on every web deploy (`v10`, `v11`, etc.)

---

## 15. Capacitor-Specific Rules

1. **NEVER add `server.url` to `capacitor.config.json` for production builds** — the APK must work standalone with bundled assets
2. **Always use `androidScheme: "https"`** — `http` scheme causes CORS issues with Supabase
3. **Run `npx cap sync android`** after ANY change to files in `public/`
4. **The `android/app/src/main/assets/public/` directory is auto-generated** — never edit it manually, it gets overwritten by `cap sync`
5. **Network security config** is required for cross-origin requests from Capacitor's `https://localhost` origin
6. **`keystore.properties`** path `storeFile=../recon-release-key.jks` — relative to `android/app/`, the `../` is needed because the keystore lives in `android/`

---

## 16. Database Schema Quick Reference

### Entity Relationships

```
profiles (auth.uid)
  └── projects (1:N)
        ├── phases (1:N, always 10 per project)
        ├── subcontractors (1:N)
        │     └── invoices (1:N)
        ├── punch_items (1:N)
        ├── labour (1:N)
        │     └── labour_logs (1:N)
        ├── vendors (1:N)
        │     └── vendor_transactions (1:N)
        ├── materials (1:N)
        │     └── material_logs (1:N)
        ├── ra_bills (1:N, has boq_items JSONB)
        ├── leads (1:N)
        └── site_photos (1:N)
```

### Key Column Types
- `phases.data` → JSONB (contains all line items, quantities, costs for that phase)
- `ra_bills.boq_items` → JSONB (Bill of Quantities items array)
- `site_photos.image_url` → text (URL, could be Supabase Storage or external)
- `labour_logs.status` → text ('full', 'half', 'absent')
- `vendor_transactions.type` → text ('debit', 'credit')

---

## 17. Feature Checklist

| Feature | Module | Status |
|---|---|---|
| Project CRUD | state.js | ✅ Working |
| 10-phase data entry | phases.js, phases-new-core.js | ✅ Working |
| Financial calculations | financial.js | ✅ Working |
| Dashboard | dashboard.js | ✅ Working |
| Pre-construction estimator | estimation.js | ✅ Working |
| Labour attendance (Hajiri) | labour-vendors.js | ✅ Working |
| Vendor ledger (Udhaar/Khata) | labour-vendors.js, vendor-khata.js | ✅ Working |
| Site inventory | site-inventory.js | ✅ Working |
| RA bills (with BOQ) | ra-bills.js | ✅ Working |
| Flat/unit sales | flat-sales.js | ⚠️ Partial (GAP-05) |
| Quick leads (CRM) | quick-leads.js | ✅ Working |
| Site photos | site-photos.js | ✅ Working |
| AI chat (Build Assistant) | ai.js | ✅ Working |
| OCR bill scanner | bill-scanner.js | ✅ Working |
| PDF/CSV export | export.js | ✅ Working |
| Call log plugin (Android) | CallLogPlugin.java | ✅ Working |
| Google Sign-In (web) | supabase-client.js | ✅ Working |
| Google Sign-In (Android native) | supabase-client.js | ❌ Broken (MAIN-01) |
| Cloud sync | state.js | ⚠️ Works but high request volume (SYNC-01) |
| Offline mode | capacitor-bridge.js | ✅ Working (local assets + cached data) |
| PWA | sw.js, manifest.json | ✅ Working (web only) |

---

## 18. Deployment Status

| Component | Status | URL / Location |
|---|---|---|
| Render (web) | ✅ Deployed | `https://recon-app.onrender.com` (placeholder — verify) |
| Supabase | ✅ Active | Project configured |
| Upstash Redis | ✅ Active | Rate limiting enabled |
| Android APK | ✅ Builds | Release build with keystore signing |
| Google Cloud Console | ❓ Verify | Android OAuth client + SHA-1 registered? |
| Custom domain | ❌ Not done | Next: Cloudflare + GoDaddy setup |
| Play Store | ❌ Not published | Future milestone |

---

## 19. IndexedDB — Local Image Storage

`state.js` contains a `LocalImages` module using IndexedDB:
- Database: `recon_local_images`
- Store: `images`
- Used by: `site-photos.js` for storing photos offline before uploading to Supabase Storage
- Methods: `init()`, `saveImage(key, blob)`, `getImage(key)`, `deleteImage(key)`

---

## 20. Quick Reference — What NOT to Do

| ❌ Never Do | Why |
|---|---|
| Add `server.url` to `capacitor.config.json` for production | APK will need a running server on device |
| Skip `npm run build:android` and use plain `cap sync` | The APK won't get a regenerated `app-config.json` → may ship stale credentials or fail to bootstrap |
| Commit `public/app-config.json` to git | Contains the project ref + anon key — keep out of history (GAP-01 lesson). It's gitignored. |
| Set `SUPABASE_SERVICE_ROLE_KEY` as a Supabase secret manually | Already auto-injected into edge functions; setting it manually risks the admin key being logged or exposed |
| Rename `buildmanager_v2` localStorage key | Will orphan all existing user data |
| Change phase IDs or default order | Breaks data mapping across the entire app |
| Remove `capacitor-bridge.js` from script load order | Breaks Supabase init in Capacitor |
| Set server to bind `127.0.0.1` in production | Render can't detect the port |
| Use `includeSubmodules` in network_security_config.xml | Not a valid Android attribute — causes build failure |
| Hardcode Supabase credentials in JS | Security risk (GAP-01 lesson) |
| Remove `_isHandlingAuthError` guard | Will cause infinite sign-out loop on 401 |
| Change `storeFile` path in keystore.properties without understanding relative paths | Path is relative to `android/app/`, needs `../` prefix |
| Skip `npx cap sync android` after changing public/ files | APK won't include your changes |
| Use `minifyEnabled true` without proper ProGuard rules | Will strip Capacitor bridge classes |
| Touch `android/app/src/main/assets/` manually | Auto-generated by `cap sync`, your changes get overwritten |

---

*Last updated: 2026-06-21*
*Version: ARCONZA v2.1.0 (Android standalone via Supabase Edge Functions)*
