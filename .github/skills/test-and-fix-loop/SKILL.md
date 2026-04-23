# Skill: test-and-fix-loop

**Description**: A professional, product-aware test-and-fix workflow for OAO.
Use it when the task requires writing or revising tests, evaluating whether the
current behavior is actually correct, fixing broken logic, and iterating until
the relevant layers are green. This skill covers unit, API, integration, and
Playwright E2E work with explicit attention to product intent, role-based
behavior, security boundaries, and workflow orchestration semantics.

---

## When to use

- User explicitly says "execute the test-and-fix loop" / "run tests until they pass".
- After a large refactor, when multiple test layers need to be stabilized together.
- When adding new tests and then stabilizing them against the real code.
- When the user expects product judgment, not blind assertion updates.
- When the code may be wrong and tests need to enforce documented behavior.

## When NOT to use

- A single obvious failing test → just fix it directly.
- Non-test work (feature implementation without test failures).
- User wants a dry analysis only (no fixes).

---

## Product-owner review pass (mandatory before adding broad tests)

Before writing or revising a large batch of tests:

1. Read the relevant `docs/` pages and treat them as the intended product contract.
2. Map the request into a scenario matrix:
  - user roles (`super_admin`, `workspace_admin`, `creator_user`, `view_user`)
  - auth modes (database, LDAP, PAT where relevant)
  - entity lifecycle (create, read, update, delete, archive, retry, versioning)
  - trigger types (`time_schedule`, `exact_datetime`, `webhook`, `event`, Jira)
  - workflow states (draft-ish editing, active, inactive, pending execution, failed execution)
  - conversation states (new thread, send turn, stream, tool activity, override settings)
3. Identify mismatches between docs, UI, and API.
4. If the current code is inconsistent with the documented intent, fix the code and then write the test.
5. Do **not** normalize obviously bad product behavior just because it exists today.

Examples of logic defects worth fixing before or alongside tests:

- UI claims an identifier must be an email when LDAP config supports usernames.
- Role-restricted pages are visible or actionable for the wrong role.
- Delete flows succeed without confirmation or fail silently.
- Trigger forms omit required fields for the documented trigger type.
- Docs say one priority order but the implementation uses the opposite order.

---

## Prerequisites (verify before entering the loop)

1. `.env` at repo root contains the test secrets the user referenced:
   - `GITHUB_TOKEN` (PAT) – for GitHub-integration tests.
   - `JIRA_BASE_URL`, `JIRA_EMAIL`, `JIRA_API_TOKEN` – for Jira-integration tests.
   - `ENCRYPTION_KEY` (32-byte hex), `JWT_SECRET`, `AGENT_DATABASE_URL`,
     `REDIS_URL`, `DEFAULT_LLM_API_KEY` (optional).
2. Docker is running (needed for LDAP container + Postgres/Redis if E2E use them).
3. `npm install` has been run at the repo root (monorepo workspaces).
4. For E2E: Playwright browsers installed (`npx playwright install --with-deps chromium`).
5. For LDAP-dependent tests: `dwimberger/ldap-ad-it` container reachable on
   localhost:10389 (plain) / 10636 (ldaps). Start with:
   ```bash
   docker run --rm -d --name oao-test-ldap -p 10389:10389 -p 10636:10636 dwimberger/ldap-ad-it
   ```
6. For Playwright against the deployed stack: ensure OAO-UI is reachable on
  `http://localhost:3002` (for example via `kubectl -n open-agent-orchestra port-forward svc/oao-ui 3002:3002`).

---

## Test layers (run in this order)

| Order | Layer         | Command                                                              | Scope                                                     |
|-------|---------------|----------------------------------------------------------------------|-----------------------------------------------------------|
| 1     | TypeScript    | `npx tsc --noEmit -p packages/shared/tsconfig.json` then API         | Fast fail – catches type regressions                      |
| 2     | Lint          | `npm run lint`                                                       | Fast fail                                                 |
| 3     | Unit tests    | `npm test --workspace=@oao/shared`                                   | Pure logic, no I/O                                        |
| 4     | API tests     | `npm test --workspace=@oao/oao-api`                                  | Hono routes + service layer, mocked DB / integrations     |
| 5     | E2E (Playwright) | `npm run test:e2e` (root)                                         | Full stack via local deploy or docker-compose             |

Stop the loop early at the first layer that fails; fix there before moving on.

### Within each layer, prefer this order of work

1. Tight, behavior-specific failing test.
2. Focused repair in the owning code path.
3. Re-run only the affected test file.
4. Re-run the whole layer.
5. Only then widen to adjacent scenarios.

---

## The loop

```
LOOP until green OR stall_budget exhausted:
  0. Re-check product intent in docs if the failure suggests ambiguous behavior.
  1. Run next-highest failing layer (see order above).
  2. Capture:
       - failing test file + test name
       - error message, stack, first 30 lines of diff vs expected
  3. Classify the failure:
    a. Test bug  → update the test expectation / fixture.
    b. Source bug → fix in packages/<pkg>/src.
    c. Contract bug → docs/UI/API disagree; align them and then lock with tests.
    d. Environment bug (missing env, LDAP container down, port taken) → fix env then retry.
    e. Flake (timing / network) → add await, increase timeout, or mock the network.
  4. Apply the smallest fix that addresses the root cause.
  5. Re-run the *same* failing test file only (fast feedback).
  6. When the single-file run is green, re-run the whole layer.
  7. When the layer is green, move to the next layer and repeat.
```

### Stall budget

- Max **3 consecutive iterations** on the same failing test without net
  progress (error message / line must change). If the budget is hit:
  - Summarize what was tried, stop the loop, report to the user, and ask for
    direction. Do **not** silently skip the test or add `.skip`.
- Hard cap: **10 loop iterations per layer** total.

### Never do

- `it.skip` / `test.skip` / `.only` as a "fix".
- Delete a failing test to make the suite green.
- Weaken an assertion just because it fails (e.g. `toBe(x)` → `toBeTruthy()`).
- Add `--passWithNoTests`-style escape hatches.
- Commit real secrets. Always load from `.env` via `process.env.*`.
- Run `build.sh` or `deploy.sh` inside this loop – stabilization only.
- Turn an integration or E2E failure into a mocked test unless the product boundary is external.
- Treat documentation drift as acceptable when the docs clearly describe the intended behavior.

---

## Mocking strategy (must follow)

| Dependency        | Strategy                                                           |
|-------------------|--------------------------------------------------------------------|
| Postgres          | Drizzle mock object (`vi.mock('../src/database/connection')`) for unit/API; real Postgres only for E2E in docker-compose. |
| Redis / BullMQ    | `vi.mock('bullmq')` returning in-memory queue stub.                |
| `@github/copilot-sdk` | `vi.mock('@github/copilot-sdk')` with module-level mocks for `CopilotClient` + `createSession`. |
| GitHub API        | Real PAT from `.env` only for dedicated integration tests gated by `if (!process.env.GITHUB_TOKEN) it.skip`. Otherwise mock `fetch`. |
| Jira              | Same pattern: real creds from `.env` only in tagged integration tests; unit/API use `msw` / `nock` or `vi.spyOn(global, 'fetch')`. |
| LDAP / AD         | `dwimberger/ldap-ad-it` container on localhost:10389. Tests must start/stop the container via a global setup helper (`tests/helpers/ldap-container.ts`). |
| Playwright backend | Prefer the real deployed/local stack. If using the local Kubernetes deployment, start a deterministic port-forward in `globalSetup`; tear it down in `globalTeardown`. |

### Boundary rule

- **Inside OAO**: prefer real behavior over mocks (UI, routing, auth, DB-backed state transitions, trigger wiring, role restrictions).
- **Outside OAO**: use either a fake boundary (LDAP container) or dedicated gated live tests (GitHub PAT, Jira token).
- Use mocks only to isolate a unit or service slice when the test objective is local logic, not platform integration.

---

## Scenario matrix that must be considered for broad testing work

### Auth and identity

- Database register → login → logout → change password → re-login.
- LDAP login with non-email identifier when configured that way.
- Provider selector behavior when multiple auth providers are enabled.
- Admin auth-provider create / test / update / delete.

### Role-based behavior

- `super_admin` system/admin surfaces.
- `workspace_admin` workspace administration.
- `creator_user` create/manage own agents and workflows.
- `view_user` read-only behavior and forbidden actions.

### CRUD lifecycles

- Agents: create, edit, pause/activate, delete, version navigation where relevant.
- Workflows: create, edit defaults, edit steps, add/edit/delete triggers, manual run, delete.
- Conversations: create, send turn, switch agent, override model/tools, stream visibility.
- Admin users: create, role change, access enforcement.
- Variables/models/auth providers: at minimum admin CRUD on the relevant screens.

### Trigger coverage

- `time_schedule`
- `exact_datetime`
- `webhook`
- `event`
- Jira changes notification
- Jira polling

Each trigger test should validate both configuration persistence and at least one execution-path behavior where practical.

---

## Evidence expected from E2E tests

An E2E test is not complete unless it verifies at least one of these outcomes:

- The user sees the expected page transition or state change.
- The backing API returns the expected server response.
- The persisted entity is visible on the corresponding list/detail page.
- A side effect appears in executions/events/history where the product promises it.
- A forbidden action is blocked for the wrong role.

---

## Reporting format (after each loop iteration)

Emit a short status block to the user:

```
[loop N] layer=<unit|api|e2e>  passed=<p>  failed=<f>  fixed_this_iter=<list>
next=<file::test to attack>
product_delta=<logic fixes or contract corrections applied>
```

Final summary when green:

```
All layers green ✅
  unit:   <p>/<total>  time=<s>
  api:    <p>/<total>  time=<s>
  e2e:    <p>/<total>  time=<s>
```

---

## Quick reference: where the tests live

- Unit (shared): `packages/shared/tests/**/*.test.ts`
- Unit + API: `packages/oao-api/tests/**/*.test.ts`
- UI component (optional): `packages/oao-ui/tests/**/*.spec.ts`
- E2E (Playwright): `tests/e2e/**/*.spec.ts` at repo root, config `playwright.config.ts`

## Quick reference: helpers to prefer

- `tests/helpers/ldap-container.ts` – start/stop faked AD.
- `tests/helpers/test-env.ts` – loads `.env`, asserts required keys.
- `tests/helpers/http-mocks.ts` – reusable GitHub/Jira fetch mocks.
- `packages/oao-api/tests/helpers/db-mock.ts` – Drizzle mock factory.
- `tests/e2e/helpers/cluster.ts` – cluster-backed Playwright setup, port-forward, DB/admin reset helpers.
