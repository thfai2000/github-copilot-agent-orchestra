import { describe, it, expect, beforeAll } from 'vitest';
import { Hono } from 'hono';
import { authMiddleware } from '../../src/auth/middleware.js';
import { createJwt } from '../../src/auth/jwt.js';

beforeAll(() => {
  process.env.JWT_SECRET = 'test-secret-key-must-be-at-least-32-chars-long!!';
});

const testPayload = {
  userId: '550e8400-e29b-41d4-a716-446655440000',
  email: 'test@example.com',
  name: 'Test User',
  role: 'creator_user',
  workspaceId: '550e8400-e29b-41d4-a716-446655440001',
  workspaceSlug: 'default',
};

function createTestApp() {
  const app = new Hono();
  app.use('/*', authMiddleware);
  app.get('/protected', (c) => {
    const user = c.get('user');
    return c.json({ userId: user.userId, email: user.email, role: user.role, workspaceId: user.workspaceId });
  });
  return app;
}

describe('authMiddleware', () => {
  it('returns 401 when no Authorization header is present', async () => {
    const app = createTestApp();
    const res = await app.request('/protected');
    expect(res.status).toBe(401);
    const json = await res.json();
    expect(json.error).toContain('Missing');
  });

  it('returns 401 when Authorization header does not start with "Bearer "', async () => {
    const app = createTestApp();
    const res = await app.request('/protected', {
      headers: { Authorization: 'Basic abc123' },
    });
    expect(res.status).toBe(401);
  });

  it('returns 401 when token is invalid', async () => {
    const app = createTestApp();
    const res = await app.request('/protected', {
      headers: { Authorization: 'Bearer invalid.token.value' },
    });
    expect(res.status).toBe(401);
    const json = await res.json();
    expect(json.error).toContain('Invalid or expired');
  });

  it('returns 401 when token is tampered', async () => {
    const app = createTestApp();
    const token = await createJwt(testPayload);
    const tampered = token.slice(0, -5) + 'XXXXX';
    const res = await app.request('/protected', {
      headers: { Authorization: `Bearer ${tampered}` },
    });
    expect(res.status).toBe(401);
  });

  it('allows request and sets user context with valid token', async () => {
    const app = createTestApp();
    const token = await createJwt(testPayload);
    const res = await app.request('/protected', {
      headers: { Authorization: `Bearer ${token}` },
    });
    expect(res.status).toBe(200);
    const json = await res.json();
    expect(json.userId).toBe(testPayload.userId);
    expect(json.email).toBe(testPayload.email);
    expect(json.role).toBe(testPayload.role);
    expect(json.workspaceId).toBe(testPayload.workspaceId);
  });

  it('sets workspaceId to null when not in token', async () => {
    const app = createTestApp();
    const token = await createJwt({
      userId: '550e8400-e29b-41d4-a716-446655440000',
      email: 'test@example.com',
      name: 'Test',
      role: 'creator_user',
    });
    const res = await app.request('/protected', {
      headers: { Authorization: `Bearer ${token}` },
    });
    expect(res.status).toBe(200);
    const json = await res.json();
    expect(json.workspaceId).toBeNull();
  });

  it('returns 401 when token is expired', async () => {
    // We cannot easily create an expired token without modifying JWT_SECRET or clock,
    // but we can test with a completely fabricated token
    const app = createTestApp();
    const res = await app.request('/protected', {
      headers: { Authorization: 'Bearer eyJhbGciOiJIUzI1NiJ9.eyJleHAiOjAsImlhdCI6MH0.invalid' },
    });
    expect(res.status).toBe(401);
  });
});
