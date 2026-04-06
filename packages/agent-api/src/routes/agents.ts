import { Hono } from 'hono';
import { z } from 'zod';
import { eq } from 'drizzle-orm';
import { db } from '../database/index.js';
import { agents } from '../database/schema.js';
import { authMiddleware, encrypt, uuidSchema } from '@ai-trader/shared';

const agentsRouter = new Hono();
agentsRouter.use('/*', authMiddleware);

// GET / — list agents for current user
agentsRouter.get('/', async (c) => {
  const user = c.get('user');
  const agentList = await db.query.agents.findMany({
    where: eq(agents.userId, user.userId),
    columns: {
      githubTokenEncrypted: false,
    },
  });
  return c.json({ agents: agentList });
});

// POST / — create agent
const createAgentSchema = z.object({
  name: z.string().min(1).max(100),
  description: z.string().max(1000).optional(),
  gitRepoUrl: z.string().url().max(500),
  gitBranch: z.string().max(100).default('main'),
  agentFilePath: z.string().min(1).max(300),
  skillsPaths: z.array(z.string().max(300)).max(20).default([]),
  githubToken: z.string().max(500).optional(),
});

agentsRouter.post('/', async (c) => {
  const user = c.get('user');
  const body = createAgentSchema.parse(await c.req.json());

  const [agent] = await db
    .insert(agents)
    .values({
      userId: user.userId,
      name: body.name,
      description: body.description,
      gitRepoUrl: body.gitRepoUrl,
      gitBranch: body.gitBranch,
      agentFilePath: body.agentFilePath,
      skillsPaths: body.skillsPaths,
      githubTokenEncrypted: body.githubToken ? encrypt(body.githubToken) : null,
    })
    .returning();

  return c.json(
    {
      agent: {
        ...agent,
        githubTokenEncrypted: undefined,
      },
    },
    201,
  );
});

// GET /:id — agent detail
agentsRouter.get('/:id', async (c) => {
  const user = c.get('user');
  const id = uuidSchema.parse(c.req.param('id'));

  const agent = await db.query.agents.findFirst({
    where: eq(agents.id, id),
    columns: { githubTokenEncrypted: false },
  });

  if (!agent) return c.json({ error: 'Agent not found' }, 404);
  if (agent.userId !== user.userId) return c.json({ error: 'Forbidden' }, 403);

  return c.json({ agent });
});

// PUT /:id — update agent
const updateAgentSchema = z.object({
  name: z.string().min(1).max(100).optional(),
  description: z.string().max(1000).optional(),
  gitRepoUrl: z.string().url().max(500).optional(),
  gitBranch: z.string().max(100).optional(),
  agentFilePath: z.string().min(1).max(300).optional(),
  skillsPaths: z.array(z.string().max(300)).max(20).optional(),
  githubToken: z.string().max(500).optional(),
  status: z.enum(['active', 'paused']).optional(),
});

agentsRouter.put('/:id', async (c) => {
  const user = c.get('user');
  const id = uuidSchema.parse(c.req.param('id'));
  const body = updateAgentSchema.parse(await c.req.json());

  const existing = await db.query.agents.findFirst({ where: eq(agents.id, id) });
  if (!existing) return c.json({ error: 'Agent not found' }, 404);
  if (existing.userId !== user.userId) return c.json({ error: 'Forbidden' }, 403);

  const updateData: Record<string, unknown> = { updatedAt: new Date() };
  if (body.name) updateData.name = body.name;
  if (body.description !== undefined) updateData.description = body.description;
  if (body.gitRepoUrl) updateData.gitRepoUrl = body.gitRepoUrl;
  if (body.gitBranch) updateData.gitBranch = body.gitBranch;
  if (body.agentFilePath) updateData.agentFilePath = body.agentFilePath;
  if (body.skillsPaths) updateData.skillsPaths = body.skillsPaths;
  if (body.githubToken) updateData.githubTokenEncrypted = encrypt(body.githubToken);
  if (body.status) updateData.status = body.status;

  const [updated] = await db.update(agents).set(updateData).where(eq(agents.id, id)).returning();

  return c.json({
    agent: { ...updated, githubTokenEncrypted: undefined },
  });
});

// DELETE /:id — delete agent
agentsRouter.delete('/:id', async (c) => {
  const user = c.get('user');
  const id = uuidSchema.parse(c.req.param('id'));

  const existing = await db.query.agents.findFirst({ where: eq(agents.id, id) });
  if (!existing) return c.json({ error: 'Agent not found' }, 404);
  if (existing.userId !== user.userId) return c.json({ error: 'Forbidden' }, 403);

  await db.delete(agents).where(eq(agents.id, id));
  return c.json({ success: true });
});

export default agentsRouter;
