# Build Manager — Bug Fixes Applied

## Fix 1 — `financial.js`: Duplicate `computePhase1`–`computePhase8` functions (CRASH)
**Error:** `TypeError: Cannot read properties of undefined (reading 'qty_kg')` at `financial.js:274`

**Root cause:** The file had two sets of compute functions with identical names. JavaScript silently
kept the second definition (the new trade-based functions like `computePhase1` for Civil Work).
When `renderSidebar` called `computePhaseTotal` on a freshly-created project (with empty `data: {}`),
`d.iron` was `undefined`, and `d.iron.qty_kg` crashed immediately.

**Fix:** Deleted the old 8-function set entirely. Renamed the trade functions to `calcPhase1`–`calcPhase10`
(private to the module). The `computePhaseTotal` dispatcher calls these internally. Added try/catch
in the dispatcher so any future error returns 0 gracefully instead of crashing the whole app.

---

## Fix 2 — `app.js`: Duplicate `showTools` function (SILENT BUG)
**Error:** The second `showTools` body replaced the first. The first stub accidentally called
`AI.setWatching('Subcontractor Ledger')` — wrong context — before being overwritten.

**Fix:** Removed the dead first stub. Only one `showTools` function remains.

---

## Fix 3 — `app.js` + `state.js`: `wizardNext` crash on button mashing (CRASH)
**Error:** `TypeError: Cannot read properties of undefined (reading 'length')` at `app.js:209:95`

**Root cause:** Two problems together:
1. `wizardNext` called `await State.load()` every time it fired. `State.load()` re-triggers
   the full Supabase auth flow and can fire `showMainApp` a second time, corrupting app state.
2. No debounce guard — clicking "Create Project →" multiple times fired `State.createProject`
   multiple times simultaneously, creating duplicate projects and racing on `proj.phases.length`.

**Fix:**
- Removed the redundant `await State.load()` call from inside `wizardNext` (state is already
  loaded by `boot()` before `init()` runs).
- Added a `_wizardCreating` boolean guard — the button is disabled and shows "Creating…" while
  the async project creation is in flight.
- Wrapped the `proj.phases.length` log line defensively: `Array.isArray(proj.phases) ? proj.phases : []`.

---

## Fix 4 — `state.js`: Supabase 400 Bad Request on `POST /phases` (API ERROR)
**Error:** `POST /phases?columns=... 400 (Bad Request)`

**Root cause:** Supabase JS v2 sends a `columns=` hint when inserting JSONB columns. When
`data` was passed as a raw JS object `{}`, the client's column-type inference failed and
Supabase rejected the request with a 400.

**Fix:** All three INSERT/UPSERT calls for phase data now use `JSON.stringify(data || {})`:
- `createProject` → phase batch insert
- `migrateToSupabase` → phase batch insert  
- `saveToSupabase` → phase upsert

---

## Fix 5 — `state.js`: Early-return bug in `loadFromSupabase` loop (LOGIC BUG)
**Error:** `[State] Cloud empty but local has data — keeping local projects` fires incorrectly
for users who have both local AND cloud data.

**Root cause:** The "keep local" guard was placed INSIDE the per-project for-loop, checked after
the first project was processed. `fullProjects.length === 0` is always true on the first iteration,
so any user with local data would bail out before the cloud project was added to `fullProjects`.

**Fix:** Removed the misplaced in-loop guard. The check now happens correctly BEFORE the loop,
only when Supabase returns zero projects.

---

## Fix 6 — `sql/schema.sql`: Policy names cleaned up
Renamed all RLS policies to short, non-conflicting names (`projects_select`, `phases_all`, etc.)
so the schema can be safely re-run without `DROP POLICY IF EXISTS` conflicts from the old verbose names.
Added `ON CONFLICT (id) DO NOTHING` to the profile trigger to prevent duplicate profile errors
on re-authentication.
