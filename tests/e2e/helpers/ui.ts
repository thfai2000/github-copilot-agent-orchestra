import { expect, type Locator, type Page } from '@playwright/test';

type FieldRoot = Locator | Page;

function escapeRegex(value: string) {
  return value.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
}

function uniqueForwardedIp() {
  const octet = () => Math.floor(Math.random() * 200) + 20;
  return `10.${octet()}.${octet()}.${octet()}`;
}

function fieldContainer(root: FieldRoot, label: string | RegExp) {
  const matcher = typeof label === 'string'
    ? new RegExp(`^${escapeRegex(label)}(?:\\s*\\*)?$`)
    : label;
  return root.locator('label').filter({ hasText: matcher }).first().locator('..');
}

export async function fillField(page: Page, label: string | RegExp, value: string, root: FieldRoot = page) {
  const container = fieldContainer(root, label);
  const input = container.locator('input:not([type=hidden]), textarea').first();
  await input.fill(value);

  if ((await input.getAttribute('type')) === 'password') {
    await page.keyboard.press('Escape');
  }
}

export async function selectOption(page: Page, label: string | RegExp, option: string, root: FieldRoot = page) {
  const container = fieldContainer(root, label);
  const combobox = container.locator('[role="combobox"], .p-select').first();
  const currentValue = ((await combobox.textContent()) || '').trim();
  if (currentValue === option) {
    return;
  }

  const optionPattern = new RegExp(`^${escapeRegex(option)}$`);
  const roleOption = page.getByRole('option', { name: option, exact: true }).first();
  const popupOption = page.locator('[role="listbox"] [role="option"], [data-pc-section="option"]').filter({ hasText: optionPattern }).first();

  const isOptionVisible = async () => {
    if (await roleOption.isVisible({ timeout: 1_500 }).catch(() => false)) {
      return true;
    }
    return await popupOption.isVisible({ timeout: 1_500 }).catch(() => false);
  };

  await combobox.click();
  if (!await isOptionVisible()) {
    await combobox.press('ArrowDown').catch(() => {});
  }
  if (!await isOptionVisible()) {
    await combobox.click();
  }

  if (await roleOption.isVisible({ timeout: 5_000 }).catch(() => false)) {
    await roleOption.click();
    return;
  }

  await expect(popupOption).toBeVisible({ timeout: 5_000 });
  await popupOption.click();
}

export async function loginViaUi(page: Page, params: {
  identifier: string;
  password: string;
  providerLabel?: 'Email & Password' | 'Active Directory';
}) {
  const forwardedIp = uniqueForwardedIp();
  await page.context().setExtraHTTPHeaders({ 'x-forwarded-for': forwardedIp });
  await page.context().clearCookies();
  const providersResponse = page.waitForResponse((response) => {
    return response.url().includes('/api/auth/providers') && response.request().method() === 'GET';
  }).catch(() => null);
  await page.goto('/default/login');
  await providersResponse;
  await page.waitForLoadState('networkidle');

  try {
    if (params.providerLabel) {
      const identifierLabel = page.locator('label[for="identifier"]').first();
      const currentLabel = ((await identifierLabel.textContent()) || '').trim();
      const wantsLdap = params.providerLabel === 'Active Directory';
      const expectedIdentifierLabel = wantsLdap ? 'Username or Email' : 'Email';
      const needsProviderSwitch = wantsLdap
        ? currentLabel !== 'Username or Email'
        : currentLabel !== 'Email';

      const providerButton = page.getByRole('button', { name: params.providerLabel, exact: true }).first();
      if (needsProviderSwitch && await providerButton.count()) {
        await providerButton.click();
        if (!await identifierLabel.filter({ hasText: new RegExp(`^${escapeRegex(expectedIdentifierLabel)}$`) }).isVisible({ timeout: 3_000 }).catch(() => false)) {
          await providerButton.click();
        }
        await expect(identifierLabel).toHaveText(expectedIdentifierLabel);
      }
    }

    await fillField(page, /Username or Email|Email/, params.identifier);
    await fillField(page, 'Password', params.password);
    await page.getByRole('button', { name: /Sign In/i }).click();
    await expect(page).toHaveURL(/\/default(?:\?.*)?$/);
  } finally {
    await page.context().setExtraHTTPHeaders({});
  }
}

export async function logoutViaUi(page: Page) {
  const userButton = page.locator('header').getByRole('button').last();
  await userButton.click();
  await page.getByText('Logout', { exact: true }).click();
  await expect(page).toHaveURL(/\/login$/);
}