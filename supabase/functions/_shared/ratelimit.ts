// ═══════════════════════════════════════════
// Upstash sliding-window rate limiter for RECON Edge Functions.
//
// Mirrors the server.js behavior exactly: 10 requests per 60 seconds per
// identifier (user id, or IP as fallback). Uses the Upstash REST HTTP API
// directly via fetch — no SDK dependency.
//
// Upstash exposes a Lua-based sliding-window command over REST. We send
// an EVAL with the classic ZSET + counter algorithm that @upstash/ratelimit
// uses internally, returning [remaining, reset_ms]. This keeps behavior
// identical to the Node server.
// ═══════════════════════════════════════════

export interface RateLimitResult {
  success: boolean;
  limit: number;
  remaining: number;
  reset: number; // epoch ms
}

export interface RateLimiterConfig {
  url?: string;     // UPSTASH_REDIS_REST_URL
  token?: string;   // UPSTASH_REDIS_REST_TOKEN
}

const WINDOW = 60;          // seconds
const MAX_REQUESTS = 10;

/**
 * Sliding-window rate limit. Returns { success: false } if over budget.
 * If Upstash is not configured (or errors), it FAILS OPEN — the call is
 * allowed — exactly like server.js does.
 */
export async function rateLimit(
  identifier: string,
  cfg: RateLimiterConfig,
): Promise<RateLimitResult> {
  if (!cfg.url || !cfg.token) {
    return { success: true, limit: MAX_REQUESTS, remaining: MAX_REQUESTS, reset: Date.now() + WINDOW * 1000 };
  }

  const key = `recon:ratelimit:${identifier}`;
  const now = Date.now();
  const clearBefore = now - WINDOW * 1000;

  // Classic sliding-window Lua: drop old entries, count current window,
  // add this request if under limit, return [count, oldestTimestamp].
  const lua = `
    redis.call('ZREMRANGEBYSCORE', KEYS[1], 0, ARGV[1])
    local count = redis.call('ZCARD', KEYS[1])
    local allowed = count < tonumber(ARGV[2])
    if allowed then
      redis.call('ZADD', KEYS[1], ARGV[3], ARGV[3])
    end
    redis.call('EXPIRE', KEYS[1], ARGV[4])
    local first = redis.call('ZRANGE', KEYS[1], 0, 0)
    local oldest = #first > 0 and first[1] or ARGV[3]
    return { allowed and 1 or 0, count, oldest }
  `;

  const body = [lua, 1, key, String(clearBefore), String(MAX_REQUESTS), String(now), String(WINDOW)];

  try {
    const res = await fetch(`${cfg.url}/eval`, {
      method: "POST",
      headers: {
        "Authorization": `Bearer ${cfg.token}`,
        "Content-Type": "application/json",
      },
      body: JSON.stringify(body),
    });

    if (!res.ok) {
      // Fail open on any Upstash error, matching server.js.
      return { success: true, limit: MAX_REQUESTS, remaining: MAX_REQUESTS, reset: Date.now() + WINDOW * 1000 };
    }

    const data = await res.json();
    // Upstash REST returns { result: [...] } for EVAL.
    const result = Array.isArray(data?.result) ? data.result : [];
    const allowed = Number(result[0] ?? 1) === 1;
    const count = Number(result[1] ?? 0);
    const oldest = Number(result[2] ?? now);

    return {
      success: allowed,
      limit: MAX_REQUESTS,
      remaining: Math.max(0, MAX_REQUESTS - count - (allowed ? 1 : 0)),
      reset: oldest + WINDOW * 1000,
    };
  } catch {
    return { success: true, limit: MAX_REQUESTS, remaining: MAX_REQUESTS, reset: Date.now() + WINDOW * 1000 };
  }
}

/** Convenience: rate-limit by user id (from a verified JWT) or fall back to IP. */
export async function rateLimitByUserOrIp(
  userId: string | null,
  ip: string,
  cfg: RateLimiterConfig,
): Promise<RateLimitResult> {
  return rateLimit(userId || ip, cfg);
}
