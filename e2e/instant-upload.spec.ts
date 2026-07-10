import path from 'node:path';
import { test, expect } from './support/fixtures';
import { loginAsParent } from './support/auth';

test.describe('instant wizard upload flow', () => {
  test('uploads a photo and submits the instant story payload', async ({ page }) => {
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

    const instantRequest = page.waitForRequest(
      (request) => request.method() === 'POST' && request.url().includes('/api/v1/stories/instant')
    );
    await page.getByTestId('wizard-instant-generate').click();
    const request = await instantRequest;

    expect(request.postDataJSON()).toMatchObject({
      photos: ['/api/v1/assets/e2e-uploaded-photo.png'],
      age_group: '6-7',
      scenario: 'space_odyssey',
      language: 'es',
    });
  });
});
