// ARCONZA — Supabase Edge Function: ai-chat
// Port of server.js /api/ai/chat route for the standalone Android app.
// Handles BOTH Build Assistant chat AND bill OCR (image scanning).
//
// Deploy with: supabase functions deploy ai-chat --no-verify-jwt
//
// Required Supabase secrets:
//   GEMINI_API_KEY       — Google Gemini API key
//   (UPSTASH_REDIS_REST_URL / TOKEN — optional, for rate limiting)
//
// The function is deployed with --no-verify-jwt so anonymous callers
// can access it (rate limiting falls back to IP if no JWT present).

import { serve } from "https://deno.land/std@0.168.0/http/server.ts";
import { createClient } from "https://esm.sh/@upstash/redis@1.34.0";
import { Ratelimit } from "https://esm.sh/@upstash/ratelimit@2.0.0";

// ── CORS ──────────────────────────────────────────────────────
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
    'Access-Control-Allow-Headers': 'Content-Type, Authorization',
    'Access-Control-Max-Age': '86400',
  };
}

function json(data, status = 200, extraHeaders = {}) {
  return new Response(JSON.stringify(data), {
    status,
    headers: { 'Content-Type': 'application/json', ...extraHeaders },
  });
}

// ── Rate limiting (optional — fails open if Upstash not configured) ──
let ratelimit = null;
const UPSTASH_URL = Deno.env.get('UPSTASH_REDIS_REST_URL');
const UPSTASH_TOKEN = Deno.env.get('UPSTASH_REDIS_REST_TOKEN');

if (UPSTASH_URL && UPSTASH_TOKEN) {
  try {
    const redis = createClient({ url: UPSTASH_URL, token: UPSTASH_TOKEN });
    ratelimit = new Ratelimit({
      redis,
      limiter: Ratelimit.slidingWindow(10, '60 s'),
      analytics: true,
    });
    console.log('[ai-chat] Rate limiting enabled (Upstash)');
  } catch (e) {
    console.warn('[ai-chat] Upstash init failed, rate limiting disabled:', e.message);
  }
} else {
  console.log('[ai-chat] No Upstash credentials — rate limiting disabled');
}

// ── Gemini system instructions ────────────────────────────────
const CHAT_SYSTEM_INSTRUCTION = {
  parts: [{
    text: `You are Build Assistant, an expert construction cost advisor embedded in ARCONZA — a construction financial ledger app for Indian contractors and site builders.

You help with: Cost estimation and budget management in INR, Material selection and alternatives with local pricing, Construction best practices and ISI/BIS standards, Risk identification and mitigation, Phase-specific construction guidance, Subcontractor negotiation strategies.

IMPORTANT: The user's COMPLETE project data is provided in the first user turn. USE THIS DATA to answer precisely. Never guess or invent values.

Guidelines:
- Quote exact figures from the data (use the ₹ symbol, lakhs/crores where appropriate).
- Address the contractor directly as "you".
- Respond concisely unless the user asked for a list/breakdown.`
  }]
};

const OCR_SYSTEM_INSTRUCTION = {
  parts: [{
    text: `You are an OCR and data extraction assistant for Indian construction bills ("Kachha" bills, GST invoices).
Extract the details from the uploaded bill image.
Strictly return a JSON object (no markdown, no backticks, just raw JSON).
Schema:
{
  "vendor": "String (Name of the shop/hardware store, or 'Unknown Shop')",
  "date": "String (YYYY-MM-DD format if found, else empty string)",
  "totalAmount": "Number (The final total amount on the bill)",
  "items": [
    {
      "desc": "String (Item name/description)",
      "qty": "Number",
      "rate": "Number",
      "amount": "Number"
    }
  ]
}`
  }]
};

// ── Main handler ──────────────────────────────────────────────
serve(async (req) => {
  // Handle CORS preflight
  if (req.method === 'OPTIONS') {
    return new Response('ok', { headers: corsHeaders(req) });
  }

  if (req.method !== 'POST') {
    return json({ error: 'Method not allowed' }, 405, corsHeaders(req));
  }

  const _cors = corsHeaders(req);

  // ── Check GEMINI_API_KEY ──────────────────────────────────
  const geminiKey = Deno.env.get('GEMINI_API_KEY');
  if (!geminiKey) {
    console.error('[ai-chat] GEMINI_API_KEY not configured');
    return json({
      error: 'AI service not configured',
      message: 'GEMINI_API_KEY secret is not set. Run: supabase secrets set GEMINI_API_KEY=...'
    }, 503, _cors);
  }

  // ── Parse request body ────────────────────────────────────
  let body;
  try {
    body = await req.json();
  } catch (e) {
    return json({ error: 'Invalid JSON body' }, 400, _cors);
  }

  const { contents, generationConfig } = body;

  // ── Validate contents ─────────────────────────────────────
  if (!contents || !Array.isArray(contents)) {
    return json({
      error: 'Invalid request',
      message: 'Request body must include "contents" array'
    }, 400, _cors);
  }

  if (contents.length > 12) {
    return json({ error: 'Too many messages', message: 'Maximum 12 messages per request' }, 400, _cors);
  }

  for (const msg of contents) {
    const textLen = msg.parts?.reduce((sum, p) => sum + (p.text?.length || 0), 0) || 0;
    if (textLen > 100000) {
      return json({ error: 'Message too long', message: 'Individual message exceeds 100KB' }, 400, _cors);
    }
  }

  // Validate inline image sizes (Gemini ~4MB limit)
  for (const msg of contents) {
    const imgLen = msg.parts?.reduce((sum, p) => sum + (p.inlineData?.data?.length || 0), 0) || 0;
    if (imgLen > 4_000_000) {
      return json({ error: 'Image too large', message: 'Image must be under 3MB. Please compress and retry.' }, 413, _cors);
    }
  }

  // ── Rate limiting ─────────────────────────────────────────
  // Extract user identifier: JWT sub if present, else fall back to IP
  let userId = 'anonymous';
  try {
    const authHeader = req.headers.get('Authorization') || '';
    if (authHeader.startsWith('Bearer ')) {
      const token = authHeader.replace('Bearer ', '');
      const parts = token.split('.');
      if (parts.length === 3) {
        const payload = JSON.parse(atob(parts[1]));
        userId = payload.sub || 'anonymous';
      }
    }
  } catch (_) {}

  const clientIp = req.headers.get('x-forwarded-for')?.split(',')[0]?.trim() ||
                   req.headers.get('x-real-ip') || 'unknown';
  const rateLimitKey = userId !== 'anonymous' ? userId : clientIp;

  if (ratelimit) {
    try {
      const { success, reset } = await ratelimit.limit(rateLimitKey);
      if (!success) {
        return json({
          error: 'Rate limited',
          message: 'Too many AI requests. Please wait a moment.',
          retryAfter: Math.ceil((reset - Date.now()) / 1000)
        }, 429, _cors);
      }
    } catch (err) {
      console.warn('[ai-chat] Rate limit check failed:', err.message);
      // Continue without rate limiting if Redis is down (fail open)
    }
  }

  // ── Determine system instruction ──────────────────────────
  // Never trust client-sent systemInstruction — hardcode server-side
  let serverSystemInstruction = CHAT_SYSTEM_INSTRUCTION;
  const clientInstructionText = body.systemInstruction?.parts?.[0]?.text || '';
  const hasImage = contents.some(msg =>
    msg.parts?.some(part => part.inlineData)
  );

  if (hasImage || clientInstructionText.includes('OCR') || clientInstructionText.includes('construction bills')) {
    serverSystemInstruction = OCR_SYSTEM_INSTRUCTION;
  }

  // ── Call Gemini API ───────────────────────────────────────
  const geminiUrl = `https://generativelanguage.googleapis.com/v1beta/models/gemini-2.5-flash:generateContent?key=${geminiKey}`;

  const controller = new AbortController();
  const timeout = setTimeout(() => controller.abort(), 30000);

  try {
    const response = await fetch(geminiUrl, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        systemInstruction: serverSystemInstruction,
        contents,
        generationConfig: generationConfig || {
          temperature: 0.7,
          maxOutputTokens: 2048,
          topP: 0.9,
        }
      }),
      signal: controller.signal,
    });

    clearTimeout(timeout);

    const data = await response.json();

    if (!response.ok) {
      console.error('[Gemini API error]', JSON.stringify(data));
      return json({
        error: 'Gemini API error',
        message: data.error?.message || `Status ${response.status}`,
      }, response.status, _cors);
    }

    // Return Gemini response directly to client
    return json(data, 200, _cors);

  } catch (fetchErr) {
    clearTimeout(timeout);

    if (fetchErr.name === 'AbortError') {
      return json({
        error: 'AI service timeout',
        message: 'The AI service took too long to respond. Please try again.'
      }, 504, _cors);
    }

    console.error('[ai-chat] Fetch error:', fetchErr);
    return json({
      error: 'AI service error',
      message: fetchErr.message || 'Failed to reach AI service'
    }, 500, _cors);
  }
});
