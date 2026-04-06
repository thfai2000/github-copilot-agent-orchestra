import { describe, it, expect, vi, beforeAll } from 'vitest';

// Mock database before importing routes
vi.mock('../src/database/index.js', () => ({
  db: {
    query: {
      agents: {
        findFirst: vi.fn(),
        findMany: vi.fn().mockResolvedValue([]),
      },
      workflows: {
        findFirst: vi.fn(),
        findMany: vi.fn().mockResolvedValue([]),
      },
      workflowSteps: {
        findMany: vi.fn().mockResolvedValue([]),
      },
      triggers: {
        findFirst: vi.fn(),
        findMany: vi.fn().mockResolvedValue([]),
      },
      workflowExecutions: {
        findFirst: vi.fn(),
        findMany: vi.fn().mockResolvedValue([]),
      },
      stepExecutions: {
        findMany: vi.fn().mockResolvedValue([]),
      },
      agentCredentials: {
        findFirst: vi.fn(),
        findMany: vi.fn().mockResolvedValue([]),
      },
      webhookRegistrations: {
        findFirst: vi.fn(),
      },
    },
    select: vi.fn().mockReturnValue({
      from: vi.fn().mockReturnValue({
        where: vi.fn().mockReturnValue({
          orderBy: vi.fn().mockReturnValue({
            limit: vi.fn().mockReturnValue({
              offset: vi.fn().mockResolvedValue([]),
            }),
          }),
        }),
      }),
    }),
    insert: vi.fn().mockReturnValue({
      values: vi.fn().mockReturnValue({
        returning: vi.fn().mockResolvedValue([{ id: 'test-id' }]),
        onConflictDoUpdate: vi.fn().mockReturnValue({
          returning: vi.fn().mockResolvedValue([{ id: 'test-id' }]),
        }),
      }),
    }),
    update: vi.fn().mockReturnValue({
      set: vi.fn().mockReturnValue({
        where: vi.fn().mockReturnValue({
          returning: vi.fn().mockResolvedValue([]),
        }),
      }),
    }),
    delete: vi.fn().mockReturnValue({
      where: vi.fn().mockResolvedValue([]),
    }),
    transaction: vi.fn(),
  },
}));

// Mock redis
vi.mock('../src/services/redis.js', () => ({
  getRedisConnection: vi.fn().mockReturnValue({}),
  getRedisConnectionOpts: vi.fn().mockReturnValue({ host: 'localhost', port: 6379 }),
}));

beforeAll(() => {
  process.env.JWT_SECRET = 'test-secret-key-must-be-at-least-32-chars-long!!';
  process.env.ENCRYPTION_KEY = '0123456789abcdef0123456789abcdef0123456789abcdef0123456789abcdef';
});

describe('Agent API Server', () => {
  it('should import and create Hono app', async () => {
    const { app } = await import('../src/server.js');
    expect(app).toBeDefined();
  });

  it('should respond to health check', async () => {
    const { app } = await import('../src/server.js');
    const res = await app.request('/health');
    expect(res.status).toBe(200);
    const json = await res.json();
    expect(json.status).toBe('ok');
    expect(json.service).toBe('agent-api');
    expect(json.version).toBe('4.0.0');
  });

  it('should return 404 for unknown routes', async () => {
    const { app } = await import('../src/server.js');
    const res = await app.request('/api/nonexistent');
    expect(res.status).toBe(404);
  });
});

describe('Agent routes', () => {
  it('should reject creating an agent without auth', async () => {
    const { app } = await import('../src/server.js');
    const res = await app.request('/api/agents', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ name: 'Test Agent' }),
    });
    expect(res.status).toBe(401);
  });

  it('should reject creating an agent with invalid data', async () => {
    const { createJwt } = await import('@ai-trader/shared');
    const token = await createJwt({ userId: '550e8400-e29b-41d4-a716-446655440000', email: 'test@example.com', name: 'Test' });

    const { app } = await import('../src/server.js');
    const res = await app.request('/api/agents', {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'Authorization': `Bearer ${token}`,
      },
      body: JSON.stringify({}), // missing name
    });
    expect(res.status).toBe(400);
  });
});

describe('Workflow routes', () => {
  it('should reject creating a workflow without auth', async () => {
    const { app } = await import('../src/server.js');
    const res = await app.request('/api/workflows', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ name: 'Test Workflow' }),
    });
    expect(res.status).toBe(401);
  });
});

describe('Credentials routes', () => {
  it('should reject credentials without auth', async () => {
    const { app } = await import('../src/server.js');
    const res = await app.request('/api/credentials', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ agentId: '550e8400-e29b-41d4-a716-446655440000', key: 'API_KEY', value: 'test' }),
    });
    expect(res.status).toBe(401);
  });

  it('should reject credentials with invalid key format', async () => {
    const { createJwt } = await import('@ai-trader/shared');
    const token = await createJwt({ userId: '550e8400-e29b-41d4-a716-446655440000', email: 'test@example.com', name: 'Test' });

    const { app } = await import('../src/server.js');
    const res = await app.request('/api/credentials', {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'Authorization': `Bearer ${token}`,
      },
      body: JSON.stringify({
        agentId: '550e8400-e29b-41d4-a716-446655440000',
        key: 'invalid-key-lowercase',
        value: 'test',
      }),
    });
    expect(res.status).toBe(400);
  });
});

describe('Trigger routes', () => {
  it('should reject trigger creation without auth', async () => {
    const { app } = await import('../src/server.js');
    const res = await app.request('/api/triggers', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({}),
    });
    expect(res.status).toBe(401);
  });
});

describe('Execution routes', () => {
  it('should reject execution list without auth', async () => {
    const { app } = await import('../src/server.js');
    const res = await app.request('/api/executions');
    expect(res.status).toBe(401);
  });
});
