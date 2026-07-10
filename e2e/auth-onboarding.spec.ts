import { test, expect } from './support/fixtures';
import { loginAsParent } from './support/auth';

test.describe('auth hydration and onboarding', () => {
  test('keeps authenticated deep links after auth store hydration', async ({ page }) => {
    await loginAsParent(page, { mode: 'artisan' });

    await page.goto('/children');
    await expect(page).toHaveURL(/\/children/);
    await expect(page.getByTestId('children-screen')).toBeVisible();
    await expect(page.getByTestId('child-card-child-e2e-1')).toBeVisible();

    await page.goto('/characters');
    await expect(page).toHaveURL(/\/characters/);
    await expect(page.getByTestId('characters-screen')).toBeVisible();
    await expect(page.getByTestId('character-card-character-e2e-1')).toBeVisible();
  });

  test('completes first child setup from the mode-selection route', async ({ page }) => {
    let onboardingCompleted = false;
    await page.route('**/api/v1/me', async (route) => {
      const request = route.request();
      if (request.method() === 'PATCH') {
        onboardingCompleted = true;
        await route.fulfill({
          status: 200,
          contentType: 'application/json',
          body: JSON.stringify({
            status: 'success',
            user: {
              id: 'user-e2e-parent',
              email: 'parent@example.test',
              displayName: 'E2E Parent',
              role: 'user',
              mode: 'artisan',
              onboardingCompleted: true,
              childModeExitPasscodeConfigured: true,
              avatarUrl: null,
            },
          }),
        });
        return;
      }

      await route.fulfill({
        status: 200,
        contentType: 'application/json',
        body: JSON.stringify({
          status: 'success',
          user: {
            id: 'user-e2e-parent',
            email: 'parent@example.test',
            displayName: 'E2E Parent',
            role: 'user',
            mode: 'artisan',
            onboardingCompleted,
            childModeExitPasscodeConfigured: true,
            avatarUrl: null,
          },
        }),
      });
    });
    await loginAsParent(page, { mode: 'artisan', onboardingCompleted: false });

    await page.goto('/mode-selection');
    await expect(page.getByTestId('mode-selection-screen')).toBeVisible();

    await page.getByTestId('mode-selection-child-name').fill('Nina');
    await page.getByTestId('mode-selection-language-en').click();
    await page.getByTestId('mode-selection-consent').click();
    await expect(page.getByTestId('mode-selection-continue')).toBeEnabled();
    await page.getByTestId('mode-selection-continue').click();

    await page.getByTestId('mode-selection-mode-artisan').click();
    const childRequestPromise = page.waitForRequest(
      (request) =>
        request.method() === 'POST' && new URL(request.url()).pathname === '/api/v1/children'
    );
    await page.getByTestId('mode-selection-finish').click();
    const childRequest = await childRequestPromise;

    expect(childRequest.postDataJSON()).toMatchObject({
      name: 'Nina',
      story_creation_mode: 'artisan',
      child_data_consent_accepted: true,
    });

    await expect(page.getByTestId('mode-selection-create-story')).toBeVisible();
    await expect(page.getByTestId('mode-selection-start-child-mode')).toBeVisible();
    await expect(page.getByTestId('mode-selection-add-another-child')).toBeVisible();
  });
});
