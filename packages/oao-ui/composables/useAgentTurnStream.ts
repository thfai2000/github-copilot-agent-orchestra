/**
 * Unified composable for an "Agent Session Turn" — a single send-and-wait
 * interaction with a Copilot session. Powers both the conversation page and
 * the workflow-execution step view.
 *
 * Subscribes to the appropriate SSE endpoint based on the context type and
 * filters incoming `agent.*` events by `contextId`. Maintains in-memory turn
 * state (content, reasoning, activity, pending ask_questions).
 *
 * Use the lower-level useConversationStream / useExecutionStream composables
 * directly if you need the full event firehose; this is for shared turn UI.
 */

import type { Ref } from 'vue';

export type AgentTurnContextType = 'conversation' | 'workflow_step';

export interface AgentTurnScope {
  contextType: AgentTurnContextType;
  /** conversationId for conversation, stepExecutionId for workflow_step. */
  contextId: string;
  /** conversationId or workflowExecutionId — used to open the SSE stream. */
  parentId: string;
}

export interface AgentTurnToolActivity {
  toolName: string;
  startedAt: string;
  completedAt?: string;
  success?: boolean;
  arguments?: unknown;
}

export interface AgentTurnPendingAsk {
  askId: string;
  introduction: string | null;
  questions: Array<{
    id: string;
    prompt: string;
    type: 'single_choice' | 'multi_choice' | 'free_text';
    options?: string[];
    allowOther?: boolean;
    required?: boolean;
  }>;
  receivedAt: string;
  resolved?: boolean;
}

export interface AgentTurnState {
  content: string;
  reasoning: string;
  activity: AgentTurnToolActivity[];
  pendingAsks: AgentTurnPendingAsk[];
  status: 'idle' | 'running' | 'awaiting_input' | 'completed' | 'failed';
  error?: string;
}

function emptyState(): AgentTurnState {
  return { content: '', reasoning: '', activity: [], pendingAsks: [], status: 'idle' };
}

export function useAgentTurnStream(scope: Ref<AgentTurnScope | null>) {
  const { authHeaders } = useAuth();

  const state = reactive<AgentTurnState>(emptyState());
  const connected = ref(false);
  let eventSource: EventSource | null = null;
  let reconnectTimer: ReturnType<typeof setTimeout> | null = null;

  function reset() {
    state.content = '';
    state.reasoning = '';
    state.activity = [];
    state.pendingAsks = [];
    state.status = 'idle';
    state.error = undefined;
  }

  function streamUrl(s: AgentTurnScope, token: string): string {
    if (s.contextType === 'conversation') {
      return `/api/conversations/${s.parentId}/stream?token=${encodeURIComponent(token)}`;
    }
    return `/api/executions/${s.parentId}/stream?token=${encodeURIComponent(token)}`;
  }

  // Filter incoming events to this scope's contextId.
  function matchesScope(payload: any, s: AgentTurnScope): boolean {
    const data = payload?.data || {};
    if (data.contextType && data.contextId) {
      return data.contextType === s.contextType && data.contextId === s.contextId;
    }
    // Fallback for legacy events without contextType: match by stepExecutionId / messageId.
    if (s.contextType === 'workflow_step') {
      return payload?.stepExecutionId === s.contextId;
    }
    return payload?.conversationId === s.contextId;
  }

  function handleEvent(type: string, payload: any) {
    const s = scope.value;
    if (!s) return;
    if (!matchesScope(payload, s)) return;
    const data = payload?.data || {};
    switch (type) {
      case 'agent.turn.started':
      case 'agent.message.started':
        state.status = 'running';
        return;
      case 'agent.message.delta':
        if (typeof data.delta === 'string') state.content += data.delta;
        return;
      case 'agent.message.reasoning_delta':
        if (typeof data.delta === 'string') state.reasoning += data.delta;
        return;
      case 'agent.tool.execution_start':
        state.activity.push({
          toolName: String(data.toolName ?? 'unknown'),
          startedAt: payload?.timestamp ?? new Date().toISOString(),
          arguments: data.arguments,
        });
        return;
      case 'agent.tool.execution_complete': {
        // Mark the most recent in-flight entry for this tool as complete.
        for (let i = state.activity.length - 1; i >= 0; i--) {
          if (!state.activity[i].completedAt) {
            state.activity[i].completedAt = payload?.timestamp ?? new Date().toISOString();
            state.activity[i].success = data.success !== false;
            break;
          }
        }
        return;
      }
      case 'agent.tool.ask_questions': {
        const askId = String(data.askId);
        if (state.pendingAsks.some((a) => a.askId === askId)) return;
        state.pendingAsks.push({
          askId,
          introduction: data.introduction ?? null,
          questions: data.questions ?? [],
          receivedAt: payload?.timestamp ?? new Date().toISOString(),
        });
        if (s.contextType === 'workflow_step') state.status = 'awaiting_input';
        return;
      }
      case 'agent.tool.ask_questions_resolved': {
        const askId = String(data.askId);
        state.pendingAsks = state.pendingAsks.filter((a) => a.askId !== askId);
        if (s.contextType === 'workflow_step' && state.pendingAsks.length === 0) {
          state.status = 'running';
        }
        return;
      }
      case 'agent.turn.completed':
      case 'agent.message.completed':
        state.status = 'completed';
        if (typeof data.content === 'string' && data.content) state.content = data.content;
        return;
      case 'agent.message.failed':
        state.status = 'failed';
        state.error = String(data.error ?? 'Unknown error');
        return;
    }
  }

  async function submitAnswers(askId: string, answers: Record<string, unknown>): Promise<void> {
    const s = scope.value;
    if (!s) throw new Error('No agent turn scope');
    await $fetch('/api/agent-sessions/answer', {
      method: 'POST',
      headers: authHeaders(),
      body: {
        contextType: s.contextType,
        contextId: s.contextId,
        askId,
        answers,
      },
    });
  }

  function connect() {
    disconnect();
    if (typeof EventSource === 'undefined') return;
    const s = scope.value;
    if (!s) return;
    const headers = authHeaders();
    const token = headers.Authorization?.replace('Bearer ', '') || '';
    if (!token) return;

    eventSource = new EventSource(streamUrl(s, token));
    eventSource.addEventListener('connected', () => { connected.value = true; });

    const types = [
      'agent.turn.started', 'agent.turn.completed',
      'agent.message.started', 'agent.message.delta', 'agent.message.reasoning_delta',
      'agent.message.completed', 'agent.message.failed',
      'agent.tool.execution_start', 'agent.tool.execution_complete',
      'agent.tool.ask_questions', 'agent.tool.ask_questions_resolved',
    ];
    for (const type of types) {
      eventSource.addEventListener(type, (event: MessageEvent) => {
        try {
          handleEvent(type, JSON.parse(event.data));
        } catch { /* ignore malformed payloads */ }
      });
    }

    eventSource.onerror = () => {
      connected.value = false;
      eventSource?.close();
      eventSource = null;
      reconnectTimer = setTimeout(() => connect(), 3000);
    };
  }

  function disconnect() {
    if (reconnectTimer) { clearTimeout(reconnectTimer); reconnectTimer = null; }
    if (eventSource) { eventSource.close(); eventSource = null; }
    connected.value = false;
  }

  watch(scope, (s) => {
    reset();
    if (s) connect();
    else disconnect();
  }, { immediate: true });

  onUnmounted(() => { disconnect(); });

  return { state, connected, submitAnswers, reset, connect, disconnect };
}
