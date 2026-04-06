import { serve } from '@hono/node-server';
import {
  createApp,
  createLogger,
  agentEventBus,
  agentApiSpec,
} from '@ai-trader/shared';
import agentsRouter from './routes/agents.js';
import authRouter from './routes/auth.js';
import workflowsRouter from './routes/workflows.js';
import executionsRouter from './routes/executions.js';
import credentialsRouter from './routes/credentials.js';
import triggersRouter from './routes/triggers.js';
import webhooks from './routes/webhooks.js';
import supervisorRouter from './routes/supervisor.js';

const logger = createLogger('agent-api');
const port = Number(process.env.AGENT_API_PORT) || 4002;

const app = createApp({
  serviceName: 'agent-api',
  port,
  eventBus: agentEventBus,
  apiSpec: agentApiSpec,
  routes: [
    ['/api/auth', authRouter],
    ['/api/agents', agentsRouter],
    ['/api/workflows', workflowsRouter],
    ['/api/executions', executionsRouter],
    ['/api/credentials', credentialsRouter],
    ['/api/triggers', triggersRouter],
    ['/api/webhooks', webhooks],
    ['/api/supervisor', supervisorRouter],
  ],
});

if (process.env.NODE_ENV !== 'test') {
  serve({ fetch: app.fetch, port }, () => {
    logger.info(`Agent API running on http://localhost:${port}`);
  });
}

export { app };
