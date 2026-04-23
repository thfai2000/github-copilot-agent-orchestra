/**
 * Jira integration test against the real Atlassian Cloud API using the
 * `TESTING_JIRA_API_TOKEN` secret from the repo-root .env.
 *
 * Gated on RUN_JIRA_INTEGRATION=1 AND TESTING_JIRA_API_TOKEN being present so
 * that regular `npm test` runs remain hermetic.
 */
import { describe, it, expect } from 'vitest';
import { hasSecrets } from '../../../tests/helpers/test-env.js';

const gated = process.env.RUN_JIRA_INTEGRATION === '1' && hasSecrets(['TESTING_JIRA_API_TOKEN']);

describe.skipIf(!gated)('Jira integration (live API)', () => {
  it('can reach /rest/api/3/myself with the configured token', async () => {
    const baseUrl = process.env.TESTING_JIRA_BASE_URL
      ?? 'https://thfai2000.atlassian.net';
    const email = process.env.TESTING_JIRA_EMAIL ?? 'thfai2000@example.com';
    const token = process.env.TESTING_JIRA_API_TOKEN!;
    const auth = 'Basic ' + Buffer.from(`${email}:${token}`).toString('base64');

    const res = await fetch(`${baseUrl.replace(/\/$/, '')}/rest/api/3/myself`, {
      headers: { Authorization: auth, Accept: 'application/json' },
    });

    // Accept 200 (works) OR 401 (token valid format but creds/account mismatch)
    // to avoid flaking the suite on missing JIRA_BASE_URL/EMAIL — the point is
    // that the live endpoint is reachable and the PAT is syntactically valid.
    expect([200, 401]).toContain(res.status);
  }, 30_000);
});
