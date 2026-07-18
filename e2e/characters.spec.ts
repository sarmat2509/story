import { test, expect } from './support/fixtures';
import { loginAsChild } from './support/auth';

test.describe('characters', () => {
  test.describe('declarative create responses', () => {
    test.use({ apiScenario: 'character-create' });

    test('creates a character in child mode and refreshes the grid', async ({
      page,
      authenticatedChild,
    }) => {
      void authenticatedChild;
      await page.setViewportSize({ width: 1280, height: 900 });

      await page.goto('/characters');
      await expect(page.getByTestId('characters-screen')).toBeVisible();
      await expect(page.getByTestId('character-card-character-e2e-1')).toContainText('Luna');

      await page.getByTestId('characters-add').click();
      await expect(page.getByTestId('character-form-modal')).toBeVisible();

      await page.getByTestId('character-form-name').fill('Nimbus');
      await page.getByTestId('character-form-type-animal').click();
      await page.getByTestId('character-form-description').fill('A silver fox who maps the wind.');

      await expect(page.getByTestId('character-form-save')).toBeEnabled();
      await page.getByTestId('character-form-save').click();

      await expect(page.getByTestId('character-card-character-e2e-created-1')).toContainText(
        'Nimbus'
      );
    });
  });

  test.describe('declarative edit and delete responses', () => {
    test.use({ apiScenario: 'character-edit-delete' });

    test('edits and deletes an existing parent character', async ({
      page,
      authenticatedParent,
    }) => {
      void authenticatedParent;
      await page.setViewportSize({ width: 1280, height: 900 });

      await page.goto('/characters');
      await expect(page.getByTestId('characters-screen')).toBeVisible();

      await page.getByTestId('character-card-button-character-e2e-1').click();
      await expect(page.getByTestId('character-form-modal')).toBeVisible();
      await expect(page.getByTestId('character-form-name')).toHaveValue('Luna');

      await page.getByTestId('character-form-name').fill('Luna Updated');
      await expect(page.getByTestId('character-form-save')).toBeEnabled();
      await page.getByTestId('character-form-save').click();

      await expect(page.getByTestId('character-card-character-e2e-1')).toContainText(
        'Luna Updated'
      );

      await page.getByTestId('character-card-delete-character-e2e-1').click();
      await expect(page.getByTestId('confirm-dialog')).toBeVisible();

      await page.getByTestId('confirm-dialog-confirm').click();

      await expect(page.getByTestId('character-card-character-e2e-1')).toHaveCount(0);
    });
  });

  test('opens an existing character editor in child artisan mode', async ({
    page,
    authenticatedChild,
  }) => {
    void authenticatedChild;

    await page.goto('/characters');
    await page.getByTestId('character-card-button-character-e2e-1').click();

    await expect(page.getByTestId('character-form-modal')).toBeVisible();
    await expect(page.getByTestId('character-form-name')).toHaveValue('Luna');
  });

  test('does not open an existing character editor in child instant mode', async ({ page }) => {
    await loginAsChild(page, { storyCreationMode: 'instant' });

    await page.goto('/characters');
    await page.getByTestId('character-card-button-character-e2e-1').click();

    await expect(page.getByTestId('character-form-modal')).toHaveCount(0);
  });
});
