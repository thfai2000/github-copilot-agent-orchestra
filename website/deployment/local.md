# Local Deployment

Deploy the Agent Orchestration Platform to Docker Desktop Kubernetes.

## Prerequisites

- Docker Desktop with Kubernetes enabled
- Helm 3
- Node.js >= 20

## Build & Deploy Cycle

```bash
# 1. Pre-build checks (must all pass)
npx tsc --noEmit -p packages/shared/tsconfig.json
npx tsc --noEmit -p packages/agent-api/tsconfig.json
npm run lint
npm test

# 2. Build Docker images
BUILD_TAG=v1.0 ./build.sh

# 3. Update image tags in helm/agent-platform/values.yaml
# api.image: agent-orchestra-api:v1.0
# ui.image: agent-orchestra-ui:v1.0

# 4. Deploy to Kubernetes
./deploy.sh

# 5. Push schema changes (if any)
cd packages/agent-api
AGENT_DATABASE_URL="postgresql://ai_trader:ai_trader_dev@localhost:15432/agent_db" \
  npx drizzle-kit push

# 6. Seed default data (first deploy only)
AGENT_DATABASE_URL="postgresql://ai_trader:ai_trader_dev@localhost:15432/agent_db" \
  npx tsx src/database/seed.ts
```

## What Gets Deployed

```mermaid
graph TB
    subgraph "agent-orchestra namespace"
        API[agent-api<br/>Deployment :4002]
        UI[agent-ui<br/>Deployment :3002]
        SCH[scheduler<br/>Deployment]
        PG[postgres<br/>StatefulSet :5432]
        RD[redis<br/>Deployment :6379]
    end

    subgraph "Port Forwards"
        L3002[localhost:3002] --> UI
        L4002[localhost:4002] --> API
        L15432[localhost:15432] --> PG
    end
```

## Helm Values

Key configuration in `helm/agent-platform/values.yaml`:

```yaml
namespace: agent-orchestra

api:
  image: agent-orchestra-api:v16.0
  replicas: 1
  port: 4002

ui:
  image: agent-orchestra-ui:v16.0
  replicas: 1
  port: 3002

postgres:
  image: pgvector/pgvector:pg16
  storage: 10Gi

redis:
  image: redis:7-alpine
```

## Verification

After deployment:

```bash
# Check all pods are running
kubectl -n agent-orchestra get pods

# Health check
curl http://localhost:4002/health

# View logs
kubectl -n agent-orchestra logs -f deployment/agent-api
kubectl -n agent-orchestra logs -f deployment/scheduler
```

## Redeployment

After code changes, always follow the full cycle:
1. Pre-build checks (TypeScript, lint, tests)
2. Bump `BUILD_TAG` version
3. Build images
4. Update Helm values with new tag
5. Deploy with `./deploy.sh`
6. Push schema if changed
