import path from 'node:path';
import { test, expect } from './support/fixtures';
import { loginAsParent } from './support/auth';

test.describe('instant wizard upload flow', () => {
  test('uploads a photo and shows the completed instant story result', async ({ page }) => {
    await loginAsParent(page, { mode: 'instant' });
    page.on('dialog', (dialog) => dialog.accept());

    await page.goto('/wizard');
    await expect(page.getByTestId('wizard-instant-screen')).toBeVisible();

    const [fileChooser] = await Promise.all([
      page.waitForEvent('filechooser'),
      page.getByTestId('photo-upload-add').click(),
    ]);
    await fileChooser.setFiles(path.join(process.cwd(), 'e2e/fixtures/upload-photo.svg'));

    await expect(page.getByTestId('photo-upload-item-0')).toBeVisible();
    await expect(page.getByTestId('photo-upload-remove-0')).toBeVisible();

    await page.getByTestId('wizard-age-6-7').click();
    await page.getByTestId('wizard-scenario-space_odyssey').click();
    await page.getByTestId('wizard-language-es').click();

    await expect(page.getByTestId('wizard-instant-generate')).toBeEnabled();

    await page.getByTestId('wizard-instant-generate').click();
    await expect(page.getByText('Готово! 🎉')).toBeVisible();
    await expect(page.getByRole('button', { name: 'Переглянути історію' })).toBeVisible();
  });
});
