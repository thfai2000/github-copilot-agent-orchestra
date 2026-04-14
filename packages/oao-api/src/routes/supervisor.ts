import { Hono } from 'hono';
import { ne } from 'drizzle-orm';
import { db } from '../database/index.js';
import { agents } from '../database/schema.js';
import { authMiddleware, createLogger, agentEventBus } from '@oao/shared';

const logger = createLogger('supervisor');
const supervisorRouter = new Hono();
supervisorRouter.use('/*', authMiddleware);

// POST /emergency-stop — pause ALL agents immediately (admin only)
supervisorRouter.post('/emergency-stop', async (c) => {
  const user = c.get('user');
  if (user.role !== 'workspace_admin' && user.role !== 'super_admin') {
    return c.json({ error: 'Admin access required for emergency stop' }, 403);
  }
  logger.warn({ userId: user.userId }, 'EMERGENCY STOP triggered');

  const result = await db
    .update(agents)
    .set({ status: 'paused', updatedAt: new Date() })
    .where(ne(agents.status, 'paused'))
    .returning({ id: agents.id, name: agents.name });

  agentEventBus.broadcast('supervisor:emergency-stop', {
    triggeredBy: user.userId,
    agentsPaused: result.length,
    timestamp: new Date().toISOString(),
  });

  return c.json({
    action: 'emergency-stop',
    agentsPaused: result.length,
    agents: result,
  });
});

// POST /resume-all — resume ALL paused agents (admin only)
supervisorRouter.post('/resume-all', async (c) => {
  const user = c.get('user');
  if (user.role !== 'workspace_admin' && user.role !== 'super_admin') {
    return c.json({ error: 'Admin access required for resume all' }, 403);
  }
  logger.info({ userId: user.userId }, 'Resume all agents triggered');

  const result = await db
    .update(agents)
    .set({ status: 'active', updatedAt: new Date() })
    .where(ne(agents.status, 'active'))
    .returning({ id: agents.id, name: agents.name });

  agentEventBus.broadcast('supervisor:resume-all', {
    triggeredBy: user.userId,
    agentsResumed: result.length,
    timestamp: new Date().toISOString(),
  });

  return c.json({
    action: 'resume-all',
    agentsResumed: result.length,
    agents: result,
  });
});

// GET /status — overview of all agent statuses (admin only)
supervisorRouter.get('/status', async (c) => {
  const user = c.get('user');
  if (user.role !== 'workspace_admin' && user.role !== 'super_admin') {
    return c.json({ error: 'Admin access required' }, 403);
  }
  const allAgents = await db.query.agents.findMany({
    columns: { id: true, name: true, status: true, updatedAt: true },
  });

  const counts = { active: 0, paused: 0, error: 0 };
  for (const a of allAgents) {
    counts[a.status as keyof typeof counts]++;
  }

  return c.json({ counts, agents: allAgents });
});

export default supervisorRouter;
