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

// ── Delete User Account (server-side, needs service key) ──
app.post('/api/user/delete', async (req, res) => {
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
    return res.status(500).json({ error: 'Server error', message: err.message });
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
