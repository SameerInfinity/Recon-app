// ═══════════════════════════════════════════
// Shared CORS helpers for RECON Edge Functions.
//
// The Android app runs in a Capacitor WebView whose origin is
// `https://localhost` (and `capacitor://localhost` on iOS). The web app
// is served from the Render production URL. All of these origins need to
// be able to call these functions, plus `null`/no-origin requests from
// curl/Postman during testing.
// ═══════════════════════════════════════════

export const CORS_HEADERS: Record<string, string> = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Methods": "POST, OPTIONS",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type",
  "Access-Control-Max-Age": "86400",
  "Vary": "Origin",
};

/**
 * Responds to a CORS preflight request. Returns null for non-OPTIONS
 * requests so the caller can continue normally.
 *
 * Usage:
 *   if (corsPreflight(req)) return corsPreflight(req);
 */
export function handlePreflight(req: Request): Response | null {
  if (req.method !== "OPTIONS") return null;
  return new Response(null, { status: 204, headers: CORS_HEADERS });
}

/** Adds CORS headers to an outgoing JSON response. */
export function corsJson(body: unknown, init: { status?: number; headers?: Record<string, string> } = {}): Response {
  return new Response(JSON.stringify(body), {
    status: init.status ?? 200,
    headers: { "Content-Type": "application/json", ...CORS_HEADERS, ...(init.headers || {}) },
  });
}

/**
 * Best-effort client IP extraction. Edge functions run behind Supabase's
 * edge network; the real client IP is in the `x-forwarded-for` header
 * (first entry). Used as a rate-limit fallback when there is no user JWT.
 */
export function clientIp(req: Request): string {
  const xff = req.headers.get("x-forwarded-for");
  if (xff) return xff.split(",")[0].trim();
  return "0.0.0.0";
}
