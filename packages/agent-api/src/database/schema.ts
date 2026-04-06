import {
  pgTable,
  uuid,
  varchar,
  text,
  boolean,
  integer,
  date,
  timestamp,
  pgEnum,
  uniqueIndex,
  jsonb,
  index,
  customType,
} from 'drizzle-orm/pg-core';

// ─── Enums ───────────────────────────────────────────────────────────

export const userRoleEnum = pgEnum('user_role', ['user', 'admin']);
export const agentStatusEnum = pgEnum('agent_status', ['active', 'paused', 'error']);
export const triggerTypeEnum = pgEnum('trigger_type', [
  'time_schedule',
  'webhook',
  'event',
  'manual',
]);
export const executionStatusEnum = pgEnum('execution_status', [
  'pending',
  'running',
  'completed',
  'failed',
  'cancelled',
]);
export const stepStatusEnum = pgEnum('step_status', [
  'pending',
  'running',
  'completed',
  'failed',
  'skipped',
]);

// ─── Users (independent — Agent Platform owns its own identity) ──────

export const users = pgTable('users', {
  id: uuid('id').defaultRandom().primaryKey(),
  email: varchar('email', { length: 255 }).notNull().unique(),
  passwordHash: varchar('password_hash', { length: 255 }).notNull(),
  name: varchar('name', { length: 100 }).notNull(),
  role: userRoleEnum('role').notNull().default('user'),
  createdAt: timestamp('created_at', { withTimezone: true }).notNull().defaultNow(),
  updatedAt: timestamp('updated_at', { withTimezone: true }).notNull().defaultNow(),
});

// ─── Agents ──────────────────────────────────────────────────────────

export const agents = pgTable('agents', {
  id: uuid('id').defaultRandom().primaryKey(),
  userId: uuid('user_id').notNull(), // from JWT, no FK to trading_db
  name: varchar('name', { length: 100 }).notNull(),
  description: text('description'),
  gitRepoUrl: varchar('git_repo_url', { length: 500 }).notNull(),
  gitBranch: varchar('git_branch', { length: 100 }).notNull().default('main'),
  agentFilePath: varchar('agent_file_path', { length: 300 }).notNull(),
  skillsPaths: varchar('skills_paths', { length: 300 }).array().notNull().default([]),
  githubTokenEncrypted: text('github_token_encrypted'),
  status: agentStatusEnum('status').notNull().default('active'),
  lastSessionAt: timestamp('last_session_at', { withTimezone: true }),
  createdAt: timestamp('created_at', { withTimezone: true }).notNull().defaultNow(),
  updatedAt: timestamp('updated_at', { withTimezone: true }).notNull().defaultNow(),
});

// ─── Workflows ───────────────────────────────────────────────────────

export const workflows = pgTable('workflows', {
  id: uuid('id').defaultRandom().primaryKey(),
  agentId: uuid('agent_id')
    .notNull()
    .references(() => agents.id, { onDelete: 'cascade' }),
  name: varchar('name', { length: 200 }).notNull(),
  description: text('description'),
  isActive: boolean('is_active').notNull().default(true),
  maxConcurrentExecutions: integer('max_concurrent_executions').notNull().default(1),
  createdAt: timestamp('created_at', { withTimezone: true }).notNull().defaultNow(),
  updatedAt: timestamp('updated_at', { withTimezone: true }).notNull().defaultNow(),
});

// ─── Workflow Steps ──────────────────────────────────────────────────

export const workflowSteps = pgTable(
  'workflow_steps',
  {
    id: uuid('id').defaultRandom().primaryKey(),
    workflowId: uuid('workflow_id')
      .notNull()
      .references(() => workflows.id, { onDelete: 'cascade' }),
    name: varchar('name', { length: 200 }).notNull(),
    promptTemplate: text('prompt_template').notNull(),
    stepOrder: integer('step_order').notNull(),
    agentId: uuid('agent_id').references(() => agents.id), // optional override
    timeoutSeconds: integer('timeout_seconds').notNull().default(300),
    createdAt: timestamp('created_at', { withTimezone: true }).notNull().defaultNow(),
    updatedAt: timestamp('updated_at', { withTimezone: true }).notNull().defaultNow(),
  },
  (table) => ({
    workflowOrderIdx: uniqueIndex('workflow_steps_workflow_order_idx').on(
      table.workflowId,
      table.stepOrder,
    ),
  }),
);

// ─── Triggers ────────────────────────────────────────────────────────

export const triggers = pgTable('triggers', {
  id: uuid('id').defaultRandom().primaryKey(),
  workflowId: uuid('workflow_id')
    .notNull()
    .references(() => workflows.id, { onDelete: 'cascade' }),
  triggerType: triggerTypeEnum('trigger_type').notNull(),
  configuration: jsonb('configuration').notNull().default({}),
  isActive: boolean('is_active').notNull().default(true),
  lastFiredAt: timestamp('last_fired_at', { withTimezone: true }),
  createdAt: timestamp('created_at', { withTimezone: true }).notNull().defaultNow(),
});

// ─── Workflow Executions ─────────────────────────────────────────────

export const workflowExecutions = pgTable('workflow_executions', {
  id: uuid('id').defaultRandom().primaryKey(),
  workflowId: uuid('workflow_id')
    .notNull()
    .references(() => workflows.id, { onDelete: 'cascade' }),
  triggerId: uuid('trigger_id').references(() => triggers.id),
  triggerMetadata: jsonb('trigger_metadata'),
  status: executionStatusEnum('status').notNull().default('pending'),
  currentStep: integer('current_step'),
  totalSteps: integer('total_steps'),
  startedAt: timestamp('started_at', { withTimezone: true }),
  completedAt: timestamp('completed_at', { withTimezone: true }),
  error: text('error'),
  createdAt: timestamp('created_at', { withTimezone: true }).notNull().defaultNow(),
});

// ─── Step Executions ─────────────────────────────────────────────────

export const stepExecutions = pgTable('step_executions', {
  id: uuid('id').defaultRandom().primaryKey(),
  workflowExecutionId: uuid('workflow_execution_id')
    .notNull()
    .references(() => workflowExecutions.id, { onDelete: 'cascade' }),
  workflowStepId: uuid('workflow_step_id')
    .notNull()
    .references(() => workflowSteps.id),
  stepOrder: integer('step_order').notNull(),
  resolvedPrompt: text('resolved_prompt'),
  output: text('output'),
  reasoningTrace: jsonb('reasoning_trace'),
  status: stepStatusEnum('status').notNull().default('pending'),
  startedAt: timestamp('started_at', { withTimezone: true }),
  completedAt: timestamp('completed_at', { withTimezone: true }),
  error: text('error'),
});

// ─── Agent Credentials (key-value store) ─────────────────────────────

export const agentCredentials = pgTable(
  'agent_credentials',
  {
    id: uuid('id').defaultRandom().primaryKey(),
    agentId: uuid('agent_id')
      .notNull()
      .references(() => agents.id, { onDelete: 'cascade' }),
    key: varchar('key', { length: 100 }).notNull(),
    valueEncrypted: text('value_encrypted').notNull(),
    description: varchar('description', { length: 300 }),
    createdAt: timestamp('created_at', { withTimezone: true }).notNull().defaultNow(),
    updatedAt: timestamp('updated_at', { withTimezone: true }).notNull().defaultNow(),
  },
  (table) => ({
    agentKeyIdx: uniqueIndex('agent_credentials_agent_key_idx').on(table.agentId, table.key),
  }),
);

// ─── Agent Quota Usage ───────────────────────────────────────────────

export const agentQuotaUsage = pgTable(
  'agent_quota_usage',
  {
    id: uuid('id').defaultRandom().primaryKey(),
    agentId: uuid('agent_id')
      .notNull()
      .references(() => agents.id, { onDelete: 'cascade' }),
    date: date('date').notNull(),
    promptTokensUsed: integer('prompt_tokens_used').notNull().default(0),
    completionTokensUsed: integer('completion_tokens_used').notNull().default(0),
    sessionCount: integer('session_count').notNull().default(0),
    createdAt: timestamp('created_at', { withTimezone: true }).notNull().defaultNow(),
  },
  (table) => ({
    agentDateIdx: uniqueIndex('agent_quota_agent_date_idx').on(table.agentId, table.date),
  }),
);

// ─── Webhook Registrations ───────────────────────────────────────────

export const webhookRegistrations = pgTable('webhook_registrations', {
  id: uuid('id').defaultRandom().primaryKey(),
  agentId: uuid('agent_id')
    .notNull()
    .references(() => agents.id, { onDelete: 'cascade' }),
  triggerId: uuid('trigger_id').references(() => triggers.id),
  endpointPath: varchar('endpoint_path', { length: 200 }).notNull(),
  hmacSecretEncrypted: text('hmac_secret_encrypted').notNull(),
  isActive: boolean('is_active').notNull().default(true),
  requestCount: integer('request_count').notNull().default(0),
  lastReceivedAt: timestamp('last_received_at', { withTimezone: true }),
  createdAt: timestamp('created_at', { withTimezone: true }).notNull().defaultNow(),
});

// ─── Trade Decisions (Agent audit trail) ─────────────────────────────

export const tradeDecisions = pgTable('trade_decisions', {
  id: uuid('id').defaultRandom().primaryKey(),
  agentId: uuid('agent_id')
    .notNull()
    .references(() => agents.id, { onDelete: 'cascade' }),
  executionId: uuid('execution_id').references(() => workflowExecutions.id),
  symbol: varchar('symbol', { length: 10 }).notNull(),
  side: varchar('side', { length: 10 }).notNull(),
  quantity: integer('quantity').notNull(),
  price: varchar('price', { length: 30 }),
  decision: jsonb('decision').notNull(), // full reasoning: signals, indicators, confidence, risk
  outcome: varchar('outcome', { length: 20 }), // executed, rejected, skipped
  tradeId: varchar('trade_id', { length: 100 }), // reference to trading-api trade ID
  createdAt: timestamp('created_at', { withTimezone: true }).notNull().defaultNow(),
});

// ─── pgvector custom type ────────────────────────────────────────────

const vector = customType<{ data: number[]; driverData: string }>({
  dataType() {
    return 'vector(1536)';
  },
  toDriver(value: number[]): string {
    return `[${value.join(',')}]`;
  },
  fromDriver(value: string): number[] {
    // Postgres returns vector as "[0.1,0.2,...]"
    return value
      .replace(/^\[|\]$/g, '')
      .split(',')
      .map(Number);
  },
});

// ─── Memory Type Enum ────────────────────────────────────────────────

export const memoryTypeEnum = pgEnum('memory_type', [
  'trade_scenario',
  'market_insight',
  'strategy_note',
  'lesson_learned',
  'general',
]);

// ─── Agent Memories (Vector Memory with pgvector) ────────────────────

export const agentMemories = pgTable(
  'agent_memories',
  {
    id: uuid('id').defaultRandom().primaryKey(),
    agentId: uuid('agent_id')
      .notNull()
      .references(() => agents.id, { onDelete: 'cascade' }),
    content: text('content').notNull(),
    memoryType: memoryTypeEnum('memory_type').notNull().default('general'),
    tags: varchar('tags', { length: 50 }).array().notNull().default([]),
    metadata: jsonb('metadata'), // flexible extra data (symbols, dates, signals, etc.)
    embedding: vector('embedding'), // 1536-dim vector for semantic search
    createdAt: timestamp('created_at', { withTimezone: true }).notNull().defaultNow(),
    updatedAt: timestamp('updated_at', { withTimezone: true }).notNull().defaultNow(),
  },
  (table) => ({
    agentMemoriesAgentIdx: index('agent_memories_agent_idx').on(table.agentId),
    agentMemoriesTypeIdx: index('agent_memories_type_idx').on(table.agentId, table.memoryType),
  }),
);
