import {
  expect,
  request as playwrightRequest,
  test as base,
  type APIRequestContext,
  type Page,
} from '@playwright/test';

function uniqueForwardedIp() {
  const octet = () => Math.floor(Math.random() * 200) + 20;
  return `10.${octet()}.${octet()}.${octet()}`;
}

export const test = base.extend<{
  forwardedIp: string;
}>({
  forwardedIp: async ({}, use) => {
    await use(uniqueForwardedIp());
  },

  page: async ({ page, forwardedIp }, use) => {
    await page.context().setExtraHTTPHeaders({ 'x-forwarded-for': forwardedIp });
    await use(page);
  },

  request: async ({ forwardedIp }, use, testInfo) => {
    const request = await playwrightRequest.newContext({
      baseURL: testInfo.project.use.baseURL,
      extraHTTPHeaders: { 'x-forwarded-for': forwardedIp },
    });

    await use(request);
    await request.dispose();
  },
});

export { expect };
export type { APIRequestContext, Page };