#!/usr/bin/env bash
# ============================================================================
# deploy.sh — Development helper to deploy OAO to local Kubernetes via Helm
# For production, use `helm upgrade --install` directly (see docs).
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

if ! command -v docker &>/dev/null; then
  echo "Error: docker not found. Install Docker Desktop first." >&2
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

# ─── Deploy via Helm ─────────────────────────────────────────────────────────

echo "═══════════════════════════════════════════════════════════════"
echo "  Deploying Open Agent Orchestra (OAO) to Kubernetes (Helm)"
echo "═══════════════════════════════════════════════════════════════"
echo ""

helm upgrade --install oao-platform "${HELM_DIR}/oao-platform" \
  -f "${HELM_DIR}/oao-platform/values.yaml" \
  "$@" \
  --namespace open-agent-orchestra --create-namespace

echo ""
echo "═══════════════════════════════════════════════════════════════"
echo "  Waiting for core workloads to become ready"
echo "═══════════════════════════════════════════════════════════════"
echo ""

kubectl -n open-agent-orchestra rollout status deployment/redis --timeout=120s
kubectl -n open-agent-orchestra rollout status statefulset/postgres --timeout=180s
kubectl -n open-agent-orchestra rollout status deployment/oao-api --timeout=180s
kubectl -n open-agent-orchestra rollout status deployment/oao-ui --timeout=180s
kubectl -n open-agent-orchestra rollout status deployment/oao-controller --timeout=180s

if kubectl -n open-agent-orchestra get deployment/oao-agent-worker >/dev/null 2>&1; then
  kubectl -n open-agent-orchestra rollout status deployment/oao-agent-worker --timeout=180s
fi

echo ""
echo "═══════════════════════════════════════════════════════════════"
echo "  Wiring local access bridge for http://oao.local"
echo "═══════════════════════════════════════════════════════════════"
echo ""

bash "${SCRIPT_DIR}/scripts/ensure-local-oao-access.sh"
