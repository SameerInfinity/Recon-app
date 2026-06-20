// ═══════════════════════════════════════════
// JWT helpers for RECON Edge Functions.
//
// Supabase injects the requesting user's JWT in the `Authorization`
// header automatically (the SDK adds it for authenticated calls). We do
// NOT need the service-role key here — we just want the user id for
// rate-limiting, and Supabase has already validated the signature before
// the request reaches the function.
//
// We decode the JWT payload (base64url) without verifying the signature —
// safe because (a) we never use this id for anything that grants access,
// it only personalizes the rate-limit bucket, and (b) any actual data
// access happens through RLS-protected tables keyed on auth.uid(), which
// Supabase enforces independently of this value.
// ═══════════════════════════════════════════

function base64urlDecode(input: string): string {
  const pad = input.length % 4 === 0 ? "" : "=".repeat(4 - (input.length % 4));
  const b64 = input.replace(/-/g, "+").replace(/_/g, "/") + pad;
  // atob is available in the Deno / edge runtime.
  const binary = atob(b64);
  const bytes = new Uint8Array(binary.length);
  for (let i = 0; i < binary.length; i++) bytes[i] = binary.charCodeAt(i);
  return new TextDecoder().decode(bytes);
}

/**
 * Extracts `sub` (user id) from a Bearer JWT, or null if absent/invalid.
 */
export function userIdFromRequest(req: Request): string | null {
  const auth = req.headers.get("authorization") || req.headers.get("Authorization");
  if (!auth || !auth.toLowerCase().startsWith("bearer ")) return null;
  const token = auth.slice(7).trim();
  const parts = token.split(".");
  if (parts.length !== 3) return null;
  try {
    const payload = JSON.parse(base64urlDecode(parts[1]));
    return payload?.sub || null;
  } catch {
    return null;
  }
}
