# API Endpoints

All routes are served by the Agent API (Hono v4.6) at port 4002. The UI proxies all `/api/*` requests to the API.

## Authentication

| Method | Path | Auth | Description |
|---|---|---|---|
| POST | `/api/auth/register` | No | Register new user |
| POST | `/api/auth/login` | No | Login, returns JWT |
| GET | `/api/auth/me` | JWT | Current user info |

JWT tokens are signed with HS256, 7-day expiry. Include in headers: `Authorization: Bearer <token>`

## Agents

| Method | Path | Role | Description |
|---|---|---|---|
| GET | `/api/agents` | Any | List agents in workspace |
| POST | `/api/agents` | creator+ | Create agent |
| GET | `/api/agents/:id` | Any | Agent detail |
| PUT | `/api/agents/:id` | creator+ | Update agent |
| DELETE | `/api/agents/:id` | creator+ | Delete agent |

## Workflows

| Method | Path | Role | Description |
|---|---|---|---|
| GET | `/api/workflows` | Any | List workflows |
| POST | `/api/workflows` | creator+ | Create workflow with steps + triggers |
| GET | `/api/workflows/:id` | Any | Detail with steps |
| PUT | `/api/workflows/:id` | creator+ | Update workflow |
| DELETE | `/api/workflows/:id` | creator+ | Delete workflow |

## Executions

| Method | Path | Description |
|---|---|---|
| GET | `/api/executions` | List executions (paginated) |
| GET | `/api/executions/:id` | Execution detail with step results |
| POST | `/api/executions/:id/cancel` | Cancel running execution |
| POST | `/api/executions/:id/retry` | Retry from failed step |

## Variables

| Method | Path | Description |
|---|---|---|
| GET | `/api/variables?scope=user` | List user variables |
| GET | `/api/variables?scope=workspace` | List workspace variables |
| GET | `/api/variables?agentId=...` | List agent variables |
| POST | `/api/variables` | Create variable |
| PUT | `/api/variables/:id` | Update variable |
| DELETE | `/api/variables/:id?scope=...` | Delete variable |

## Triggers

| Method | Path | Description |
|---|---|---|
| GET | `/api/triggers?workflowId=...` | List triggers for workflow |
| POST | `/api/triggers` | Create trigger |
| PUT | `/api/triggers/:id` | Update trigger |
| DELETE | `/api/triggers/:id` | Delete trigger |

## Agent Files

| Method | Path | Description |
|---|---|---|
| GET | `/api/agent-files/:agentId` | List files |
| POST | `/api/agent-files/:agentId` | Create file |
| PUT | `/api/agent-files/:agentId/:fileId` | Update file |
| DELETE | `/api/agent-files/:agentId/:fileId` | Delete file |

## System Events

| Method | Path | Description |
|---|---|---|
| GET | `/api/events` | List system events |
| GET | `/api/events/names` | Available event names |

## MCP Servers

| Method | Path | Description |
|---|---|---|
| GET | `/api/mcp-servers?agentId=...` | List MCP configs |
| POST | `/api/mcp-servers` | Add MCP server |
| PUT | `/api/mcp-servers/:id` | Update config |
| DELETE | `/api/mcp-servers/:id` | Delete config |

## Plugins

| Method | Path | Role | Description |
|---|---|---|---|
| GET | `/api/plugins` | Any | List plugins |
| POST | `/api/plugins` | admin | Install from Git |
| POST | `/api/plugins/:id/sync` | admin | Re-sync from Git |
| GET | `/api/plugins/agent/:agentId` | Any | Agent's plugins |
| PUT | `/api/plugins/agent/:agentId` | creator+ | Toggle plugin |

## Admin

| Method | Path | Description |
|---|---|---|
| GET | `/api/admin/users` | List workspace users |
| PUT | `/api/admin/users/:id/role` | Change user role |
| GET/POST/PUT/DELETE | `/api/admin/models[/:id]` | Model CRUD |
| GET/PUT | `/api/admin/quota-settings` | Quota settings |

## Quota

| Method | Path | Description |
|---|---|---|
| GET | `/api/quota/models` | Active models (for dropdowns) |
| GET | `/api/quota/settings` | User quota limits |
| GET | `/api/quota/usage` | Credit usage stats |

## Workspaces (super_admin)

| Method | Path | Description |
|---|---|---|
| GET | `/api/workspaces` | List all workspaces |
| POST | `/api/workspaces` | Create workspace |
| PUT | `/api/workspaces/:id` | Update workspace |
| DELETE | `/api/workspaces/:id` | Delete workspace |

## Webhooks

| Method | Path | Auth | Description |
|---|---|---|---|
| POST | `/api/webhooks/:path` | HMAC-SHA256 | Receive webhook events |
