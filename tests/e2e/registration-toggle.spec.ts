/**
 * E2E · Registration toggle
 *
 * Covers user request category 2:
 *   - When `workspace.allowRegistration === true`, public registration succeeds.
 *   - When `allowRegistration === false`, the API returns 403 and the UI hides
 *     or blocks the form.
 *
 * The test toggles the flag via the super-admin API, exercises both states,
 * then restores the original setting so other specs are unaffected.
 */

import { test, expect } from './helpers/fixtures';
import { resetSuperAdminPassword, uniqueEmail } from './helpers/cluster';
import { loginApi, disposeClient } from './helpers/api-auth';

const ADMIN_EMAIL = 'admin@oao.local';
const ADMIN_PASSWORD = 'AdminPass123!';
const PASSWORD = 'RegPass123!';

test.describe.configure({ mode: 'serial' });

test.beforeAll(async () => {
  await resetSuperAdminPassword(ADMIN_PASSWORD);
});

test('public registration succeeds when allowRegistration=true and is rejected when false', async ({ page }, testInfo) => {
  const baseURL = testInfo.project.use.baseURL!;
  const admin = await loginApi({ baseURL, identifier: ADMIN_EMAIL, password: ADMIN_PASSWORD });

  // Look up the default workspace + remember its current setting so we can restore it.
  const wsList = await admin.request.get('/api/workspaces');
  expect(wsList.ok()).toBe(true);
  const wsBody = (await wsList.json()) as { workspaces: Array<{ id: string; slug: string; allowRegistration: boolean }> };
  const defaultWs = wsBody.workspaces.find((w) => w.slug === 'default');
  expect(defaultWs, 'expected the default workspace to exist').toBeTruthy();
  const originalSetting = defaultWs!.allowRegistration;

  try {
    // ── Phase 1: enable registration ─────────────────────────────────────
    const enable = await admin.request.put(`/api/workspaces/${defaultWs!.id}`, {
      data: { allowRegistration: true },
    });
    expect(enable.ok(), await enable.text()).toBe(true);

    const enabledEmail = uniqueEmail('reg-on');
    const r1 = await admin.request.post('/api/auth/register', {
      data: {
        name: 'Reg Enabled',
        email: enabledEmail,
        password: PASSWORD,
        workspaceSlug: 'default',
      },
    });
    expect(r1.status(), await r1.text()).toBe(201);

    // The /api/auth/providers response should advertise allowRegistration=true.
    const provs1 = await admin.request.get('/api/auth/providers?workspace=default');
    const provBody1 = (await provs1.json()) as { allowRegistration: boolean };
    expect(provBody1.allowRegistration).toBe(true);

    // ── Phase 2: disable registration ────────────────────────────────────
    const disable = await admin.request.put(`/api/workspaces/${defaultWs!.id}`, {
      data: { allowRegistration: false },
    });
    expect(disable.ok(), await disable.text()).toBe(true);

    const blockedEmail = uniqueEmail('reg-off');
    const r2 = await admin.request.post('/api/auth/register', {
      data: {
        name: 'Reg Blocked',
        email: blockedEmail,
        password: PASSWORD,
        workspaceSlug: 'default',
      },
    });
    expect([403, 400]).toContain(r2.status());

    // /api/auth/providers should now reflect allowRegistration=false.
    const provs2 = await admin.request.get('/api/auth/providers?workspace=default');
    const provBody2 = (await provs2.json()) as { allowRegistration: boolean };
    expect(provBody2.allowRegistration).toBe(false);

    // ── Phase 3: UI verification — register page either redirects, hides form,
    // or shows a clear "registration disabled" message. We accept any of those
    // because the visual treatment varies, but we assert the user CANNOT submit
    // the form successfully.
    await page.goto('/default/register');
    await page.waitForLoadState('networkidle');
    const html = (await page.content()).toLowerCase();
    const looksDisabled = /registration\s+(?:is\s+)?(?:disabled|not\s+available|closed)/i.test(html)
      || (await page.getByRole('button', { name: /Create Account/i }).count()) === 0;
    if (!looksDisabled) {
      // If the form is still visible, submitting MUST fail with the API 403/400.
      await page.fill('input[type="email"]', uniqueEmail('reg-ui-off'));
      await page.fill('input[type="password"]', PASSWORD);
      const nameInput = page.locator('input[type="text"]').first();
      if (await nameInput.count()) await nameInput.fill('Reg UI Blocked');
      const responsePromise = page.waitForResponse((r) => r.url().includes('/api/auth/register'));
      await page.getByRole('button', { name: /Create Account/i }).click();
      const resp = await responsePromise;
      expect([400, 403]).toContain(resp.status());
    }
  } finally {
    // Restore the original setting so unrelated specs still work.
    await admin.request.put(`/api/workspaces/${defaultWs!.id}`, {
      data: { allowRegistration: originalSetting },
    });
    await disposeClient(admin);
  }
});
