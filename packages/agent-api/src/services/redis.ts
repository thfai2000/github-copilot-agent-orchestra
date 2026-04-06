import Redis from 'ioredis';

let redisInstance: Redis | null = null;

export function getRedisConnection(): Redis {
  if (!redisInstance) {
    const url = process.env.REDIS_URL || 'redis://localhost:6379';
    redisInstance = new Redis(url, { maxRetriesPerRequest: null });
  }
  return redisInstance;
}

export function getRedisConnectionOpts() {
  const url = process.env.REDIS_URL || 'redis://localhost:6379';
  const parsed = new URL(url);
  return {
    host: parsed.hostname,
    port: parseInt(parsed.port || '6379', 10),
    maxRetriesPerRequest: null as null,
  };
}
