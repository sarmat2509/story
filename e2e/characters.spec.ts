import { test, expect } from './support/fixtures';
import { loginAsChild } from './support/auth';

test.describe('characters', () => {
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
    const createRequest = page.waitForRequest(
      (request) =>
        request.method() === 'POST' && new URL(request.url()).pathname === '/api/v1/characters'
    );
    await page.getByTestId('character-form-save').click();

    expect((await createRequest).postDataJSON()).toMatchObject({
      name: 'Nimbus',
      type: 'animal',
      description: 'A silver fox who maps the wind.',
    });
    await expect(page.getByTestId('character-card-character-e2e-created-1')).toContainText(
      'Nimbus'
    );
  });

  test('edits and deletes an existing parent character', async ({ page, authenticatedParent }) => {
    void authenticatedParent;
    await page.setViewportSize({ width: 1280, height: 900 });

    await page.goto('/characters');
    await expect(page.getByTestId('characters-screen')).toBeVisible();

    await page.getByTestId('character-card-button-character-e2e-1').click();
    await expect(page.getByTestId('character-form-modal')).toBeVisible();
    await expect(page.getByTestId('character-form-name')).toHaveValue('Luna');

    await page.getByTestId('character-form-name').fill('Luna Updated');
    await expect(page.getByTestId('character-form-save')).toBeEnabled();
    const updateRequest = page.waitForRequest(
      (request) =>
        request.method() === 'PATCH' &&
        new URL(request.url()).pathname === '/api/v1/characters/character-e2e-1'
    );
    await page.getByTestId('character-form-save').click();

    expect((await updateRequest).postDataJSON()).toMatchObject({
      name: 'Luna Updated',
      type: 'person',
      description: 'A brave friend with a blue scarf.',
    });
    await expect(page.getByTestId('character-card-character-e2e-1')).toContainText('Luna Updated');

    await page.getByTestId('character-card-delete-character-e2e-1').click();
    await expect(page.getByTestId('confirm-dialog')).toBeVisible();

    const deleteRequest = page.waitForRequest(
      (request) =>
        request.method() === 'DELETE' &&
        new URL(request.url()).pathname === '/api/v1/characters/character-e2e-1'
    );
    await page.getByTestId('confirm-dialog-confirm').click();
    await deleteRequest;

    await expect(page.getByTestId('character-card-character-e2e-1')).toHaveCount(0);
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
