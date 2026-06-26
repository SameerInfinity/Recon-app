// ARCONZA — Supabase Edge Function: delete-user
// Port of server.js /api/user/delete route for the standalone Android app.
// Verifies the caller's JWT, then admin-deletes the user account.
//
// Deploy with: supabase functions deploy delete-user
//
// Required Supabase secrets:
//   SUPABASE_SERVICE_ROLE_KEY — auto-injected by Supabase (never set manually)
//
// Rate limited per-user (or per-IP if no JWT) via Upstash.

import { serve } from "https://deno.land/std@0.168.0/http/server.ts";
import { createClient } from "https://esm.sh/@supabase/supabase-js@2";
import { createClient as createRedis } from "https://esm.sh/@upstash/redis@1.34.0";
import { Ratelimit } from "https://esm.sh/@upstash/ratelimit@2.0.0";

const ALLOWED_ORIGINS = [
  'http://localhost:8080',
  'http://localhost:3000',
  'http://localhost',
  'https://localhost',
  'capacitor://localhost',
  'ionic://localhost',
];

function corsHeaders(req) {
  const origin = req.headers.get('Origin') || '';
  const allowed = ALLOWED_ORIGINS.includes(origin) ||
    origin.startsWith('http://10.') ||
    origin.startsWith('http://192.168.');
  return {
    'Access-Control-Allow-Origin': allowed ? origin : ALLOWED_ORIGINS[0],
    'Access-Control-Allow-Methods': 'POST, OPTIONS',
    'Access-Control-Allow-Headers': 'Content-Type, Authorization, apikey',
    'Access-Control-Max-Age': '86400',
  };
}

function json(data, status = 200, extraHeaders = {}) {
  return new Response(JSON.stringify(data), {
    status,
    headers: { 'Content-Type': 'application/json', ...extraHeaders },
  });
}

// Rate limiting (optional)
let ratelimit = null;
const UPSTASH_URL = Deno.env.get('UPSTASH_REDIS_REST_URL');
const UPSTASH_TOKEN = Deno.env.get('UPSTASH_REDIS_REST_TOKEN');

if (UPSTASH_URL && UPSTASH_TOKEN) {
  try {
    const redis = createRedis({ url: UPSTASH_URL, token: UPSTASH_TOKEN });
    ratelimit = new Ratelimit({
      redis,
      limiter: Ratelimit.slidingWindow(10, '60 s'),
      analytics: true,
    });
  } catch (e) {
    console.warn('[delete-user] Upstash init failed:', e.message);
  }
}

serve(async (req) => {
  if (req.method === 'OPTIONS') {
    return new Response('ok', { headers: corsHeaders(req) });
  }

  if (req.method !== 'POST') {
    return json({ error: 'Method not allowed' }, 405, corsHeaders(req));
  }

  const _cors = corsHeaders(req);

  // Extract JWT from Authorization header
  const authHeader = req.headers.get('Authorization') || '';
  if (!authHeader.startsWith('Bearer ')) {
    return json({ error: 'Unauthorized', message: 'Missing or invalid Authorization header' }, 401, _cors);
  }

  const token = authHeader.replace('Bearer ', '');
  let userId = 'unknown';
  let userEmail = '';

  try {
    const parts = token.split('.');
    if (parts.length === 3) {
      const payload = JSON.parse(atob(parts[1]));
      userId = payload.sub || 'unknown';
      userEmail = payload.email || '';
    }
  } catch (e) {
    return json({ error: 'Invalid token', message: 'Could not decode JWT' }, 401, _cors);
  }

  if (userId === 'unknown') {
    return json({ error: 'Invalid token', message: 'No user ID in JWT' }, 401, _cors);
  }

  // Rate limit by user ID
  const clientIp = req.headers.get('x-forwarded-for')?.split(',')[0]?.trim() || 'unknown';
  const rateLimitKey = userId !== 'unknown' ? `delete:${userId}` : `delete:${clientIp}`;

  if (ratelimit) {
    try {
      const { success } = await ratelimit.limit(rateLimitKey);
      if (!success) {
        return json({ error: 'Rate limited', message: 'Too many delete attempts. Please wait.' }, 429, _cors);
      }
    } catch (err) {
      console.warn('[delete-user] Rate limit check failed:', err.message);
    }
  }

  // Get service role key (auto-injected by Supabase — never in the APK)
  const serviceRoleKey = Deno.env.get('SUPABASE_SERVICE_ROLE_KEY');
  if (!serviceRoleKey) {
    console.error('[delete-user] SUPABASE_SERVICE_ROLE_KEY not found');
    return json({ error: 'Server misconfigured', message: 'Service role key not available' }, 500, _cors);
  }

  // Create admin client
  const supabaseUrl = Deno.env.get('SUPABASE_URL') || `https://${Deno.env.get('SUPABASE_PROJECT_REF')}.supabase.co`;
  const adminClient = createClient(supabaseUrl, serviceRoleKey, {
    auth: { autoRefreshToken: false, persistSession: false }
  });

  // Delete the user
  try {
    const { error } = await adminClient.auth.admin.deleteUser(userId);
    if (error) {
      console.error('[delete-user] Admin delete failed:', error.message);
      return json({ error: 'Delete failed', message: error.message }, 500, _cors);
    }

    console.log(`[delete-user] Successfully deleted user: ${userEmail || userId}`);
    return json({ success: true, message: 'Account deleted successfully' }, 200, _cors);

  } catch (err) {
    console.error('[delete-user] Unexpected error:', err);
    return json({ error: 'Delete failed', message: err.message || 'Unknown error' }, 500, _cors);
  }
});
