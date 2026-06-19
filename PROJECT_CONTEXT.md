# RECON - Build Manager Project Context

## Project Overview
RECON is a construction financial ledger app for Indian contractors and site builders. It's a PWA that works on both desktop (browser) and Android (Capacitor WebView).

## Architecture
- **Backend**: Express.js server (`server.js`) on port 8080
- **Frontend**: Vanilla JS modules in `public/js/`
- **Mobile**: Capacitor Android app in `android/`
- **Database**: Supabase (PostgreSQL) with localStorage fallback
- **State Management**: `state.js` - single source of truth

## Key Modules
1. **Estimation** (`estimation.js`) - Project cost estimation with two sections:
   - Section 1: Land & Development Estimate (Land Cost, Developing Fees, Architecture Fees, Other)
   - Section 2: Construction Estimate (per trade: Civil, Tiles, Painting, Electrical, etc.)

2. **Dashboard** (`dashboard.js`) - Shows hero card, stats, phase cards, variance alerts

3. **Phases** (`phases.js`, `phases-new-core.js`) - 10 construction phases (9 trades + Interior)

4. **Ledgers** - Labour, Vendor Khata, Site Inventory

5. **RA Bills** (`ra-bills.js`) - Running Account bills

6. **AI Assistant** (`ai.js`) - Gemini AI proxy via `/api/ai/chat`

7. **Export** (`export.js`) - PDF/CSV export

## Data Flow
- All data stored in `State` (localStorage + Supabase sync)
- Project has `estimation` object with `land` and `constr` properties
- `land`: `{landCost, devDN, devGovt, devOther, archFees, landOther}`
- `constr`: per trade `{material, labor}`

## UI Patterns
- **Desktop**: Sidebar navigation (`m-desktop-sidebar`)
- **Mobile**: Bottom navigation (`m-bottomnav`) + top app bar
- **Mode switch**: `public/js/app.js` adds `body.desktop-mode` only in a non-native browser at viewport width >= 900px. Capacitor / Android native stays on the mobile layout even on a large WebView.
- **CRITICAL responsive rule**: Every UI change must be designed separately for PC/browser and Android/mobile. Do not assume one CSS layout fits both. Android should remain compact, touch-friendly, and usually single-screen-width; PC can use wider fields, sidebars, and denser horizontal space.
- **Cards**: Glassmorphism `.glass` / `.m-hero-card` / `.est-card`
- **Inputs**: Currency inputs with ₹ symbol (`.est-amt-wrap` + `.est-rupee`)
- **Modals**: Bottom sheet (mobile) / centered (desktop) via `.m-modal-overlay`

## Current Task: Land & Development Estimate - "Add New" Feature
Replace the single "Other" field in Section 1 with a dynamic "Add New" section where users can:
1. Click "Add New" button
2. Enter custom title and estimate amount
3. Add multiple custom items
4. Each item contributes to the Land total

Implementation notes:
- `public/js/estimation.js` owns render, totals, add/remove/update handlers, and persists under `project.estimation.land.customItems`.
- Project Estimation card should render compact/collapsed by default; users expand it by tapping/clicking the header.
- Custom item amount fields should use the same `.est-amt-wrap` / `.est-input` rupee-wrapped sizing as standard estimation amount fields.
- Custom item rows should not display a duplicate formatted amount below the amount input; the section total already reflects it.
- Custom item layout is mobile-first but side-by-side: Android keeps title, amount, and remove button in one compact row; >=560px gives the amount field more width; >=900px follows desktop amount sizing.

## Files to Modify
- `public/js/estimation.js` - Core logic for rendering, calculation, and input handling
- `public/css/main.css` - Additional styles for dynamic items

## Android/WiFi Note
Server binds to 0.0.0.0:8080. For phone access on same WiFi:
- Use `adb reverse tcp:8080 tcp:8080` with USB debugging, OR
- Update `capacitor.config.json` url to `http://192.168.1.6:8080` and rebuild
- Ensure Windows Firewall allows Node.js on Private networks
