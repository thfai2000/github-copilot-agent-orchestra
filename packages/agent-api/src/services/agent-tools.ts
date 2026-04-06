// eslint-disable-next-line @typescript-eslint/ban-ts-comment
// @ts-nocheck — Copilot SDK's Tool/defineTool generics have incompatible Zod type constraints
import { defineTool, type Tool } from '@github/copilot-sdk';
import { z } from 'zod';
import { eq, and, sql } from 'drizzle-orm';
import { createLogger } from '@ai-trader/shared';
import { db } from '../database/index.js';
import { triggers, webhookRegistrations, tradeDecisions, agentMemories } from '../database/schema.js';
import { generateEmbedding } from './embedding-service.js';

const logger = createLogger('agent-tools');

/**
 * Context for tools that interact with the agent's own resources.
 */
export interface AgentToolContext {
  agentId: string;
  workflowId: string;
  executionId?: string;
}

/**
 * Creates the set of **built-in** tools available to agents during Copilot sessions.
 *
 * These tools operate on the agent-orchestra's own database (agent_db).
 * Trading/market-data tools are provided externally via MCP from the Trading Platform.
 *
 * Built-in tools:
 *   - record_trade_decision — Audit trail for trade decisions
 *   - schedule_next_wakeup  — Self-scheduling (cron triggers)
 *   - manage_webhook_trigger — Webhook lifecycle management
 *   - memory_store           — Store semantic memories (pgvector)
 *   - memory_retrieve        — Retrieve memories via similarity search
 */
export function createAgentTools(
  _credentials: Map<string, string>,
  context?: AgentToolContext,
): Tool[] {
  return [
    // ── Self-Scheduling Tools ────────────────────────────────────────

    defineTool('schedule_next_wakeup', {
      description:
        'Schedule the agent to wake up and run again at a future time. Creates or updates a time_schedule trigger for this workflow.',
      parameters: z.object({
        cronExpression: z
          .string()
          .describe('Cron expression for when to run next (e.g. "0 9 * * 1-5" for weekdays at 9am)'),
        reason: z.string().optional().describe('Why this schedule was chosen'),
      }),
      handler: async ({
        cronExpression,
        reason,
      }: {
        cronExpression: string;
        reason?: string;
      }) => {
        if (!context?.workflowId) return { error: 'No workflow context available' };
        logger.info({ cronExpression, workflowId: context.workflowId, reason }, 'Tool: schedule_next_wakeup');

        // Check for existing time_schedule trigger
        const existing = await db.query.triggers.findFirst({
          where: and(
            eq(triggers.workflowId, context.workflowId),
            eq(triggers.triggerType, 'time_schedule'),
          ),
        });

        if (existing) {
          await db
            .update(triggers)
            .set({
              configuration: { cron: cronExpression, reason },
              isActive: true,
            })
            .where(eq(triggers.id, existing.id));
          return { updated: true, triggerId: existing.id, cronExpression, reason };
        }

        const [newTrigger] = await db
          .insert(triggers)
          .values({
            workflowId: context.workflowId,
            triggerType: 'time_schedule',
            configuration: { cron: cronExpression, reason },
            isActive: true,
          })
          .returning({ id: triggers.id });

        return { created: true, triggerId: newTrigger.id, cronExpression, reason };
      },
    }),

    defineTool('manage_webhook_trigger', {
      description:
        'Create, update, or deactivate a webhook trigger for this agent. Webhook triggers allow external systems to invoke agent workflows.',
      parameters: z.object({
        action: z
          .enum(['create', 'deactivate'])
          .describe('Action to perform on the webhook trigger'),
        endpointPath: z
          .string()
          .optional()
          .describe('Custom endpoint path (e.g. "/my-agent/trade-signal"). Required for create.'),
      }),
      handler: async ({
        action,
        endpointPath,
      }: {
        action: 'create' | 'deactivate';
        endpointPath?: string;
      }) => {
        if (!context?.agentId || !context.workflowId)
          return { error: 'No agent context available' };
        logger.info({ action, endpointPath, agentId: context.agentId }, 'Tool: manage_webhook_trigger');

        if (action === 'deactivate') {
          const existing = await db.query.webhookRegistrations.findFirst({
            where: and(
              eq(webhookRegistrations.agentId, context.agentId),
              eq(webhookRegistrations.isActive, true),
            ),
          });
          if (!existing) return { error: 'No active webhook found for this agent' };
          await db
            .update(webhookRegistrations)
            .set({ isActive: false })
            .where(eq(webhookRegistrations.id, existing.id));
          return { deactivated: true, webhookId: existing.id };
        }

        // Create
        if (!endpointPath) return { error: 'endpointPath is required for create action' };

        // Create trigger first
        const [trigger] = await db
          .insert(triggers)
          .values({
            workflowId: context.workflowId,
            triggerType: 'webhook',
            configuration: { endpointPath },
            isActive: true,
          })
          .returning({ id: triggers.id });

        // Generate a simple HMAC secret
        const hmacSecret = crypto.randomUUID() + crypto.randomUUID();
        const { encrypt } = await import('@ai-trader/shared');
        const hmacSecretEncrypted = encrypt(hmacSecret);

        const [webhook] = await db
          .insert(webhookRegistrations)
          .values({
            agentId: context.agentId,
            triggerId: trigger.id,
            endpointPath,
            hmacSecretEncrypted,
            isActive: true,
          })
          .returning({ id: webhookRegistrations.id });

        return {
          created: true,
          webhookId: webhook.id,
          triggerId: trigger.id,
          endpointPath,
          hmacSecret, // returned once for the caller to configure
        };
      },
    }),

    // ── Decision Audit Trail ─────────────────────────────────────────

    defineTool('record_trade_decision', {
      description:
        'Record a full trade decision with reasoning, signals, confidence level, and outcome. Creates an audit trail for post-analysis.',
      parameters: z.object({
        symbol: z.string().describe('Stock symbol'),
        side: z.enum(['buy', 'sell', 'hold']).describe('Decision direction'),
        quantity: z.number().int().min(0).describe('Planned quantity (0 for hold)'),
        confidence: z.number().min(0).max(1).describe('Confidence level (0-1)'),
        signals: z
          .array(z.string())
          .describe('List of signals that led to this decision'),
        reasoning: z.string().describe('Full reasoning text'),
        riskAssessment: z.string().optional().describe('Risk assessment summary'),
        outcome: z
          .enum(['executed', 'rejected', 'skipped'])
          .optional()
          .describe('What happened with this decision'),
        tradeId: z.string().optional().describe('Trade ID if executed'),
      }),
      handler: async ({
        symbol,
        side,
        quantity,
        confidence,
        signals,
        reasoning,
        riskAssessment,
        outcome,
        tradeId,
      }: {
        symbol: string;
        side: 'buy' | 'sell' | 'hold';
        quantity: number;
        confidence: number;
        signals: string[];
        reasoning: string;
        riskAssessment?: string;
        outcome?: string;
        tradeId?: string;
      }) => {
        if (!context?.agentId) return { error: 'No agent context available' };
        logger.info({ symbol, side, quantity, confidence, agentId: context.agentId }, 'Tool: record_trade_decision');

        const [decision] = await db
          .insert(tradeDecisions)
          .values({
            agentId: context.agentId,
            executionId: context.executionId,
            symbol,
            side,
            quantity,
            decision: { confidence, signals, reasoning, riskAssessment },
            outcome: outcome ?? null,
            tradeId: tradeId ?? null,
          })
          .returning({ id: tradeDecisions.id, createdAt: tradeDecisions.createdAt });

        return {
          recorded: true,
          decisionId: decision.id,
          createdAt: decision.createdAt,
          symbol,
          side,
          quantity,
          confidence,
        };
      },
    }),

    // ── Vector Memory Tools ──────────────────────────────────────────

    defineTool('memory_store', {
      description:
        'Store a memory with semantic embedding for later retrieval. Use this to remember important trade scenarios, market insights, strategy notes, or lessons learned.',
      parameters: z.object({
        content: z.string().describe('The memory content to store (e.g. market observation, trade reasoning)'),
        memoryType: z
          .enum(['trade_scenario', 'market_insight', 'strategy_note', 'lesson_learned', 'general'])
          .default('general')
          .describe('Type of memory'),
        tags: z.array(z.string()).optional().describe('Tags for filtering (e.g. ["AAPL", "bearish", "earnings"])'),
        metadata: z.record(z.unknown()).optional().describe('Additional structured data'),
      }),
      handler: async ({
        content,
        memoryType,
        tags,
        metadata,
      }: {
        content: string;
        memoryType: 'trade_scenario' | 'market_insight' | 'strategy_note' | 'lesson_learned' | 'general';
        tags?: string[];
        metadata?: Record<string, unknown>;
      }) => {
        if (!context?.agentId) return { error: 'No agent context available' };
        logger.info({ agentId: context.agentId, memoryType, tags }, 'Tool: memory_store');

        // Generate embedding for semantic search
        const embedding = await generateEmbedding(content);

        const [memory] = await db
          .insert(agentMemories)
          .values({
            agentId: context.agentId,
            content,
            memoryType,
            tags: tags ?? [],
            metadata: metadata ?? null,
            embedding,
          })
          .returning({ id: agentMemories.id, createdAt: agentMemories.createdAt });

        return {
          stored: true,
          memoryId: memory.id,
          memoryType,
          tags: tags ?? [],
          createdAt: memory.createdAt,
        };
      },
    }),

    defineTool('memory_retrieve', {
      description:
        'Retrieve relevant memories using semantic search. Finds memories similar to the query using vector similarity. Use this to recall past trade scenarios, market conditions, or learned strategies.',
      parameters: z.object({
        query: z.string().describe('Search query describing what you want to remember (e.g. "bearish AAPL earnings miss")'),
        memoryType: z
          .enum(['trade_scenario', 'market_insight', 'strategy_note', 'lesson_learned', 'general'])
          .optional()
          .describe('Filter by memory type'),
        tags: z.array(z.string()).optional().describe('Filter by tags (matches any)'),
        limit: z.number().min(1).max(20).default(5).describe('Number of memories to retrieve'),
      }),
      skipPermission: true,
      handler: async ({
        query,
        memoryType,
        tags,
        limit,
      }: {
        query: string;
        memoryType?: string;
        tags?: string[];
        limit: number;
      }) => {
        if (!context?.agentId) return { error: 'No agent context available' };
        logger.info({ agentId: context.agentId, query, memoryType, tags, limit }, 'Tool: memory_retrieve');

        // Generate query embedding for similarity search
        const queryEmbedding = await generateEmbedding(query);
        const embeddingStr = `[${queryEmbedding.join(',')}]`;

        // Build pgvector cosine distance query with parameterized conditions
        let baseQuery = sql`
          SELECT
            id,
            content,
            memory_type,
            tags,
            metadata,
            created_at,
            1 - (embedding <=> ${embeddingStr}::vector) AS similarity
          FROM agent_memories
          WHERE agent_id = ${context.agentId}
            AND embedding IS NOT NULL
        `;

        if (memoryType) {
          baseQuery = sql`${baseQuery} AND memory_type = ${memoryType}`;
        }

        if (tags && tags.length > 0) {
          baseQuery = sql`${baseQuery} AND tags && ${tags}::varchar[]`;
        }

        baseQuery = sql`${baseQuery} ORDER BY embedding <=> ${embeddingStr}::vector LIMIT ${limit}`;

        const results = await db.execute(baseQuery);

        const memories = (results.rows ?? results) as Array<{
          id: string;
          content: string;
          memory_type: string;
          tags: string[];
          metadata: unknown;
          created_at: string;
          similarity: number;
        }>;

        return {
          query,
          count: memories.length,
          memories: memories.map((m) => ({
            id: m.id,
            content: m.content,
            memoryType: m.memory_type,
            tags: m.tags,
            metadata: m.metadata,
            similarity: Number(Number(m.similarity).toFixed(4)),
            createdAt: m.created_at,
          })),
        };
      },
    }),
  ];
}
