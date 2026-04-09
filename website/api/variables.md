# Variable System

The platform provides a three-tier encrypted variable system for managing credentials and configuration.

## Priority Rules

When the same key exists at multiple scopes:

```
Agent Variables  (highest priority — overrides all)
    ↓
User Variables   (medium priority — overrides workspace)
    ↓
Workspace Variables (lowest priority — base layer)
```

## Variable Types

| Type | Storage | Injection | Use Case |
|---|---|---|---|
| **Credential** | AES-256-GCM encrypted | Available to tools & MCP servers | API keys, tokens, secrets |
| **Property** | AES-256-GCM encrypted | `Properties.KEY` in prompts | Config values, settings |

## Environment Variable Injection

Variables with `injectAsEnvVariable: true` are written to a `.env` file in the agent workspace before execution:

```ini
API_KEY=decrypted-value
DATABASE_URL=postgres://...
```

This is useful for MCP servers and tools that read from environment variables.

## Key Format

All variable keys must match: `^[A-Z_][A-Z0-9_]*$`

Valid: `API_KEY`, `MAX_RISK`, `TRADING_API_URL`
Invalid: `apiKey`, `my-variable`, `123_KEY`

## Access Control

| Role | User Variables | Workspace Variables | Agent Variables |
|---|---|---|---|
| super_admin | Full CRUD | Full CRUD | Full CRUD |
| workspace_admin | Full CRUD | Full CRUD | Full CRUD |
| creator_user | Own only | Read only | Own agents only |
| view_user | Read own | Read only | Read only |

## API Examples

### Create a credential

```bash
curl -X POST http://localhost:4002/api/variables \
  -H "Authorization: Bearer $TOKEN" \
  -H "Content-Type: application/json" \
  -d '{
    "scope": "user",
    "key": "GITHUB_TOKEN",
    "value": "ghp_xxxxxxxxxxxx",
    "variableType": "credential",
    "description": "GitHub personal access token"
  }'
```

### List user credentials

```bash
curl http://localhost:4002/api/variables?scope=user \
  -H "Authorization: Bearer $TOKEN"
```
