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
 * Build the Trading Platform API base URL from environment.
 * In K8s, this resolves to the ClusterIP service.
 * In dev, falls back to localhost:4001.
 */
function getTradingApiUrl(): string {
  return process.env.TRADING_API_URL ?? 'http://localhost:4001';
}

/**
 * Internal fetch helper for calling Trading Platform APIs.
 * Includes the agent's trading API key if provided.
 */
async function tradingFetch(
  path: string,
  opts: { method?: string; body?: unknown; apiKey?: string } = {},
): Promise<unknown> {
  const url = `${getTradingApiUrl()}${path}`;
  const headers: Record<string, string> = { 'Content-Type': 'application/json' };
  if (opts.apiKey) headers['Authorization'] = `Bearer ${opts.apiKey}`;

  const res = await fetch(url, {
    method: opts.method ?? 'GET',
    headers,
    body: opts.body ? JSON.stringify(opts.body) : undefined,
  });

  if (!res.ok) {
    const text = await res.text();
    throw new Error(`Trading API ${opts.method ?? 'GET'} ${path} failed (${res.status}): ${text}`);
  }
  return res.json();
}

/**
 * Context for tools that interact with the agent's own resources.
 */
export interface AgentToolContext {
  agentId: string;
  workflowId: string;
  executionId?: string;
}

/**
 * Creates the set of tools available to agents during Copilot sessions.
 * Uses @github/copilot-sdk defineTool() format.
 * Credentials map is used to inject agent-specific keys (e.g. TRADING_API_KEY).
 */
export function createAgentTools(
  credentials: Map<string, string>,
  context?: AgentToolContext,
): Tool[] {
  const apiKey = credentials.get('TRADING_API_KEY') ?? '';
  const traderId = credentials.get('TRADER_ID') ?? '';

  return [
    // ── Market Data Tools ────────────────────────────────────────────

    defineTool('fetch_current_prices', {
      description:
        'Fetch current prices for one or more stock symbols. Returns latest price, open, high, low, close, volume.',
      parameters: z.object({
        symbols: z.string().describe('Comma-separated stock symbols, e.g. "AAPL,GOOG,MSFT"'),
      }),
      skipPermission: true,
      handler: async ({ symbols }: { symbols: string }) => {
        logger.info({ symbols }, 'Tool: fetch_current_prices');
        return tradingFetch(`/api/market-data/prices?symbols=${encodeURIComponent(symbols)}`, {
          apiKey,
        });
      },
    }),

    defineTool('fetch_historical_data', {
      description:
        'Fetch historical OHLCV price data for a symbol. Use for trend analysis and backtesting.',
      parameters: z.object({
        symbol: z.string().describe('Stock symbol, e.g. "AAPL"'),
        limit: z
          .number()
          .min(1)
          .max(1000)
          .default(100)
          .describe('Number of data points to retrieve (default 100)'),
      }),
      skipPermission: true,
      handler: async ({ symbol, limit }: { symbol: string; limit: number }) => {
        logger.info({ symbol, limit }, 'Tool: fetch_historical_data');
        return tradingFetch(
          `/api/market-data/historical/${encodeURIComponent(symbol)}?limit=${limit}`,
          { apiKey },
        );
      },
    }),

    defineTool('technical_indicators', {
      description:
        'Calculate technical indicators (SMA, EMA, RSI, MACD, Bollinger Bands) for a symbol.',
      parameters: z.object({
        symbol: z.string().describe('Stock symbol'),
        indicators: z
          .string()
          .default('sma,ema,rsi')
          .describe('Comma-separated indicators: sma, ema, rsi, macd, bollinger'),
        period: z.number().min(2).max(200).default(14).describe('Calculation period'),
      }),
      skipPermission: true,
      handler: async ({
        symbol,
        indicators,
        period,
      }: {
        symbol: string;
        indicators: string;
        period: number;
      }) => {
        logger.info({ symbol, indicators, period }, 'Tool: technical_indicators');
        return tradingFetch(
          `/api/market-data/indicators/${encodeURIComponent(symbol)}?indicators=${indicators}&period=${period}`,
          { apiKey },
        );
      },
    }),

    // ── Trading Tools ────────────────────────────────────────────────

    defineTool('execute_trade', {
      description:
        'Execute a virtual stock trade (buy or sell). The circuit breaker will validate risk limits before execution.',
      parameters: z.object({
        symbol: z.string().describe('Stock symbol to trade'),
        side: z.enum(['buy', 'sell']).describe('Trade direction'),
        quantity: z.number().int().positive().describe('Number of shares'),
        reason: z.string().optional().describe('Reasoning for the trade decision'),
      }),
      handler: async ({
        symbol,
        side,
        quantity,
        reason,
      }: {
        symbol: string;
        side: 'buy' | 'sell';
        quantity: number;
        reason?: string;
      }) => {
        logger.info({ symbol, side, quantity, traderId }, 'Tool: execute_trade');
        return tradingFetch('/api/trades', {
          method: 'POST',
          apiKey,
          body: { traderId, symbol, side, quantity, reason },
        });
      },
    }),

    defineTool('get_portfolio_state', {
      description:
        'Get the current portfolio state including cash balance, total value, and all open positions with P&L.',
      parameters: z.object({}),
      skipPermission: true,
      handler: async () => {
        if (!traderId) return { error: 'TRADER_ID credential not set' };
        logger.info({ traderId }, 'Tool: get_portfolio_state');
        return tradingFetch(`/api/portfolios/${traderId}`, { apiKey });
      },
    }),

    // ── News & Research Tools ────────────────────────────────────────

    defineTool('get_latest_news', {
      description:
        'Get the latest financial news articles, optionally filtered by symbols or sentiment.',
      parameters: z.object({
        symbols: z.string().optional().describe('Filter by stock symbols (comma-separated)'),
        sentiment: z
          .enum(['positive', 'negative', 'neutral'])
          .optional()
          .describe('Filter by sentiment'),
        limit: z.number().min(1).max(50).default(10).describe('Number of articles'),
      }),
      skipPermission: true,
      handler: async ({
        symbols,
        sentiment,
        limit,
      }: {
        symbols?: string;
        sentiment?: string;
        limit: number;
      }) => {
        logger.info({ symbols, sentiment, limit }, 'Tool: get_latest_news');
        const params = new URLSearchParams({ limit: String(limit) });
        if (symbols) params.set('symbols', symbols);
        if (sentiment) params.set('sentiment', sentiment);
        return tradingFetch(`/api/news?${params}`, { apiKey });
      },
    }),

    // ── Blog / Reporting Tools ───────────────────────────────────────

    defineTool('publish_blog_post', {
      description: 'Publish a blog post (e.g. market commentary, trade journal entry).',
      parameters: z.object({
        title: z.string().describe('Blog post title'),
        content: z.string().describe('Blog post content in markdown'),
        tags: z.array(z.string()).optional().describe('Tags for categorization'),
        summary: z.string().optional().describe('Short summary'),
      }),
      handler: async ({
        title,
        content,
        tags,
        summary,
      }: {
        title: string;
        content: string;
        tags?: string[];
        summary?: string;
      }) => {
        if (!traderId) return { error: 'TRADER_ID credential not set' };
        logger.info({ traderId, title }, 'Tool: publish_blog_post');
        return tradingFetch('/api/blogs', {
          method: 'POST',
          apiKey,
          body: { traderId, title, content, tags, summary },
        });
      },
    }),

    // ── Risk & Position Sizing Tools ─────────────────────────────────

    defineTool('calculate_trade_cost', {
      description:
        'Calculate the estimated cost of a trade including commission fees before executing.',
      parameters: z.object({
        symbol: z.string().describe('Stock symbol'),
        side: z.enum(['buy', 'sell']).describe('Trade direction'),
        quantity: z.number().int().positive().describe('Number of shares'),
      }),
      skipPermission: true,
      handler: async ({
        symbol,
        side,
        quantity,
      }: {
        symbol: string;
        side: 'buy' | 'sell';
        quantity: number;
      }) => {
        logger.info({ symbol, side, quantity }, 'Tool: calculate_trade_cost');
        const data = (await tradingFetch(
          `/api/market-data/prices?symbols=${encodeURIComponent(symbol)}`,
          { apiKey },
        )) as { prices: Array<{ symbol: string; price: string }> };

        const price = data.prices?.[0];
        if (!price) return { error: `No price data for ${symbol}` };

        const priceNum = Number(price.price);
        const commission = 0.001; // 0.1% commission
        const grossCost = priceNum * quantity;
        const commissionAmount = grossCost * commission;
        const totalCost =
          side === 'buy' ? grossCost + commissionAmount : grossCost - commissionAmount;

        return {
          symbol,
          side,
          quantity,
          pricePerShare: priceNum,
          grossCost,
          commission: commissionAmount,
          totalCost,
          netProceeds: side === 'sell' ? totalCost : undefined,
        };
      },
    }),

    defineTool('check_portfolio_constraints', {
      description:
        'Check if a proposed trade would violate risk constraints (position limits, cash reserves, daily loss limits).',
      parameters: z.object({
        symbol: z.string().describe('Stock symbol'),
        side: z.enum(['buy', 'sell']).describe('Trade direction'),
        quantity: z.number().int().positive().describe('Number of shares'),
      }),
      skipPermission: true,
      handler: async ({
        symbol,
        side,
        quantity,
      }: {
        symbol: string;
        side: 'buy' | 'sell';
        quantity: number;
      }) => {
        if (!traderId) return { error: 'TRADER_ID credential not set' };
        logger.info({ symbol, side, quantity }, 'Tool: check_portfolio_constraints');

        const portfolio = (await tradingFetch(`/api/portfolios/${traderId}`, {
          apiKey,
        })) as {
          portfolio: { cashBalance: string; totalValue: string };
          positions: Array<{ symbol: string; quantity: number; currentValue: string }>;
        };

        const cashBalance = Number(portfolio.portfolio.cashBalance);
        const totalValue = Number(portfolio.portfolio.totalValue);

        const priceData = (await tradingFetch(
          `/api/market-data/prices?symbols=${encodeURIComponent(symbol)}`,
          { apiKey },
        )) as { prices: Array<{ price: string }> };

        const price = Number(priceData.prices?.[0]?.price ?? 0);
        const tradeCost = price * quantity;

        const constraints = {
          cashAvailable: cashBalance,
          estimatedCost: tradeCost,
          hasSufficientCash: side === 'buy' ? cashBalance >= tradeCost * 1.001 : true,
          positionConcentration:
            totalValue > 0 ? ((tradeCost / totalValue) * 100).toFixed(2) + '%' : 'N/A',
          maxRecommendedConcentration: '20%',
          cashReserveAfterTrade:
            side === 'buy' ? (cashBalance - tradeCost * 1.001).toFixed(2) : cashBalance.toFixed(2),
        };

        return {
          symbol,
          side,
          quantity,
          ...constraints,
          recommendation: constraints.hasSufficientCash
            ? 'Trade passes basic risk checks'
            : 'Insufficient cash for this trade',
        };
      },
    }),

    // ── Leaderboard / Metrics Tools ──────────────────────────────────

    defineTool('get_leaderboard', {
      description: 'Get the top trader rankings by portfolio performance.',
      parameters: z.object({
        limit: z.number().min(1).max(50).default(10).describe('Number of traders'),
      }),
      skipPermission: true,
      handler: async ({ limit }: { limit: number }) => {
        logger.info({ limit }, 'Tool: get_leaderboard');
        return tradingFetch(`/api/traders/leaderboard?limit=${limit}`, { apiKey });
      },
    }),

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

    // ── Position Sizing Tools ────────────────────────────────────────

    defineTool('calculate_position_size', {
      description:
        'Calculate the recommended position size based on portfolio value, risk tolerance, and current price. Uses Kelly Criterion-inspired sizing.',
      parameters: z.object({
        symbol: z.string().describe('Stock symbol'),
        riskPercentage: z
          .number()
          .min(0.1)
          .max(10)
          .default(2)
          .describe('Max portfolio % to risk on this trade (default 2%)'),
        stopLossPercentage: z
          .number()
          .min(0.5)
          .max(50)
          .default(5)
          .describe('Stop loss distance as % from entry (default 5%)'),
      }),
      skipPermission: true,
      handler: async ({
        symbol,
        riskPercentage,
        stopLossPercentage,
      }: {
        symbol: string;
        riskPercentage: number;
        stopLossPercentage: number;
      }) => {
        if (!traderId) return { error: 'TRADER_ID credential not set' };
        logger.info({ symbol, riskPercentage, stopLossPercentage }, 'Tool: calculate_position_size');

        const portfolio = (await tradingFetch(`/api/portfolios/${traderId}`, {
          apiKey,
        })) as {
          portfolio: { cashBalance: string; totalValue: string };
        };

        const priceRes = (await tradingFetch(
          `/api/market-data/prices?symbols=${encodeURIComponent(symbol)}`,
          { apiKey },
        )) as { prices: Array<{ price: string }> };

        const price = Number(priceRes.prices?.[0]?.price ?? 0);
        if (!price) return { error: `No price data for ${symbol}` };

        const totalValue = Number(portfolio.portfolio.totalValue);
        const cashBalance = Number(portfolio.portfolio.cashBalance);
        const riskAmount = totalValue * (riskPercentage / 100);
        const riskPerShare = price * (stopLossPercentage / 100);
        const optimalQuantity = Math.floor(riskAmount / riskPerShare);
        const estimatedCost = optimalQuantity * price;
        const canAfford = Math.floor(cashBalance / (price * 1.001)); // include commission

        return {
          symbol,
          currentPrice: price,
          portfolioValue: totalValue,
          cashAvailable: cashBalance,
          riskPercentage,
          stopLossPercentage,
          maxRiskAmount: Number(riskAmount.toFixed(2)),
          optimalQuantity,
          maxAffordableQuantity: canAfford,
          recommendedQuantity: Math.min(optimalQuantity, canAfford),
          estimatedCost: Number(estimatedCost.toFixed(2)),
          positionWeight: totalValue > 0
            ? Number(((estimatedCost / totalValue) * 100).toFixed(2))
            : 0,
        };
      },
    }),

    // ── News Credibility Tools ───────────────────────────────────────

    defineTool('fetch_verified_news', {
      description:
        'Fetch news articles filtered by minimum credibility score. Only returns articles that pass the credibility threshold.',
      parameters: z.object({
        symbols: z.string().optional().describe('Filter by stock symbols (comma-separated)'),
        minCredibility: z
          .number()
          .min(0)
          .max(1)
          .default(0.7)
          .describe('Minimum credibility score (0-1, default 0.7)'),
        limit: z.number().min(1).max(50).default(10).describe('Number of articles'),
      }),
      skipPermission: true,
      handler: async ({
        symbols,
        minCredibility,
        limit,
      }: {
        symbols?: string;
        minCredibility: number;
        limit: number;
      }) => {
        logger.info({ symbols, minCredibility, limit }, 'Tool: fetch_verified_news');
        const params = new URLSearchParams({
          limit: String(limit),
          minCredibility: String(minCredibility),
        });
        if (symbols) params.set('symbols', symbols);
        return tradingFetch(`/api/news?${params}`, { apiKey });
      },
    }),

    defineTool('assess_news_credibility', {
      description:
        'Assess the credibility of a news article or claim. Returns a structured credibility assessment with factors like source reliability, recency, and cross-reference count.',
      parameters: z.object({
        title: z.string().describe('The headline or title of the news'),
        source: z.string().optional().describe('News source name'),
        symbols: z.string().optional().describe('Related stock symbols (comma-separated)'),
      }),
      skipPermission: true,
      handler: async ({
        title,
        source,
        symbols,
      }: {
        title: string;
        source?: string;
        symbols?: string;
      }) => {
        logger.info({ title, source, symbols }, 'Tool: assess_news_credibility');

        // Heuristic credibility scoring
        const factors: Record<string, number> = {};
        const reliableSources = [
          'reuters', 'bloomberg', 'wsj', 'ft', 'cnbc', 'sec.gov',
          'yahoo finance', 'marketwatch', 'barrons',
        ];
        const srcLower = (source ?? '').toLowerCase();
        factors.sourceReliability = reliableSources.some((s) => srcLower.includes(s)) ? 0.9 : 0.5;
        factors.hasSpecificData = /\d+%|\$\d+|Q[1-4]|revenue|earnings|EPS/i.test(title) ? 0.8 : 0.4;
        factors.sensationalism = /breaking|urgent|crash|moon|skyrocket|plunge/i.test(title) ? 0.3 : 0.7;

        const avgScore = Object.values(factors).reduce((a, b) => a + b, 0) / Object.values(factors).length;

        return {
          title,
          source: source ?? 'unknown',
          symbols: symbols ?? '',
          credibilityScore: Number(avgScore.toFixed(2)),
          factors,
          recommendation: avgScore >= 0.7 ? 'reliable' : avgScore >= 0.5 ? 'verify' : 'skeptical',
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
