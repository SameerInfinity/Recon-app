/* ═══════════════════════════════════════════
   RECON — Express Backend Server
   Serves static files, proxies Gemini AI,
   rate-limits via Upstash Redis
   ═══════════════════════════════════════════ */

require('dotenv').config();
const express = require('express');
const path = require('path');
const cors = require('cors');

const app = express();
const PORT = process.env.PORT || 8080;

// ── Middleware ──────────────────────────────
app.use(cors());
app.use(express.json({ limit: '1mb' }));

// Serve static frontend
app.use(express.static(path.join(__dirname, 'public')));

// ── Expose safe config to frontend ─────────
app.get('/api/config', (req, res) => {
  res.json({
    supabaseUrl: process.env.SUPABASE_URL || '',
    supabaseAnonKey: process.env.SUPABASE_ANON_KEY || '',
  });
});

// ── Health Check ───────────────────────────
app.get('/api/health', (req, res) => {
  res.json({
    status: 'ok',
    timestamp: new Date().toISOString(),
    services: {
      supabase: !!process.env.SUPABASE_URL,
      upstash: !!process.env.UPSTASH_REDIS_REST_URL,
      gemini: !!process.env.GEMINI_API_KEY,
    }
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

  // Rate limiting (user identified by auth token or IP)
  const userId = req.headers['x-user-id'] || req.ip;
  if (ratelimit) {
    try {
      const { success, limit, remaining, reset } = await ratelimit.limit(userId);
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

  // Proxy to Gemini
  const { systemInstruction, contents, generationConfig } = req.body;

  if (!contents || !Array.isArray(contents)) {
    return res.status(400).json({
      error: 'Invalid request',
      message: 'Request body must include "contents" array'
    });
  }

  try {
    const geminiUrl = `https://generativelanguage.googleapis.com/v1beta/models/gemini-2.5-flash:generateContent?key=${geminiKey}`;

    const response = await fetch(geminiUrl, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        systemInstruction,
        contents,
        generationConfig: generationConfig || {
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

  app.listen(PORT, () => {
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
