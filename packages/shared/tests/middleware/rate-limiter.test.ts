import { describe, it, expect } from 'vitest';
import { Hono } from 'hono';
import { rateLimiter } from '../../src/middleware/rate-limiter.js';

describe('rateLimiter', () => {
  it('should allow requests under the limit', async () => {
    const app = new Hono();
    app.use('/*', rateLimiter({ windowMs: 60_000, max: 5 }));
    app.get('/test', (c) => c.json({ ok: true }));

    const res = await app.request('/test', {
      headers: { 'X-Forwarded-For': '1.2.3.4' },
    });
    expect(res.status).toBe(200);
    expect(res.headers.get('X-RateLimit-Limit')).toBe('5');
    expect(res.headers.get('X-RateLimit-Remaining')).toBe('4');
  });

  it('should block requests over the limit', async () => {
    const app = new Hono();
    app.use('/*', rateLimiter({ windowMs: 60_000, max: 2 }));
    app.get('/test', (c) => c.json({ ok: true }));

    const headers = { 'X-Forwarded-For': '10.0.0.1' };

    // First 2 should pass
    const r1 = await app.request('/test', { headers });
    expect(r1.status).toBe(200);
    const r2 = await app.request('/test', { headers });
    expect(r2.status).toBe(200);

    // Third should be blocked
    const r3 = await app.request('/test', { headers });
    expect(r3.status).toBe(429);
    const body = await r3.json();
    expect(body.error).toBe('Too many requests');
    expect(r3.headers.get('Retry-After')).toBeTruthy();
  });

  it('should track separate keys independently', async () => {
    const app = new Hono();
    app.use('/*', rateLimiter({ windowMs: 60_000, max: 1 }));
    app.get('/test', (c) => c.json({ ok: true }));

    const r1 = await app.request('/test', {
      headers: { 'X-Forwarded-For': '192.168.1.1' },
    });
    expect(r1.status).toBe(200);

    // Different IP should still be allowed
    const r2 = await app.request('/test', {
      headers: { 'X-Forwarded-For': '192.168.1.2' },
    });
    expect(r2.status).toBe(200);

    // Same IP should be blocked
    const r3 = await app.request('/test', {
      headers: { 'X-Forwarded-For': '192.168.1.1' },
    });
    expect(r3.status).toBe(429);
  });

  it('should set proper rate limit headers', async () => {
    const app = new Hono();
    app.use('/*', rateLimiter({ windowMs: 60_000, max: 10 }));
    app.get('/test', (c) => c.json({ ok: true }));

    const res = await app.request('/test', {
      headers: { 'X-Forwarded-For': '172.16.0.1' },
    });
    expect(res.headers.get('X-RateLimit-Limit')).toBe('10');
    expect(res.headers.get('X-RateLimit-Remaining')).toBe('9');
    expect(res.headers.get('X-RateLimit-Reset')).toBeTruthy();
  });
});
