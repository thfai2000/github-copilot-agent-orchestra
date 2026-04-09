# Workspaces & RBAC

The platform supports full multi-tenant workspace isolation with role-based access control.

## Workspaces

A **workspace** is a tenant boundary. All resources (agents, workflows, variables, executions) are scoped to a workspace.

- A **Default Workspace** (`slug: default`) is created on first deployment
- Each workspace has a unique slug used in URLs: `/<workspace-slug>/agents`
- Resources cannot be accessed across workspace boundaries

## User Roles

| Role | Agents | Workflows | Variables | Admin |
|---|---|---|---|---|
| **super_admin** | Full CRUD (all scopes) | Full CRUD | Full CRUD | Full access |
| **workspace_admin** | Full CRUD (all scopes) | Full CRUD | Full CRUD | Full access |
| **creator_user** | Create/edit own | Create/edit own | Create/edit own | No access |
| **view_user** | Read only | Read only | Read only | No access |

## Resource Scoping

Resources have two scope levels:

| Scope | Visibility | Who Can Create |
|---|---|---|
| **User** | Only the creator | Any user (except view_user) |
| **Workspace** | All workspace members | Admins only |

## URL Pattern

All pages are scoped by workspace slug:

```
http://localhost:3002/{workspace-slug}/agents
http://localhost:3002/{workspace-slug}/workflows
http://localhost:3002/{workspace-slug}/executions
http://localhost:3002/{workspace-slug}/variables
http://localhost:3002/{workspace-slug}/admin/models
```
