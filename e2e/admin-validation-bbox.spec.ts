import { expect, test } from './support/fixtures';

const validationId = '1588b77c-aace-416a-9adf-9dfd3ff3f495';

test.use({ apiScenario: 'admin-validation-bbox' });

test('renders the protected validation image inside the BBox modal', async ({
  page,
  authenticatedAdmin,
}) => {
  void authenticatedAdmin;

  // Reproduce a real session after token refresh: the active auth store has the
  // current token, while the legacy persisted token is stale.
  await page.addInitScript(() => {
    window.localStorage.setItem('@wondertales/auth_token', 'stale-e2e-token');
  });

  await page.goto(`/admin/validations/${validationId}`);

  await page.getByTestId('validation-bbox-button-validation-result-characters-0').click();

  const modal = page.getByTestId('validation-bbox-modal');
  await expect(modal).toBeVisible();
  await expect(modal.getByTestId('validation-bbox-image-unavailable')).toHaveCount(0);

  const renderedImage = modal.getByTestId('validation-bbox-image');
  await expect(renderedImage).toBeVisible();
  await expect
    .poll(() =>
      renderedImage.evaluate((element) => {
        const image = element instanceof HTMLImageElement ? element : element.querySelector('img');
        return image ? image.complete && image.naturalWidth > 0 : false;
      })
    )
    .toBe(true);
});
