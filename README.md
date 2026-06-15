# RECON — AI-Powered Construction Management & Dynamic Financial Ledger

**RECON** (Version 2.0 / v3 Architecture) is a comprehensive, mobile-first web platform designed specifically for contractors, site builders, and construction managers. It replaces chaotic spreadsheets with a structured, intuitive financial ledger and project management tool, augmented by an intelligent AI assistant. 

This new version introduces a robust mobile-optimized UI, an advanced local-first synchronization engine (Supabase + localStorage), an expanded trade-based phase system, flat sales tracking, and a powerful Gemini 2.5 AI co-pilot.

---

## 🌟 Value Proposition & Key Features

Construction projects often suffer from budget overruns, disjointed tracking of labor and materials, and mismanaged subcontractor contracts. RECON solves these pain points by offering a unified dashboard for all site activities:

1. **Complete Financial Control**: Track every rupee (or dollar) spent across different phases of construction. The system provides real-time budget health indicators, variance tracking, and dynamic totals via a robust calculation engine (`financial.js`).
2. **Trade-Based Phase Tracking**: Manage up to 10 distinct phases (9 standard construction trades + 1 highly detailed Interior phase) with granular, line-item precision.
3. **Site Ledgers (Labour, Vendor & Inventory)**:
   - **Worker Attendance**: Track daily worker logs, absences, extra pay (daily expenses), and running balances.
   - **Udhaar / Khata (Vendor Credit)**: Maintain running balances with local shops, tracking debits, credits, and material vendors.
   - **Site Inventory**: Keep track of material inward/outward logs and current stock on site.
4. **Operations & Subcontractors**: 
   - **Subcontractor Ledger**: Manage trade contracts, retention amounts, and payments.
   - **RA Bills**: Manage Running Account invoices and track work completion percentages.
   - **Flat Sales / Buyers**: Track apartment/flat buyers and the payment installments received.
5. **AI Co-Pilot (Build Assistant)**: A **Gemini 2.5 Flash**-powered AI actively "watches" the user's current view. It flags financial risks (e.g., budget overruns), suggests material alternatives (e.g., PEX vs Copper), answers queries about costs, and enumerates line items contextually.
6. **Offline-Ready & Cloud Synced**: Built as a Progressive Web App (PWA) with Service Workers for offline caching. `state.js` seamlessly manages local state with a fallback mechanism, automatically syncing data to **Supabase** when online.
7. **Professional Exports**: Generate beautiful, single-page PDF reports or export granular data to CSV/Excel for clients, audits, or off-platform accounting.

---

## 🛠 Technical Architecture & Codebase Overview

RECON is built using a lightweight, highly performant stack. It favors Vanilla JavaScript, CSS, and HTML on the frontend to keep the client fast, and utilizes Express.js and Supabase for a robust backend and real-time data layer.

### Frontend SPA (`public/`)
A custom-built, module-based Vanilla JS frontend (No React/Vue overhead) focused on a mobile-first, bottom-nav architecture.
- **Controller (`js/app.js`)**: The main application controller orchestrating view switching (Dashboard, Trades, Interior, Ledgers, More), wizard flows, modals, and the right-hand AI drawer.
- **State Management (`js/state.js`)**: Manages the local application state (v3 schema) and coordinates robust bi-directional sync with Supabase, falling back to `localStorage`.
- **Financial Engine (`js/financial.js`)**: A precise calculation engine computing running totals, budget health, phase costs, and handling complex math for the Interior finishes (Phase 10).
- **Module Scripts**: 
  - `phases-new-core.js` / `phases.js`: Manages the granular input cards and UI for the 10 construction phases.
  - `labour-vendors.js`, `vendor-khata.js`, `site-inventory.js`: Manage the ledgers.
  - `ra-bills.js`, `bill-scanner.js`, `flat-sales.js`: Handle specialized operational hubs.
  - `ai.js`: Manages the deterministic rule engine and proxies conversations to the Gemini API.
  - `export.js`: Integrates `html2pdf.js` and CSV generation.
- **Cloud Client (`js/supabase-client.js`)**: Handles authentication, token refresh, and initializes the Supabase client based on config fetched from the server.

### Backend (`server.js`)
A Node.js/Express server acting as a secure proxy, rate-limiter, and static file host.
- **Static Delivery**: Serves the SPA from the `public/` directory with optimized caching headers.
- **AI Proxy**: Securely routes chat requests to the **Google Gemini API** (`gemini-2.5-flash`), injecting the full project context while protecting API keys from client-side exposure.
- **Rate Limiting**: Integrates **Upstash Redis** (`@upstash/ratelimit`) to rate-limit AI requests and prevent API abuse.
- **Admin Endpoints**: Securely handles sensitive operations like user account deletion using the Supabase Service Key.

### Database Schema (`sql/schema.sql`)
Powered by **Supabase (PostgreSQL)**, utilizing strict Row Level Security (RLS) policies.
- **Core Entities**: `profiles`, `projects`, `phases`.
- **Dynamic Schemas**: The `phases` table uses a `JSONB` column (`data`) to store highly dynamic, deeply nested line items for various trades without rigid table structures.
- **Ledger Tables**: Relational tracking for `subcontractors`, `invoices`, `punch_items`, `labour`, `labour_logs`, `vendors`, `vendor_transactions`, `materials`, `material_logs`, and `ra_bills`.
- **Triggers**: Automated triggers handle timestamp updates and automatic profile creation via Auth hooks.

---

## 🚀 Getting Started for Developers

### Prerequisites
- Node.js (v18+)
- A **Supabase** project (URL & Anon Key + Service Key)
- An **Upstash Redis** database (URL & Token)
- A **Google Gemini API Key**

### 1. Environment Setup
Clone `.env.example` to `.env` and fill in the required keys:
```env
PORT=8080
SUPABASE_URL=your_supabase_url
SUPABASE_ANON_KEY=your_anon_key
SUPABASE_SERVICE_KEY=your_service_role_key
GEMINI_API_KEY=your_gemini_api_key
UPSTASH_REDIS_REST_URL=your_upstash_url
UPSTASH_REDIS_REST_TOKEN=your_upstash_token
```

### 2. Database Provisioning
Open your Supabase Dashboard SQL Editor and execute the contents of `sql/schema.sql`. This will:
- Create all necessary tables (`projects`, `phases`, ledgers, etc.).
- Set up **Row Level Security (RLS)** ensuring users can only access their own project data.
- Create automated database triggers.

### 3. Install & Run
Install the server dependencies and start the Node.js Express server:
```bash
npm install
npm start
```

### 4. Access the Application (Web)
Navigate to `http://localhost:8080` in your browser.
- You will be greeted by the Welcome Screen.
- Sign up / Log in to test the Supabase sync.
- Try creating a project and interacting with the Build Assistant!

---

## 📱 Android App with Capacitor

RECON is now wrapped as a native Android app using **Capacitor 8**. The app loads your existing web frontend inside a WebView, giving you access to native Android features (camera, file system, etc.) while keeping the same codebase.

### Prerequisites (for Android)
- All the web prerequisites above
- **Android Studio** (with Android SDK, build tools, etc.) — [Download](https://developer.android.com/studio)
- A physical Android device (or emulator) for testing
- USB debugging enabled on your device (for physical testing)

### 🔥 The Key: Live Reload — No More Reinstalling APKs

The biggest pain point of mobile app development is rebuilding and reinstalling the APK after every code change. **Live Reload** solves this by pointing the Android app to your local development server over Wi-Fi — every change you save instantly appears on your device.

#### How Live Reload Works
1. Your Android app loads from your computer's local IP (e.g., `http://192.168.1.5:8080`) instead of bundled files
2. You edit code on your computer, the Express server refreshes the files
3. The Android app detects the change and reloads automatically
4. **No APK reinstallation needed until you want to ship a release build**

---

### 🚀 Quick Start: One-Command Dev Server + Live Reload

```bash
# Start the Express server with live reload config
npm run dev:android
```

This will:
1. Auto-detect your computer's local Wi-Fi IP
2. Update `capacitor.config.json` with the live reload server URL
3. Copy the config to the Android project
4. Start the Express dev server

> ⚠️ **Keep this terminal running** — it's your dev server.

Then, **in a second terminal**, run the app on your device:

```bash
npm run cap:run:android
```

This will build and launch the app on your connected Android device. The app will load from your dev server.

**Edit your code → Save → App refreshes instantly on your phone.** 🎉

---

### 🛠 Manual Android Workflow

| Command | What it does |
|---|---|
| `npm run cap:sync` | Sync web assets & config to Android project |
| `npm run cap:copy` | Copy web assets to Android (faster than sync) |
| `npm run cap:open:android` | Open the Android project in Android Studio |
| `npm run cap:run:android` | Build & run on connected device |
| `npm run dev:android` | Start dev server + configure live reload |

#### Option A: Android Studio (most reliable)
```bash
# Sync latest web changes
npx cap sync

# Open Android Studio
npm run cap:open:android

# In Android Studio, click Run ▶ (green triangle)
```

#### Option B: CLI (faster for quick iterations)
```bash
# Sync and run directly on connected device
npm run cap:run:android
```

---

### 🔄 Live Reload Workflow (Step by Step)

1. **Connect devices to the same Wi-Fi** — Your computer and Android phone must be on the same network.

2. **Start the live reload setup:**
   ```bash
   npm run dev:android
   ```
   This auto-detects your IP, patches the config, and starts the Express server.

3. **Enable USB Debugging on your phone:**
   - Settings → About Phone → Tap "Build Number" 7 times
   - Settings → Developer Options → Enable USB Debugging
   - Connect your phone via USB

4. **Run the app on your phone (second terminal):**
   ```bash
   npm run cap:run:android
   ```

5. **Make changes!** — Edit any HTML, CSS, or JS file. Save it. Watch the app refresh instantly.

> 🔄 Switch back to bundled mode for distribution: remove `"url"` from `server` in `capacitor.config.json` and run `npx cap sync`.

---

### 📦 Building a Release APK

When you're ready to distribute the app (without needing the dev server):

1. **Restore production config:**
   Open `capacitor.config.json` and remove the `server.url` field (or comment it out).

2. **Sync bundled assets:**
   ```bash
   npx cap sync
   ```

3. **Build in Android Studio:**
   ```bash
   npm run cap:open:android
   ```
   In Android Studio: Build → Generate Signed Bundle / APK → APK → Next → Create new keystore → Finish.

4. **Install the APK:**
   The signed APK will be at `android/app/release/app-release.apk`. Transfer it to your phone and install.

---

### 🧹 Project Structure (Android)

```
android/
├── app/
│   ├── src/main/
│   │   ├── AndroidManifest.xml    # App permissions & config
│   │   ├── assets/public/         # Copy of web assets
│   │   ├── java/                  # MainActivity.java
│   │   └── res/                   # Icons, themes, etc.
│   ├── build.gradle               # App build config
│   └── proguard-rules.pro
├── gradle/                        # Gradle wrapper
├── build.gradle                   # Root gradle config
└── settings.gradle
```

**Key files:**
- `capacitor.config.json` — **Root config** for app name, ID, server URL, plugins
- `android/app/src/main/AndroidManifest.xml` — Android permissions, cleartext traffic
- `android/app/build.gradle` — Build versions, min SDK, dependencies
- `scripts/setup-livereload.js` — Auto-detect IP and configure live reload
