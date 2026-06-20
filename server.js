/* ═══════════════════════════════════════════
   RECON — Express Backend Server
   Serves static files, proxies Gemini AI,
   rate-limits via Upstash Redis
   ═══════════════════════════════════════════ */

require('dotenv').config();
const express = require('express');
const path = require('path');
const cors = require('cors');
const helmet = require('helmet');

const app = express();
const PORT = process.env.PORT || 8080;
const IS_PRODUCTION = process.env.NODE_ENV === 'production';

// SEC-02: in production we sit behind a reverse proxy (Nginx/Cloudflare/Render).
// Trust the first proxy hop so req.ip reflects the real client for rate-limiting.
if (IS_PRODUCTION) app.set('trust proxy', 1);

// ── Middleware ──────────────────────────────

// Security headers (X-Content-Type-Options, X-Frame-Options,
// Strict-Transport-Security, Referrer-Policy, etc.)
app.use(helmet({
  contentSecurityPolicy: {
    directives: {
      defaultSrc: ["'self'"],
      scriptSrc: ["'self'", "'unsafe-inline'", "https://cdn.jsdelivr.net", "https://cdnjs.cloudflare.com"],
      styleSrc: ["'self'", "'unsafe-inline'", "https://fonts.googleapis.com"],
      scriptSrcAttr: ["'unsafe-inline'"],
      styleSrcAttr: ["'unsafe-inline'"],
      fontSrc: ["'self'", "https://fonts.gstatic.com"],
      connectSrc: [
        "'self'", 
        "https://*.supabase.co", 
        "https://generativelanguage.googleapis.com",
        "ws:",
        "wss:"
      ],
      imgSrc: ["'self'", "data:", "blob:", "https://*.supabase.co", "https://lh3.googleusercontent.com", "https://*.googleusercontent.com"],
      frameSrc: ["'none'"],
      upgradeInsecureRequests: IS_PRODUCTION ? [] : null,
    },
  },
  crossOriginEmbedderPolicy: false,  // needed for CDN scripts
}));

// CORS — restrict to known origins
const ALLOWED_ORIGINS = [
  'http://localhost:8080',
  'http://localhost:3000',
  'http://localhost',       // Capacitor Android (http scheme)
  'https://localhost',      // Capacitor Android (https scheme — default for Capacitor 5+)
  'capacitor://localhost',  // iOS Capacitor local assets origin
  'ionic://localhost',      // Ionic iOS local assets origin
];
if (process.env.PRODUCTION_URL) {
  // Accept a comma-separated list so apex + www + CDN domains can all be allowed.
  process.env.PRODUCTION_URL.split(',').map(s => s.trim()).filter(Boolean).forEach(o => ALLOWED_ORIGINS.push(o));
}

app.use(cors({
  origin: (origin, callback) => {
    // Allow requests with no origin (mobile apps, curl, server-to-server)
    if (!origin || 
        ALLOWED_ORIGINS.includes(origin) || 
        (!IS_PRODUCTION && (origin.startsWith('http://10.') || origin.startsWith('http://192.168.')))) {
      callback(null, true);
    } else {
      callback(new Error('Not allowed by CORS'));
    }
  },
  credentials: true,
  methods: ['GET', 'POST'],
}));

// HTTPS redirect in production
if (IS_PRODUCTION) {
  app.use((req, res, next) => {
    if (req.headers['x-forwarded-proto'] !== 'https') {
      return res.redirect(301, `https://${req.hostname}${req.url}`);
    }
    next();
  });
}

app.use(express.json({ limit: '1mb' }));

// Serve static frontend — set aggressive no-cache for code assets
// Using setHeaders inside express.static ensures headers are applied before
// the file is sent, unlike separate app.get() routes that run after static.
app.use(express.static(path.join(__dirname, 'public'), {
  setHeaders: (res, filePath) => {
    if (filePath.endsWith('sw.js') || filePath.endsWith('.js') || filePath.endsWith('.css') || filePath.endsWith('.html')) {
      res.setHeader('Cache-Control', 'no-cache, no-store, must-revalidate');
      res.setHeader('Pragma', 'no-cache');
      res.setHeader('Expires', '0');
    }
  }
}));

// ── Expose safe config to frontend ─────────
app.get('/api/config', (req, res) => {
  res.json({
    supabaseUrl: process.env.SUPABASE_URL || '',
    supabaseAnonKey: process.env.SUPABASE_ANON_KEY || '',
    googleWebClientId: process.env.GOOGLE_WEB_CLIENT_ID || '',
  });
});

// ── Health Check ───────────────────────────
app.get('/api/health', (req, res) => {
  res.json({
    status: 'ok',
    timestamp: new Date().toISOString()
  });
});

// ── Upstash Rate Limiter ───────────────────
let ratelimit = null;

async function initRateLimiter() {
  if (!process.env.UPSTASH_REDIS_REST_URL || !process.env.UPSTASH_REDIS_REST_TOKEN) {
    console.warn('[Upstash] No credentials — rate limiting disabled');
    return;
  }
  try {
    const { Redis } = require('@upstash/redis');
    const { Ratelimit } = require('@upstash/ratelimit');

    const redis = new Redis({
      url: process.env.UPSTASH_REDIS_REST_URL,
      token: process.env.UPSTASH_REDIS_REST_TOKEN,
    });

    ratelimit = new Ratelimit({
      redis,
      limiter: Ratelimit.slidingWindow(10, '60 s'), // 10 requests per minute
      analytics: true,
    });

    console.log('[Upstash] Rate limiter initialized (10 req/min)');
  } catch (err) {
    console.warn('[Upstash] Failed to initialize:', err.message);
  }
}

// ── AI Chat Proxy ──────────────────────────
app.post('/api/ai/chat', async (req, res) => {
  // Validate Gemini key exists
  const geminiKey = process.env.GEMINI_API_KEY;
  if (!geminiKey) {
    return res.status(503).json({
      error: 'AI service not configured',
      message: 'GEMINI_API_KEY is not set in .env file'
    });
  }

  // Rate limiting (user identified by verified JWT or IP — never trust client headers)
  let rateLimitId = req.ip;
  const authHeader = req.headers['authorization'];
  if (authHeader?.startsWith('Bearer ') && process.env.SUPABASE_URL) {
    try {
      const verifyRes = await fetch(`${process.env.SUPABASE_URL}/auth/v1/user`, {
        headers: {
          'Authorization': authHeader,
          'apikey': process.env.SUPABASE_ANON_KEY,
        }
      });
      if (verifyRes.ok) {
        const user = await verifyRes.json();
        if (user?.id) rateLimitId = user.id;
      }
    } catch (e) { /* fall back to IP */ }
  }

  if (ratelimit) {
    try {
      const { success, limit, remaining, reset } = await ratelimit.limit(rateLimitId);
      res.set('X-RateLimit-Limit', limit);
      res.set('X-RateLimit-Remaining', remaining);
      res.set('X-RateLimit-Reset', reset);

      if (!success) {
        return res.status(429).json({
          error: 'Rate limited',
          message: 'Too many AI requests. Please wait a moment.',
          retryAfter: Math.ceil((reset - Date.now()) / 1000)
        });
      }
    } catch (err) {
      console.warn('[Upstash] Rate limit check failed:', err.message);
      // Continue without rate limiting if Redis is down
    }
  }

  // Server-side input validation
  const { contents, generationConfig } = req.body;
  // Never trust client-sent systemInstruction — hardcode it server-side

  if (!contents || !Array.isArray(contents)) {
    return res.status(400).json({
      error: 'Invalid request',
      message: 'Request body must include "contents" array'
    });
  }

  // Validate message count and size
  if (contents.length > 12) {
    return res.status(400).json({ error: 'Too many messages', message: 'Maximum 12 messages per request' });
  }
  for (const msg of contents) {
    const textLen = msg.parts?.reduce((sum, p) => sum + (p.text?.length || 0), 0) || 0;
    if (textLen > 100000) {
      return res.status(400).json({ error: 'Message too long', message: 'Individual message exceeds 100KB' });
    }
  }

  try {
    const geminiUrl = `https://generativelanguage.googleapis.com/v1beta/models/gemini-2.5-flash:generateContent?key=${geminiKey}`;

    const CHAT_SYSTEM_INSTRUCTION = {
      parts: [{
        text: `You are Build Assistant, an expert construction cost advisor embedded in RECON — a construction financial ledger app for Indian contractors and site builders.

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

    // Determine the system instruction to use
    let serverSystemInstruction = CHAT_SYSTEM_INSTRUCTION;
    const clientInstructionText = req.body.systemInstruction?.parts?.[0]?.text || '';
    const hasImage = contents.some(msg => 
      msg.parts?.some(part => part.inlineData)
    );

    if (hasImage || clientInstructionText.includes('OCR') || clientInstructionText.includes('construction bills')) {
      serverSystemInstruction = OCR_SYSTEM_INSTRUCTION;
    }

    const response = await fetch(geminiUrl, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        systemInstruction: serverSystemInstruction,
        contents,
        generationConfig: {
          temperature: 0.7,
          maxOutputTokens: 2048,
          topP: 0.9,
        }
      })
    });

    const data = await response.json();

    if (!response.ok) {
      return res.status(response.status).json({
        error: 'Gemini API error',
        message: data.error?.message || `Status ${response.status}`,
      });
    }

    return res.json(data);

  } catch (err) {
    console.error('[Gemini] Proxy error:', err.message);
    return res.status(500).json({
      error: 'AI proxy error',
      message: 'Failed to reach Gemini API. Check server logs.'
    });
  }
});

// ── Delete User Account (server-side, needs service key) ──
app.post('/api/user/delete', async (req, res) => {
  // GAP-07: apply the same Upstash rate limiter to this destructive endpoint.
  if (ratelimit) {
    try {
      const { success, reset } = await ratelimit.limit(`delete:${req.ip}`);
      if (!success) {
        return res.status(429).json({
          error: 'Rate limited',
          message: 'Too many delete attempts. Please wait a moment.',
          retryAfter: Math.ceil((reset - Date.now()) / 1000)
        });
      }
    } catch (e) { /* fail open if redis is down */ }
  }

  const authHeader = req.headers['authorization'];
  if (!authHeader?.startsWith('Bearer ')) {
    return res.status(401).json({ error: 'Unauthorized', message: 'Missing auth token' });
  }

  const userToken = authHeader.replace('Bearer ', '');

  const serviceKey = process.env.SUPABASE_SERVICE_KEY;
  const supabaseUrl = process.env.SUPABASE_URL;
  if (!serviceKey || !supabaseUrl) {
    return res.status(503).json({ error: 'Not configured', message: 'Supabase service key not set' });
  }

  try {
    // 1. Verify the user's own JWT to get their user_id (don't trust client-sent IDs)
    const verifyRes = await fetch(`${supabaseUrl}/auth/v1/user`, {
      headers: {
        'Authorization': `Bearer ${userToken}`,
        'apikey': process.env.SUPABASE_ANON_KEY,
      }
    });
    if (!verifyRes.ok) {
      return res.status(401).json({ error: 'Invalid token', message: 'Could not verify user identity' });
    }
    const userData = await verifyRes.json();
    const userId = userData.id;
    if (!userId) return res.status(401).json({ error: 'No user ID in token' });

    // 2. Delete the user via service-role (admin) API — cascades to all tables
    const deleteRes = await fetch(`${supabaseUrl}/auth/v1/admin/users/${userId}`, {
      method: 'DELETE',
      headers: {
        'Authorization': `Bearer ${serviceKey}`,
        'apikey': serviceKey,
      }
    });

    if (!deleteRes.ok) {
      const errBody = await deleteRes.json().catch(() => ({}));
      return res.status(deleteRes.status).json({
        error: 'Delete failed',
        message: errBody.message || `Supabase returned ${deleteRes.status}`
      });
    }

    console.log(`[Auth] Deleted user ${userId}`);
    return res.json({ success: true, message: 'Account deleted' });

  } catch (err) {
    console.error('[Delete User] Error:', err.message);
    return res.status(500).json({
      error: 'Server error',
      message: IS_PRODUCTION ? 'An internal error occurred' : err.message
    });
  }
});

// ── SPA Fallback ───────────────────────────
app.get('*', (req, res) => {
  // For any non-API, non-static route, serve index.html
  if (!req.path.startsWith('/api/')) {
    res.sendFile(path.join(__dirname, 'public', 'index.html'));
  }
});

// ── Start ──────────────────────────────────
async function start() {
  await initRateLimiter();

  // Cloud hosts (Render, Railway, Fly.io) require binding to 0.0.0.0
  // so their external proxy can forward traffic to the app.
  // We still trust the proxy (set above) so req.ip reflects the real client.
  const HOST = '0.0.0.0';
  app.listen(PORT, HOST, () => {
    console.log('');
    console.log('  ╔══════════════════════════════════════╗');
    console.log('  ║   RECON — Server Running     ║');
    console.log(`  ║   http://localhost:${PORT}              ║`);
    console.log('  ╠══════════════════════════════════════╣');
    console.log(`  ║   Supabase:  ${process.env.SUPABASE_URL ? '✓ Connected' : '✗ Not configured'}        ║`);
    console.log(`  ║   Upstash:   ${ratelimit ? '✓ Rate limiting ON' : '✗ Not configured'}   ║`);
    console.log(`  ║   Gemini AI: ${process.env.GEMINI_API_KEY ? '✓ Key loaded' : '✗ Not configured'}         ║`);
    console.log('  ╚══════════════════════════════════════╝');
    console.log('');
  });
}

start();

