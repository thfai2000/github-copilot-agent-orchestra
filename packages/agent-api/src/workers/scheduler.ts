import { eq, and } from 'drizzle-orm';
import { createLogger } from '@ai-trader/shared';
import { db } from '../database/index.js';
import { triggers, workflows } from '../database/schema.js';
import { enqueueWorkflowExecution } from '../services/workflow-engine.js';
import { getRedisConnection } from '../services/redis.js';

const logger = createLogger('scheduler');
const POLL_INTERVAL = 30_000; // 30 seconds
const LEADER_LOCK_KEY = 'scheduler:leader';
const LEADER_LOCK_TTL = 60; // seconds

/**
 * Simple cron parser: checks if a cron expression matches the current time.
 * Supports: minute hour dayOfMonth month dayOfWeek
 * This is a basic implementation; in production use a library like cron-parser.
 */
function cronMatchesNow(cronExpr: string): boolean {
  const parts = cronExpr.split(/\s+/);
  if (parts.length !== 5) return false;

  const now = new Date();
  const checks = [
    { value: now.getMinutes(), field: parts[0] },
    { value: now.getHours(), field: parts[1] },
    { value: now.getDate(), field: parts[2] },
    { value: now.getMonth() + 1, field: parts[3] },
    { value: now.getDay(), field: parts[4] },
  ];

  return checks.every(({ value, field }) => {
    if (field === '*') return true;
    // Handle lists (1,2,3)
    if (field.includes(',')) {
      return field.split(',').map(Number).includes(value);
    }
    // Handle ranges (1-5)
    if (field.includes('-')) {
      const [min, max] = field.split('-').map(Number);
      return value >= min && value <= max;
    }
    // Handle step (*/5)
    if (field.startsWith('*/')) {
      const step = parseInt(field.slice(2), 10);
      return value % step === 0;
    }
    return parseInt(field, 10) === value;
  });
}

async function acquireLeaderLock(): Promise<boolean> {
  const redis = getRedisConnection();
  const result = await redis.set(LEADER_LOCK_KEY, 'scheduler', 'EX', LEADER_LOCK_TTL, 'NX');
  return result === 'OK';
}

async function renewLeaderLock(): Promise<boolean> {
  const redis = getRedisConnection();
  const result = await redis.expire(LEADER_LOCK_KEY, LEADER_LOCK_TTL);
  return result === 1;
}

async function pollTriggers() {
  try {
    // Get all active time-schedule triggers
    const activeTriggers = await db.query.triggers.findMany({
      where: and(eq(triggers.triggerType, 'time_schedule'), eq(triggers.isActive, true)),
    });

    for (const trigger of activeTriggers) {
      const config = trigger.configuration as Record<string, unknown>;
      const cronExpr = config.cron as string | undefined;

      if (!cronExpr) continue;

      // Check if cron matches current time
      if (!cronMatchesNow(cronExpr)) continue;

      // Check if already fired in this minute
      if (trigger.lastFiredAt) {
        const lastFired = new Date(trigger.lastFiredAt);
        const now = new Date();
        if (
          lastFired.getFullYear() === now.getFullYear() &&
          lastFired.getMonth() === now.getMonth() &&
          lastFired.getDate() === now.getDate() &&
          lastFired.getHours() === now.getHours() &&
          lastFired.getMinutes() === now.getMinutes()
        ) {
          continue; // Already fired this minute
        }
      }

      // Check workflow is active
      const workflow = await db.query.workflows.findFirst({
        where: eq(workflows.id, trigger.workflowId),
      });
      if (!workflow?.isActive) continue;

      // Enqueue workflow execution
      await enqueueWorkflowExecution(trigger.workflowId, trigger.id, {
        type: 'time_schedule',
        cron: cronExpr,
        firedAt: new Date().toISOString(),
      });

      // Update last fired time
      await db.update(triggers).set({ lastFiredAt: new Date() }).where(eq(triggers.id, trigger.id));

      logger.info(
        { triggerId: trigger.id, workflowId: trigger.workflowId, cron: cronExpr },
        'Trigger fired',
      );
    }
  } catch (error) {
    logger.error({ error }, 'Error polling triggers');
  }
}

async function run() {
  logger.info('Scheduler starting...');

  // Main loop
  const tick = async () => {
    const isLeader = (await acquireLeaderLock()) || (await renewLeaderLock());
    if (!isLeader) {
      logger.debug('Not leader, skipping poll');
      return;
    }

    await pollTriggers();
  };

  // Initial tick
  await tick();

  // Poll on interval
  setInterval(tick, POLL_INTERVAL);

  logger.info(`Scheduler running, polling every ${POLL_INTERVAL / 1000}s`);
}

run().catch((err) => {
  logger.error(err, 'Scheduler failed to start');
  process.exit(1);
});

// Graceful shutdown
process.on('SIGTERM', () => {
  logger.info('SIGTERM received, shutting down scheduler...');
  process.exit(0);
});
