#!/usr/bin/env bash
# ============================================================================
# deploy.sh — Deploy Open Agent Orchestra (OAO) to Kubernetes via Helm
# ============================================================================
set -euo pipefail

SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
HELM_DIR="${SCRIPT_DIR}/helm"

# ─── Pre-flight checks ──────────────────────────────────────────────────────

if ! command -v kubectl &>/dev/null; then
  echo "Error: kubectl not found. Install it first." >&2
  exit 1
fi

if ! command -v helm &>/dev/null; then
  echo "Error: helm not found. Install it first." >&2
  echo "  brew install helm" >&2
  exit 1
fi

if ! kubectl cluster-info &>/dev/null 2>&1; then
  echo "Error: Cannot connect to Kubernetes cluster." >&2
  echo "Make sure Docker Desktop Kubernetes or another cluster is running." >&2
  exit 1
fi

if [ ! -f "${HELM_DIR}/oao-platform/values.yaml" ]; then
  echo "Error: helm/oao-platform/values.yaml not found." >&2
  echo "" >&2
  echo "Create it from the template:" >&2
  echo "  cp helm/oao-platform/values.yaml.template helm/oao-platform/values.yaml" >&2
  echo "  # Then edit helm/oao-platform/values.yaml with your real credentials" >&2
  exit 1
fi

echo "═══════════════════════════════════════════════════════════════"
echo "  Deploying Open Agent Orchestra (OAO) to Kubernetes (Helm)"
echo "═══════════════════════════════════════════════════════════════"

# ─── Deploy OAO Platform (API + UI + PostgreSQL + Redis) ───────────────────

echo ""
echo "▸ [1/1] Deploying Open Agent Orchestra ..."
helm upgrade --install oao-platform "${HELM_DIR}/oao-platform" \
  -f "${HELM_DIR}/oao-platform/values.yaml" \
  --namespace open-agent-orchestra --create-namespace

echo "▸ Waiting for redis to be ready ..."
kubectl -n open-agent-orchestra rollout status deployment/redis --timeout=60s 2>/dev/null || true

echo "▸ Waiting for postgres to be ready ..."
kubectl -n open-agent-orchestra rollout status statefulset/postgres --timeout=120s 2>/dev/null || true

echo "▸ Waiting for oao-api to be ready ..."
kubectl -n open-agent-orchestra rollout status deployment/oao-api --timeout=120s 2>/dev/null || true

echo "▸ Waiting for oao-ui to be ready ..."
kubectl -n open-agent-orchestra rollout status deployment/oao-ui --timeout=120s 2>/dev/null || true

# NOTE: Database schema is pushed automatically via Helm post-install/post-upgrade hook
# (see templates/job-db-migrate.yaml). No manual drizzle-kit push needed.

# ─── Port forwards ────────────────────────────────────────────────────────────

echo ""
echo "▸ Setting up port-forwards for localhost access..."

pkill -f "kubectl.*port-forward.*open-agent-orchestra" 2>/dev/null || true
sleep 1

kubectl -n open-agent-orchestra port-forward svc/oao-ui 3002:3002 &>/dev/null &
kubectl -n open-agent-orchestra port-forward svc/oao-api 4002:4002 &>/dev/null &
sleep 2

# ─── Summary ─────────────────────────────────────────────────────────────────

echo ""
echo "═══════════════════════════════════════════════════════════════"
echo "  ✓ Deployment complete"
echo ""
echo "  Helm release:"
echo "    oao-platform      — OAO-API + OAO-UI + PostgreSQL + Redis"
echo ""
echo "  Access (via port-forward):"
echo "    OAO-UI:   http://localhost:3002"
echo "    OAO-API:  http://localhost:4002"
echo ""
echo "  Useful commands:"
echo "    kubectl -n open-agent-orchestra get pods"
echo "    kubectl -n open-agent-orchestra logs -f deployment/oao-api"
echo "    helm list -n open-agent-orchestra"
echo "    helm uninstall oao-platform -n open-agent-orchestra"
echo "═══════════════════════════════════════════════════════════════"
