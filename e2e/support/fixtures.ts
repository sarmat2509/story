import { test as base, expect } from '@playwright/test';
import { installApiMocks, type ApiMockScenario } from './apiMocks';
import { loginAsAdmin, loginAsChild, loginAsParent } from './auth';

type WonderTalesFixtures = {
  apiScenario: ApiMockScenario;
  browserDefaults: void;
  mockApi: void;
  authenticatedParent: void;
  authenticatedAdmin: void;
  authenticatedChild: void;
};

export const test = base.extend<WonderTalesFixtures>({
  apiScenario: ['default', { option: true }],
  browserDefaults: [
    async ({ page }, use) => {
      await page.addInitScript(() => {
        window.localStorage.setItem('@wondertales/language', 'en');
        window.localStorage.setItem('wondertales:analytics-consent', 'denied');
      });
      await use();
    },
    { auto: true },
  ],
  mockApi: [
    async ({ page, apiScenario }, use) => {
      const controller = await installApiMocks(page, apiScenario);
      await use();
      controller.assertNoUnexpectedRequests();
    },
    { auto: true },
  ],
  authenticatedParent: async ({ page }, use) => {
    await loginAsParent(page);
    await use();
  },
  authenticatedAdmin: async ({ page }, use) => {
    await loginAsAdmin(page);
    await use();
  },
  authenticatedChild: async ({ page }, use) => {
    await loginAsChild(page);
    await use();
  },
});

export { expect };
