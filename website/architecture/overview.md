# System Overview

The Agent Orchestration Platform is a monorepo consisting of four packages deployed as Docker containers on Kubernetes.

## High-Level Architecture

```mermaid
graph TB
    subgraph "Frontend"
        UI[Agent UI<br/>Nuxt 3 :3002]
    end

    subgraph "Backend Services"
        API[Agent API<br/>Hono v4.6 :4002]
        SCH[Scheduler<br/>30s poll loop]
        WKR[Workflow Worker<br/>BullMQ consumer]
    end

    subgraph "Data Layer"
        PG[(PostgreSQL 16<br/>+ pgvector)]
        RD[(Redis 7<br/>+ BullMQ)]
    end

    subgraph "External"
        GH[GitHub Copilot SDK]
        MCP[MCP Servers]
        GIT[Git Repos]
    end

    UI -->|REST API| API
    API --> PG
    API --> RD
    SCH --> PG
    SCH -->|enqueue jobs| RD
    WKR -->|dequeue jobs| RD
    WKR --> PG
    WKR --> GH
    WKR --> MCP
    WKR --> GIT
```

## Component Details

### Agent API (Hono v4.6)

The central REST API handling all CRUD operations:

- **Authentication**: JWT (HS256, 7-day expiry)
- **Routes**: Agents, Workflows, Triggers, Executions, Variables, Admin, Events, Webhooks
- **Validation**: Zod schemas on all inputs
- **Security**: AES-256-GCM encryption for credentials, HMAC webhooks

### Agent UI (Nuxt 3)

A single-page application dashboard:

- **Framework**: Vue 3 + Nuxt 3 + shadcn-vue + Tailwind CSS
- **Pages**: ~20 pages for managing agents, workflows, executions, variables, admin
- **Auth**: JWT stored client-side with middleware guards
- **Proxy**: All `/api/*` requests proxied to Agent API

### Scheduler

A standalone Node.js service that polls for due triggers:

```mermaid
graph LR
    subgraph "Every 30 seconds"
        L[Acquire Redis Lock] --> C[Poll Cron Triggers]
        C --> D[Poll Datetime Triggers]
        D --> E[Poll Event Triggers]
    end
    C -->|due| Q[BullMQ Queue]
    D -->|due| Q
    E -->|matched| Q
```

- **Leader election**: Redis SETNX with TTL (prevents duplicate execution)
- **Cron**: Checks `nextRunAt` against current time
- **Datetime**: Fires once, then deactivates the trigger
- **Events**: Matches unprocessed system events against trigger conditions

### Workflow Worker

A BullMQ consumer that executes workflow jobs:

```mermaid
sequenceDiagram
    participant Q as BullMQ Queue
    participant W as Worker
    participant DB as PostgreSQL
    participant CS as Copilot Session

    Q->>W: Dequeue job (workflowId, executionId)
    W->>DB: Load workflow + steps + variables
    loop For each step
        W->>DB: Mark step as running
        W->>CS: Create Copilot session
        Note over CS: Agent markdown + skills<br/>+ built-in tools + MCP tools
        CS-->>W: Step output
        W->>DB: Store step result
    end
    W->>DB: Mark execution complete
```

## Monorepo Structure

```
packages/
├── shared/       # Auth, encryption, middleware, utilities
├── agent-api/    # Hono REST API + workers
├── agent-ui/     # Nuxt 3 dashboard
└── ui-base/      # Shared Nuxt layer (Tailwind, auth composables)

helm/
├── agent-platform/   # API + UI + Scheduler + PostgreSQL + Redis
└── infrastructure/   # (legacy) Redis + namespace
```

## Request Flow

```mermaid
sequenceDiagram
    participant User as Browser
    participant UI as Agent UI :3002
    participant API as Agent API :4002
    participant DB as PostgreSQL

    User->>UI: Navigate to /default/agents
    UI->>API: GET /api/agents
    API->>API: Verify JWT
    API->>DB: SELECT * FROM agents WHERE workspace_id = ?
    DB-->>API: Agent rows
    API-->>UI: JSON response
    UI-->>User: Render page
```

## Technology Stack

| Layer | Technology | Version |
|---|---|---|
| Runtime | Node.js | >= 20 |
| Language | TypeScript | strict mode |
| API | Hono | v4.6 |
| Frontend | Nuxt 3 / Vue 3 | 3.x |
| UI Components | shadcn-vue + Tailwind | Latest |
| Database | PostgreSQL + pgvector | 16 |
| Queue / Cache | Redis + BullMQ | 7 |
| AI SDK | GitHub Copilot SDK | Latest |
| ORM | Drizzle ORM | Latest |
| Auth | JWT (jose, HS256) | — |
| Encryption | AES-256-GCM | — |
| Testing | Vitest | Latest |
| Deployment | Docker + Helm + K8s | — |
