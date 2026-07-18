import { test, expect } from './support/fixtures';

test.describe('artisan wizard flow', () => {
  test('walks the parent wizard and shows the completed story result', async ({
    page,
    authenticatedParent,
  }) => {
    void authenticatedParent;
    await page.setViewportSize({ width: 1280, height: 900 });

    await page.goto('/wizard');
    await expect(page.getByTestId('wizard-artisan-screen')).toBeVisible();

    await page.getByTestId('wizard-format-story').click();
    await page.getByTestId('wizard-scenario-magic_wizards').click();
    await page.getByTestId('wizard-language-en').click();
    await page.getByTestId('wizard-next').click();

    await page.getByTestId('wizard-child-child-e2e-1').click();
    await page.getByTestId('wizard-goal-kindness').click();
    await page.getByTestId('wizard-image-style-soft_watercolor').click();
    await page.getByTestId('wizard-notes').fill('Please include a gentle moon lantern.');
    await page.getByTestId('wizard-next').click();

    await page.getByTestId('wizard-character-character-e2e-1').click();
    await page.getByTestId('wizard-create').click();
    await expect(page.getByText('Готово! 🎉')).toBeVisible();
    await expect(page.getByRole('button', { name: 'Переглянути історію' })).toBeVisible();
  });
});
