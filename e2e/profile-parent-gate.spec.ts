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

    const passcodeRequest = page.waitForRequest(
      (request) =>
        request.method() === 'PATCH' &&
        new URL(request.url()).pathname === '/api/v1/me/child-mode-exit-passcode'
    );
    await page.getByTestId('profile-child-mode-passcode-save').click();

    expect((await passcodeRequest).postDataJSON()).toEqual({
      old_passcode: '1234',
      new_passcode: '5678',
    });
    await expect(page.getByTestId('profile-child-mode-passcode-modal')).toHaveCount(0);
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

    const parentGateRequest = page.waitForRequest(
      (request) =>
        request.method() === 'POST' &&
        new URL(request.url()).pathname === '/api/v1/auth/parent-gate'
    );
    await page.getByTestId('parent-gate-submit').click();

    expect((await parentGateRequest).postDataJSON()).toEqual({
      password: 'parent-passcode',
    });
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

    const recoveryRequest = page.waitForRequest(
      (request) =>
        request.method() === 'POST' &&
        new URL(request.url()).pathname === '/api/v1/auth/child-mode/recovery'
    );
    await page.getByTestId('parent-gate-recovery').click();
    await recoveryRequest;

    await expect(page.getByTestId('parent-gate-recovery-sent')).toBeVisible();
  });
});
