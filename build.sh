#!/usr/bin/env bash
# ============================================================================
# build.sh — Build Docker images for Agent Orchestration Platform
# ============================================================================
set -euo pipefail

SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
cd "$SCRIPT_DIR"

TAG="${BUILD_TAG:-latest}"

echo "═══════════════════════════════════════════════════════════════"
echo "  Building Agent Orchestration Platform images  (tag: ${TAG})"
echo "═══════════════════════════════════════════════════════════════"

echo ""
echo "▸ [1/2] Building agent-ui image: agent-orchestra-ui:${TAG}"
docker build -t "agent-orchestra-ui:${TAG}" -f Dockerfile.ui .

echo ""
echo "▸ [2/2] Building agent-api image: agent-orchestra-api:${TAG}"
docker build -t "agent-orchestra-api:${TAG}" -f Dockerfile.api .

echo ""
echo "═══════════════════════════════════════════════════════════════"
echo "  ✓ All images built successfully"
echo ""
echo "  Images:"
echo "    agent-orchestra-ui:${TAG}     (Agent UI — port 3002)"
echo "    agent-orchestra-api:${TAG}    (Agent API — port 4002)"
echo "═══════════════════════════════════════════════════════════════"
