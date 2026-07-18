import { test, expect } from './support/fixtures';
import { loginAsChild, loginAsParent } from './support/auth';

test.describe('story creation mode matrix', () => {
  test('opens the instant wizard for an instant-mode parent', async ({ page }) => {
    await loginAsParent(page, { mode: 'instant' });
    await page.setViewportSize({ width: 1280, height: 900 });

    await page.goto('/wizard');
    await expect(page.getByTestId('wizard-instant-screen')).toBeVisible();
    await expect(page.getByTestId('wizard-age-6-7')).toBeVisible();
    await expect(page.getByTestId('nav-drawer-Children')).toBeVisible();
    await expect(page.getByTestId('nav-drawer-Characters')).toBeVisible();
  });

  test('opens the artisan wizard for an artisan-mode parent', async ({ page }) => {
    await loginAsParent(page, { mode: 'artisan' });
    await page.setViewportSize({ width: 1280, height: 900 });

    await page.goto('/wizard');
    await expect(page.getByTestId('wizard-artisan-screen')).toBeVisible();
    await expect(page.getByTestId('wizard-format-story')).toBeVisible();
  });

  test('opens the instant child wizard without manual age or character creation controls', async ({
    page,
  }) => {
    await loginAsChild(page, { storyCreationMode: 'instant' });
    await page.setViewportSize({ width: 1280, height: 900 });

    await page.goto('/wizard');
    await expect(page.getByTestId('wizard-instant-screen')).toBeVisible();
    await expect(page.getByTestId('wizard-age-6-7')).toHaveCount(0);

    await page.goto('/characters');
    await expect(page.getByTestId('characters-screen')).toBeVisible();
    await expect(page.getByTestId('characters-add')).toHaveCount(0);
  });

  test('opens the artisan child wizard with restricted setup and manual character creation', async ({
    page,
  }) => {
    await loginAsChild(page, { storyCreationMode: 'artisan' });
    await page.setViewportSize({ width: 1280, height: 900 });

    await page.goto('/wizard');
    await expect(page.getByTestId('wizard-artisan-screen')).toBeVisible();
    await expect(page.getByTestId('wizard-format-story')).toHaveCount(0);
    await page.getByTestId('wizard-scenario-magic_wizards').click();
    await page.getByTestId('wizard-language-en').click();
    await page.getByTestId('wizard-next').click();
    await expect(page.getByTestId('wizard-child-child-e2e-1')).toHaveCount(0);

    await page.goto('/characters');
    await expect(page.getByTestId('characters-add')).toBeVisible();
    await page.getByTestId('characters-add').click();
    await expect(page.getByTestId('character-form-modal')).toBeVisible();
  });

  test.describe('parent mode switching', () => {
    test.use({ apiScenario: 'parent-mode-switch-instant' });

    test('uses the newly saved parent mode after profile reload', async ({ page }) => {
      await loginAsParent(page, { mode: 'artisan' });
      await page.setViewportSize({ width: 1280, height: 900 });

      await page.goto('/profile');
      await expect(page.getByTestId('profile-story-mode-artisan')).toHaveAttribute(
        'aria-checked',
        'true'
      );
      await page.getByTestId('profile-story-mode-instant').click();
      await expect(page.getByTestId('profile-story-mode-instant')).toHaveAttribute(
        'aria-checked',
        'true'
      );

      await page.reload();
      await expect(page.getByTestId('profile-story-mode-instant')).toHaveAttribute(
        'aria-checked',
        'true'
      );
      await page.goto('/wizard');
      await expect(page.getByTestId('wizard-instant-screen')).toBeVisible();
    });
  });

  test.describe('child mode switching', () => {
    test.use({ apiScenario: 'child-mode-switch-instant' });

    test('uses the newly saved child mode when entering a fresh child session', async ({
      page,
    }) => {
      await loginAsParent(page, { mode: 'artisan' });
      await page.setViewportSize({ width: 1280, height: 900 });

      await page.goto('/children/child-e2e-1');
      await page.getByTestId('child-detail-tab-story').click();
      const instantMode = page.getByText('Instant Mode', { exact: true });
      const initialColor = await instantMode.evaluate((element) => getComputedStyle(element).color);
      await instantMode.click();
      await expect
        .poll(() => instantMode.evaluate((element) => getComputedStyle(element).color))
        .not.toBe(initialColor);

      await page.getByTestId('child-detail-start-child-mode').click();
      await expect(page).toHaveURL(/\/dashboard/);
      await page.goto('/wizard');
      await expect(page.getByTestId('wizard-instant-screen')).toBeVisible();
      await expect(page.getByTestId('wizard-age-6-7')).toHaveCount(0);
    });
  });
});
