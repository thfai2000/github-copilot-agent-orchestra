# Workflow Engine

The workflow engine orchestrates the execution of multi-step workflows, managing variable resolution, agent loading, Copilot session creation, and error recovery.

## Execution Pipeline

```mermaid
graph TB
    START[Trigger fires] --> LOAD[Load workflow + steps + execution]
    LOAD --> VARS[Load variables<br/>Workspace → User → Agent]
    VARS --> MARK[Mark execution as running]
    MARK --> LOOP{Next step?}
    LOOP -->|yes| RESOLVE[Resolve prompt template<br/>inject variables + precedent output]
    RESOLVE --> AGENT[Load step agent<br/>or workflow default]
    AGENT --> MERGE[Merge credentials<br/>agent overrides user overrides workspace]
    MERGE --> SESSION[Execute Copilot Session]
    SESSION -->|success| STORE[Store step output]
    STORE --> LOOP
    SESSION -->|error| FAIL[Mark step + execution failed]
    LOOP -->|no more steps| DONE[Mark execution completed]
```

## Variable Resolution

Variables are resolved in three tiers with override semantics:

```mermaid
graph LR
    W[Workspace Variables] -->|base| M[Merged Map]
    U[User Variables] -->|override| M
    A[Agent Variables] -->|override| M

    M --> C[Credentials Map]
    M --> P[Properties Map]
    M --> E[Env Variables Map]
```

For each step, the engine:
1. Starts with **workspace variables** (lowest priority)
2. Overlays **user variables** (same key overrides workspace)
3. Overlays the **step's agent variables** (highest priority)
4. Splits into three maps: credentials, properties, env variables

## GitHub Token Credential Resolution

When an agent references a `githubTokenCredentialId` (pointing to a credential variable), the engine:
1. Looks up the credential by UUID in user variables
2. Falls back to workspace variables if not found
3. Uses the encrypted value for Git authentication (decrypted at clone time)

## Concurrency Control

```mermaid
sequenceDiagram
    participant W1 as Worker 1
    participant Redis as Redis Lock
    participant W2 as Worker 2

    W1->>Redis: SETNX session-lock:{agentId}
    Redis-->>W1: OK (acquired)
    W2->>Redis: SETNX session-lock:{agentId}
    Redis-->>W2: FAIL (locked)
    Note over W2: Throws: Agent already has active session

    W1->>Redis: DEL session-lock:{agentId}
    Note over W1: Lock released after completion
```

Each agent can only have one active Copilot session at a time. Concurrent execution is blocked via Redis distributed locks.

## Retry Mechanism

```mermaid
graph LR
    E[Failed Execution] -->|retry from step 3| S3[Re-execute Step 3]
    S3 -->|success| S4[Execute Step 4]
    S4 -->|success| S5[Execute Step 5]
    S5 --> D[Execution Complete]

    style S3 fill:#FF9800,color:#fff
```

When retrying:
- Steps 1–2 are **preserved** (their outputs remain)
- The precedent output for step 3 is recovered from step 2's stored output
- Execution continues normally from the retry point
