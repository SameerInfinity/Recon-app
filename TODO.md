# Build Manager — TODO

## Completed
- Trade input cards (phases 1–9) now read/write latest `phase.data[cardId].entries[].fields` when present; fallback remains for legacy scalar fields.
- Phase 10 behavior remains unchanged (manual total override still supported).
- `public/js/bill-scanner.js` was left as a legacy phase-level bill ledger flow (note only).

## Remaining (to “do the rest”)
1. Add trade-card UI for:
   - “Save New Entry”
   - “Previous Entries” list
   - Basic delete entry
2. Wire bills scanner to save scanned bills into the active card entry (`phase.data[cardId].entries[last].bills[]`) and display them under entries.
3. Ensure totals are derived from entries (already implemented for costFn usage in trade-card detail).
4. Rename label/ID occurrences:
   - `thekedar` → “Labor Costing” in visible UI meta/labels (phase 1 category + card naming).
5. Migration:
   - On load, migrate legacy scalar fields into a single `entries[0].fields` for each card.

## Test plan
- Open existing project with legacy data → verify totals match after migration.
- Add entry to a trade card → verify totals update.
- Scan a bill → verify bill appears under that card entry.

