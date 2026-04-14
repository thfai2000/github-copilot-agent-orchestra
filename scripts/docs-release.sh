#!/usr/bin/env bash
# ────────────────────────────────────────────────────────────────────────
# docs-release.sh — Build & deploy versioned documentation to GitHub Pages
#
# Usage:
#   bash scripts/docs-release.sh <software-version>
#
# Example:
#   bash scripts/docs-release.sh 1.8.1
#
# What it does:
#   1. Derives the doc version from the software version (e.g., 1.8.1 → v1.8)
#   2. Updates docs/.vitepress/versions.ts with the new version if needed
#   3. Builds "latest" docs at the site root (base: /open-agent-orchestra/)
#   4. Builds versioned docs (base: /open-agent-orchestra/v1.8/)
#   5. Fetches existing gh-pages branch content to preserve older version snapshots
#   6. Combines everything: latest at root + all version snapshots
#   7. Force-pushes to gh-pages
#
# Version strategy:
#   - Doc versions use major.minor (e.g., v1.8) — patch releases update the
#     same doc version.
#   - The "latest" docs live at the site root.
#   - Older versions are preserved at /v{X.Y}/ subdirectories.
# ────────────────────────────────────────────────────────────────────────
set -euo pipefail

REPO_URL="git@github.com:thfai2000/open-agent-orchestra.git"
SITE_BASE="/open-agent-orchestra"
ROOT_DIR="$(cd "$(dirname "$0")/.." && pwd)"

# ── Parse arguments ──────────────────────────────────────────────────
if [[ $# -lt 1 ]]; then
  echo "Usage: bash scripts/docs-release.sh <software-version>"
  echo "Example: bash scripts/docs-release.sh 1.8.1"
  exit 1
fi

SOFTWARE_VERSION="$1"

# Derive doc version: 1.8.1 → v1.8
IFS='.' read -r MAJOR MINOR _PATCH <<< "$SOFTWARE_VERSION"
DOC_VERSION="v${MAJOR}.${MINOR}"

echo "═══════════════════════════════════════════════════════════════"
echo "  Docs Release"
echo "  Software version: $SOFTWARE_VERSION"
echo "  Doc version:      $DOC_VERSION"
echo "═══════════════════════════════════════════════════════════════"

cd "$ROOT_DIR"

# ── Step 1: Update versions.ts if this doc version is new ────────────
VERSIONS_FILE="docs/.vitepress/versions.ts"

if ! grep -q "'${DOC_VERSION}'" "$VERSIONS_FILE"; then
  echo ""
  echo "→ Adding $DOC_VERSION to versions registry..."

  # Mark previous latest as non-latest
  # Change: { version: 'vX.Y', latest: true },
  # To:     { version: 'vX.Y' },
  sed -i '' "s/{ version: '\(v[0-9]*\.[0-9]*\)', latest: true }/{ version: '\1' }/" "$VERSIONS_FILE"

  # Insert new latest entry after the opening bracket of DOC_VERSIONS array
  sed -i '' "/^export const DOC_VERSIONS: DocVersion\[\] = \[$/a\\
\\  { version: '${DOC_VERSION}', latest: true },
" "$VERSIONS_FILE"

  echo "  ✓ versions.ts updated"
else
  echo ""
  echo "→ $DOC_VERSION already in versions registry, skipping update"
fi

# ── Step 2: Build latest docs (root) ────────────────────────────────
echo ""
echo "→ Building latest docs (root)..."
npm run docs:build
echo "  ✓ Latest docs built → docs-dist/"

# ── Step 3: Build versioned docs ────────────────────────────────────
echo ""
echo "→ Building versioned docs ($DOC_VERSION)..."
DOCS_BASE="${SITE_BASE}/${DOC_VERSION}/" \
  DOCS_OUTDIR="../docs-dist-versioned" \
  npm run docs:build
echo "  ✓ Versioned docs built → docs-dist-versioned/"

# ── Step 4: Fetch existing gh-pages content ─────────────────────────
STAGING_DIR="$(mktemp -d)"
echo ""
echo "→ Fetching existing gh-pages branch..."

if git ls-remote --exit-code --heads "$REPO_URL" gh-pages &>/dev/null; then
  git clone --branch gh-pages --depth 1 "$REPO_URL" "$STAGING_DIR/existing" 2>/dev/null || true
  if [[ -d "$STAGING_DIR/existing" ]]; then
    # Remove root-level files (will be replaced by latest build)
    # Keep only versioned directories (v*.*)
    cd "$STAGING_DIR/existing"
    # Remove everything except versioned directories and .git
    find . -maxdepth 1 -not -name '.' -not -name '.git' -not -name 'v*.*' -exec rm -rf {} +
    cd "$ROOT_DIR"
    echo "  ✓ Preserved existing version snapshots from gh-pages"
  fi
else
  mkdir -p "$STAGING_DIR/existing"
  echo "  ℹ No existing gh-pages branch (first deployment)"
fi

# ── Step 5: Combine everything ──────────────────────────────────────
DEPLOY_DIR="$STAGING_DIR/deploy"
mkdir -p "$DEPLOY_DIR"

# Copy preserved versioned directories first
if [[ -d "$STAGING_DIR/existing" ]]; then
  # Copy any existing v*.* directories
  for vdir in "$STAGING_DIR/existing"/v*.*; do
    if [[ -d "$vdir" ]]; then
      cp -r "$vdir" "$DEPLOY_DIR/"
    fi
  done
fi

# Copy latest build (root)
cp -r docs-dist/* "$DEPLOY_DIR/"

# Copy versioned build into subdirectory
mkdir -p "$DEPLOY_DIR/$DOC_VERSION"
cp -r docs-dist-versioned/* "$DEPLOY_DIR/$DOC_VERSION/"

# Ensure .nojekyll exists
touch "$DEPLOY_DIR/.nojekyll"

echo ""
echo "→ Combined deployment directory:"
echo "  Root (latest): $(ls "$DEPLOY_DIR"/*.html 2>/dev/null | wc -l | tr -d ' ') HTML files"
for vdir in "$DEPLOY_DIR"/v*.*; do
  if [[ -d "$vdir" ]]; then
    echo "  $(basename "$vdir")/: $(find "$vdir" -name '*.html' | wc -l | tr -d ' ') HTML files"
  fi
done

# ── Step 6: Deploy to gh-pages ──────────────────────────────────────
echo ""
echo "→ Deploying to gh-pages..."
cd "$DEPLOY_DIR"
git init
git checkout -b gh-pages
git add -A
git commit -m "docs: release $DOC_VERSION (software $SOFTWARE_VERSION)"
git push -f "$REPO_URL" gh-pages
cd "$ROOT_DIR"

# ── Cleanup ─────────────────────────────────────────────────────────
rm -rf "$STAGING_DIR"
rm -rf docs-dist-versioned

echo ""
echo "═══════════════════════════════════════════════════════════════"
echo "  ✓ Docs released successfully!"
echo ""
echo "  Latest:    https://thfai2000.github.io/open-agent-orchestra/"
echo "  $DOC_VERSION:     https://thfai2000.github.io/open-agent-orchestra/$DOC_VERSION/"
echo "═══════════════════════════════════════════════════════════════"
