import { Hono } from 'hono';
import { createHmac, timingSafeEqual } from 'crypto';
import { eq } from 'drizzle-orm';
import { db } from '../database/index.js';
import { webhookRegistrations, triggers } from '../database/schema.js';
import { decrypt, createLogger } from '@oao/shared';
import { enqueueWorkflowExecution } from '../services/workflow-engine.js';

const logger = createLogger('agent-webhooks');
const webhooks = new Hono();

// Dedup cache for event IDs (in-memory, 5-minute window)
const processedEvents = new Map<string, number>();
setInterval(() => {
  const cutoff = Date.now() - 5 * 60 * 1000;
  for (const [key, time] of processedEvents) {
    if (time < cutoff) processedEvents.delete(key);
  }
}, 60_000);

// POST /:registrationId — receive webhook event
webhooks.post('/:registrationId', async (c) => {
  const registrationId = c.req.param('registrationId');
  const signature = c.req.header('X-Signature');
  const timestamp = c.req.header('X-Timestamp');
  const eventId = c.req.header('X-Event-Id');

  if (!signature || !timestamp) {
    return c.json({ error: 'Missing signature or timestamp' }, 401);
  }

  // Replay protection: 5-minute window
  const ts = parseInt(timestamp, 10);
  if (isNaN(ts) || Math.abs(Date.now() - ts * 1000) > 5 * 60 * 1000) {
    return c.json({ error: 'Timestamp out of range' }, 401);
  }

  // Event ID dedup
  if (eventId && processedEvents.has(eventId)) {
    return c.json({ status: 'already_processed' }, 200);
  }

  // Look up registration
  const registration = await db.query.webhookRegistrations.findFirst({
    where: eq(webhookRegistrations.id, registrationId),
  });
  if (!registration || !registration.isActive) {
    return c.json({ error: 'Registration not found' }, 404);
  }

  // Verify HMAC signature
  const body = await c.req.text();
  const secret = decrypt(registration.hmacSecretEncrypted);
  const expectedSig = createHmac('sha256', secret).update(`${timestamp}.${body}`).digest('hex');

  if (!timingSafeEqual(Buffer.from(signature), Buffer.from(expectedSig))) {
    return c.json({ error: 'Invalid signature' }, 401);
  }

  // Mark event as processed
  if (eventId) processedEvents.set(eventId, Date.now());

  // Update registration stats
  await db
    .update(webhookRegistrations)
    .set({
      requestCount: registration.requestCount + 1,
      lastReceivedAt: new Date(),
    })
    .where(eq(webhookRegistrations.id, registrationId));

  // Find associated trigger and enqueue workflow
  if (registration.triggerId) {
    const trigger = await db.query.triggers.findFirst({
      where: eq(triggers.id, registration.triggerId),
    });

    if (trigger && trigger.isActive) {
      let payload = {};
      try { payload = body ? JSON.parse(body) : {}; } catch { /* non-JSON body */ }
      await enqueueWorkflowExecution(trigger.workflowId, trigger.id, {
        type: 'webhook',
        eventId,
        payload,
        receivedAt: new Date().toISOString(),
      });
      logger.info({ registrationId, triggerId: trigger.id }, 'Webhook triggered workflow');
    }
  }

  return c.json({ status: 'accepted' }, 202);
});

export default webhooks;
