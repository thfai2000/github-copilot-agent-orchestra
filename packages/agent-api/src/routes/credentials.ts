import { Hono } from 'hono';
import { z } from 'zod';
import { eq } from 'drizzle-orm';
import { db } from '../database/index.js';
import { agentCredentials, agents } from '../database/schema.js';
import { authMiddleware, encrypt, uuidSchema } from '@ai-trader/shared';

const credentialsRouter = new Hono();
credentialsRouter.use('/*', authMiddleware);

// GET / — list credentials for an agent
credentialsRouter.get('/', async (c) => {
  const user = c.get('user');
  const agentId = c.req.query('agentId');
  if (!agentId) return c.json({ error: 'agentId query parameter required' }, 400);

  // Verify agent belongs to user
  const agent = await db.query.agents.findFirst({ where: eq(agents.id, agentId) });
  if (!agent || agent.userId !== user.userId) {
    return c.json({ error: 'Agent not found' }, 404);
  }

  const creds = await db.query.agentCredentials.findMany({
    where: eq(agentCredentials.agentId, agentId),
    columns: {
      id: true,
      agentId: true,
      key: true,
      description: true,
      createdAt: true,
      updatedAt: true,
    },
  });

  return c.json({ credentials: creds });
});

// POST / — add credential
const createCredentialSchema = z.object({
  agentId: z.string().uuid(),
  key: z
    .string()
    .min(1)
    .max(100)
    .regex(/^[A-Z_][A-Z0-9_]*$/, 'Key must be uppercase with underscores'),
  value: z.string().min(1).max(5000),
  description: z.string().max(300).optional(),
});

credentialsRouter.post('/', async (c) => {
  const user = c.get('user');
  const body = createCredentialSchema.parse(await c.req.json());

  const agent = await db.query.agents.findFirst({ where: eq(agents.id, body.agentId) });
  if (!agent || agent.userId !== user.userId) {
    return c.json({ error: 'Agent not found' }, 404);
  }

  const [credential] = await db
    .insert(agentCredentials)
    .values({
      agentId: body.agentId,
      key: body.key,
      valueEncrypted: encrypt(body.value),
      description: body.description,
    })
    .onConflictDoUpdate({
      target: [agentCredentials.agentId, agentCredentials.key],
      set: {
        valueEncrypted: encrypt(body.value),
        description: body.description,
        updatedAt: new Date(),
      },
    })
    .returning({
      id: agentCredentials.id,
      agentId: agentCredentials.agentId,
      key: agentCredentials.key,
      description: agentCredentials.description,
      createdAt: agentCredentials.createdAt,
    });

  return c.json({ credential }, 201);
});

// PUT /:id — update credential value
const updateCredentialSchema = z.object({
  value: z.string().min(1).max(5000).optional(),
  description: z.string().max(300).optional(),
});

credentialsRouter.put('/:id', async (c) => {
  const id = uuidSchema.parse(c.req.param('id'));
  const body = updateCredentialSchema.parse(await c.req.json());

  const updateData: Record<string, unknown> = { updatedAt: new Date() };
  if (body.value) updateData.valueEncrypted = encrypt(body.value);
  if (body.description !== undefined) updateData.description = body.description;

  const [updated] = await db
    .update(agentCredentials)
    .set(updateData)
    .where(eq(agentCredentials.id, id))
    .returning({
      id: agentCredentials.id,
      key: agentCredentials.key,
      description: agentCredentials.description,
      updatedAt: agentCredentials.updatedAt,
    });

  if (!updated) return c.json({ error: 'Credential not found' }, 404);
  return c.json({ credential: updated });
});

// DELETE /:id — remove credential
credentialsRouter.delete('/:id', async (c) => {
  const id = uuidSchema.parse(c.req.param('id'));
  await db.delete(agentCredentials).where(eq(agentCredentials.id, id));
  return c.json({ success: true });
});

export default credentialsRouter;
