import { Queue } from 'bullmq';
import { eq, sql } from 'drizzle-orm';
import { db } from '../database/index.js';
import {
  workflowExecutions,
  stepExecutions,
  workflowSteps,
  workflows,
  agents,
  agentCredentials,
  agentQuotaUsage,
} from '../database/schema.js';
import { decrypt, createLogger } from '@ai-trader/shared';
import { getRedisConnection } from './redis.js';
import { CopilotClient, approveAll } from '@github/copilot-sdk';
import { prepareAgentWorkspace } from './agent-workspace.js';
import { createAgentTools } from './agent-tools.js';

const logger = createLogger('workflow-engine');

// ─── Redis Distributed Session Lock ──────────────────────────────────

const SESSION_LOCK_PREFIX = 'agent-session-lock:';
const SESSION_LOCK_TTL_SECONDS = 600; // 10 minutes

/**
 * Acquire a Redis distributed lock to prevent concurrent Copilot sessions
 * for the same agent. Uses SET NX with TTL for automatic expiry.
 */
async function acquireSessionLock(agentId: string): Promise<boolean> {
  const redis = getRedisConnection();
  const key = `${SESSION_LOCK_PREFIX}${agentId}`;
  const result = await redis.set(key, Date.now().toString(), 'EX', SESSION_LOCK_TTL_SECONDS, 'NX');
  return result === 'OK';
}

/**
 * Release the session lock for an agent.
 */
async function releaseSessionLock(agentId: string): Promise<void> {
  const redis = getRedisConnection();
  const key = `${SESSION_LOCK_PREFIX}${agentId}`;
  await redis.del(key);
}

/**
 * Extend the session lock TTL (call periodically during long sessions).
 */
// eslint-disable-next-line @typescript-eslint/no-unused-vars
async function extendSessionLock(agentId: string): Promise<void> {
  const redis = getRedisConnection();
  const key = `${SESSION_LOCK_PREFIX}${agentId}`;
  await redis.expire(key, SESSION_LOCK_TTL_SECONDS);
}

let workflowQueue: Queue | null = null;

function getQueue(): Queue {
  if (!workflowQueue) {
    workflowQueue = new Queue('workflow-execution', {
      connection: getRedisConnection(),
      defaultJobOptions: {
        removeOnComplete: 100,
        removeOnFail: 200,
        attempts: 1,
      },
    });
  }
  return workflowQueue;
}

/** Create an execution record and enqueue a BullMQ job. */
export async function enqueueWorkflowExecution(
  workflowId: string,
  triggerId: string | null,
  triggerMetadata: Record<string, unknown>,
) {
  const workflow = await db.query.workflows.findFirst({
    where: eq(workflows.id, workflowId),
  });
  if (!workflow) throw new Error(`Workflow ${workflowId} not found`);

  const steps = await db.query.workflowSteps.findMany({
    where: eq(workflowSteps.workflowId, workflowId),
    orderBy: workflowSteps.stepOrder,
  });

  // Create execution record
  const [execution] = await db
    .insert(workflowExecutions)
    .values({
      workflowId,
      triggerId,
      triggerMetadata,
      status: 'pending',
      currentStep: 0,
      totalSteps: steps.length,
    })
    .returning();

  // Pre-create step execution records
  await db.insert(stepExecutions).values(
    steps.map((step) => ({
      workflowExecutionId: execution.id,
      workflowStepId: step.id,
      stepOrder: step.stepOrder,
      status: 'pending' as const,
    })),
  );

  // Enqueue BullMQ job
  await getQueue().add(
    'execute-workflow',
    {
      executionId: execution.id,
      workflowId,
      agentId: workflow.agentId,
    },
    { jobId: `exec-${execution.id}` },
  );

  logger.info({ executionId: execution.id, workflowId }, 'Workflow execution enqueued');
  return execution;
}

/**
 * Execute a workflow: run each step sequentially as a Copilot session.
 * Called by the workflow worker.
 */
export async function executeWorkflow(executionId: string) {
  const execution = await db.query.workflowExecutions.findFirst({
    where: eq(workflowExecutions.id, executionId),
  });
  if (!execution) throw new Error(`Execution ${executionId} not found`);

  const workflow = await db.query.workflows.findFirst({
    where: eq(workflows.id, execution.workflowId),
  });
  if (!workflow) throw new Error(`Workflow ${execution.workflowId} not found`);

  const agent = await db.query.agents.findFirst({
    where: eq(agents.id, workflow.agentId),
  });
  if (!agent) throw new Error(`Agent ${workflow.agentId} not found`);

  const steps = await db.query.workflowSteps.findMany({
    where: eq(workflowSteps.workflowId, workflow.id),
    orderBy: workflowSteps.stepOrder,
  });

  const stepExecs = await db.query.stepExecutions.findMany({
    where: eq(stepExecutions.workflowExecutionId, executionId),
    orderBy: stepExecutions.stepOrder,
  });

  // Load agent credentials
  const creds = await db.query.agentCredentials.findMany({
    where: eq(agentCredentials.agentId, agent.id),
  });
  const credentialMap = new Map(creds.map((c) => [c.key, decrypt(c.valueEncrypted)]));

  // Mark execution as running
  await db
    .update(workflowExecutions)
    .set({ status: 'running', startedAt: new Date(), currentStep: 1 })
    .where(eq(workflowExecutions.id, executionId));

  let precedentOutput = '';

  for (let i = 0; i < steps.length; i++) {
    const step = steps[i];
    const stepExec = stepExecs[i];

    // Resolve prompt: replace <PRECEDENT_OUTPUT> with previous step's output
    const resolvedPrompt = step.promptTemplate.replace(/<PRECEDENT_OUTPUT>/g, precedentOutput);

    // Mark step as running
    await db
      .update(stepExecutions)
      .set({ status: 'running', resolvedPrompt, startedAt: new Date() })
      .where(eq(stepExecutions.id, stepExec.id));

    await db
      .update(workflowExecutions)
      .set({ currentStep: i + 1 })
      .where(eq(workflowExecutions.id, executionId));

    try {
      // Execute the Copilot session for this step
      const result = await executeCopilotSession({
        agent,
        step,
        resolvedPrompt,
        credentials: credentialMap,
        workflowId: workflow.id,
        executionId,
      });

      // Update step execution with output
      await db
        .update(stepExecutions)
        .set({
          status: 'completed',
          output: result.output,
          reasoningTrace: result.reasoningTrace,
          completedAt: new Date(),
        })
        .where(eq(stepExecutions.id, stepExec.id));

      precedentOutput = result.output;
      logger.info({ executionId, stepOrder: step.stepOrder }, 'Step completed');
    } catch (error) {
      const errorMsg = error instanceof Error ? error.message : 'Unknown error';

      // Mark this step as failed
      await db
        .update(stepExecutions)
        .set({ status: 'failed', error: errorMsg, completedAt: new Date() })
        .where(eq(stepExecutions.id, stepExec.id));

      // Mark remaining steps as skipped
      for (let j = i + 1; j < stepExecs.length; j++) {
        await db
          .update(stepExecutions)
          .set({ status: 'skipped' })
          .where(eq(stepExecutions.id, stepExecs[j].id));
      }

      // Mark execution as failed
      await db
        .update(workflowExecutions)
        .set({ status: 'failed', error: errorMsg, completedAt: new Date() })
        .where(eq(workflowExecutions.id, executionId));

      logger.error({ executionId, stepOrder: step.stepOrder, error: errorMsg }, 'Step failed');
      return;
    }
  }

  // All steps completed: mark execution as completed
  await db
    .update(workflowExecutions)
    .set({ status: 'completed', completedAt: new Date() })
    .where(eq(workflowExecutions.id, executionId));

  // Update agent's last session timestamp
  await db.update(agents).set({ lastSessionAt: new Date() }).where(eq(agents.id, agent.id));

  logger.info({ executionId }, 'Workflow execution completed');
}

/**
 * Execute a single Copilot session for one workflow step.
 * Uses @github/copilot-sdk to:
 * 1. Clone the agent's Git repo
 * 2. Load agent personality (.md) and skills
 * 3. Initialize a Copilot session with custom tools
 * 4. Run the prompt and capture output
 * 5. Track token usage for quota enforcement
 */
async function executeCopilotSession(params: {
  agent: typeof agents.$inferSelect;
  step: typeof workflowSteps.$inferSelect;
  resolvedPrompt: string;
  credentials: Map<string, string>;
  workflowId: string;
  executionId: string;
}): Promise<{ output: string; reasoningTrace: Record<string, unknown> }> {
  const { agent, step, resolvedPrompt, credentials, workflowId, executionId } = params;

  logger.info(
    {
      agentName: agent.name,
      stepName: step.name,
      promptLength: resolvedPrompt.length,
      credentialCount: credentials.size,
    },
    'Executing Copilot session',
  );

  // 0. Acquire distributed session lock (prevent concurrent sessions per agent)
  const lockAcquired = await acquireSessionLock(agent.id);
  if (!lockAcquired) {
    throw new Error(
      `Agent ${agent.name} (${agent.id}) already has an active Copilot session. Concurrent execution blocked.`,
    );
  }

  // 1. Prepare agent workspace (clone repo, read agent.md + skills)
  const workspace = await prepareAgentWorkspace({
    gitRepoUrl: agent.gitRepoUrl,
    gitBranch: agent.gitBranch,
    agentFilePath: agent.agentFilePath,
    skillsPaths: agent.skillsPaths ?? [],
    githubTokenEncrypted: agent.githubTokenEncrypted,
  });

  const toolCalls: Array<{ tool: string; args: unknown }> = [];

  try {
    // 2. Build system message from agent personality + skills
    const skillsContent = workspace.skills.length
      ? `\n\n## Agent Skills\n\n${workspace.skills.join('\n\n---\n\n')}`
      : '';
    const systemContent = `${workspace.agentMarkdown}${skillsContent}`;

    // 3. Create agent tools
    const tools = createAgentTools(credentials, {
      agentId: agent.id,
      workflowId,
      executionId,
    });

    // 4. Initialize Copilot client + session
    const client = new CopilotClient();

    const session = await client.createSession({
      model: process.env.DEFAULT_AGENT_MODEL ?? 'gpt-4.1',
      tools,
      onPermissionRequest: approveAll,
      systemMessage: {
        mode: 'customize',
        sections: {
          code_change_rules: { action: 'remove' },
          guidelines: {
            action: 'append',
            content:
              '\n* You are an autonomous trading agent. Execute tools to gather data and make decisions.\n* Always explain your reasoning before and after tool calls.\n* All outputs are labeled VIRTUAL/SIMULATED.',
          },
        },
        content: systemContent,
      },
    });

    // 5. Track tool calls for reasoning trace
    session.on('tool.execution_start', (event) => {
      toolCalls.push({ tool: event.data?.toolName ?? 'unknown', args: event.data?.arguments });
    });

    // 6. Send prompt and wait for response
    const timeoutMs = (step.timeoutSeconds ?? 300) * 1000;
    const response = await session.sendAndWait({ prompt: resolvedPrompt }, timeoutMs);

    const output = response?.data?.content ?? '[No response from Copilot session]';

    // 7. Clean up session
    await session.disconnect();
    await client.stop();

    // 8. Track quota usage (best-effort)
    try {
      const today = new Date().toISOString().split('T')[0];
      await db
        .insert(agentQuotaUsage)
        .values({
          agentId: agent.id,
          date: today,
          promptTokensUsed: resolvedPrompt.length, // approximate
          completionTokensUsed: output.length, // approximate
          sessionCount: 1,
        })
        .onConflictDoUpdate({
          target: [agentQuotaUsage.agentId, agentQuotaUsage.date],
          set: {
            promptTokensUsed: sql`${agentQuotaUsage.promptTokensUsed} + ${resolvedPrompt.length}`,
            completionTokensUsed: sql`${agentQuotaUsage.completionTokensUsed} + ${output.length}`,
            sessionCount: sql`${agentQuotaUsage.sessionCount} + 1`,
          },
        });
    } catch (quotaErr) {
      logger.warn({ error: quotaErr }, 'Failed to update quota usage');
    }

    return {
      output,
      reasoningTrace: {
        model: process.env.DEFAULT_AGENT_MODEL ?? 'gpt-4.1',
        agentFile: agent.agentFilePath,
        skills: agent.skillsPaths,
        promptTokens: resolvedPrompt.length,
        completionTokens: output.length,
        toolCalls,
      },
    };
  } finally {
    await workspace.cleanup();
    await releaseSessionLock(agent.id);
  }
}
