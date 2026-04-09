# Host on Kubernetes

Deploy **Open Agent Orchestra (OAO)** to Kubernetes using Helm charts. No source code checkout or build required.

## Prerequisites

| Requirement | Version | Purpose |
|---|---|---|
| Kubernetes cluster | 1.25+ | Docker Desktop K8s, Minikube, or any cluster |
| Helm | >= 3 | Package manager for Kubernetes |
| kubectl | Latest | Kubernetes CLI |

## Quick Start

### 1. Add the Helm Repository

If the chart is published to an OCI registry:

```bash
helm pull oci://registry-1.docker.io/<dockerhub-user>/oao-platform --version 1.0
```

Or, if you have the chart locally:

```bash
git clone https://github.com/thfai2000/github-copilot-agent-orchestra.git
cd github-copilot-agent-orchestra
```

### 2. Create Values File

Create a `my-values.yaml` with your configuration:

```yaml
namespace: agent-orchestra

api:
  image: <dockerhub-user>/oao-api:v1.0    # or local: oao-api:v1.0
  replicas: 1
  port: 4002
  resources:
    requests:
      memory: 256Mi
      cpu: 200m
    limits:
      memory: 512Mi
      cpu: 500m

ui:
  image: <dockerhub-user>/oao-ui:v1.0     # or local: oao-ui:v1.0
  replicas: 1
  port: 3002

scheduler:
  replicas: 1

postgres:
  image: pgvector/pgvector:pg16
  storage: 10Gi

redis:
  image: redis:7-alpine

config:
  NODE_ENV: production
  LOG_LEVEL: info
  DEFAULT_AGENT_MODEL: gpt-4.1

secrets:
  POSTGRES_PASSWORD: "change-me-in-production"
  AGENT_DATABASE_URL: "postgresql://ai_trader:change-me-in-production@postgres:5432/agent_db"
  REDIS_URL: "redis://redis:6379"
  JWT_SECRET: "your-jwt-secret-change-in-production"
  ENCRYPTION_KEY: "0123456789abcdef0123456789abcdef0123456789abcdef0123456789abcdef"
  GITHUB_TOKEN: "your-github-token"
```

### 3. Deploy with Helm

```bash
helm upgrade --install oao-platform helm/agent-platform \
  -f my-values.yaml \
  --namespace agent-orchestra --create-namespace
```

### 4. Wait for Pods

```bash
kubectl -n agent-orchestra rollout status deployment/redis --timeout=60s
kubectl -n agent-orchestra rollout status statefulset/postgres --timeout=120s
kubectl -n agent-orchestra rollout status deployment/agent-api --timeout=120s
kubectl -n agent-orchestra rollout status deployment/agent-ui --timeout=120s
```

### 5. Push Database Schema

```bash
# Port-forward PostgreSQL
kubectl -n agent-orchestra port-forward pod/postgres-0 15432:5432 &

# Push schema
AGENT_DATABASE_URL="postgresql://ai_trader:change-me-in-production@localhost:15432/agent_db" \
  npx drizzle-kit push
```

### 6. Set Up Port Forwards

```bash
kubectl -n agent-orchestra port-forward svc/agent-ui 3002:3002 &
kubectl -n agent-orchestra port-forward svc/agent-api 4002:4002 &
```

### 7. Access the Platform

| Service | URL |
|---|---|
| **OAO-UI** | http://localhost:3002 |
| **OAO-API** | http://localhost:4002 |

Register at http://localhost:3002/register.

## What Gets Deployed

```mermaid
graph TB
    subgraph "agent-orchestra namespace"
        API[OAO-API<br/>Deployment :4002]
        UI[OAO-UI<br/>Deployment :3002]
        SCH[Scheduler<br/>Deployment]
        PG[PostgreSQL<br/>StatefulSet :5432]
        RD[Redis<br/>Deployment :6379]
    end

    subgraph "Port Forwards"
        L3002[localhost:3002] --> UI
        L4002[localhost:4002] --> API
    end
```

## Updating

```bash
# Pull new images (if using published images)
# Update image tags in my-values.yaml

# Redeploy
helm upgrade --install oao-platform helm/agent-platform \
  -f my-values.yaml \
  --namespace agent-orchestra

# Push schema if changed
kubectl -n agent-orchestra port-forward pod/postgres-0 15432:5432 &
AGENT_DATABASE_URL="postgresql://ai_trader:change-me-in-production@localhost:15432/agent_db" \
  npx drizzle-kit push
```

## Useful Commands

```bash
# Pod status
kubectl -n agent-orchestra get pods

# OAO-API logs
kubectl -n agent-orchestra logs -f deployment/agent-api

# Scheduler logs
kubectl -n agent-orchestra logs -f deployment/scheduler

# Uninstall
helm uninstall oao-platform -n agent-orchestra
```

## Next Steps

- [Build & Deploy](/guide/build-and-deploy) — Build from source and customize
- [AI Security](/concepts/security) — Configure credential approval
- [Workflows](/concepts/workflows) — Build your first multi-agent workflow
