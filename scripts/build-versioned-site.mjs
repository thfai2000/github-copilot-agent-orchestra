#!/usr/bin/env node

import { execFileSync } from 'node:child_process';
import { copyFileSync, existsSync, mkdirSync, readFileSync, rmSync, writeFileSync } from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const rootDir = path.resolve(__dirname, '..');
const siteBase = '/open-agent-orchestra';
const siteUrl = 'https://thfai2000.github.io/open-agent-orchestra';
const outputDir = path.join(rootDir, 'docs-dist');
const chartsDir = path.join(outputDir, 'charts');
const worktreeRoot = path.join(rootDir, '.tmp-docs-site');
const vitepressCli = path.join(rootDir, 'node_modules', 'vitepress', 'dist', 'node', 'cli.js');
const versionLimit = Number.parseInt(process.env.DOCS_VERSION_LIMIT ?? '5', 10);
const semverPattern = /^v?(\d+)\.(\d+)\.(\d+)$/;

function run(command, args, options = {}) {
  return execFileSync(command, args, {
    cwd: rootDir,
    stdio: 'pipe',
    encoding: 'utf8',
    ...options,
  }).trim();
}

function runInherited(command, args, options = {}) {
  execFileSync(command, args, {
    cwd: rootDir,
    stdio: 'inherit',
    ...options,
  });
}

function parseSemver(value) {
  const match = value.match(semverPattern);
  if (!match) {
    return null;
  }

  return {
    raw: value,
    version: `${match[1]}.${match[2]}.${match[3]}`,
    parts: [Number(match[1]), Number(match[2]), Number(match[3])],
  };
}

function compareSemver(a, b) {
  for (let index = 0; index < a.parts.length; index += 1) {
    if (a.parts[index] !== b.parts[index]) {
      return b.parts[index] - a.parts[index];
    }
  }
  return a.raw.localeCompare(b.raw);
}

function getCurrentVersion() {
  const packageJson = JSON.parse(readFileSync(path.join(rootDir, 'package.json'), 'utf8'));
  return String(packageJson.version ?? '').trim();
}

function listTaggedVersions() {
  const rawTags = run('git', ['tag', '--list']).split('\n').map((value) => value.trim()).filter(Boolean);
  const parsed = rawTags.map(parseSemver).filter(Boolean).sort(compareSemver);
  const uniqueByVersion = new Map();

  for (const tag of parsed) {
    if (!uniqueByVersion.has(tag.version)) {
      uniqueByVersion.set(tag.version, tag);
    }
  }

  return [...uniqueByVersion.values()];
}

function buildDocVersions(currentVersion, taggedVersions) {
  const includeCurrentTag = taggedVersions.some((entry) => entry.version === currentVersion);
  const maxTaggedSnapshots = includeCurrentTag ? Math.max(versionLimit - 1, 0) : Math.max(versionLimit - 1, 0);
  const retainedTags = taggedVersions
    .filter((entry) => entry.version !== currentVersion)
    .slice(0, maxTaggedSnapshots);
  const displayVersions = [{ version: currentVersion, latest: true }, ...retainedTags.map((entry) => ({ version: entry.version }))];
  const taggedSnapshots = includeCurrentTag
    ? [taggedVersions.find((entry) => entry.version === currentVersion), ...retainedTags]
    : retainedTags;

  return {
    displayVersions,
    taggedSnapshots: taggedSnapshots.filter(Boolean),
  };
}

function renderVersionsModule(versions) {
  const items = versions
    .map((entry, index) => `  { version: '${entry.version}'${index === 0 ? ', latest: true' : ''} },`)
    .join('\n');

  return `export interface DocVersion {\n  version: string;\n  latest?: boolean;\n}\n\nexport const DOC_VERSIONS: DocVersion[] = [\n${items}\n];\n`;
}

function buildDocs(checkoutDir, base, outDir, versions, shouldOverrideVersionsFile = false) {
  if (shouldOverrideVersionsFile) {
    writeFileSync(path.join(checkoutDir, 'docs', '.vitepress', 'versions.ts'), renderVersionsModule(versions));
  }

  mkdirSync(path.dirname(outDir), { recursive: true });
  runInherited('node', [vitepressCli, 'build', path.join(checkoutDir, 'docs')], {
    cwd: checkoutDir,
    env: {
      ...process.env,
      DOCS_BASE: base,
      DOCS_OUTDIR: outDir,
      DOC_VERSIONS_JSON: JSON.stringify(versions),
    },
  });
}

function buildChartsFromCheckout(checkoutDir) {
  runInherited('helm', ['package', path.join(checkoutDir, 'helm', 'oao-platform'), '--destination', chartsDir]);
}

function resetOutput() {
  rmSync(outputDir, { recursive: true, force: true });
  rmSync(worktreeRoot, { recursive: true, force: true });
  mkdirSync(outputDir, { recursive: true });
  mkdirSync(chartsDir, { recursive: true });
}

function addWorktree(tag) {
  const worktreeDir = path.join(worktreeRoot, tag.version);
  rmSync(worktreeDir, { recursive: true, force: true });
  mkdirSync(worktreeRoot, { recursive: true });
  runInherited('git', ['worktree', 'add', '--detach', worktreeDir, tag.raw]);
  return worktreeDir;
}

function removeWorktree(worktreeDir) {
  if (existsSync(worktreeDir)) {
    runInherited('git', ['worktree', 'remove', '--force', worktreeDir]);
  }
}

function main() {
  const currentVersion = getCurrentVersion();
  const taggedVersions = listTaggedVersions();
  const { displayVersions, taggedSnapshots } = buildDocVersions(currentVersion, taggedVersions);

  resetOutput();

  buildDocs(rootDir, `${siteBase}/`, outputDir, displayVersions);

  for (const tag of taggedSnapshots) {
    const worktreeDir = addWorktree(tag);
    try {
      buildDocs(worktreeDir, `${siteBase}/${tag.version}/`, path.join(outputDir, tag.version), displayVersions, true);
      buildChartsFromCheckout(worktreeDir);
    } finally {
      removeWorktree(worktreeDir);
    }
  }

  if (!existsSync(chartsDir) || run('bash', ['-lc', `find '${chartsDir}' -name '*.tgz' | head -n 1`]).length === 0) {
    buildChartsFromCheckout(rootDir);
  }

  runInherited('helm', ['repo', 'index', chartsDir, '--url', `${siteUrl}/charts`]);
  copyFileSync(path.join(rootDir, 'artifacthub-repo.yml'), path.join(outputDir, 'artifacthub-repo.yml'));
  writeFileSync(path.join(outputDir, '.nojekyll'), '');
  rmSync(worktreeRoot, { recursive: true, force: true });

  console.log(`Built docs site with latest=${currentVersion} and ${taggedSnapshots.length} tagged snapshot(s).`);
}

main();