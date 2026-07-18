import { test, expect } from './support/fixtures';
import { loginAsChild } from './support/auth';

const childId = 'child-e2e-1';

test.describe('child profile access controls', () => {
  test('renders each parent-managed permission and unset child limit', async ({
    page,
    authenticatedParent,
  }) => {
    void authenticatedParent;
    await page.setViewportSize({ width: 1280, height: 900 });

    await page.goto(`/children/${childId}`);
    await page.getByTestId('child-detail-tab-access').click();

    await expect(
      page.getByTestId(`child-mode-setting-${childId}-story-generation`).locator('input')
    ).toBeChecked();
    await expect(
      page.getByTestId(`child-mode-setting-${childId}-story-continuation`).locator('input')
    ).toBeChecked();
    await expect(
      page.getByTestId(`child-mode-setting-${childId}-public-stories`).locator('input')
    ).toBeChecked();
    await expect(
      page.getByTestId(`child-mode-setting-${childId}-free-text`).locator('input')
    ).toBeChecked();
    await expect(
      page.getByTestId(`child-mode-setting-${childId}-audio`).locator('input')
    ).toBeChecked();
    await expect(
      page.getByTestId(`child-mode-setting-${childId}-quizzes`).locator('input')
    ).toBeChecked();
    await expect(
      page.getByTestId(`child-mode-setting-${childId}-parent-review`).locator('input')
    ).not.toBeChecked();
    await expect(
      page.getByTestId(`child-mode-setting-${childId}-siblings`).locator('input')
    ).not.toBeChecked();
    await expect(
      page.getByTestId(`child-mode-setting-${childId}-family-stories`).locator('input')
    ).toBeChecked();

    await expect(page.getByText('Stories per child per day', { exact: true })).toBeVisible();
    await expect(page.getByText('Stories per child per month', { exact: true })).toBeVisible();
    await expect(page.getByText('Audio stories per child per day', { exact: true })).toBeVisible();
    await expect(page.locator('[role="checkbox"]')).toHaveCount(3);
    await expect(page.getByRole('checkbox', { checked: false })).toHaveCount(3);
  });

  test.describe('declarative control update responses', () => {
    test.use({ apiScenario: 'child-controls-update' });

    test('updates child-mode access controls from the child detail screen', async ({
      page,
      authenticatedParent,
    }) => {
      void authenticatedParent;
      await page.setViewportSize({ width: 1280, height: 900 });

      await page.goto('/children');
      await expect(page.getByTestId('children-screen')).toBeVisible();
      await page.getByTestId(`child-card-open-${childId}`).click();
      await expect(page).toHaveURL(new RegExp(`/children/${childId}`));

      await page.getByTestId('child-detail-tab-access').click();
      await expect(page.getByTestId(`child-mode-enable-${childId}`)).toBeVisible();

      const publicStories = page.getByTestId(`child-mode-setting-${childId}-public-stories`);
      await expect(publicStories.locator('input')).toBeChecked();
      await publicStories.click();
      await expect(publicStories.locator('input')).not.toBeChecked();

      const freeText = page.getByTestId(`child-mode-setting-${childId}-free-text`);
      await expect(freeText.locator('input')).toBeChecked();
      await freeText.click();
      await expect(freeText.locator('input')).not.toBeChecked();

      const parentReview = page.getByTestId(`child-mode-setting-${childId}-parent-review`);
      await expect(parentReview.locator('input')).not.toBeChecked();
      await parentReview.click();
      await expect(parentReview.locator('input')).toBeChecked();

      const language = page.getByTestId(`child-mode-languages-${childId}-option-es`);
      const languageBackground = await language.evaluate(
        (element) => getComputedStyle(element).backgroundColor
      );
      await language.click();
      await expect
        .poll(() => language.evaluate((element) => getComputedStyle(element).backgroundColor))
        .not.toBe(languageBackground);

      const theme = page.getByTestId(`child-mode-themes-${childId}-option-kindness`);
      const themeBackground = await theme.evaluate(
        (element) => getComputedStyle(element).backgroundColor
      );
      await theme.click();
      await expect
        .poll(() => theme.evaluate((element) => getComputedStyle(element).backgroundColor))
        .not.toBe(themeBackground);

      const character = page.getByTestId(`child-mode-characters-${childId}-option-character-e2e-1`);
      const characterBackground = await character.evaluate(
        (element) => getComputedStyle(element).backgroundColor
      );
      await character.click();
      await expect
        .poll(() => character.evaluate((element) => getComputedStyle(element).backgroundColor))
        .not.toBe(characterBackground);
    });
  });

  test('enters child mode from the child detail screen', async ({ page, authenticatedParent }) => {
    void authenticatedParent;
    await page.setViewportSize({ width: 390, height: 844 });

    await page.goto(`/children/${childId}`);
    await expect(page.getByText('Mira')).toBeVisible();

    await page.getByTestId('child-detail-start-child-mode').click();
    await page.waitForFunction(() => {
      const rawAuthState = window.localStorage.getItem('auth-storage');
      if (!rawAuthState) return false;
      try {
        return JSON.parse(rawAuthState)?.state?.sessionMode === 'child';
      } catch {
        return false;
      }
    });
    await expect(page).toHaveURL(/\/dashboard/);
    await expect(page.getByTestId('nav-tab-Dashboard')).toBeVisible();
  });

  test.describe('shared family stories denied', () => {
    test.use({ apiScenario: 'child-series-denied' });

    test('hides Series and blocks direct access when shared family stories are denied', async ({
      page,
    }) => {
      await loginAsChild(page, { allowSharedFamilyStories: false });
      await page.setViewportSize({ width: 390, height: 844 });

      await page.goto('/dashboard');
      await page.getByTestId('nav-tab-more').click();
      await expect(page.getByTestId('nav-more-Series')).toHaveCount(0);

      for (const parentOnlyPath of [
        '/children',
        `/children/${childId}`,
        '/billing/plans',
        '/profile',
        '/me/series',
      ]) {
        await page.goto(parentOnlyPath);
        await expect(page.getByText('404')).toBeVisible();
        await expect(page.getByTestId('children-screen')).toHaveCount(0);
      }
    });
  });
});
