# Scheduler & Workers

The platform uses a dedicated scheduler service and BullMQ workers to process workflow executions.

## Scheduler Service

The scheduler is deployed as a separate Kubernetes deployment that polls for due triggers every 30 seconds.

```mermaid
graph TB
    subgraph "Scheduler Pod"
        INIT[Startup] --> LOCK[Acquire Redis Leader Lock<br/>SETNX with 60s TTL]
        LOCK -->|acquired| POLL[Poll Cycle]
        LOCK -->|not leader| WAIT[Wait 30s]
        WAIT --> LOCK

        subgraph "Poll Cycle (every 30s)"
            POLL --> CT[pollCronTriggers]
            CT --> DT[pollDatetimeTriggers]
            DT --> ET[pollEventTriggers]
            ET --> RENEW[Renew leader lock]
            RENEW --> SLEEP[Sleep 30s]
            SLEEP --> POLL
        end
    end

    CT -->|enqueue| Q[BullMQ Queue]
    DT -->|enqueue| Q
    ET -->|enqueue| Q
```

### Cron Triggers

1. Find active cron triggers where `nextRunAt <= NOW()`
2. Enqueue workflow execution
3. Calculate next run time from cron expression
4. Update `nextRunAt` and `lastFiredAt`

### Datetime Triggers

1. Find active datetime triggers where `configuration.datetime <= NOW()`
2. Enqueue workflow execution
3. **Deactivate the trigger** (one-shot execution)

### Event Triggers

```mermaid
graph LR
    SE[System Events Table<br/>unprocessed events] --> MATCH{Match trigger?}
    MATCH -->|eventName matches| C{Conditions?}
    C -->|all conditions match| FIRE[Enqueue Execution]
    C -->|mismatch| SKIP[Skip]
    MATCH -->|no match| SKIP
    FIRE --> MARK[Mark event processed]
```

1. Load unprocessed system events
2. For each event, check all active event triggers:
   - Match `eventName` (e.g., `agent.created`)
   - Match `eventScope` (optional filter)
   - Match `conditions` — all key-value pairs must match event data
3. Enqueue matched workflows
4. Mark events as processed

## Workflow Worker (BullMQ)

```mermaid
sequenceDiagram
    participant Q as BullMQ Queue
    participant W as Worker (concurrency: 1)
    participant E as Workflow Engine
    participant DB as PostgreSQL

    Q->>W: Job: {workflowId, executionId, startFromStep}
    W->>E: executeWorkflow()
    E->>DB: Load workflow, steps, variables
    loop Each step
        E->>E: Create Copilot session
        E->>DB: Store step result
    end
    E->>DB: Mark execution complete/failed
    W-->>Q: Job done
```

### Worker Configuration

- **Concurrency**: 1 per pod (prevents resource contention)
- **Connection**: Shared Redis connection for BullMQ
- **Error handling**: Failed jobs mark the execution as failed with error details

### Job Payload

```typescript
interface WorkflowJob {
  workflowId: string;
  executionId: string;
  startFromStep?: number;  // For retries
}
```

## Kubernetes Deployment

```yaml
# Scheduler — single replica
apiVersion: apps/v1
kind: Deployment
metadata:
  name: scheduler
spec:
  replicas: 1
  # ...runs scheduler.ts as entrypoint

# API — includes embedded worker
apiVersion: apps/v1
kind: Deployment
metadata:
  name: agent-api
spec:
  replicas: 1
  # ...runs server.ts which starts both API + BullMQ worker
```

The scheduler runs as a separate deployment while the workflow worker is embedded in the API server process.
