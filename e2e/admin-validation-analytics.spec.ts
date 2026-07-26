import { expect, test } from './support/fixtures';

test.use({ apiScenario: 'admin-validation-analytics' });

test('shows character-count correlation for individual image generations', async ({
  page,
  authenticatedAdmin,
}) => {
  void authenticatedAdmin;

  await page.goto('/admin/validations');

  const analytics = page.getByTestId('character-regeneration-correlation');
  await expect(analytics).toBeVisible();
  await expect(analytics.getByText('r = +0.853')).toBeVisible();
  await expect(analytics.getByText('Strong positive correlation.')).toBeVisible();
  await expect(analytics.getByText('4', { exact: true }).first()).toBeVisible();
  await expect(analytics.getByText('8', { exact: true })).toBeVisible();
  await expect(analytics.getByText('75%', { exact: true })).toBeVisible();
  await expect(page.getByTestId('character-regeneration-scatter-chart')).toBeVisible();
});
