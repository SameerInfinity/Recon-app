# RECON — AI-Powered Construction Management & Dynamic Financial Ledger

RECON is a comprehensive, web-based platform designed specifically for contractors, site builders, and construction managers. It replaces chaotic spreadsheets with a structured, intuitive financial ledger and project management tool, augmented by an intelligent AI assistant.

---

## 🌟 Value Proposition: How RECON Empowers Users

Construction projects often suffer from budget overruns, disjointed tracking of labor and materials, and mismanaged subcontractor contracts. RECON solves these pain points by offering a unified dashboard for all site activities:

1. **Complete Financial Control**: Track every rupee spent across different phases of construction. The system provides real-time budget health indicators and totals.
2. **Phase-by-Phase Tracking**: Manage up to 10 distinct phases (9 construction trades + 1 interior phase) with granular, line-item precision.
3. **Labour & Vendor Ledgers**: 
   - **Hajiri (Labour Attendance)**: Track daily labor logs, absences, and kharchi (daily expenses).
   - **Udhaar / Khata (Vendor Credit)**: Maintain running balances with local shops and material vendors.
4. **Site Inventory Management**: Keep track of material inward/outward logs and current stock on site.
5. **AI Co-Pilot (Build Assistant)**: A Gemini-powered AI actively "watches" the user's current view. It flags financial risks, analyzes project health, enumerates line items, and answers queries about costs or materials contextually.
6. **Subcontractors & RA Bills**: Manage trade contracts, retention amounts, and Running Account (RA) invoices effectively.
7. **Offline-Ready & Synced**: Employs Service Workers for robust caching and fast loading, while automatically syncing data across devices using Supabase.
8. **Professional Exports**: Generate beautiful, single-page PDF reports or export granular data to CSV/Excel for clients, audits, or off-platform accounting.

---

## 🛠 Technical Architecture & Codebase Overview

RECON is built using a lightweight, performant stack. It favors Vanilla JavaScript, CSS, and HTML on the frontend to keep the client fast, and utilizes Express.js and Supabase for robust backend and data management.

### Backend (`server.js`)
A Node.js/Express server that acts as a secure proxy and static file host.
- **Static Delivery**: Serves the Single Page Application (SPA) from the `public/` directory with optimized caching headers.
- **AI Proxy**: Securely routes requests to the **Google Gemini API** (`gemini-2.5-flash`), protecting API keys and preventing direct client-side exposure.
- **Rate Limiting**: Integrates **Upstash Redis** to rate-limit AI requests, preventing abuse.
- **Admin Endpoints**: Uses the Supabase Service Key to handle sensitive operations like complete user account deletion.

### Database Schema (`sql/schema.sql`)
Powered by **Supabase (PostgreSQL)**, utilizing strict Row Level Security (RLS) policies.
- **Core Entities**: `profiles`, `projects`, `phases`.
- **Dynamic Schemas**: The `phases` table uses a `JSONB` column (`data`) to store highly dynamic, deeply nested line items for various trades without rigid table structures.
- **Ledger Tables**: Relational tracking for `subcontractors`, `invoices`, `punch_items`.
- **Specialized Modules**: Contains specialized tables for Indian/regional construction norms, such as `labour` & `labour_logs` (Hajiri), `vendors` & `vendor_transactions` (Khata), `materials` & `material_logs`, and `ra_bills`.
- **Triggers**: Automated triggers handle timestamp updates and automatic profile creation upon user signup.

### Frontend SPA (`public/`)
A completely custom-built, module-based Vanilla JS frontend without heavy frameworks like React or Vue.
- **State Management (`js/state.js`)**: Manages the local application state and coordinates synchronization.
- **Cloud Sync (`js/supabase-client.js`)**: Handles authentication and bi-directional real-time data sync with the Supabase backend.
- **Router & Controller (`js/app.js`)**: The main application controller that orchestrates view switching (Overview, Phase Hub, Tools, etc.), wizard flows, and UI toggles.
- **Financial Engine (`js/financial.js`)**: Computes running totals, budget health, phase costs, and percentage completions dynamically.
- **Module Scripts**: Dedicated logic for different business functions:
  - `phases.js` & `phases-new-core.js`: Renders and manages the granular input cards for construction phases.
  - `labour-vendors.js` & `vendor-khata.js`: Manages the Hajiri and Udhaar interfaces.
  - `site-inventory.js`, `ra-bills.js`, `flat-sales.js`: Handle specific operational hubs.
  - `ai.js`: Manages the right-hand AI drawer UI and communication with the local proxy.
  - `export.js`: Integrates `html2pdf.js` and CSV generation.
- **Styling (`css/main.css`)**: Custom, responsive CSS leveraging CSS variables for theming, tailored to feel native, modern, and high-quality.

---

## 🚀 Getting Started for Developers

1. **Prerequisites**: Node.js, a Supabase project, an Upstash Redis database, and a Gemini API Key.
2. **Environment Variables**: Clone `.env.example` to `.env` and fill in:
   - `PORT`, `SUPABASE_URL`, `SUPABASE_ANON_KEY`, `SUPABASE_SERVICE_KEY`
   - `GEMINI_API_KEY`
   - `UPSTASH_REDIS_REST_URL`, `UPSTASH_REDIS_REST_TOKEN`
3. **Database Setup**: Execute `sql/schema.sql` in your Supabase SQL Editor to provision tables, RLS, and triggers.
4. **Install & Run**:
   ```bash
   npm install
   npm start
   ```
5. **Access**: Navigate to `http://localhost:8080` in your browser.