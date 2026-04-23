import { defineConfig, devices } from '@playwright/test';

/**
 * Playwright configuration for OAO end-to-end tests.
 *
 * Target URL is configurable via E2E_BASE_URL (defaults to the locally-deployed
 * Nuxt UI on port 3002). When the target is not reachable, the smoke test
 * skips itself so the suite stays green in CI-less local workflows.
 */
export default defineConfig({
  testDir: './tests/e2e',
  timeout: 60_000,
  expect: { timeout: 10_000 },
  reporter: [['list']],
  retries: 0,
  forbidOnly: true,
  globalSetup: './tests/e2e/global-setup.ts',
  globalTeardown: './tests/e2e/global-teardown.ts',
  use: {
    baseURL: process.env.E2E_BASE_URL ?? 'http://oao.local',
    trace: 'retain-on-failure',
    screenshot: 'only-on-failure',
    video: 'retain-on-failure',
  },
  projects: [
    {
      name: 'chromium',
      use: {
        ...devices['Desktop Chrome'],
        launchOptions: {
          args: ['--host-resolver-rules=MAP oao.local 127.0.0.1'],
        },
      },
    },
  ],
});
