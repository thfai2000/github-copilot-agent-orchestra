import { Hono } from 'hono';
import { z } from 'zod';
import { eq } from 'drizzle-orm';
import { db } from '../database/index.js';
import { workflows, workflowSteps, triggers, agents } from '../database/schema.js';
import { authMiddleware, uuidSchema } from '@ai-trader/shared';
import { enqueueWorkflowExecution } from '../services/workflow-engine.js';

const workflowsRouter = new Hono();
workflowsRouter.use('/*', authMiddleware);

// GET / — list workflows
workflowsRouter.get('/', async (c) => {
  const user = c.get('user');
  const agentId = c.req.query('agentId');

  // Only show workflows for user's agents
  const userAgents = await db.query.agents.findMany({
    where: eq(agents.userId, user.userId),
    columns: { id: true },
  });
  const agentIds = userAgents.map((a) => a.id);
  if (agentIds.length === 0) return c.json({ workflows: [] });

  const workflowList = await db.query.workflows.findMany({
    where: agentId ? eq(workflows.agentId, agentId) : undefined,
  });

  // Filter to user's agents
  const filtered = workflowList.filter((w) => agentIds.includes(w.agentId));
  return c.json({ workflows: filtered });
});

// POST / — create workflow with steps
const stepSchema = z.object({
  name: z.string().min(1).max(200),
  promptTemplate: z.string().min(1),
  stepOrder: z.number().int().min(1),
  agentId: z.string().uuid().optional(),
  timeoutSeconds: z.number().int().min(30).max(3600).default(300),
});

const createWorkflowSchema = z.object({
  agentId: z.string().uuid(),
  name: z.string().min(1).max(200),
  description: z.string().max(1000).optional(),
  steps: z.array(stepSchema).min(1).max(20),
});

workflowsRouter.post('/', async (c) => {
  const user = c.get('user');
  const body = createWorkflowSchema.parse(await c.req.json());

  // Verify agent belongs to user
  const agent = await db.query.agents.findFirst({ where: eq(agents.id, body.agentId) });
  if (!agent || agent.userId !== user.userId) {
    return c.json({ error: 'Agent not found' }, 404);
  }

  const result = await db.transaction(async (tx) => {
    const [workflow] = await tx
      .insert(workflows)
      .values({
        agentId: body.agentId,
        name: body.name,
        description: body.description,
      })
      .returning();

    const steps = await tx
      .insert(workflowSteps)
      .values(
        body.steps.map((s) => ({
          workflowId: workflow.id,
          name: s.name,
          promptTemplate: s.promptTemplate,
          stepOrder: s.stepOrder,
          agentId: s.agentId,
          timeoutSeconds: s.timeoutSeconds,
        })),
      )
      .returning();

    return { workflow, steps };
  });

  return c.json(result, 201);
});

// GET /:id — workflow detail + steps + triggers
workflowsRouter.get('/:id', async (c) => {
  const id = uuidSchema.parse(c.req.param('id'));

  const workflow = await db.query.workflows.findFirst({ where: eq(workflows.id, id) });
  if (!workflow) return c.json({ error: 'Workflow not found' }, 404);

  const [steps, workflowTriggers] = await Promise.all([
    db.query.workflowSteps.findMany({
      where: eq(workflowSteps.workflowId, id),
      orderBy: workflowSteps.stepOrder,
    }),
    db.query.triggers.findMany({
      where: eq(triggers.workflowId, id),
    }),
  ]);

  return c.json({ workflow, steps, triggers: workflowTriggers });
});

// PUT /:id — update workflow
const updateWorkflowSchema = z.object({
  name: z.string().min(1).max(200).optional(),
  description: z.string().max(1000).optional(),
  isActive: z.boolean().optional(),
});

workflowsRouter.put('/:id', async (c) => {
  const id = uuidSchema.parse(c.req.param('id'));
  const body = updateWorkflowSchema.parse(await c.req.json());

  const [updated] = await db
    .update(workflows)
    .set({ ...body, updatedAt: new Date() })
    .where(eq(workflows.id, id))
    .returning();

  if (!updated) return c.json({ error: 'Workflow not found' }, 404);
  return c.json({ workflow: updated });
});

// PUT /:id/steps — replace all steps atomically
workflowsRouter.put('/:id/steps', async (c) => {
  const id = uuidSchema.parse(c.req.param('id'));
  const { steps } = z
    .object({ steps: z.array(stepSchema).min(1).max(20) })
    .parse(await c.req.json());

  const result = await db.transaction(async (tx) => {
    await tx.delete(workflowSteps).where(eq(workflowSteps.workflowId, id));
    const newSteps = await tx
      .insert(workflowSteps)
      .values(
        steps.map((s) => ({
          workflowId: id,
          name: s.name,
          promptTemplate: s.promptTemplate,
          stepOrder: s.stepOrder,
          agentId: s.agentId,
          timeoutSeconds: s.timeoutSeconds,
        })),
      )
      .returning();
    return newSteps;
  });

  return c.json({ steps: result });
});

// DELETE /:id
workflowsRouter.delete('/:id', async (c) => {
  const id = uuidSchema.parse(c.req.param('id'));
  await db.delete(workflows).where(eq(workflows.id, id));
  return c.json({ success: true });
});

// POST /:id/trigger — manually trigger a workflow
workflowsRouter.post('/:id/trigger', async (c) => {
  const id = uuidSchema.parse(c.req.param('id'));
  const user = c.get('user');

  const workflow = await db.query.workflows.findFirst({ where: eq(workflows.id, id) });
  if (!workflow) return c.json({ error: 'Workflow not found' }, 404);

  const execution = await enqueueWorkflowExecution(id, null, {
    type: 'manual',
    userId: user.userId,
    triggeredAt: new Date().toISOString(),
  });

  return c.json({ execution }, 201);
});

export default workflowsRouter;
