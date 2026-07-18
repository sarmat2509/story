import { test, expect } from './support/fixtures';
import { loginAsChild } from './support/auth';

test.describe('child mode', () => {
  test.describe('shared family stories allowed', () => {
    test.use({ apiScenario: 'child-series-allowed' });

    test('shows shared family Series and opens it when the child policy allows access', async ({
      page,
    }) => {
      await loginAsChild(page, {
        publicStoriesEnabled: false,
        storyCreationMode: 'artisan',
        allowSharedFamilyStories: true,
      });
      await page.setViewportSize({ width: 390, height: 844 });

      await page.goto('/dashboard');
      await expect(page.getByTestId('nav-tab-Dashboard')).toBeVisible();
      await expect(page.getByTestId('nav-tab-Wizard')).toBeVisible();
      await expect(page.getByTestId('nav-tab-Library')).toBeVisible();
      await expect(page.getByTestId('nav-tab-Characters')).toBeVisible();

      await page.getByTestId('nav-tab-more').click();
      await expect(page.getByTestId('nav-more-Children')).toHaveCount(0);
      await expect(page.getByTestId('nav-more-Plans')).toHaveCount(0);
      await expect(page.getByTestId('nav-more-Profile')).toHaveCount(0);
      await expect(page.getByTestId('nav-more-Stories')).toHaveCount(0);
      await expect(page.getByTestId('nav-more-Series')).toBeVisible();

      await page.getByTestId('nav-more-Series').click();
      await expect(page).toHaveURL(/\/me\/series/);
      await expect(page.getByText('No series yet')).toBeVisible();
    });
  });

  test.describe('restricted child wizard responses', () => {
    test.use({ apiScenario: 'child-wizard-restricted' });

    test('uses child-mode settings in the artisan wizard and shows the completed result', async ({
      page,
    }) => {
      await loginAsChild(page, {
        storyCreationMode: 'artisan',
        allowedLanguageCodes: ['es'],
        allowedThemeSlugs: ['kindness'],
        allowedCharacterIds: ['character-e2e-1'],
      });
      await page.setViewportSize({ width: 1280, height: 900 });

      await page.goto('/wizard');
      await expect(page.getByTestId('wizard-artisan-screen')).toBeVisible();
      await expect(page.getByTestId('wizard-format-story')).toHaveCount(0);

      await page.getByTestId('wizard-scenario-space_odyssey').click();
      await expect(page.getByTestId('wizard-language-en')).toHaveCount(0);
      await page.getByTestId('wizard-language-es').click();
      await page.getByTestId('wizard-next').click();

      await expect(page.getByTestId('wizard-child-child-e2e-1')).toHaveCount(0);
      await page.getByTestId('wizard-goal-kindness').click();
      await expect(page.getByTestId('wizard-goal-curiosity')).toHaveCount(0);
      await page.getByTestId('wizard-next').click();

      await page.getByTestId('wizard-character-character-e2e-1').click();
      await page.getByTestId('wizard-create').click();
      await expect(page.getByText('Готово! 🎉')).toBeVisible();
      await expect(page.getByRole('button', { name: 'Переглянути історію' })).toBeVisible();
    });
  });
});
