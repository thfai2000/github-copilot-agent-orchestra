/**
 * GitHub PAT live integration test using `TESTING_GITHUB_PAT` from .env.
 * Gated on RUN_GITHUB_INTEGRATION=1 + secret presence so the default run
 * remains offline.
 */
import { describe, it, expect } from 'vitest';
import { hasSecrets } from '../../../tests/helpers/test-env.js';

const gated = process.env.RUN_GITHUB_INTEGRATION === '1' && hasSecrets(['TESTING_GITHUB_PAT']);

describe.skipIf(!gated)('GitHub PAT live integration', () => {
  it('authenticates against /user', async () => {
    const token = process.env.TESTING_GITHUB_PAT!;
    const res = await fetch('https://api.github.com/user', {
      headers: {
        Authorization: `Bearer ${token}`,
        Accept: 'application/vnd.github+json',
        'User-Agent': 'oao-test',
      },
    });
    expect(res.status).toBe(200);
    const json = (await res.json()) as Record<string, unknown>;
    expect(typeof json.login).toBe('string');
  }, 30_000);
});
