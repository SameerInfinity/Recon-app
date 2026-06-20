// ═══════════════════════════════════════════
// RECON Edge Function: delete-user
//
// Port of server.js /api/user/delete (Express → Deno). Identical behavior:
//   1. Verify the caller's Bearer JWT (their own access token) to obtain
//      their user id — never trust a client-supplied id.
//   2. Delete the user via the Supabase admin API (cascades to all rows
//      via RLS / foreign keys, exactly like the server version).
//   3. Rate-limit the destructive call: 10 / 60 s per IP (Upstash).
//
// Supabase auto-injects into the function environment:
//   SUPABASE_URL
//   SUPABASE_ANON_KEY
//   SUPABASE_SERVICE_ROLE_KEY   ← admin privileges, NEVER expose to client
//
// We construct two clients: one with the caller's token (to *verify*
// identity, like server.js calling /auth/v1/user), and one with the
// service-role key (to perform the admin delete).
// ═══════════════════════════════════════════

import { createClient } from "https://esm.sh/@supabase/supabase-js@2";
import { corsJson, handlePreflight, clientIp } from "../_shared/cors.ts";
import { rateLimit } from "../_shared/ratelimit.ts";

Deno.serve(async (req: Request) => {
  const preflight = handlePreflight(req);
  if (preflight) return preflight;

  if (req.method !== "POST") {
    return corsJson({ error: "Method not allowed", message: "Use POST" }, { status: 405 });
  }

  const supabaseUrl = Deno.env.get("SUPABASE_URL");
  const serviceKey = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY");
  const anonKey = Deno.env.get("SUPABASE_ANON_KEY");

  if (!supabaseUrl || !serviceKey || !anonKey) {
    return corsJson({
      error: "Not configured",
      message: "Supabase env vars missing (this should be auto-injected).",
    }, { status: 503 });
  }

  // ── Rate limit (per IP, keyed like server.js) ──
  const rl = await rateLimit(`delete:${clientIp(req)}`, {
    url: Deno.env.get("UPSTASH_REDIS_REST_URL"),
    token: Deno.env.get("UPSTASH_REDIS_REST_TOKEN"),
  });
  if (!rl.success) {
    return corsJson({
      error: "Rate limited",
      message: "Too many delete attempts. Please wait a moment.",
      retryAfter: Math.ceil((rl.reset - Date.now()) / 1000),
    }, { status: 429 });
  }

  // ── Auth: verify the caller's own token ──
  const authHeader = req.headers.get("authorization");
  if (!authHeader || !authHeader.toLowerCase().startsWith("bearer ")) {
    return corsJson({ error: "Unauthorized", message: "Missing auth token" }, { status: 401 });
  }
  const userToken = authHeader.slice(7).trim();

  // Verify identity with the caller's token (same pattern as server.js
  // hitting /auth/v1/user). getUser() validates the JWT signature.
  const userClient = createClient(supabaseUrl, anonKey, {
    global: { headers: { Authorization: `Bearer ${userToken}` } },
  });
  const { data: userData, error: verifyError } = await userClient.auth.getUser();

  if (verifyError || !userData?.user?.id) {
    return corsJson({ error: "Invalid token", message: "Could not verify user identity" }, { status: 401 });
  }
  const userId = userData.user.id;

  // ── Admin delete (cascades to all tables the user owns) ──
  const adminClient = createClient(supabaseUrl, serviceKey, {
    auth: { autoRefreshToken: false, persistSession: false },
  });
  const { error: deleteError } = await adminClient.auth.admin.deleteUser(userId);

  if (deleteError) {
    console.error("[delete-user] admin.deleteUser failed:", deleteError.message);
    return corsJson({
      error: "Delete failed",
      message: deleteError.message,
    }, { status: 500 });
  }

  console.log(`[delete-user] Deleted user ${userId}`);
  return corsJson({ success: true, message: "Account deleted" });
});
