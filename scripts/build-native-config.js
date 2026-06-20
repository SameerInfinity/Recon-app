/* ═══════════════════════════════════════════
   build-native-config.js
   ───────────────────────────────────────────
   Generates `public/app-config.json` from the local `.env` so the
   standalone Android APK can boot WITHOUT calling the Render server.

   Why this exists:
     The Express server exposes GET /api/config which serves
     { supabaseUrl, supabaseAnonKey, googleWebClientId } to the frontend.
     On the web that works fine. In the Capacitor APK, however, that fetch
     is pointed at the production Render URL — if Render is cold-starting
     or unreachable, supabase-client.js can't initialize and every auth
     call throws "Supabase not initialized". Bundling these (already-public)
     values into the APK removes that dependency entirely.

   Run automatically by `npm run build:android` (before `cap sync`).

   NOTE: The values written here are the *anon* key + project URL — both
   already shipped to every browser visitor via /api/config. They are NOT
   secrets. The file is still gitignored to keep the project ref out of
   git history (GAP-01 lesson).
   ═══════════════════════════════════════════ */

const fs = require("fs");
const path = require("path");

const ROOT = path.resolve(__dirname, "..");
const ENV_PATH = path.join(ROOT, ".env");
const OUT_PATH = path.join(ROOT, "public", "app-config.json");

// ── Minimal .env parser (no dependency on dotenv CLI) ──
function parseEnv(filePath) {
  const text = fs.readFileSync(filePath, "utf8");
  const out = {};
  for (const rawLine of text.split(/\r?\n/)) {
    const line = rawLine.trim();
    if (!line || line.startsWith("#")) continue;
    const eq = line.indexOf("=");
    if (eq === -1) continue;
    const key = line.slice(0, eq).trim();
    let val = line.slice(eq + 1).trim();
    // Strip surrounding quotes if present
    if ((val.startsWith('"') && val.endsWith('"')) ||
        (val.startsWith("'") && val.endsWith("'"))) {
      val = val.slice(1, -1);
    }
    out[key] = val;
  }
  return out;
}

function main() {
  if (!fs.existsSync(ENV_PATH)) {
    console.error(`[build-native-config] ERROR: .env not found at ${ENV_PATH}`);
    console.error("  Create it from .env.example and fill in real values first.");
    process.exit(1);
  }

  const env = parseEnv(ENV_PATH);

  const supabaseUrl = env.SUPABASE_URL;
  const supabaseAnonKey = env.SUPABASE_ANON_KEY;
  const googleWebClientId = env.GOOGLE_WEB_CLIENT_ID || "";

  const missing = [];
  if (!supabaseUrl) missing.push("SUPABASE_URL");
  if (!supabaseAnonKey) missing.push("SUPABASE_ANON_KEY");
  if (missing.length) {
    console.error(`[build-native-config] ERROR: missing required env vars: ${missing.join(", ")}`);
    process.exit(1);
  }

  if (!googleWebClientId) {
    console.warn("[build-native-config] WARNING: GOOGLE_WEB_CLIENT_ID is empty — native Google sign-in will not work (email/password will).");
  }

  const config = {
    supabaseUrl: supabaseUrl.replace(/\/+$/, ""), // no trailing slash
    supabaseAnonKey,
    googleWebClientId,
    // Build timestamp so we can verify the APK is using a fresh config.
    generatedAt: new Date().toISOString(),
  };

  fs.mkdirSync(path.dirname(OUT_PATH), { recursive: true });
  fs.writeFileSync(OUT_PATH, JSON.stringify(config, null, 2) + "\n", "utf8");

  console.log("[build-native-config] Wrote", path.relative(ROOT, OUT_PATH));
  console.log("  supabaseUrl:", config.supabaseUrl);
  console.log("  googleWebClientId:", config.googleWebClientId ? `${config.googleWebClientId.slice(0, 12)}…` : "(empty)");
  console.log("  Edge Functions →", `${config.supabaseUrl}/functions/v1/{ai-chat,delete-user}`);
}

main();
