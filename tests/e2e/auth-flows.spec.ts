import { test, expect } from '@playwright/test';
import { ensureClusterLdap, cleanupClusterLdap, resetSuperAdminPassword, uniqueEmail, uniqueName } from './helpers/cluster';
import { fillField, loginViaUi, logoutViaUi, selectOption } from './helpers/ui';

const ADMIN_EMAIL = 'admin@oao.local';
const ADMIN_PASSWORD = 'AdminPass123!';

test.describe.configure({ mode: 'serial' });

test.beforeAll(async () => {
  await resetSuperAdminPassword(ADMIN_PASSWORD);
});

test('database registration, logout, login, and password change work through the UI', async ({ page }) => {
  const email = uniqueEmail('register');
  const password = 'StartPass123!';
  const nextPassword = 'ChangedPass123!';

  await page.goto('/default/register');
  await fillField(page, 'Name', 'Playwright User');
  await fillField(page, 'Email', email);
  await fillField(page, 'Password', password);
  await page.getByRole('button', { name: /Create Account/i }).click();

  await expect(page).toHaveURL(/\/default(?:\?.*)?$/);
  await expect(page.getByRole('heading', { name: 'Dashboard' })).toBeVisible();

  await logoutViaUi(page);
  await loginViaUi(page, { identifier: email, password, providerLabel: 'Email & Password' });

  const userButton = page.locator('header').getByRole('button').last();
  await userButton.click();
  await page.getByText('Change Password', { exact: true }).click();
  await expect(page).toHaveURL(/\/default\/settings\/change-password$/);

  await fillField(page, 'Current Password', password);
  await fillField(page, 'New Password', nextPassword);
  await fillField(page, 'Confirm New Password', nextPassword);
  await page.getByRole('button', { name: /Update Password/i }).click();
  await expect(page.getByText('Password updated successfully.')).toBeVisible();

  await logoutViaUi(page);
  await loginViaUi(page, { identifier: email, password: nextPassword, providerLabel: 'Email & Password' });
  await expect(page.getByRole('heading', { name: 'Dashboard' })).toBeVisible();
});

test('superadmin can create a user and change that user role', async ({ page }) => {
  const managedEmail = uniqueEmail('managed-user');

  await loginViaUi(page, { identifier: ADMIN_EMAIL, password: ADMIN_PASSWORD, providerLabel: 'Email & Password' });
  await page.goto('/default/admin/users/new');

  await selectOption(page, 'Role', 'Viewer');
  await fillField(page, 'Name', 'Managed Viewer');
  await fillField(page, 'Email', managedEmail);
  await fillField(page, 'Password', 'ViewerPass123!');
  await expect(page.getByPlaceholder('Full name')).toHaveValue('Managed Viewer');
  await expect(page.getByPlaceholder('user@example.com')).toHaveValue(managedEmail);
  await page.getByRole('button', { name: /^Create$/ }).click();

  await expect(page).toHaveURL(/\/default\/admin\/users$/);
  await expect(page.getByText(managedEmail)).toBeVisible();

  const row = page.locator('tr', { hasText: managedEmail });
  await row.locator('button').first().click();
  await expect(page).toHaveURL(/\/default\/admin\/users\/.+$/);

  await selectOption(page, 'Role', 'Creator');
  await page.getByRole('button', { name: /^Save$/ }).click();
  await expect(page.getByText('Role updated successfully.')).toBeVisible();
});

test('superadmin can configure LDAP, test it, and an LDAP user can log in with a non-email identifier', async ({ page }) => {
  const ldapUrl = ensureClusterLdap();
  const providerName = uniqueName('ldap-e2e');

  await loginViaUi(page, { identifier: ADMIN_EMAIL, password: ADMIN_PASSWORD, providerLabel: 'Email & Password' });
  await page.goto('/default/admin/auth-providers');
  await page.waitForLoadState('networkidle');

  const addProviderButton = page.getByRole('button', { name: /Add Provider/i });
  const providerDialog = page.locator('.p-dialog').filter({ has: page.getByText(/^Add Provider$/) }).last();
  await addProviderButton.click();
  if (!await providerDialog.isVisible({ timeout: 3_000 }).catch(() => false)) {
    await addProviderButton.click();
  }
  await expect(providerDialog).toBeVisible();
  await selectOption(page, 'Type', 'LDAP', providerDialog);
  await fillField(page, 'Name', providerName, providerDialog);
  await fillField(page, 'Server URL', ldapUrl, providerDialog);
  await fillField(page, 'Bind DN', 'uid=admin,ou=system', providerDialog);
  await fillField(page, 'Bind Password', 'secret', providerDialog);
  await providerDialog.getByPlaceholder('dc=example,dc=com', { exact: true }).fill('ou=users,dc=wimpi,dc=net');
  await providerDialog.getByPlaceholder('(uid={{username}})', { exact: true }).fill('(cn={{username}})');
  await providerDialog.getByPlaceholder('uid', { exact: true }).fill('cn');
  await providerDialog.getByPlaceholder('mail', { exact: true }).fill('mail');
  await providerDialog.getByPlaceholder('cn', { exact: true }).fill('cn');
  await expect(providerDialog.getByPlaceholder('dc=example,dc=com', { exact: true })).toHaveValue('ou=users,dc=wimpi,dc=net');
  await expect(providerDialog.getByPlaceholder('(uid={{username}})', { exact: true })).toHaveValue('(cn={{username}})');
  await page.keyboard.press('Tab');
  await providerDialog.getByRole('button', { name: /^Create$/ }).click({ force: true });
  await expect(providerDialog).toBeHidden();

  await expect(page.getByText(providerName)).toBeVisible();

  const row = page.locator('tr', { hasText: providerName });
  const testConnectionResponsePromise = page.waitForResponse((response) => {
    return response.url().includes('/api/auth-providers/test-connection') && response.request().method() === 'POST';
  });
  await row.getByRole('button', { name: /Test/i }).click();
  const testConnectionResponse = await testConnectionResponsePromise;
  expect(testConnectionResponse.ok()).toBe(true);
  const testConnectionPayload = await testConnectionResponse.json() as { success?: boolean };
  expect(testConnectionPayload.success).toBe(true);

  await logoutViaUi(page);
  await loginViaUi(page, {
    identifier: 'Test User',
    password: 'secret',
    providerLabel: 'Active Directory',
  });
  await expect(page.locator('header').getByRole('button').last()).toContainText(/Test User|test/i);

  await logoutViaUi(page);
  await loginViaUi(page, { identifier: ADMIN_EMAIL, password: ADMIN_PASSWORD, providerLabel: 'Email & Password' });
  await page.goto('/default/admin/auth-providers');
  const deleteRow = page.locator('tr', { hasText: providerName });
  await deleteRow.locator('button').last().click();
  await page.getByRole('button', { name: /^Delete$/ }).click();
  await expect(page.getByText(providerName)).toHaveCount(0);

  cleanupClusterLdap();
});