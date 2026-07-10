import { test, expect } from './support/fixtures';

test.describe('story catalog filters', () => {
  test('filters the private library by audio, scenario, and language', async ({
    page,
    authenticatedParent,
  }) => {
    void authenticatedParent;
    await page.goto('/me/stories');

    await expect(page.getByTestId('library-screen')).toBeVisible();
    await expect(page.getByTestId('story-card-private-story-magic-audio')).toBeVisible();
    await expect(page.getByTestId('story-card-private-story-space')).toBeVisible();

    await page.getByTestId('catalog-audio-only').click();
    await expect(page.getByTestId('story-card-private-story-magic-audio')).toBeVisible();
    await expect(page.getByTestId('story-card-private-story-space')).toHaveCount(0);

    await page.getByTestId('catalog-audio-all').click();
    await expect(page.getByTestId('story-card-private-story-space')).toBeVisible();

    await page.getByTestId('catalog-filter-scenario-button').click();
    await page.getByTestId('catalog-filter-scenario-option-space_odyssey').click();
    await expect(page.getByTestId('story-card-private-story-space')).toBeVisible();
    await expect(page.getByTestId('story-card-private-story-magic-audio')).toHaveCount(0);

    await page.getByTestId('catalog-filter-language-button').click();
    await page.getByTestId('catalog-filter-language-option-es').click();
    await expect(page.getByTestId('story-card-private-story-space')).toBeVisible();
  });

  test('filters the public catalog by audio, age, language, and reading time', async ({ page }) => {
    await page.goto('/stories');

    await expect(page.getByTestId('published-stories-screen')).toBeVisible();
    await expect(page.getByTestId('published-story-card-the-singing-wand')).toBeVisible();
    await expect(page.getByTestId('published-story-card-quiet-planet-parade')).toBeVisible();

    await page.getByTestId('catalog-audio-only').click();
    await expect(page.getByTestId('published-story-card-the-singing-wand')).toBeVisible();
    await expect(page.getByTestId('published-story-card-quiet-planet-parade')).toHaveCount(0);

    await page.getByTestId('catalog-audio-all').click();
    await page.getByTestId('catalog-filter-age-button').click();
    await page.getByTestId('catalog-filter-age-option-6-7').click();
    await expect(page.getByTestId('published-story-card-quiet-planet-parade')).toBeVisible();
    await expect(page.getByTestId('published-story-card-the-singing-wand')).toHaveCount(0);

    await page.getByTestId('catalog-filter-language-button').click();
    await page.getByTestId('catalog-filter-language-option-es').click();
    await expect(page.getByTestId('published-story-card-quiet-planet-parade')).toBeVisible();

    await page.getByTestId('catalog-filter-reading-button').click();
    await page.getByTestId('catalog-filter-reading-option-medium').click();
    await expect(page.getByTestId('published-story-card-quiet-planet-parade')).toBeVisible();
  });
});
