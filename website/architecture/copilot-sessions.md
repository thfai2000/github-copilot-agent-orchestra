# Copilot Sessions

Each workflow step creates a fresh [GitHub Copilot SDK](https://github.com/features/copilot) session with the agent's personality, skills, and tools.

## Session Lifecycle

```mermaid
sequenceDiagram
    participant Engine as Workflow Engine
    participant SDK as Copilot SDK
    participant Session as Copilot Session
    participant Tools as Tool Handlers

    Engine->>SDK: new CopilotClient()
    Engine->>Engine: Build system message<br/>(agent markdown + skills)
    Engine->>Engine: Prepare tools<br/>(built-in + MCP)
    Engine->>SDK: client.createSession({model, tools, systemMessage})
    SDK-->>Session: Session created
    Engine->>Session: session.sendAndWait({prompt}, timeout)

    loop Tool calls
        Session->>Tools: Execute tool
        Tools-->>Session: Tool result
    end

    Session-->>Engine: Final response
    Engine->>Engine: Cleanup MCP connections
```

## System Message Construction

The system message is assembled from:

1. **Agent markdown** — the main `.md` file (personality, instructions)
2. **Skills** — additional `.md` files appended as `## Agent Skills` section
3. **Plugin skills** — skills from enabled plugins (if any)

```typescript
const systemContent = `${agentMarkdown}${skillsContent}`;
// Passed as: systemMessage: { mode: 'customize', content: systemContent }
```

## Tool Types

### Built-in Tools (8)

Platform tools created with `defineTool()` from the Copilot SDK:

| Tool | Parameters | Description |
|---|---|---|
| `schedule_next_workflow_execution` | `delayMinutes`, `userInput` | Schedule next execution |
| `manage_webhook_trigger` | `action`, `path`, etc. | CRUD webhook triggers |
| `record_decision` | `decision`, `reasoning`, `confidence` | Audit trail entries |
| `memory_store` | `content`, `category`, `tags` | Store with vector embeddings |
| `memory_retrieve` | `query`, `limit`, `category` | Semantic search retrieval |
| `edit_workflow` | `stepUpdates[]` | Modify workflow steps |
| `read_variables` | `scope`, `variableType` | Read variables |
| `edit_variables` | `key`, `value`, `scope`, etc. | Create/update variables |

### MCP Tools

Loaded from configured MCP servers at session start:

```mermaid
graph LR
    Config[MCP Server Config<br/>command, args, envMapping] --> Spawn[Spawn child process<br/>stdio transport]
    Spawn --> List[List available tools]
    List --> Register[Register in Copilot session]
    Register --> Use[Agent uses tools]
    Use --> Cleanup[Kill child process]
```

### Plugin Tools

Loaded from enabled plugin repositories:
1. Clone plugin Git repos
2. Parse `plugin.json` manifest
3. Load tool scripts from `tools/` directory
4. Register as additional tools in the session

## Permission Handling

For agent workflows, all tool calls are auto-approved:

```typescript
onPermissionRequest: approveAll
```

Write tools (configured per MCP server) receive explicit permission through the `approveAll` handler.

## Model Configuration

The model is resolved per step:
1. **Step-level model** (if specified)
2. **Workflow default model** (fallback)
3. Models are admin-configured and stored in the `models` table

## Session Cleanup

After each step execution:
1. MCP server child processes are killed
2. Plugin temporary directories are removed
3. Agent workspace (cloned repo) is deleted
4. Redis session lock is released
