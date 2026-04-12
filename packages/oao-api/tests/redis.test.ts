import { describe, it, expect, vi } from 'vitest';

// Mock ioredis at module level
vi.mock('ioredis', () => {
  const MockRedis = vi.fn().mockImplementation(() => ({
    status: 'ready',
    get: vi.fn(),
    set: vi.fn(),
    del: vi.fn(),
  }));
  return { default: MockRedis };
});

describe('redis service', () => {
  it('getRedisConnection returns a Redis-like object', async () => {
    const { getRedisConnection } = await import('../src/services/redis.js');
    const redis = getRedisConnection();
    expect(redis).toBeDefined();
    expect(typeof redis.get).toBe('function');
    expect(typeof redis.set).toBe('function');
  });

  it('getRedisConnection returns singleton', async () => {
    const { getRedisConnection } = await import('../src/services/redis.js');
    const a = getRedisConnection();
    const b = getRedisConnection();
    expect(a).toBe(b);
  });

  it('getRedisConnectionOpts returns parsed connection options', async () => {
    process.env.REDIS_URL = 'redis://myhost:6380';
    const { getRedisConnectionOpts } = await import('../src/services/redis.js');
    const opts = getRedisConnectionOpts();
    expect(opts.host).toBe('myhost');
    expect(opts.port).toBe(6380);
    expect(opts.maxRetriesPerRequest).toBeNull();
    process.env.REDIS_URL = 'redis://localhost:6379';
  });

  it('getRedisConnectionOpts uses default URL when not set', async () => {
    const saved = process.env.REDIS_URL;
    delete process.env.REDIS_URL;
    const { getRedisConnectionOpts } = await import('../src/services/redis.js');
    const opts = getRedisConnectionOpts();
    expect(opts.host).toBe('localhost');
    expect(opts.port).toBe(6379);
    process.env.REDIS_URL = saved;
  });
});
