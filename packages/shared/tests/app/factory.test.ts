import { describe, it, expect, beforeAll, vi } from 'vitest';
import { Hono } from 'hono';

// Mock prom-client to avoid side effects
vi.mock('prom-client', () => {
  const observe = vi.fn();
  const inc = vi.fn();
  return {
    default: {
      Registry: class {
        metrics() { return 'mock_metrics'; }
        get contentType() { return 'text/plain'; }
        registerMetric() {}
      },
      collectDefaultMetrics: vi.fn(),
      Histogram: class {
        observe = observe;
      },
      Counter: class {
        inc = inc;
      },
    },
  };
});

beforeAll(() => {
  process.env.JWT_SECRET = 'test-secret-key-must-be-at-least-32-chars-long!!';
  process.env.ENCRYPTION_KEY = '0123456789abcdef0123456789abcdef0123456789abcdef0123456789abcdef';
});

describe('createApp', () => {
  it('creates a Hono app with health check endpoint', async () => {
    const { createApp } = await import('../../src/app/factory.js');
    const app = createApp({
      serviceName: 'test-service',
      port: 3000,
      eventBus: { connect: () => new Response('ok'), connectionCount: 0 },
      apiSpec: { openapi: '3.0.0', info: { title: 'Test', version: '1.0.0' }, paths: {} },
      routes: [],
    });

    const res = await app.request('/health');
    expect(res.status).toBe(200);
    const json = await res.json();
    expect(json.status).toBe('ok');
    expect(json.service).toBe('test-service');
    expect(json.version).toBe('4.0.0');
  });

  it('mounts provided routes', async () => {
    const { createApp } = await import('../../src/app/factory.js');
    const testRouter = new Hono();
    testRouter.get('/items', (c) => c.json({ items: [1, 2, 3] }));

    const app = createApp({
      serviceName: 'test-service',
      port: 3000,
      eventBus: { connect: () => new Response('ok'), connectionCount: 0 },
      apiSpec: { openapi: '3.0.0', info: { title: 'Test', version: '1.0.0' }, paths: {} },
      routes: [['/api/test', testRouter]],
    });

    const res = await app.request('/api/test/items');
    expect(res.status).toBe(200);
    const json = await res.json();
    expect(json.items).toEqual([1, 2, 3]);
  });

  it('exposes /api/events/status with connection count', async () => {
    const { createApp } = await import('../../src/app/factory.js');
    const app = createApp({
      serviceName: 'test-service',
      port: 3000,
      eventBus: { connect: () => new Response('ok'), connectionCount: 5 },
      apiSpec: { openapi: '3.0.0', info: { title: 'Test', version: '1.0.0' }, paths: {} },
      routes: [],
    });

    const res = await app.request('/api/events/status');
    expect(res.status).toBe(200);
    const json = await res.json();
    expect(json.connections).toBe(5);
  });

  it('exposes /metrics endpoint', async () => {
    const { createApp } = await import('../../src/app/factory.js');
    const app = createApp({
      serviceName: 'test-service',
      port: 3000,
      eventBus: { connect: () => new Response('ok'), connectionCount: 0 },
      apiSpec: { openapi: '3.0.0', info: { title: 'Test', version: '1.0.0' }, paths: {} },
      routes: [],
    });

    const res = await app.request('/metrics');
    expect(res.status).toBe(200);
  });

  it('handles ZodError by returning 400', async () => {
    const { createApp } = await import('../../src/app/factory.js');
    const { z } = await import('zod');

    const zodRouter = new Hono();
    zodRouter.post('/validate', async (c) => {
      const body = await c.req.json();
      z.object({ name: z.string().min(1) }).parse(body);
      return c.json({ ok: true });
    });

    const app = createApp({
      serviceName: 'test-service',
      port: 3000,
      eventBus: { connect: () => new Response('ok'), connectionCount: 0 },
      apiSpec: { openapi: '3.0.0', info: { title: 'Test', version: '1.0.0' }, paths: {} },
      routes: [['/api', zodRouter]],
    });

    const res = await app.request('/api/validate', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({}),
    });
    expect(res.status).toBe(400);
    const json = await res.json();
    expect(json.error).toBe('Validation failed');
  });

  it('handles non-Zod errors with 500', async () => {
    const { createApp } = await import('../../src/app/factory.js');

    const errorRouter = new Hono();
    errorRouter.get('/crash', () => {
      throw new Error('unexpected crash');
    });

    const app = createApp({
      serviceName: 'test-service',
      port: 3000,
      eventBus: { connect: () => new Response('ok'), connectionCount: 0 },
      apiSpec: { openapi: '3.0.0', info: { title: 'Test', version: '1.0.0' }, paths: {} },
      routes: [['/api', errorRouter]],
    });

    const res = await app.request('/api/crash');
    expect(res.status).toBe(500);
    const json = await res.json();
    expect(json.error).toBe('Internal server error');
  });

  it('uses custom CORS origins from env', async () => {
    process.env.CORS_ORIGINS = 'https://myapp.com,https://other.com';
    // Re-import to pick up env change (factory reads CORS_ORIGINS at call time)
    const { createApp } = await import('../../src/app/factory.js');
    const app = createApp({
      serviceName: 'test-service',
      port: 3000,
      eventBus: { connect: () => new Response('ok'), connectionCount: 0 },
      apiSpec: { openapi: '3.0.0', info: { title: 'Test', version: '1.0.0' }, paths: {} },
      routes: [],
    });

    // A preflight request from allowed origin should work
    const res = await app.request('/health', {
      method: 'OPTIONS',
      headers: { 'Origin': 'https://myapp.com', 'Access-Control-Request-Method': 'GET' },
    });
    // CORS middleware should return appropriate headers
    expect(res.status).toBeLessThan(500);
    delete process.env.CORS_ORIGINS;
  });

  it('applies extra rate limits', async () => {
    const { createApp } = await import('../../src/app/factory.js');
    const app = createApp({
      serviceName: 'test-service',
      port: 3000,
      eventBus: { connect: () => new Response('ok'), connectionCount: 0 },
      apiSpec: { openapi: '3.0.0', info: { title: 'Test', version: '1.0.0' }, paths: {} },
      routes: [],
      extraRateLimits: [{ path: '/api/auth/*', windowMs: 60_000, max: 5 }],
    });

    // App should be created without errors
    expect(app).toBeInstanceOf(Hono);
  });
});
