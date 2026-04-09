---
layout: home

hero:
  name: Agent Orchestration Platform
  text: Autonomous AI Workflows
  tagline: Define agents as markdown. Connect them to multi-step workflows. Run on schedule, via webhooks, or triggered by events — all powered by the GitHub Copilot SDK.
  actions:
    - theme: brand
      text: Get Started
      link: /guide/getting-started
    - theme: alt
      text: Architecture
      link: /architecture/overview
    - theme: alt
      text: GitHub
      link: https://github.com/nicejimmy/github-copilot-agent-orchestra

features:
  - icon: 🤖
    title: Agents as Markdown
    details: Define your AI agents as Git-hosted markdown files with personality, skills, and tool access. Or manage them directly in the database editor.
  - icon: 🔄
    title: Multi-Step Workflows
    details: Chain agent steps with precedent output passing, variable injection, and per-step model/reasoning configuration.
  - icon: ⏰
    title: Flexible Triggers
    details: Cron schedules, exact datetimes, webhooks, system events with data matching, or manual execution — your choice.
  - icon: 🔐
    title: Encrypted Credentials
    details: AES-256-GCM encryption at rest for all secrets. Three-tier variable system with agent, user, and workspace scoping.
  - icon: 🏢
    title: Multi-Tenant Workspaces
    details: Full workspace isolation with RBAC (super admin, workspace admin, creator, viewer). URL-scoped routing.
  - icon: 🧩
    title: Plugin & MCP Ecosystem
    details: Extend agents with Git-hosted plugins and Model Context Protocol (MCP) servers for custom tool integration.
---

## Why Agent Orchestra?

Modern AI applications need more than a single prompt → response cycle. **Agent Orchestra** provides the infrastructure to run complex, multi-step AI workflows autonomously — with scheduling, error recovery, audit trails, and proper credential management.

### How It Works

```
┌─────────────┐     ┌───────────────┐     ┌──────────────────┐
│   Trigger    │────▶│  Scheduler    │────▶│  Workflow Engine  │
│ (cron/event/ │     │  (30s poll)   │     │  (step-by-step)  │
│  webhook)    │     └───────────────┘     └──────────────────┘
└─────────────┘                                     │
                                                    ▼
                                          ┌──────────────────┐
                                          │  Copilot Session  │
                                          │  (agent markdown  │
                                          │   + tools + MCP)  │
                                          └──────────────────┘
```

### Key Differentiators

| Feature | Agent Orchestra | Typical AI Frameworks |
|---|---|---|
| Agent definition | Git-hosted markdown | Code-only |
| Workflow orchestration | Built-in multi-step engine | Manual chaining |
| Scheduling | Cron, datetime, events, webhooks | External (cron jobs) |
| Credential management | AES-256-GCM encrypted, 3-tier scoped | Environment variables |
| Multi-tenancy | Workspace isolation + RBAC | Single tenant |
| Tool ecosystem | Built-in tools + MCP + Plugins | Framework-specific |
| Execution history | Full audit trail per step | Logging only |
| Retry mechanism | Per-step retry from failure point | Full restart |
