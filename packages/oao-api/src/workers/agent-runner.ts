/**
 * Agent Runner — Ephemeral K8s pod entry point for executing a single workflow step.
 *
 * Architecture (Jenkins-like):
 *   OAO-Controller creates this pod → pod reads step config from DB →
 *   executes Copilot session → writes results to DB → pod exits.
 *
 * Required environment variables:
 *   STEP_EXECUTION_ID — The step execution record to process
 *   EXECUTION_ID — Parent workflow execution ID
 *   WORKFLOW_ID — Parent workflow ID
 *   AGENT_DATABASE_URL — PostgreSQL connection
 *   REDIS_URL — Redis connection (for session locks)
 *   GITHUB_TOKEN — For Copilot SDK
 */
import { eq, and } from 'drizzle-orm';
import { createLogger, decrypt } from '@oao/shared';
import { db } from '../database/index.js';
import {
  stepExecutions,
  workflowExecutions,
  workflows,
  workflowSteps,
  agents,
  agentVariables,
  userVariables,
  workspaceVariables,
} from '../database/schema.js';
import { executeCopilotSession } from '../services/workflow-engine.js';

const logger = createLogger('agent-runner');

async function run() {
  const stepExecutionId = process.env.STEP_EXECUTION_ID;
  const executionId = process.env.EXECUTION_ID;

  if (!stepExecutionId || !executionId) {
    logger.error('Missing STEP_EXECUTION_ID or EXECUTION_ID environment variable');
    process.exit(1);
  }

  logger.info({ stepExecutionId, executionId }, 'Agent runner starting');

  try {
    // 1. Load step execution record
    const stepExec = await db.query.stepExecutions.findFirst({
      where: eq(stepExecutions.id, stepExecutionId),
    });
    if (!stepExec) throw new Error(`Step execution ${stepExecutionId} not found`);

    // Guard: skip if the step was already marked failed/completed (e.g. parent timed out)
    if (stepExec.status === 'failed' || stepExec.status === 'completed') {
      logger.warn({ stepExecutionId, status: stepExec.status }, 'Step already finished, skipping');
      process.exit(0);
      return;
    }

    // 2. Load parent workflow execution
    const execution = await db.query.workflowExecutions.findFirst({
      where: eq(workflowExecutions.id, executionId),
    });
    if (!execution) throw new Error(`Execution ${executionId} not found`);

    // Guard: skip if parent execution is already done
    if (execution.status === 'failed' || execution.status === 'completed' || execution.status === 'cancelled') {
      logger.warn({ executionId, status: execution.status }, 'Parent execution already finished, skipping');
      process.exit(0);
      return;
    }

    // 3. Load workflow
    const workflow = await db.query.workflows.findFirst({
      where: eq(workflows.id, execution.workflowId),
    });
    if (!workflow) throw new Error(`Workflow ${execution.workflowId} not found`);

    // 4. Load workflow step definition
    const step = await db.query.workflowSteps.findFirst({
      where: eq(workflowSteps.id, stepExec.workflowStepId),
    });
    if (!step) throw new Error(`Workflow step ${stepExec.workflowStepId} not found`);

    // 5. Resolve agent for this step
    const resolvedAgentId = step.agentId || workflow.defaultAgentId;
    if (!resolvedAgentId) throw new Error(`No agent configured for step "${step.name}"`);

    const agent = await db.query.agents.findFirst({
      where: eq(agents.id, resolvedAgentId),
    });
    if (!agent) throw new Error(`Agent ${resolvedAgentId} not found`);

    // 6. Load 3-tier variables: workspace → user → agent
    const workspaceVars = workflow.workspaceId
      ? await db.query.workspaceVariables.findMany({
          where: eq(workspaceVariables.workspaceId, workflow.workspaceId),
        })
      : [];

    const wsCredentialMap = new Map(workspaceVars.filter(v => v.variableType === 'credential').map(c => [c.key, decrypt(c.valueEncrypted)]));
    const wsPropertyMap = new Map(workspaceVars.filter(v => v.variableType === 'property').map(c => [c.key, decrypt(c.valueEncrypted)]));
    const wsEnvVarMap = new Map(workspaceVars.filter(v => v.injectAsEnvVariable).map(c => [c.key, decrypt(c.valueEncrypted)]));

    const userVars = await db.query.userVariables.findMany({
      where: eq(userVariables.userId, workflow.userId),
    });

    const userCredentialMap = new Map([...wsCredentialMap, ...userVars.filter(v => v.variableType === 'credential').map(c => [c.key, decrypt(c.valueEncrypted)] as [string, string])]);
    const userPropertyMap = new Map([...wsPropertyMap, ...userVars.filter(v => v.variableType === 'property').map(c => [c.key, decrypt(c.valueEncrypted)] as [string, string])]);
    const userEnvVarMap = new Map([...wsEnvVarMap, ...userVars.filter(v => v.injectAsEnvVariable).map(c => [c.key, decrypt(c.valueEncrypted)] as [string, string])]);

    const agentVars = await db.query.agentVariables.findMany({
      where: eq(agentVariables.agentId, agent.id),
    });

    const mergedCredentials = new Map(userCredentialMap);
    const mergedProperties = new Map(userPropertyMap);
    const mergedEnvVars = new Map(userEnvVarMap);
    for (const v of agentVars) {
      const decrypted = decrypt(v.valueEncrypted);
      if (v.variableType === 'credential') mergedCredentials.set(v.key, decrypted);
      if (v.variableType === 'property') mergedProperties.set(v.key, decrypted);
      if (v.injectAsEnvVariable) mergedEnvVars.set(v.key, decrypted);
    }

    // 7. Recover precedent output and inputs from trigger metadata
    let precedentOutput = '';
    const meta = execution.triggerMetadata as Record<string, unknown> | null;

    // Extract inputs from trigger metadata (webhook params or manual run inputs)
    const inputs = (meta?.inputs as Record<string, unknown>) ?? {};

    if (stepExec.stepOrder > 1) {
      // Find the previous step's output
      const prevStepExec = await db.query.stepExecutions.findFirst({
        where: and(
          eq(stepExecutions.workflowExecutionId, executionId),
          eq(stepExecutions.stepOrder, stepExec.stepOrder - 1),
        ),
      });
      if (prevStepExec?.output) {
        precedentOutput = prevStepExec.output;
      }
    }

    // 8. Mark step as running
    const startedStep = await db
      .update(stepExecutions)
      .set({ status: 'running', resolvedPrompt: step.promptTemplate, startedAt: new Date() })
      .where(and(eq(stepExecutions.id, stepExecutionId), eq(stepExecutions.status, 'pending')))
      .returning({ id: stepExecutions.id });

    if (startedStep.length === 0) {
      logger.warn({ stepExecutionId }, 'Step could not transition to running, exiting orphaned ephemeral runner');
      process.exit(0);
      return;
    }

    // 9. Execute the Copilot session
    const result = await executeCopilotSession({
      agent,
      step,
      stepExecutionId,
      resolvedPrompt: step.promptTemplate,
      precedentOutput,
      credentials: mergedCredentials,
      properties: mergedProperties,
      envVariables: mergedEnvVars,
      workerRuntime: 'ephemeral',
      inputs,
      workflowId: workflow.id,
      workspaceId: workflow.workspaceId ?? '',
      executionId,
      userId: workflow.userId,
      workflowDefaultModel: workflow.defaultModel,
      workflowDefaultReasoningEffort: workflow.defaultReasoningEffort,
    });

    const latestStepExec = await db.query.stepExecutions.findFirst({
      where: eq(stepExecutions.id, stepExecutionId),
    });
    const latestExecution = await db.query.workflowExecutions.findFirst({
      where: eq(workflowExecutions.id, executionId),
    });

    if (
      latestStepExec?.status === 'failed'
      || latestStepExec?.status === 'skipped'
      || latestExecution?.status === 'failed'
      || latestExecution?.status === 'cancelled'
    ) {
      logger.warn(
        { stepExecutionId, executionId, stepStatus: latestStepExec?.status, executionStatus: latestExecution?.status },
        'Late step result ignored because the step or execution is already terminal',
      );
      process.exit(0);
      return;
    }

    // 10. Write success result to DB (include actual rendered prompt)
    await db
      .update(stepExecutions)
      .set({
        status: 'completed',
        resolvedPrompt: result.resolvedPrompt,
        output: result.output,
        reasoningTrace: result.reasoningTrace,
        completedAt: new Date(),
      })
      .where(eq(stepExecutions.id, stepExecutionId));

    logger.info({ stepExecutionId, agentName: agent.name }, 'Agent runner completed successfully');
    process.exit(0);
  } catch (error) {
    const errorMsg = error instanceof Error ? error.message : 'Unknown error';
    logger.error({ stepExecutionId, error: errorMsg }, 'Agent runner failed');

    // Write failure to DB
    try {
      await db
        .update(stepExecutions)
        .set({ status: 'failed', error: errorMsg, completedAt: new Date() })
        .where(eq(stepExecutions.id, stepExecutionId));
    } catch (dbError) {
      logger.error({ dbError }, 'Failed to write error to database');
    }

    process.exit(1);
  }
}

run();
