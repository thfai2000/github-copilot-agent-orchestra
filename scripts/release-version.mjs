#!/usr/bin/env node

import { execFileSync } from 'node:child_process';
import { readFileSync, writeFileSync } from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const rootDir = path.resolve(__dirname, '..');

const semverPattern = /^\d+\.\d+\.\d+$/;
const args = process.argv.slice(2);

function usage() {
  console.error('Usage: node scripts/release-version.mjs --bump <patch|minor|major>');
  console.error('   or: node scripts/release-version.mjs --set <x.y.z>');
  process.exit(1);
}

function readJson(relativePath) {
  return JSON.parse(readFileSync(path.join(rootDir, relativePath), 'utf8'));
}

function bumpVersion(currentVersion, bumpType) {
  const [major, minor, patch] = currentVersion.split('.').map(Number);
  if (bumpType === 'patch') {
    return `${major}.${minor}.${patch + 1}`;
  }
  if (bumpType === 'minor') {
    return `${major}.${minor + 1}.0`;
  }
  if (bumpType === 'major') {
    return `${major + 1}.0.0`;
  }
  usage();
}

function replaceOnce(content, pattern, replacement, filePath) {
  if (!pattern.test(content)) {
    throw new Error(`Unable to update ${filePath}: pattern ${pattern} not found`);
  }
  return content.replace(pattern, replacement);
}

function updateTextFile(relativePath, replacements) {
  const filePath = path.join(rootDir, relativePath);
  let content = readFileSync(filePath, 'utf8');

  for (const [pattern, replacement] of replacements) {
    content = replaceOnce(content, pattern, replacement, relativePath);
  }

  writeFileSync(filePath, content);
}

const rootPackage = readJson('package.json');
const currentVersion = String(rootPackage.version ?? '').trim();

let targetVersion;
if (args[0] === '--set' && args[1]) {
  targetVersion = args[1].trim();
} else if (args[0] === '--bump' && args[1]) {
  targetVersion = bumpVersion(currentVersion, args[1].trim());
} else {
  usage();
}

if (!semverPattern.test(targetVersion)) {
  console.error(`Invalid semantic version: ${targetVersion}`);
  process.exit(1);
}

process.chdir(rootDir);

execFileSync(
  'npm',
  ['version', targetVersion, '--no-git-tag-version', '--workspaces', '--include-workspace-root'],
  { stdio: 'inherit' },
);

updateTextFile('helm/oao-platform/Chart.yaml', [
  [/^version: .*$/m, `version: ${targetVersion}`],
  [/^appVersion: ".*"$/m, `appVersion: "${targetVersion}"`],
]);

updateTextFile('helm/oao-platform/values.yaml', [
  [/^coreImage: oao-core:.*$/m, `coreImage: oao-core:${targetVersion}`],
  [/^(\s+image: )oao-ui:.*$/m, `$1oao-ui:${targetVersion}`],
]);

console.log(`Release version set to ${targetVersion}`);