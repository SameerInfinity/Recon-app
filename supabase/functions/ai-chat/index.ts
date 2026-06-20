// ═══════════════════════════════════════════
// RECON Edge Function: ai-chat
//
// Port of server.js /api/ai/chat (Express → Deno). Identical behavior:
//   • proxies Gemini gemini-2.5-flash generateContent
//   • hardcodes both CHAT and OCR system instructions server-side
//     (client-sent systemInstruction is ignored except as a *hint* for
//      which instruction to pick — never trusted verbatim)
//   • sliding-window rate limit: 10 req / 60 s per user (or IP fallback)
//   • input validation: contents array, max 12 messages, 100KB/msg
//
// Secrets (set via `supabase secrets set ...`):
//   GEMINI_API_KEY                — required
//   UPSTASH_REDIS_REST_URL        — optional (rate limiting fails open)
//   UPSTASH_REDIS_REST_TOKEN      — optional
//
// The user's JWT (if present) is used to personalize the rate-limit bucket;
// it is NOT required to call the function (matches server.js, which also
// accepts anonymous callers, falling back to IP).
// ═══════════════════════════════════════════

import { CORS_HEADERS, corsJson, handlePreflight, clientIp } from "../_shared/cors.ts";
import { rateLimitByUserOrIp } from "../_shared/ratelimit.ts";
import { userIdFromRequest } from "../_shared/auth.ts";

const GEMINI_MODEL = "gemini-2.5-flash";
const MAX_MESSAGES = 12;
const MAX_MESSAGE_BYTES = 100_000;
const RATE_LIMIT_WINDOW_S = 60;
const RATE_LIMIT_MAX = 10;

const CHAT_SYSTEM_INSTRUCTION = {
  parts: [{
    text: `You are Build Assistant, an expert construction cost advisor embedded in RECON — a construction financial ledger app for Indian contractors and site builders.

You help with: Cost estimation and budget management in INR, Material selection and alternatives with local pricing, Construction best practices and ISI/BIS standards, Risk identification and mitigation, Phase-specific construction guidance, Subcontractor negotiation strategies.

IMPORTANT: The user's COMPLETE project data is provided in the first user turn. USE THIS DATA to answer precisely. Never guess or invent values.

Guidelines:
- Quote exact figures from the data (use the ₹ symbol, lakhs/crores where appropriate).
- Address the contractor directly as "you".
- Respond concisely unless the user asked for a list/breakdown.`,
  }],
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
}`,
  }],
};

Deno.serve(async (req: Request) => {
  // CORS preflight
  const preflight = handlePreflight(req);
  if (preflight) return preflight;

  if (req.method !== "POST") {
    return corsJson({ error: "Method not allowed", message: "Use POST" }, { status: 405 });
  }

  // ── Gemini key check ──
  const geminiKey = Deno.env.get("GEMINI_API_KEY");
  if (!geminiKey) {
    return corsJson({
      error: "AI service not configured",
      message: "GEMINI_API_KEY is not set. Run: supabase secrets set GEMINI_API_KEY=...",
    }, { status: 503 });
  }

  // ── Rate limiting ──
  const userId = userIdFromRequest(req);
  const ip = clientIp(req);
  const rl = await rateLimitByUserOrIp(userId, ip, {
    url: Deno.env.get("UPSTASH_REDIS_REST_URL"),
    token: Deno.env.get("UPSTASH_REDIS_REST_TOKEN"),
  });

  if (!rl.success) {
    return corsJson({
      error: "Rate limited",
      message: "Too many AI requests. Please wait a moment.",
      retryAfter: Math.ceil((rl.reset - Date.now()) / 1000),
    }, {
      status: 429,
      headers: {
        "X-RateLimit-Limit": String(rl.limit),
        "X-RateLimit-Remaining": String(rl.remaining),
        "X-RateLimit-Reset": String(rl.reset),
      },
    });
  }

  // ── Parse + validate body ──
  let body: any;
  try {
    body = await req.json();
  } catch {
    return corsJson({ error: "Invalid request", message: "Body must be valid JSON" }, { status: 400 });
  }

  const { contents, generationConfig } = body;

  if (!contents || !Array.isArray(contents)) {
    return corsJson({
      error: "Invalid request",
      message: 'Request body must include "contents" array',
    }, { status: 400 });
  }

  if (contents.length > MAX_MESSAGES) {
    return corsJson({
      error: "Too many messages",
      message: `Maximum ${MAX_MESSAGES} messages per request`,
    }, { status: 400 });
  }

  for (const msg of contents) {
    const textLen = msg.parts?.reduce((sum: number, p: any) => sum + (p.text?.length || 0), 0) || 0;
    if (textLen > MAX_MESSAGE_BYTES) {
      return corsJson({
        error: "Message too long",
        message: "Individual message exceeds 100KB",
      }, { status: 400 });
    }
  }

  // ── Pick the system instruction ──
  // Client never controls the instruction text — only sends a *hint*
  // (presence of an image, or "OCR"/"construction bills" in its instruction)
  // that we use to choose between the chat and OCR personas.
  let serverSystemInstruction: any = CHAT_SYSTEM_INSTRUCTION;
  const clientInstructionText = body.systemInstruction?.parts?.[0]?.text || "";
  const hasImage = contents.some((msg: any) =>
    msg.parts?.some((part: any) => part.inlineData)
  );
  if (hasImage || clientInstructionText.includes("OCR") || clientInstructionText.includes("construction bills")) {
    serverSystemInstruction = OCR_SYSTEM_INSTRUCTION;
  }

  // ── Call Gemini ──
  try {
    const geminiUrl = `https://generativelanguage.googleapis.com/v1beta/models/${GEMINI_MODEL}:generateContent?key=${geminiKey}`;

    const response = await fetch(geminiUrl, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        systemInstruction: serverSystemInstruction,
        contents,
        generationConfig: generationConfig || {
          temperature: 0.7,
          maxOutputTokens: 2048,
          topP: 0.9,
        },
      }),
    });

    const data = await response.json();

    if (!response.ok) {
      return corsJson({
        error: "Gemini API error",
        message: data?.error?.message || `Status ${response.status}`,
      }, { status: response.status });
    }

    return corsJson(data, {
      headers: {
        "X-RateLimit-Limit": String(rl.limit),
        "X-RateLimit-Remaining": String(rl.remaining),
        "X-RateLimit-Reset": String(rl.reset),
      },
    });
  } catch (err) {
    console.error("[ai-chat] Gemini proxy error:", err);
    return corsJson({
      error: "AI proxy error",
      message: "Failed to reach Gemini API.",
    }, { status: 500 });
  }
});
