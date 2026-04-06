import { Worker } from 'bullmq';
import { createLogger } from '@ai-trader/shared';
import { executeWorkflow } from '../services/workflow-engine.js';
import { getRedisConnectionOpts } from '../services/redis.js';

const logger = createLogger('workflow-worker');

const worker = new Worker(
  'workflow-execution',
  async (job) => {
    const { executionId, workflowId, agentId } = job.data;
    logger.info(
      { executionId, workflowId, agentId, jobId: job.id },
      'Processing workflow execution',
    );

    await executeWorkflow(executionId);
  },
  {
    connection: getRedisConnectionOpts(),
    concurrency: 1,
    lockDuration: 600_000, // 10 minutes
  },
);

worker.on('completed', (job) => {
  logger.info({ jobId: job.id }, 'Job completed');
});

worker.on('failed', (job, err) => {
  logger.error({ jobId: job?.id, error: err.message }, 'Job failed');
});

worker.on('error', (err) => {
  logger.error({ error: err.message }, 'Worker error');
});

logger.info('Workflow worker started, waiting for jobs...');

// Graceful shutdown
process.on('SIGTERM', async () => {
  logger.info('SIGTERM received, shutting down worker...');
  await worker.close();
  process.exit(0);
});
