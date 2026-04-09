# Agents

An **agent** is an AI personality defined as a markdown file — either hosted in a Git repository or managed directly in the platform's database editor.

## Agent Sources

| Source Type | Description | Best For |
|---|---|---|
| **GitHub Repo** | Clone from any Git repo at execution time | Version-controlled agents, team collaboration |
| **Database** | Edit markdown files directly in the UI | Quick prototyping, simple agents |

## Agent Markdown Structure

An agent's main file is a markdown document that serves as the system message for the Copilot session:

```markdown
# Trading Analyst Agent

You are a professional financial analyst specializing in cryptocurrency markets.

## Personality
- Data-driven and analytical
- Conservative risk assessment
- Clear, actionable recommendations

## Guidelines
- Always cite data sources
- Never recommend more than 5% portfolio allocation to a single asset
- Use tables for comparative analysis
```

## Skills

Skills are additional markdown files that extend the agent's knowledge:

```
my-agent/
├── agent.md           # Main agent file
├── skills/
│   ├── market-analysis.md
│   ├── risk-management.md
│   └── report-writing.md
```

Configure skills via:
- **Skills Paths**: Explicit list of skill file paths
- **Skills Directory**: Load all `.md` files from a directory automatically

## GitHub Token & Credentials

For private repos, provide a GitHub token. You can either:
- Enter a token directly (encrypted at rest with AES-256-GCM)
- Select from existing **credentials** (variables of type "credential") — the token is resolved at execution time

## Built-in Tools

Every agent has access to 8 built-in platform tools (individually toggleable):

| Tool | Description |
|---|---|
| `schedule_next_workflow_execution` | Schedule the next workflow run |
| `manage_webhook_trigger` | Create/update/delete webhook triggers |
| `record_decision` | Log decisions to the audit trail |
| `memory_store` | Store long-term memories with vector embeddings |
| `memory_retrieve` | Retrieve relevant memories by semantic search |
| `edit_workflow` | Modify workflow steps programmatically |
| `read_variables` | Read properties and credentials |
| `edit_variables` | Create/update variables |

## Agent Scoping

- **User-scoped agents**: Visible only to the creator
- **Workspace-scoped agents**: Visible to all workspace members (admin-only creation)

## MCP Servers

Agents can connect to [Model Context Protocol](https://modelcontextprotocol.io/) servers for custom tool access. Each MCP server is configured with:

- **Command**: The executable to run (e.g., `node`, `python`)
- **Args**: Command arguments
- **Env Mapping**: Map credential variables to environment variables
- **Write Tools**: Tools that require explicit permission approval
