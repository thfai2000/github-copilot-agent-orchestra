import { test, expect } from './helpers/fixtures';

/**
 * Returns true if the configured baseURL responds within the timeout.
 * Used to skip E2E smoke tests when the stack is not running locally.
 */
async function baseUrlReachable(url: string): Promise<boolean> {
  try {
    const controller = new AbortController();
    const timeout = setTimeout(() => controller.abort(), 2000);
    const target = url.includes('oao.local')
      ? 'http://127.0.0.1/api/auth/providers?workspace=default'
      : url;
    const res = await fetch(target, {
      signal: controller.signal,
      headers: url.includes('oao.local') ? { Host: 'oao.local' } : undefined,
    });
    clearTimeout(timeout);
    return res.ok;
  } catch {
    return false;
  }
}

test.describe('OAO UI — smoke', () => {
  test.beforeAll(async ({ }, testInfo) => {
    const baseURL = testInfo.project.use.baseURL ?? 'http://localhost:3002';
    const up = await baseUrlReachable(baseURL);
    test.skip(!up, `OAO UI at ${baseURL} is not reachable — start it (kubectl port-forward svc/oao-ui 3002:3002) to enable E2E.`);
  });

  test('home page responds with HTML and Nuxt markers', async ({ page, request }) => {
    const res = await request.get('/');
    expect(res.status()).toBe(200);
    const body = await res.text();
    expect(body).toContain('<!DOCTYPE html>');
    // Nuxt 3 injects a __nuxt hydration script
    expect(body).toMatch(/__nuxt|window\.__NUXT__|id="__nuxt"/);
  });

  test('renders a <html> element when loaded in the browser', async ({ page }) => {
    await page.goto('/');
    await expect(page.locator('html')).toBeVisible();
  });

  test('login dependencies are reachable through the configured base URL', async ({ request }) => {
    const res = await request.get('/api/auth/providers?workspace=default');
    expect(res.status()).toBe(200);
    const body = await res.json();
    expect(Array.isArray(body.providers)).toBe(true);
    expect(body.providers.length).toBeGreaterThan(0);
  });
});
