import { test as base, expect } from '@playwright/test';
import { installApiMocks } from './apiMocks';
import { loginAsChild, loginAsParent } from './auth';

type WonderTalesFixtures = {
  browserDefaults: void;
  mockApi: void;
  authenticatedParent: void;
  authenticatedChild: void;
};

export const test = base.extend<WonderTalesFixtures>({
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
    async ({ page }, use) => {
      await installApiMocks(page);
      await use();
    },
    { auto: true },
  ],
  authenticatedParent: async ({ page }, use) => {
    await loginAsParent(page);
    await use();
  },
  authenticatedChild: async ({ page }, use) => {
    await loginAsChild(page);
    await use();
  },
});

export { expect };
