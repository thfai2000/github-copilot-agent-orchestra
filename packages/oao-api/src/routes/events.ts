import { Hono } from 'hono';
import { eq, and, desc, sql, gte, lte } from 'drizzle-orm';
import { db } from '../database/index.js';
import { systemEvents } from '../database/schema.js';
import { authMiddleware } from '@oao/shared';
import { EVENT_NAMES } from '../services/system-events.js';

const eventsRouter = new Hono();
eventsRouter.use('/*', authMiddleware);

// GET / — list system events (scoped to workspace)
eventsRouter.get('/', async (c) => {
  const user = c.get('user');
  if (!user.workspaceId) return c.json({ events: [], total: 0 });

  const page = Math.max(1, Number(c.req.query('page') || 1));
  const limit = Math.min(100, Math.max(1, Number(c.req.query('limit') || 50)));
  const offset = (page - 1) * limit;
  const eventName = c.req.query('eventName');
  const eventScope = c.req.query('eventScope') as 'workspace' | 'user' | undefined;
  const from = c.req.query('from'); // ISO date string
  const to = c.req.query('to');     // ISO date string

  const conditions = [
    sql`(
      (${systemEvents.eventScope} = 'workspace' AND ${systemEvents.scopeId} = ${user.workspaceId})
      OR
      (${systemEvents.eventScope} = 'user' AND ${systemEvents.scopeId} = ${user.userId})
    )`,
  ];

  if (eventName) {
    conditions.push(eq(systemEvents.eventName, eventName));
  }
  if (eventScope) {
    conditions.push(eq(systemEvents.eventScope, eventScope));
  }
  if (from) {
    conditions.push(gte(systemEvents.createdAt, new Date(from)));
  }
  if (to) {
    conditions.push(lte(systemEvents.createdAt, new Date(to)));
  }

  const whereClause = and(...conditions);

  const [events, countResult] = await Promise.all([
    db.query.systemEvents.findMany({
      where: whereClause,
      orderBy: desc(systemEvents.createdAt),
      limit,
      offset,
    }),
    db.select({ count: sql<number>`count(*)::int` }).from(systemEvents).where(whereClause),
  ]);

  return c.json({ events, total: countResult[0]?.count ?? 0, page, limit });
});

// GET /names — list all predefined event names
eventsRouter.get('/names', async (c) => {
  return c.json({ eventNames: Object.values(EVENT_NAMES) });
});

export default eventsRouter;
