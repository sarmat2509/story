import { test, expect } from './support/fixtures';

test.describe('billing plans', () => {
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

    const currencyRequest = page.waitForRequest(
      (request) =>
        request.method() === 'PUT' &&
        new URL(request.url()).pathname === '/api/v1/plans/billing-currency'
    );
    await page.getByTestId('plans-currency-USD').click();
    expect((await currencyRequest).postDataJSON()).toEqual({ currency: 'USD' });

    await page.getByTestId('plans-action-starter').click();
    await expect(page.getByTestId('plans-upgrade-modal')).toBeVisible();

    const checkoutRequest = page.waitForRequest(
      (request) =>
        request.method() === 'POST' &&
        new URL(request.url()).pathname === '/api/v1/billing/checkout-session'
    );
    await page.getByTestId('plans-upgrade-confirm').click();

    expect((await checkoutRequest).postDataJSON()).toEqual({
      plan_slug: 'starter',
      currency: 'USD',
    });
    await expect(page).toHaveURL(/\/billing\/success/);
  });
});
