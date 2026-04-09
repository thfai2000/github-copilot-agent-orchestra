# Getting Started

Get the Agent Orchestration Platform running locally in under 10 minutes.

## Prerequisites

| Requirement | Version | Purpose |
|---|---|---|
| Node.js | >= 20 | Runtime |
| Docker Desktop | Latest | Container runtime + Kubernetes |
| Helm | >= 3 | Kubernetes package manager |
| Kubernetes | Docker Desktop K8s | Orchestration |
| Git | Latest | Clone repos |

Enable Kubernetes in Docker Desktop: **Settings → Kubernetes → Enable Kubernetes**.

## Installation

### 1. Clone the Repository

```bash
git clone https://github.com/nicejimmy/github-copilot-agent-orchestra.git
cd github-copilot-agent-orchestra
```

### 2. Install Dependencies

```bash
npm install
```

### 3. Configure Environment

```bash
cp .env.example .env
```

Edit `.env` with your settings:

```ini
# Database (auto-configured by Helm deployment)
AGENT_DATABASE_URL=postgresql://ai_trader:ai_trader_dev@localhost:15432/agent_db

# Redis (auto-configured by Helm deployment)
REDIS_URL=redis://localhost:6379

# Security — generate unique values for production
JWT_SECRET=your-jwt-secret-here
ENCRYPTION_KEY=your-32-byte-hex-key-here

# GitHub Copilot SDK
GITHUB_TOKEN=your-github-token
```

### 4. Run Pre-Build Checks

```bash
# TypeScript compilation check
npx tsc --noEmit -p packages/shared/tsconfig.json
npx tsc --noEmit -p packages/agent-api/tsconfig.json

# Lint
npm run lint

# Tests
npm test
```

### 5. Build Docker Images

```bash
BUILD_TAG=v1.0 ./build.sh
```

This builds two images:
- `agent-orchestra-api:v1.0` — API server (port 4002)
- `agent-orchestra-ui:v1.0` — UI dashboard (port 3002)

### 6. Update Helm Values

Edit `helm/agent-platform/values.yaml` to use your build tag:

```yaml
api:
  image: agent-orchestra-api:v1.0

ui:
  image: agent-orchestra-ui:v1.0
```

### 7. Deploy to Kubernetes

```bash
./deploy.sh
```

This will:
1. Deploy PostgreSQL 16 + Redis 7 to the `agent-orchestra` namespace
2. Deploy the API, UI, and Scheduler services
3. Push the database schema via Drizzle
4. Set up port-forwards for localhost access

### 8. Seed Default Data

```bash
cd packages/agent-api
AGENT_DATABASE_URL="postgresql://ai_trader:ai_trader_dev@localhost:15432/agent_db" \
  npx tsx src/database/seed.ts
```

### 9. Access the Platform

| Service | URL |
|---|---|
| **Agent UI** | http://localhost:3002 |
| **Agent API** | http://localhost:4002 |

Register an account at http://localhost:3002/default/register and start building.

## First Workflow

1. **Create an Agent**: Go to Agents → New Agent. Choose "Database" source type to use the built-in editor, or "GitHub Repo" to point to a Git-hosted markdown file.

2. **Create a Workflow**: Go to Workflows → New Workflow. Assign your agent, add steps with prompt templates, and optionally configure triggers.

3. **Execute**: Click "Run Now" on the workflow detail page. Watch the execution progress in real-time.

## Useful Commands

```bash
# Check pod status
kubectl -n agent-orchestra get pods

# View API logs
kubectl -n agent-orchestra logs -f deployment/agent-api

# View scheduler logs
kubectl -n agent-orchestra logs -f deployment/scheduler

# Helm status
helm list -n agent-orchestra

# Rebuild and redeploy after changes
BUILD_TAG=v1.1 ./build.sh
# Update values.yaml with new tag
./deploy.sh
```

## Next Steps

- [Agents](/guide/agents) — Define and configure AI agents
- [Workflows & Steps](/guide/workflows) — Build multi-step workflows
- [Triggers](/guide/triggers) — Automate execution scheduling
