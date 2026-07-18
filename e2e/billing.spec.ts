import { test, expect } from './support/fixtures';

test.describe('billing plans', () => {
  test.use({ apiScenario: 'billing-usd' });

  test('changes billing currency and starts checkout for an upgrade', async ({
    page,
    authenticatedParent,
  }) => {
    void authenticatedParent;
    await page.setViewportSize({ width: 1280, height: 900 });

    await page.goto('/billing/plans');
    await expect(page.getByTestId('plans-screen')).toBeVisible();
    await expect(page.getByTestId('plans-card-free')).toContainText('Free');
    await expect(page.getByTestId('plans-current-free')).toBeVisible();
    await expect(page.getByTestId('plans-card-starter')).toContainText('Starter');

    await page.getByTestId('plans-currency-USD').click();
    await expect(page.getByTestId('plans-currency-USD')).toBeDisabled();
    await expect(page.getByTestId('plans-card-starter')).toContainText('$10.99');

    await page.getByTestId('plans-action-starter').click();
    await expect(page.getByTestId('plans-upgrade-modal')).toBeVisible();

    await page.getByTestId('plans-upgrade-confirm').click();
    await expect(page).toHaveURL(/\/billing\/success/);
  });
});
