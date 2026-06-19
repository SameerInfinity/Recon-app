# RECON Audit — Applied Fixes

All findings from `RECON_Audit_Report.md` were processed. Below is the
status of each finding in this build.

## Code-fixed in this build

| ID | File | What changed |
|---|---|---|
| BUG-01 | `public/js/ai.js` | Replaced `proj.phases[N]` index access with `.find(p => p.id === N)?.data \|\| {}` for phases 1, 2, 4, 5. |
| BUG-02 | `public/js/ai.js` | `addMessage(...)` now escapes `body` by default. Added `isHtml` flag so AI-formatted replies that pre-build safe markdown HTML can opt in. Updated the two AI-reply call sites. |
| BUG-03 | `public/js/supabase-client.js` | Added `_isHandlingAuthError` guard in the fetch interceptor to prevent re-entrant `signOut()` loop on a 401 from `/auth/v1/logout`. |
| BUG-04 | `public/js/ra-bills.js` | `prevPaid` baseline now excludes the bill being edited, so reopening a paid bill no longer inflates its own previously-paid figure. |
| BUG-05 | `public/js/state.js` | Labour logs now snapshot `rateAtLog` at creation time; update/delete balance math uses the historical rate, falling back to `labour.dailyRate` only for legacy logs. |
| BUG-06 | `public/auth.html` | Brute-force lockout state is persisted in `sessionStorage` (`recon_lockout`) and restored on page load, so attackers can't reset the counter by refreshing. |
| BUG-07 | `public/js/phases-new-core.js` | After exhausting retries, dispatches `app:module-error` CustomEvent and shows a user-visible `App.toast(...)` instead of failing silently. |
| CALC-01 | `public/js/export.js` | Avg-completion in PDF export now divides by `proj.phases.length` (10) instead of hardcoded `/ 8`. Two call sites fixed. |
| CALC-03 | `public/js/dashboard.js` | Fair-share variance denominator is now `phaseData.length` (all 10 phases), removing the circular "more spend → harder to trigger" logic. |
| CALC-04 | `public/js/financial.js` | Phase 2 tile sand+cement now uses `add(mul(...), mul(...))` instead of raw `+` between `mul()` calls. |
| CALC-06 | `public/js/ra-bills.js` | When deductions exceed available balance, the UI now shows the "would result in a credit of ₹X" warning under the amount display, in the ember warning color. |
| GAP-01 | `public/js/supabase-client.js` | **Removed the hardcoded production Supabase URL + anon key** from the offline fallback. Action required: **rotate the exposed anon key in your Supabase dashboard** — it must be considered compromised since it was version-controlled. |
| GAP-02 | `sql/schema.sql`, `public/js/state.js` | Added `boq_items JSONB` column on `public.ra_bills` (idempotent `ALTER TABLE`). `addRaBill` and `updateRaBill` now write `boq_items`; the Supabase loader hydrates `boqItems` back onto each bill. **Run the updated `sql/schema.sql` against your Supabase project** to add the column. |
| GAP-04 | `public/auth.html`, `public/index.html` | `img/logo.png` references replaced with the existing `icons/icon.svg` so the broken-image placeholder no longer renders. |
| GAP-06 | `public/js/app.js` | `MutationObserver` is now scoped to `#content-area` (falling back to `<main>`, then `body`) instead of `document.body` subtree — also addresses PERF-03. |
| GAP-07 | `server.js` | `POST /api/user/delete` now goes through the same Upstash rate limiter (keyed `delete:<ip>`), with a 429 + `retryAfter` if exceeded. |
| GAP-08 | `server.js` | In production, `app.listen()` binds to `127.0.0.1`. Dev still binds to `0.0.0.0` so phones on the same WiFi can reach the dev server. |
| GAP-09 | `public/js/ra-bills.js` | `grid-template-columns: repeat(4,1fr)` replaced with `repeat(auto-fit, minmax(140px, 1fr))` so the RA bill metadata cards collapse cleanly on mobile. |
| GAP-10 | `public/js/export.js` | `proj.address`, `proj.client`, `proj.name` are now wrapped in `escapeHtml(...)` everywhere they're injected into the PDF HTML template. |
| SEC-01 | `public/js/ai.js` | Removed the misleading `X-User-Id` header from AI requests. Server already authorizes via the verified Bearer token. |
| SEC-02 | `server.js` | Added `app.set('trust proxy', 1)` in production so `req.ip` is the real client IP behind a reverse proxy, restoring per-user rate-limit accuracy. |
| SEC-04 | `server.js` | `PRODUCTION_URL` is now parsed as a comma-separated list so apex + `www.` + CDN/preview domains can all be allowed. |
| PERF-03 | `public/js/app.js` | See GAP-06 — observer scoped to dynamic content area. |
| PERF-04 | `public/js/state.js` | `saveLocal()` is now a 120ms-debounced wrapper around the original synchronous writer (renamed `_saveLocalNow`). Exposed `saveLocalNow()` for cases that need an immediate flush. |

## Not code-fixed (intentional / requires environment action)

| ID | Status / why |
|---|---|
| GAP-03 | `escapeHtml` is loaded from `security.js` before any caller in `auth.html`. Documented dependency only — no code change required. |
| GAP-05 | Buyers-as-JSONB-in-phases is a large architectural migration (new `buyers` + `buyer_payments` tables, new RLS, data backfill, UI rewrites in `flat-sales.js`). Kept as-is for now; recommend planning a dedicated migration sprint. |
| CALC-02 / CALC-05 | Mostly UX warnings / naming consistency, no functional bug. CALC-02: a future improvement is to flag empty paint-coverage rows in `financial.js` Phase 10 UI — not changed to avoid behavior regression. |
| SEC-03 | Removing CSP `'unsafe-inline'` requires refactoring every inline `onclick=` across the app (hundreds of call sites) to event delegation — a dedicated refactor task. Kept current CSP. |
| PERF-01 | Batched multi-project Supabase load is a non-trivial rewrite of `loadFromSupabase()`'s grouping logic. Left for a focused performance pass. |
| PERF-02 | Splitting `calcPhase10`'s DOM updates from its math is invasive (13 element writes). Left for a focused refactor; the existing `if (!el) return` guard means it's an inexpensive no-op when Phase 10 isn't visible. |

## Required follow-up actions on your side

1. **Rotate the Supabase anon key** in the Supabase dashboard. The key
   previously hardcoded in `supabase-client.js` (`vmkdfhghyirbgdnmrfmu`
   project) is in git history and must be considered public.
2. **Run the updated `sql/schema.sql`** against your Supabase project so
   the new `boq_items` column is created on `public.ra_bills`.
3. Set `PRODUCTION_URL` in `.env` as a comma-separated list if you have
   multiple production hosts (e.g. `PRODUCTION_URL=https://app.example.com,https://www.example.com`).
