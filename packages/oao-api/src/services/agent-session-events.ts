/**
 * Helpers for publishing the unified `agent.*` realtime event family in
 * addition to the legacy context-specific events (`step.*` / `conversation.*`).
 *
 * Frontend code may subscribe to either family. New shared UI components
 * subscribe to `agent.*` so they don't have to know whether the underlying
 * Copilot session belongs to a conversation or a workflow step.
 */

import { publishRealtimeEvent } from './realtime-bus.js';

export type AgentSessionContextType = 'conversation' | 'workflow_step';

export interface AgentSessionScope {
  contextType: AgentSessionContextType;
  /** conversationId for conversations, stepExecutionId for workflow steps. */
  contextId: string;
  /** conversationId or workflowExecutionId — used by the frontend to filter SSE. */
  parentId?: string;
  workspaceId?: string;
  /** workflow execution id (only set for workflow_step). */
  executionId?: string;
  /** conversation id alias (only set for conversation). */
  conversationId?: string;
  /** workflow id (only set for workflow_step). */
  workflowId?: string;
  /** assistant message id (only set for conversation messages). */
  messageId?: string;
  /** step order (1-based, only set for workflow_step). */
  stepOrder?: number;
}

type AgentEventKind =
  | 'turn.started'
  | 'turn.completed'
  | 'message.started'
  | 'message.delta'
  | 'message.reasoning_delta'
  | 'message.completed'
  | 'message.failed'
  | 'tool.execution_start'
  | 'tool.execution_complete'
  | 'tool.ask_questions'
  | 'tool.ask_questions_resolved';

/**
 * Publish a single `agent.<kind>` event. Caller is responsible for ALSO
 * publishing the legacy event (we keep them parallel for back-compat).
 */
export async function publishAgentSessionEvent(
  scope: AgentSessionScope,
  kind: AgentEventKind,
  data: Record<string, unknown> = {},
): Promise<void> {
  await publishRealtimeEvent({
    type: `agent.${kind}` as never,
    workspaceId: scope.workspaceId,
    executionId: scope.executionId,
    workflowId: scope.workflowId,
    conversationId: scope.conversationId,
    messageId: scope.messageId,
    stepExecutionId: scope.contextType === 'workflow_step' ? scope.contextId : undefined,
    stepOrder: scope.stepOrder,
    timestamp: new Date().toISOString(),
    data: {
      contextType: scope.contextType,
      contextId: scope.contextId,
      parentId: scope.parentId,
      ...data,
    },
  });
}

/** Build a scope object for a workflow step. */
export function workflowStepScope(params: {
  stepExecutionId: string;
  workflowExecutionId: string;
  workflowId?: string;
  workspaceId?: string;
  stepOrder?: number;
}): AgentSessionScope {
  return {
    contextType: 'workflow_step',
    contextId: params.stepExecutionId,
    parentId: params.workflowExecutionId,
    workspaceId: params.workspaceId,
    executionId: params.workflowExecutionId,
    workflowId: params.workflowId,
    stepOrder: params.stepOrder,
  };
}

/** Build a scope object for a conversation message. */
export function conversationScope(params: {
  conversationId: string;
  messageId?: string;
  workspaceId?: string;
}): AgentSessionScope {
  return {
    contextType: 'conversation',
    contextId: params.conversationId,
    parentId: params.conversationId,
    workspaceId: params.workspaceId,
    conversationId: params.conversationId,
    messageId: params.messageId,
  };
}
