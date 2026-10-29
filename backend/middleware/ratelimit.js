import { redis } from "../config/redis.js";

// Simple "N requests per window" limiter, shared across restarts through Upstash Redis.
// If Redis can't be reached it falls back to counting in this server's memory, so a Redis
// hiccup never blocks real customers (it fails open) and never leaves the site unprotected either.
//
//   rateLimit({ name: "login", max: 10, windowSec: 900, key: (req) => `${req.ip}:${req.body?.email}` })
//   (add memoryOnly: true for limits that fire on every page view)
//
// Over the limit -> HTTP 429 with a Retry-After header and a friendly message.

const memory = new Map(); // key -> { n, resetAt }

function bumpMemory(key, windowSec) {
  const now = Date.now();
  let e = memory.get(key);
  if (!e || e.resetAt <= now) {
    e = { n: 0, resetAt: now + windowSec * 1000 };
    memory.set(key, e);
  }
  e.n += 1;
  if (memory.size > 5000) {
    for (const [k, v] of memory) if (v.resetAt <= now) memory.delete(k);
  }
  return { n: e.n, retryAfter: Math.max(1, Math.ceil((e.resetAt - now) / 1000)) };
}

async function bump(key, windowSec, max, memoryOnly) {
  if (memoryOnly) return bumpMemory(key, windowSec);
  try {
    const n = await redis.incr(key);
    if (n === 1) await redis.expire(key, windowSec);
    // only ask for the remaining time when we are about to say "no" (keeps Redis calls to a minimum)
    const ttl = n > max ? await redis.ttl(key) : windowSec;
    return { n, retryAfter: ttl > 0 ? ttl : windowSec };
  } catch {
    return bumpMemory(key, windowSec);
  }
}

// memoryOnly: count in this server's memory instead of Redis. Use it for high-traffic limits so the
// free Redis plan's daily command allowance isn't used up by ordinary page views.
export function rateLimit({ name, max, windowSec, key, message, memoryOnly = false }) {
  return async function limiter(req, res, next) {
    try {
      const who = String((key ? key(req) : req.ip) || "unknown").toLowerCase().slice(0, 200);
      const { n, retryAfter } = await bump(`rl:${name}:${who}`, windowSec, max, memoryOnly);
      if (n > max) {
        const mins = Math.ceil(retryAfter / 60);
        res.set("Retry-After", String(retryAfter));
        return res.status(429).json({
          message:
            message ||
            `Too many attempts. Please try again in ${mins <= 1 ? "a minute" : `${mins} minutes`}.`,
        });
      }
    } catch (err) {
      console.error("Rate limiter error (letting the request through):", err.message);
    }
    next();
  };
}

// Tests only: forget every counter.
export function _resetRateLimits() {
  memory.clear();
}