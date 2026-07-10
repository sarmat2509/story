import { test, expect } from './support/fixtures';

const childId = 'child-e2e-1';

test.describe('child profile access controls', () => {
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

    const publicStoriesRequest = page.waitForRequest(
      (request) =>
        request.method() === 'PATCH' &&
        new URL(request.url()).pathname === `/api/v1/children/${childId}/child-mode`
    );
    await page.getByTestId(`child-mode-setting-${childId}-public-stories`).click();
    expect((await publicStoriesRequest).postDataJSON()).toMatchObject({
      child_mode_settings: { public_stories_enabled: false },
    });

    const freeTextRequest = page.waitForRequest(
      (request) =>
        request.method() === 'PATCH' &&
        new URL(request.url()).pathname === `/api/v1/children/${childId}/child-mode`
    );
    await page.getByTestId(`child-mode-setting-${childId}-free-text`).click();
    expect((await freeTextRequest).postDataJSON()).toMatchObject({
      child_mode_settings: { free_text_prompts_enabled: false },
    });

    const parentReviewRequest = page.waitForRequest(
      (request) =>
        request.method() === 'PATCH' &&
        new URL(request.url()).pathname === `/api/v1/children/${childId}/child-mode`
    );
    await page.getByTestId(`child-mode-setting-${childId}-parent-review`).click();
    expect((await parentReviewRequest).postDataJSON()).toMatchObject({
      child_mode_settings: { parent_review_required: true },
    });

    const languageRequest = page.waitForRequest(
      (request) =>
        request.method() === 'PATCH' &&
        new URL(request.url()).pathname === `/api/v1/children/${childId}/child-mode`
    );
    await page.getByTestId(`child-mode-languages-${childId}-option-es`).click();
    expect((await languageRequest).postDataJSON()).toMatchObject({
      child_mode_settings: { allowed_language_codes: ['es'] },
    });

    const themeRequest = page.waitForRequest(
      (request) =>
        request.method() === 'PATCH' &&
        new URL(request.url()).pathname === `/api/v1/children/${childId}/child-mode`
    );
    await page.getByTestId(`child-mode-themes-${childId}-option-kindness`).click();
    expect((await themeRequest).postDataJSON()).toMatchObject({
      child_mode_settings: { allowed_theme_slugs: ['kindness'] },
    });

    const characterRequest = page.waitForRequest(
      (request) =>
        request.method() === 'PATCH' &&
        new URL(request.url()).pathname === `/api/v1/children/${childId}/child-mode`
    );
    await page.getByTestId(`child-mode-characters-${childId}-option-character-e2e-1`).click();
    expect((await characterRequest).postDataJSON()).toMatchObject({
      child_mode_settings: { allowed_character_ids: ['character-e2e-1'] },
    });
  });

  test('enters child mode from the child detail screen', async ({ page, authenticatedParent }) => {
    void authenticatedParent;
    await page.setViewportSize({ width: 390, height: 844 });

    await page.goto(`/children/${childId}`);
    await expect(page.getByText('Mira')).toBeVisible();

    const sessionRequest = page.waitForRequest(
      (request) =>
        request.method() === 'POST' &&
        new URL(request.url()).pathname === `/api/v1/children/${childId}/child-mode/sessions`
    );
    await page.getByTestId('child-detail-start-child-mode').click();
    expect((await sessionRequest).postData()).toBeNull();
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

  test('blocks parent-only direct routes in child mode', async ({ page, authenticatedChild }) => {
    void authenticatedChild;
    await page.setViewportSize({ width: 390, height: 844 });

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
