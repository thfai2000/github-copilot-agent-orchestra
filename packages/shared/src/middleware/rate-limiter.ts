import type { Context, Next } from 'hono';

interface RateLimitEntry {
  count: number;
  resetAt: number;
}

interface RateLimitOptions {
  windowMs?: number;
  max?: number;
  keyGenerator?: (c: Context) => string;
}

/**
 * In-memory rate limiter middleware for Hono.
 * For production with multiple replicas, replace with Redis-backed limiter.
 */
export function rateLimiter(options: RateLimitOptions = {}) {
  const windowMs = options.windowMs ?? 60_000; // 1 minute default
  const max = options.max ?? 100; // 100 requests per window
  const keyGenerator =
    options.keyGenerator ??
    ((c: Context) => {
      // Use X-Forwarded-For in production (behind ingress), fallback to peer addr
      const forwarded = c.req.header('x-forwarded-for');
      return forwarded ? forwarded.split(',')[0].trim() : 'unknown';
    });

  const store = new Map<string, RateLimitEntry>();

  // Periodic cleanup to prevent memory leak
  setInterval(() => {
    const now = Date.now();
    for (const [key, entry] of store) {
      if (entry.resetAt <= now) {
        store.delete(key);
      }
    }
  }, windowMs).unref();

  return async (c: Context, next: Next) => {
    const key = keyGenerator(c);
    const now = Date.now();
    let entry = store.get(key);

    if (!entry || entry.resetAt <= now) {
      entry = { count: 0, resetAt: now + windowMs };
      store.set(key, entry);
    }

    entry.count++;

    // Set rate limit headers
    const remaining = Math.max(0, max - entry.count);
    c.header('X-RateLimit-Limit', String(max));
    c.header('X-RateLimit-Remaining', String(remaining));
    c.header('X-RateLimit-Reset', String(Math.ceil(entry.resetAt / 1000)));

    if (entry.count > max) {
      c.header('Retry-After', String(Math.ceil((entry.resetAt - now) / 1000)));
      return c.json({ error: 'Too many requests' }, 429);
    }

    await next();
  };
}
