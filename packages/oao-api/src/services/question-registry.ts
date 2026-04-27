/**
 * In-memory registry that tracks pending `ask_questions` tool calls.
 *
 * When an agent (running inside a conversation Copilot session) calls the
 * builtin `ask_questions` tool, the tool handler:
 *   1. Registers a pending entry here keyed by the conversation ID + askId.
 *   2. Publishes a `conversation.tool.ask_questions` realtime event.
 *   3. Awaits the registered promise.
 *
 * The HTTP route POST `/api/conversations/:id/answer-questions` receives the
 * user's answers and calls `resolveQuestion()` to resolve the awaiting promise
 * so the agent's session can continue.
 *
 * Registry entries are scoped to a single API process. Conversations always
 * execute synchronously inside the API pod (see `routes/conversations.ts`),
 * so an in-memory map is sufficient. If conversation execution is ever moved
 * to a worker pool this should be promoted to Redis pub/sub.
 */

export type AskAnswers = Record<string, string | string[] | { value: string | string[]; other?: string }>;

interface PendingAsk {
  resolve: (answers: AskAnswers) => void;
  reject: (reason: Error) => void;
  timer: NodeJS.Timeout;
}

const pending = new Map<string, PendingAsk>();

function key(conversationId: string, askId: string): string {
  return `${conversationId}:${askId}`;
}

export function registerQuestion(
  conversationId: string,
  askId: string,
  timeoutMs: number,
): Promise<AskAnswers> {
  const k = key(conversationId, askId);
  return new Promise<AskAnswers>((resolve, reject) => {
    const timer = setTimeout(() => {
      if (pending.delete(k)) {
        reject(new Error(`ask_questions timed out after ${Math.round(timeoutMs / 1000)}s without a user answer.`));
      }
    }, timeoutMs);
    pending.set(k, { resolve, reject, timer });
  });
}

export function resolveQuestion(
  conversationId: string,
  askId: string,
  answers: AskAnswers,
): boolean {
  const k = key(conversationId, askId);
  const entry = pending.get(k);
  if (!entry) return false;
  clearTimeout(entry.timer);
  pending.delete(k);
  entry.resolve(answers);
  return true;
}

export function rejectQuestion(
  conversationId: string,
  askId: string,
  reason: string,
): boolean {
  const k = key(conversationId, askId);
  const entry = pending.get(k);
  if (!entry) return false;
  clearTimeout(entry.timer);
  pending.delete(k);
  entry.reject(new Error(reason));
  return true;
}

export function hasPendingQuestion(conversationId: string, askId: string): boolean {
  return pending.has(key(conversationId, askId));
}

/** For tests only — drop every pending entry. */
export function __resetQuestionRegistry(): void {
  for (const entry of pending.values()) {
    clearTimeout(entry.timer);
  }
  pending.clear();
}
