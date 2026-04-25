#!/usr/bin/env node
import { spawnSync } from 'node:child_process';
import { existsSync, mkdirSync, readFileSync, readdirSync, rmSync, writeFileSync } from 'node:fs';
import { relative, resolve } from 'node:path';

const repoRoot = resolve(new URL('..', import.meta.url).pathname);
const reportRoot = resolve(repoRoot, process.env.OAO_TEST_REPORT_DIR || 'test-results/audit-report');
const logsDir = resolve(reportRoot, 'logs');
const sharedResultsPath = resolve(reportRoot, 'shared-vitest-results.json');
const apiResultsPath = resolve(reportRoot, 'oao-api-vitest-results.json');
const playwrightResultsPath = resolve(reportRoot, 'playwright-results.json');
const markdownPath = resolve(reportRoot, 'test-audit-report.md');
const htmlPath = resolve(reportRoot, 'test-audit-report.html');

const objectiveByFile = new Map([
  ['tests/e2e/smoke.spec.ts', 'Verifies the deployed UI base URL, Nuxt shell rendering, and login/auth-provider dependencies.'],
  ['tests/e2e/auth-flows.spec.ts', 'Verifies database registration/login/logout/password change, admin user management, and LDAP provider configuration/login.'],
  ['tests/e2e/agent-workflow-conversation.spec.ts', 'Verifies the primary happy path across agent CRUD, conversation startup, workflow CRUD, and manual workflow execution.'],
  ['tests/e2e/workflow-manual-run-inputs.spec.ts', 'Verifies webhook manual-run input validation and successful accepted payload handling.'],
  ['tests/e2e/workflow-security-abuse.spec.ts', 'Verifies webhook signature/PAT abuse protections, replay dedupe, token secrecy, trigger cleanup, and manual-run disablement without active webhooks.'],
  ['tests/e2e/executions-version-history.spec.ts', 'Verifies execution history/detail pages and immutable agent/workflow version snapshot navigation.'],
  ['packages/shared/tests/app/factory.test.ts', 'Verifies shared Hono app construction, health/events/metrics routes, CORS, error handling, and rate-limit wiring.'],
  ['packages/shared/tests/auth/jwt.test.ts', 'Verifies JWT creation, verification, claims, tamper detection, invalid secrets, and expiry handling.'],
  ['packages/shared/tests/auth/middleware.test.ts', 'Verifies Bearer auth middleware rejects missing/invalid/expired tokens and attaches valid user context.'],
  ['packages/shared/tests/middleware/rate-limiter.test.ts', 'Verifies shared rate-limiter limits, headers, remaining counters, and per-IP isolation.'],
  ['packages/shared/tests/sse/event-bus.test.ts', 'Verifies SSE connection setup, initial connected event, broadcast, disconnect handling, and connection counts.'],
  ['packages/shared/tests/utils/encryption.test.ts', 'Verifies AES-256-GCM encryption/decryption, random IVs, tamper detection, and missing-key failures.'],
  ['packages/shared/tests/utils/validation.test.ts', 'Verifies shared email, password, UUID, pagination, trigger, model, and variable validation schemas.'],
  ['packages/oao-api/tests/functional-weather-report.test.ts', 'Verifies a full functional API scenario: weather agent/files/workflow/triggers/executions/versioning/cleanup/edge cases.'],
  ['packages/oao-api/tests/server.test.ts', 'Verifies API health, OpenAPI, unknown routes, auth, agents, workflows, variables, triggers, executions, supervisor, and events.'],
  ['packages/oao-api/tests/routes.test.ts', 'Verifies broad API route behavior with mocked persistence and integrations.'],
  ['packages/oao-api/tests/routes-extended.test.ts', 'Verifies extended route behavior for agent files, trigger updates/deletes, executions, and variables.'],
  ['packages/oao-api/tests/security-fixes.test.ts', 'Verifies security regressions around admin-only routes, path traversal, PATs, events, workspaces, quotas, and public auth-provider listing.'],
  ['packages/oao-api/tests/agent-tools.test.ts', 'Verifies built-in agent tools, variable access/editing, workflow edits, scheduling, memory, decisions, and HTTP credential masking.'],
  ['packages/oao-api/tests/controller.test.ts', 'Verifies controller scheduling, polling, trigger dispatch, and workflow execution orchestration decisions.'],
  ['packages/oao-api/tests/workflow-engine.test.ts', 'Verifies workflow engine execution, retry, step allocation, static/ephemeral runtime behavior, and failure handling.'],
  ['packages/oao-api/tests/jinja-renderer.test.ts', 'Verifies workflow prompt template rendering and supported Jinja/Nunjucks variables/functions.'],
  ['packages/oao-api/tests/mcp-client.test.ts', 'Verifies MCP client connection/tool discovery behavior and error handling.'],
  ['packages/oao-api/tests/embedding-service.test.ts', 'Verifies embedding provider behavior and fallback/local embedding logic.'],
  ['packages/oao-api/tests/system-events.test.ts', 'Verifies system event emission, persistence, and event-related helper behavior.'],
  ['packages/oao-api/tests/trigger-definitions.test.ts', 'Verifies trigger definition metadata and validation contract.'],
  ['packages/oao-api/tests/jira-integration.test.ts', 'Verifies Jira trigger callback URL construction and Jira webhook payload normalization.'],
  ['packages/oao-api/tests/ldap-auth.test.ts', 'Verifies LDAP auth-provider login semantics, identifier handling, provisioning, and configuration behavior.'],
  ['packages/oao-api/tests/redis.test.ts', 'Verifies Redis client behavior and connection handling.'],
  ['packages/oao-api/tests/github-live.integration.test.ts', 'Gated live GitHub integration smoke test; skipped when credentials are absent.'],
  ['packages/oao-api/tests/jira-live.integration.test.ts', 'Gated live Jira integration smoke test; skipped when credentials are absent.'],
  ['packages/oao-api/tests/ldap-auth.integration.test.ts', 'Gated LDAP integration smoke test; skipped when LDAP fixture is absent.'],
]);

const commands = [
  {
    id: 'shared-vitest',
    label: 'Shared unit tests',
    command: 'npx',
    args: [
      'vitest', 'run', '--root', 'packages/shared',
      '--reporter=json', `--outputFile=${sharedResultsPath}`,
      '--coverage', '--coverage.reporter=json-summary', '--coverage.reporter=html',
      `--coverage.reportsDirectory=${resolve(reportRoot, 'shared-coverage')}`,
    ],
    jsonPath: sharedResultsPath,
  },
  {
    id: 'oao-api-vitest',
    label: 'API, integration, and functional tests',
    command: 'npx',
    args: [
      'vitest', 'run', '--root', 'packages/oao-api',
      '--reporter=json', `--outputFile=${apiResultsPath}`,
      '--coverage', '--coverage.reporter=json-summary', '--coverage.reporter=html',
      `--coverage.reportsDirectory=${resolve(reportRoot, 'oao-api-coverage')}`,
    ],
    jsonPath: apiResultsPath,
  },
  {
    id: 'playwright-e2e',
    label: 'Browser E2E tests',
    command: 'npx',
    args: ['playwright', 'test', '--project=chromium'],
    env: {
      PLAYWRIGHT_AUDIT: '1',
      OAO_TEST_REPORT_DIR: reportRoot,
    },
    jsonPath: playwrightResultsPath,
  },
];

function ensureCleanDir(path) {
  rmSync(path, { recursive: true, force: true });
  mkdirSync(path, { recursive: true });
}

function runCommand(entry) {
  const startedAt = new Date();
  const printable = `${entry.command} ${entry.args.join(' ')}`;
  console.log(`\n=== ${entry.label} ===`);
  console.log(printable);
  const result = spawnSync(entry.command, entry.args, {
    cwd: repoRoot,
    env: { ...process.env, ...(entry.env || {}) },
    encoding: 'utf8',
    maxBuffer: 1024 * 1024 * 80,
  });
  const output = `${result.stdout || ''}${result.stderr || ''}`;
  process.stdout.write(output);
  const logPath = resolve(logsDir, `${entry.id}.log`);
  writeFileSync(logPath, output, 'utf8');
  return {
    ...entry,
    printable,
    exitCode: result.status ?? 1,
    startedAt,
    finishedAt: new Date(),
    logPath,
  };
}

function readJson(path) {
  if (!existsSync(path)) return null;
  return JSON.parse(readFileSync(path, 'utf8'));
}

function normalizePath(path) {
  if (!path) return 'unknown';
  return relative(repoRoot, resolve(repoRoot, path)).replaceAll('\\', '/');
}

function relLink(path) {
  return relative(reportRoot, path).replaceAll('\\', '/').replaceAll(' ', '%20');
}

function statusLabel(status) {
  if (['passed', 'pass', 'success'].includes(status)) return 'passed';
  if (['failed', 'fail', 'error'].includes(status)) return 'failed';
  if (['skipped', 'skip', 'pending', 'todo'].includes(status)) return 'skipped';
  return status || 'unknown';
}

function objectiveFor(file, title) {
  const fileObjective = objectiveByFile.get(file)
    || objectiveByFile.get(`tests/e2e/${file}`)
    || 'Verifies the behavior described by the test names in this file.';
  return `${fileObjective} Test focus: ${title}.`;
}

function parseVitest(json, layer) {
  if (!json) return [];
  const rows = [];
  const suites = json.testResults || [];
  for (const suite of suites) {
    const file = normalizePath(suite.name || suite.filepath || suite.file || suite.path);
    const assertions = suite.assertionResults || suite.tests || [];
    for (const assertion of assertions) {
      const ancestors = assertion.ancestorTitles || assertion.suite || [];
      const title = assertion.fullName || [...ancestors, assertion.title || assertion.name].filter(Boolean).join(' > ');
      rows.push({
        layer,
        file,
        title,
        status: statusLabel(assertion.status),
        durationMs: assertion.duration ?? assertion.durationMs ?? null,
        objective: objectiveFor(file, title),
        evidence: [],
      });
    }
  }
  return rows;
}

function flattenPlaywrightSuites(suites, parents = []) {
  const rows = [];
  for (const suite of suites || []) {
    const nextParents = suite.title ? [...parents, suite.title] : parents;
    for (const spec of suite.specs || []) {
      const file = normalizePath(spec.file);
      for (const test of spec.tests || []) {
        const result = test.results?.at(-1) || {};
        const titleParts = [...nextParents, spec.title].filter(Boolean);
        const title = titleParts.join(' > ');
        const evidence = (result.attachments || [])
          .filter((attachment) => attachment.path)
          .map((attachment) => ({
            name: attachment.name || attachment.contentType || 'attachment',
            path: resolve(repoRoot, attachment.path),
            contentType: attachment.contentType || '',
          }));
        rows.push({
          layer: 'E2E',
          file,
          title,
          status: statusLabel(result.status || test.outcome || (spec.ok ? 'passed' : 'unknown')),
          durationMs: result.duration ?? null,
          objective: objectiveFor(file, title),
          evidence,
        });
      }
    }
    rows.push(...flattenPlaywrightSuites(suite.suites, nextParents));
  }
  return rows;
}

function parsePlaywright(json) {
  if (!json) return [];
  return flattenPlaywrightSuites(json.suites || []);
}

function summarize(rows) {
  return rows.reduce((acc, row) => {
    acc.total += 1;
    acc[row.status] = (acc[row.status] || 0) + 1;
    return acc;
  }, { total: 0, passed: 0, failed: 0, skipped: 0 });
}

function coverageSummary(path) {
  const json = readJson(path);
  const total = json?.total;
  if (!total) return 'not available';
  return `lines ${total.lines?.pct ?? 'n/a'}%, statements ${total.statements?.pct ?? 'n/a'}%, branches ${total.branches?.pct ?? 'n/a'}%, functions ${total.functions?.pct ?? 'n/a'}%`;
}

function listFilesRecursive(path, predicate, results = []) {
  if (!existsSync(path)) return results;
  for (const entry of readdirSync(path, { withFileTypes: true })) {
    const child = resolve(path, entry.name);
    if (entry.isDirectory()) listFilesRecursive(child, predicate, results);
    else if (predicate(child)) results.push(child);
  }
  return results;
}

function tableRow(cells) {
  return `| ${cells.map((cell) => String(cell ?? '').replaceAll('\n', '<br>').replaceAll('|', '\\|')).join(' | ')} |`;
}

function htmlEscape(value) {
  return String(value ?? '')
    .replaceAll('&', '&amp;')
    .replaceAll('<', '&lt;')
    .replaceAll('>', '&gt;')
    .replaceAll('"', '&quot;')
    .replaceAll("'", '&#39;');
}

function htmlLink(path, label) {
  return `<a href="${htmlEscape(relLink(path))}">${htmlEscape(label)}</a>`;
}

function htmlStatusClass(status) {
  if (status === 'passed') return 'status-passed';
  if (status === 'failed') return 'status-failed';
  if (status === 'skipped') return 'status-skipped';
  return 'status-unknown';
}

function renderCaseTable(title, rows) {
  const lines = [`### ${title}`, '', tableRow(['Status', 'Test', 'File', 'Objective / verification intent', 'Evidence'])];
  lines.push(tableRow(['---', '---', '---', '---', '---']));
  for (const row of rows) {
    const evidence = row.evidence.length
      ? row.evidence.map((item) => `[${item.name}](${relLink(item.path)})`).join('<br>')
      : '';
    lines.push(tableRow([
      row.status,
      row.title,
      row.file,
      row.objective,
      evidence,
    ]));
  }
  lines.push('');
  return lines;
}

function renderReport(commandResults, rows) {
  const generatedAt = new Date().toISOString();
  const sharedRows = rows.filter((row) => row.layer === 'Shared Unit');
  const apiRows = rows.filter((row) => row.layer === 'API / Functional');
  const e2eRows = rows.filter((row) => row.layer === 'E2E');
  const allSummary = summarize(rows);
  const screenshots = listFilesRecursive(resolve(reportRoot, 'playwright-artifacts'), (path) => path.endsWith('.png'));
  const traces = listFilesRecursive(resolve(reportRoot, 'playwright-artifacts'), (path) => path.endsWith('.zip'));

  const lines = [
    '# OAO Test Audit Report',
    '',
    `Generated: ${generatedAt}`,
    'Repository: open-agent-orchestra',
    `E2E base URL: ${process.env.E2E_BASE_URL || 'http://oao.local'}`,
    '',
    '## Executive Summary',
    '',
    tableRow(['Total', 'Passed', 'Failed', 'Skipped']),
    tableRow(['---:', '---:', '---:', '---:']),
    tableRow([allSummary.total, allSummary.passed || 0, allSummary.failed || 0, allSummary.skipped || 0]),
    '',
    '## Standard Reports And Evidence',
    '',
    tableRow(['Artifact', 'Location']),
    tableRow(['---', '---']),
    tableRow(['Shared Vitest JSON', `[shared-vitest-results.json](${relLink(sharedResultsPath)})`]),
    tableRow(['Shared coverage HTML', `[index.html](${relLink(resolve(reportRoot, 'shared-coverage/index.html'))})`]),
    tableRow(['OAO API Vitest JSON', `[oao-api-vitest-results.json](${relLink(apiResultsPath)})`]),
    tableRow(['OAO API coverage HTML', `[index.html](${relLink(resolve(reportRoot, 'oao-api-coverage/index.html'))})`]),
    tableRow(['HTML audit report', `[test-audit-report.html](${relLink(htmlPath)})`]),
    tableRow(['Playwright JSON', `[playwright-results.json](${relLink(playwrightResultsPath)})`]),
    tableRow(['Playwright HTML report', `[index.html](${relLink(resolve(reportRoot, 'playwright-html/index.html'))})`]),
    tableRow(['Command logs', `[logs/](${relLink(logsDir)}/)`]),
    '',
    '## Coverage Summary',
    '',
    tableRow(['Layer', 'Coverage']),
    tableRow(['---', '---']),
    tableRow(['Shared', coverageSummary(resolve(reportRoot, 'shared-coverage/coverage-summary.json'))]),
    tableRow(['OAO API', coverageSummary(resolve(reportRoot, 'oao-api-coverage/coverage-summary.json'))]),
    '',
    '## Commands Executed',
    '',
    tableRow(['Layer', 'Exit', 'Command', 'Log']),
    tableRow(['---', '---:', '---', '---']),
    ...commandResults.map((result) => tableRow([
      result.label,
      result.exitCode,
      result.printable,
      `[log](${relLink(result.logPath)})`,
    ])),
    '',
    '## Screenshot And Trace Evidence',
    '',
    `Playwright audit mode captured ${screenshots.length} screenshot artifact(s) and ${traces.length} trace archive(s). The HTML report is the best way to browse them interactively.`,
    '',
  ];

  if (screenshots.length > 0) {
    lines.push('Representative screenshots:', '');
    for (const screenshot of screenshots.slice(0, 12)) {
      lines.push(`![${relative(reportRoot, screenshot)}](${relLink(screenshot)})`);
      lines.push('');
    }
    if (screenshots.length > 12) {
      lines.push(`Additional screenshots are available under [playwright-artifacts/](${relLink(resolve(reportRoot, 'playwright-artifacts'))}/).`, '');
    }
  }

  lines.push(...renderCaseTable('Browser E2E Test Cases', e2eRows));
  lines.push(...renderCaseTable('API, Integration, And Functional Test Cases', apiRows));
  lines.push(...renderCaseTable('Shared Unit Test Cases', sharedRows));

  return lines.join('\n');
}

function renderHtmlCaseRows(rows) {
  return rows.map((row) => {
    const evidence = row.evidence.length
      ? row.evidence.map((item) => htmlLink(item.path, item.name)).join('<br>')
      : '<span class="muted">none</span>';

    return `<tr>
      <td><span class="status ${htmlStatusClass(row.status)}">${htmlEscape(row.status)}</span></td>
      <td>${htmlEscape(row.title)}</td>
      <td><code>${htmlEscape(row.file)}</code></td>
      <td>${htmlEscape(row.objective)}</td>
      <td>${evidence}</td>
    </tr>`;
  }).join('\n');
}

function renderHtmlCaseTable(title, rows) {
  return `<section>
    <h2>${htmlEscape(title)}</h2>
    <div class="table-wrap">
      <table>
        <thead>
          <tr>
            <th>Status</th>
            <th>Test</th>
            <th>File</th>
            <th>What It Verifies</th>
            <th>Evidence</th>
          </tr>
        </thead>
        <tbody>${renderHtmlCaseRows(rows)}</tbody>
      </table>
    </div>
  </section>`;
}

function renderHtmlReport(commandResults, rows) {
  const generatedAt = new Date().toISOString();
  const sharedRows = rows.filter((row) => row.layer === 'Shared Unit');
  const apiRows = rows.filter((row) => row.layer === 'API / Functional');
  const e2eRows = rows.filter((row) => row.layer === 'E2E');
  const allSummary = summarize(rows);
  const screenshots = listFilesRecursive(resolve(reportRoot, 'playwright-artifacts'), (path) => path.endsWith('.png'));
  const traces = listFilesRecursive(resolve(reportRoot, 'playwright-artifacts'), (path) => path.endsWith('.zip'));
  const sharedCoverage = coverageSummary(resolve(reportRoot, 'shared-coverage/coverage-summary.json'));
  const apiCoverage = coverageSummary(resolve(reportRoot, 'oao-api-coverage/coverage-summary.json'));

  const commandRows = commandResults.map((result) => `<tr>
    <td>${htmlEscape(result.label)}</td>
    <td><span class="status ${result.exitCode === 0 ? 'status-passed' : 'status-failed'}">${htmlEscape(result.exitCode)}</span></td>
    <td><code>${htmlEscape(result.printable)}</code></td>
    <td>${htmlLink(result.logPath, 'log')}</td>
  </tr>`).join('\n');

  const screenshotGallery = screenshots.length > 0
    ? screenshots.slice(0, 12).map((screenshot) => `<figure>
      <a href="${htmlEscape(relLink(screenshot))}"><img src="${htmlEscape(relLink(screenshot))}" alt="${htmlEscape(relative(reportRoot, screenshot))}"></a>
      <figcaption>${htmlEscape(relative(reportRoot, screenshot))}</figcaption>
    </figure>`).join('\n')
    : '<p class="muted">No screenshot artifacts were captured.</p>';

  return `<!doctype html>
<html lang="en">
<head>
  <meta charset="utf-8">
  <meta name="viewport" content="width=device-width, initial-scale=1">
  <title>OAO Test Audit Report</title>
  <style>
    :root { color-scheme: light; --bg: #f7f8fb; --panel: #ffffff; --text: #111827; --muted: #6b7280; --border: #d9dee8; --accent: #155eef; --pass: #087443; --fail: #b42318; --skip: #a15c07; --code: #eef2f7; }
    * { box-sizing: border-box; }
    body { margin: 0; background: var(--bg); color: var(--text); font: 14px/1.5 -apple-system, BlinkMacSystemFont, "Segoe UI", sans-serif; }
    header { background: #101828; color: #fff; padding: 32px max(24px, calc((100vw - 1180px) / 2)); }
    main { width: min(1180px, calc(100vw - 32px)); margin: 24px auto 56px; }
    h1 { margin: 0 0 8px; font-size: 30px; line-height: 1.2; }
    h2 { margin: 30px 0 12px; font-size: 20px; }
    a { color: var(--accent); text-decoration: none; }
    a:hover { text-decoration: underline; }
    code { display: inline-block; max-width: 520px; overflow-wrap: anywhere; border-radius: 4px; background: var(--code); padding: 2px 5px; font-family: ui-monospace, SFMono-Regular, Menlo, Consolas, monospace; font-size: 12px; }
    .muted { color: var(--muted); }
    .summary { display: grid; gap: 12px; grid-template-columns: repeat(auto-fit, minmax(160px, 1fr)); margin: 22px 0; }
    .card { background: var(--panel); border: 1px solid var(--border); border-radius: 8px; padding: 16px; }
    .card strong { display: block; font-size: 26px; line-height: 1; margin-bottom: 8px; }
    .links { display: grid; gap: 10px; grid-template-columns: repeat(auto-fit, minmax(230px, 1fr)); }
    .link-card { background: var(--panel); border: 1px solid var(--border); border-radius: 8px; padding: 14px; }
    .table-wrap { overflow-x: auto; background: var(--panel); border: 1px solid var(--border); border-radius: 8px; }
    table { width: 100%; border-collapse: collapse; min-width: 860px; }
    th, td { padding: 10px 12px; border-bottom: 1px solid var(--border); text-align: left; vertical-align: top; }
    th { background: #f0f3f8; font-size: 12px; text-transform: uppercase; letter-spacing: .04em; color: #344054; }
    tr:last-child td { border-bottom: 0; }
    .status { display: inline-flex; align-items: center; border-radius: 999px; padding: 2px 8px; font-size: 12px; font-weight: 700; }
    .status-passed { color: var(--pass); background: #ecfdf3; }
    .status-failed { color: var(--fail); background: #fef3f2; }
    .status-skipped { color: var(--skip); background: #fff7ed; }
    .status-unknown { color: #344054; background: #f2f4f7; }
    .gallery { display: grid; gap: 14px; grid-template-columns: repeat(auto-fit, minmax(260px, 1fr)); }
    figure { margin: 0; background: var(--panel); border: 1px solid var(--border); border-radius: 8px; padding: 10px; }
    img { display: block; width: 100%; border: 1px solid var(--border); border-radius: 6px; background: #fff; }
    figcaption { margin-top: 8px; color: var(--muted); font-size: 12px; overflow-wrap: anywhere; }
  </style>
</head>
<body>
  <header>
    <h1>OAO Test Audit Report</h1>
    <div>Generated ${htmlEscape(generatedAt)} for ${htmlEscape(process.env.E2E_BASE_URL || 'http://oao.local')}</div>
  </header>
  <main>
    <section class="summary" aria-label="Executive summary">
      <div class="card"><strong>${htmlEscape(allSummary.total)}</strong><span>Total checks</span></div>
      <div class="card"><strong>${htmlEscape(allSummary.passed || 0)}</strong><span>Passed</span></div>
      <div class="card"><strong>${htmlEscape(allSummary.failed || 0)}</strong><span>Failed</span></div>
      <div class="card"><strong>${htmlEscape(allSummary.skipped || 0)}</strong><span>Skipped</span></div>
    </section>

    <section>
      <h2>Reports And Evidence</h2>
      <div class="links">
        <div class="link-card">${htmlLink(markdownPath, 'Markdown audit report')}</div>
        <div class="link-card">${htmlLink(sharedResultsPath, 'Shared Vitest JSON')}</div>
        <div class="link-card">${htmlLink(resolve(reportRoot, 'shared-coverage/index.html'), 'Shared coverage HTML')}</div>
        <div class="link-card">${htmlLink(apiResultsPath, 'OAO API Vitest JSON')}</div>
        <div class="link-card">${htmlLink(resolve(reportRoot, 'oao-api-coverage/index.html'), 'OAO API coverage HTML')}</div>
        <div class="link-card">${htmlLink(playwrightResultsPath, 'Playwright JSON')}</div>
        <div class="link-card">${htmlLink(resolve(reportRoot, 'playwright-html/index.html'), 'Playwright HTML report')}</div>
        <div class="link-card">${htmlLink(logsDir, 'Command logs')}</div>
      </div>
    </section>

    <section>
      <h2>Coverage Summary</h2>
      <div class="table-wrap">
        <table>
          <thead><tr><th>Layer</th><th>Coverage</th></tr></thead>
          <tbody>
            <tr><td>Shared</td><td>${htmlEscape(sharedCoverage)}</td></tr>
            <tr><td>OAO API</td><td>${htmlEscape(apiCoverage)}</td></tr>
          </tbody>
        </table>
      </div>
    </section>

    <section>
      <h2>Commands Executed</h2>
      <div class="table-wrap">
        <table>
          <thead><tr><th>Layer</th><th>Exit</th><th>Command</th><th>Log</th></tr></thead>
          <tbody>${commandRows}</tbody>
        </table>
      </div>
    </section>

    <section>
      <h2>Screenshot And Trace Evidence</h2>
      <p>Playwright audit mode captured ${htmlEscape(screenshots.length)} screenshot artifact(s) and ${htmlEscape(traces.length)} trace archive(s). Use the Playwright HTML report for the richest trace viewer.</p>
      <div class="gallery">${screenshotGallery}</div>
    </section>

    ${renderHtmlCaseTable('Browser E2E Test Cases', e2eRows)}
    ${renderHtmlCaseTable('API, Integration, And Functional Test Cases', apiRows)}
    ${renderHtmlCaseTable('Shared Unit Test Cases', sharedRows)}
  </main>
</body>
</html>`;
}

ensureCleanDir(reportRoot);
mkdirSync(logsDir, { recursive: true });

const commandResults = commands.map(runCommand);
const rows = [
  ...parseVitest(readJson(sharedResultsPath), 'Shared Unit'),
  ...parseVitest(readJson(apiResultsPath), 'API / Functional'),
  ...parsePlaywright(readJson(playwrightResultsPath)),
];

writeFileSync(markdownPath, renderReport(commandResults, rows), 'utf8');
writeFileSync(htmlPath, renderHtmlReport(commandResults, rows), 'utf8');
console.log(`\nTest audit report written to ${relative(repoRoot, markdownPath)}`);
console.log(`HTML test audit report written to ${relative(repoRoot, htmlPath)}`);

if (commandResults.some((result) => result.exitCode !== 0)) {
  process.exit(1);
}
