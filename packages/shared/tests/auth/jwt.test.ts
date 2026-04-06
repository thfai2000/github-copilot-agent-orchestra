import { describe, it, expect, beforeAll } from 'vitest';
import { createJwt, verifyJwt } from '../../src/auth/jwt.js';

beforeAll(() => {
  process.env.JWT_SECRET = 'test-secret-key-must-be-at-least-32-chars-long!!';
});

describe('JWT', () => {
  const testUser = { userId: '550e8400-e29b-41d4-a716-446655440000', email: 'test@example.com', name: 'Test User' };

  it('should create and verify a JWT', async () => {
    const token = await createJwt(testUser);
    expect(token).toBeTruthy();
    expect(typeof token).toBe('string');
    expect(token.split('.').length).toBe(3);

    const payload = await verifyJwt(token);
    expect(payload.userId).toBe(testUser.userId);
    expect(payload.email).toBe(testUser.email);
    expect(payload.name).toBe(testUser.name);
    expect(payload.iat).toBeDefined();
    expect(payload.exp).toBeDefined();
  });

  it('should reject an invalid token', async () => {
    await expect(verifyJwt('invalid.token.value')).rejects.toThrow();
  });

  it('should reject a tampered token', async () => {
    const token = await createJwt(testUser);
    const tampered = token.slice(0, -5) + 'XXXXX';
    await expect(verifyJwt(tampered)).rejects.toThrow();
  });

  it('should reject without JWT_SECRET', async () => {
    const orig = process.env.JWT_SECRET;
    delete process.env.JWT_SECRET;
    await expect(createJwt(testUser)).rejects.toThrow('JWT_SECRET');
    process.env.JWT_SECRET = orig;
  });
});
