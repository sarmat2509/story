import { test, expect } from './support/fixtures';

test.describe('profile and parent gate', () => {
  test('updates the child-mode exit passcode from profile settings', async ({
    page,
    authenticatedParent,
  }) => {
    void authenticatedParent;
    page.on('dialog', (dialog) => dialog.accept());
    await page.setViewportSize({ width: 1280, height: 900 });

    await page.goto('/profile');
    await expect(page.getByTestId('profile-screen')).toBeVisible();

    await page.getByTestId('profile-child-mode-passcode-open').click();
    await expect(page.getByTestId('profile-child-mode-passcode-modal')).toBeVisible();

    await page.getByTestId('profile-child-mode-passcode-current').fill('1234');
    await page.getByTestId('profile-child-mode-passcode-new').fill('5678');
    await page.getByTestId('profile-child-mode-passcode-confirm').fill('5678');

    await page.getByTestId('profile-child-mode-passcode-save').click();

    await expect(page.getByTestId('profile-child-mode-passcode-modal')).toHaveCount(0);
  });

  test('requests an exit-password recovery link from profile settings', async ({
    page,
    authenticatedParent,
  }) => {
    void authenticatedParent;
    await page.setViewportSize({ width: 1280, height: 900 });

    await page.goto('/profile');
    await page.getByTestId('profile-child-mode-passcode-open').click();

    const [recoveryResponse] = await Promise.all([
      page.waitForResponse(
        (response) =>
          response.request().method() === 'POST' &&
          new URL(response.url()).pathname === '/api/v1/auth/child-mode/recovery'
      ),
      page.getByTestId('profile-child-mode-passcode-recovery').click(),
    ]);
    expect(recoveryResponse.ok()).toBe(true);
  });

  test('returns from child mode to the parent profile through parent gate', async ({
    page,
    authenticatedChild,
  }) => {
    void authenticatedChild;
    await page.setViewportSize({ width: 390, height: 844 });

    await page.goto('/dashboard');
    await expect(page.getByTestId('nav-tab-Dashboard')).toBeVisible();

    await page.getByTestId('child-profile-switcher-trigger').click();
    await expect(page.getByTestId('child-profile-switcher-menu')).toBeVisible();
    await page.getByTestId('child-profile-switcher-parent').click();
    await expect(page.getByTestId('parent-gate-password')).toBeVisible();
    await page.getByTestId('parent-gate-password').fill('parent-passcode');

    await page.getByTestId('parent-gate-submit').click();

    await expect(page.getByTestId('profile-screen')).toBeVisible();
    await expect
      .poll(async () => {
        const rawAuthState = await page.evaluate(() => window.localStorage.getItem('auth-storage'));
        return rawAuthState ? JSON.parse(rawAuthState)?.state?.sessionMode : null;
      })
      .toBe('parent');
  });

  test('requests a recovery link from the child-mode parent gate', async ({
    page,
    authenticatedChild,
  }) => {
    void authenticatedChild;
    await page.setViewportSize({ width: 390, height: 844 });

    await page.goto('/dashboard');
    await page.getByTestId('child-profile-switcher-trigger').click();
    await page.getByTestId('child-profile-switcher-parent').click();

    await page.getByTestId('parent-gate-recovery').click();

    await expect(page.getByTestId('parent-gate-recovery-sent')).toBeVisible();
  });

  test('sets a new exit password after opening the recovery email link', async ({
    page,
    authenticatedChild,
  }) => {
    void authenticatedChild;
    await page.setViewportSize({ width: 390, height: 844 });

    await page.goto('/auth/child-mode-recovery?token=e2e-email-recovery-token');
    await expect(page.getByTestId('child-mode-recovery-reset-form')).toBeVisible();

    await page.getByTestId('child-mode-recovery-new-passcode').fill('new-parent-password');
    await page.getByTestId('child-mode-recovery-confirm-passcode').fill('new-parent-password');
    await page.getByTestId('child-mode-recovery-reset-submit').click();

    await expect(page.getByTestId('child-mode-recovery-reset-form')).toHaveCount(0);
    await expect(page.getByText('Password saved')).toBeVisible();
  });
});
