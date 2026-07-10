import { test, expect } from './support/fixtures';

test.describe('navigation', () => {
  test('opens authenticated desktop drawer routes', async ({ page, authenticatedParent }) => {
    void authenticatedParent;
    await page.setViewportSize({ width: 1280, height: 900 });

    await page.goto('/dashboard');
    await expect(page.getByTestId('nav-drawer-Dashboard')).toBeVisible();

    await page.getByTestId('nav-drawer-Wizard').click();
    await expect(page).toHaveURL(/\/wizard/);
    await expect(page.getByTestId('wizard-artisan-screen')).toBeVisible();

    await page.getByTestId('nav-drawer-Library').click();
    await expect(page).toHaveURL(/\/me\/stories/);
    await expect(page.getByTestId('library-screen')).toBeVisible();

    await page.getByTestId('nav-drawer-MapTiles').click();
    await expect(page).toHaveURL(/\/me\/map-tiles/);
    await expect(page.getByTestId('map-tiles-screen')).toBeVisible();

    await page.getByTestId('nav-drawer-Stories').click();
    await expect(page).toHaveURL(/\/stories/);
    await expect(page.getByTestId('published-stories-screen')).toBeVisible();
  });

  test('opens authenticated mobile tab and more-menu routes', async ({
    page,
    authenticatedParent,
  }) => {
    void authenticatedParent;
    await page.setViewportSize({ width: 390, height: 844 });

    await page.goto('/dashboard');
    await expect(page.getByTestId('nav-tab-Dashboard')).toBeVisible();

    await page.getByTestId('nav-tab-Wizard').click();
    await expect(page).toHaveURL(/\/wizard/);
    await expect(page.getByTestId('wizard-artisan-screen')).toBeVisible();

    await page.getByTestId('nav-tab-Library').click();
    await expect(page).toHaveURL(/\/me\/stories/);
    await expect(page.getByTestId('library-screen')).toBeVisible();

    await page.getByTestId('nav-tab-more').click();
    await page.getByTestId('nav-more-Stories').click();
    await expect(page).toHaveURL(/\/stories/);
    await expect(page.getByTestId('published-stories-screen')).toBeVisible();
  });

  test('opens public stories from the public tab bar', async ({ page }) => {
    await page.setViewportSize({ width: 390, height: 844 });

    await page.goto('/welcome');
    await expect(page.getByTestId('nav-tab-Stories')).toBeVisible();

    await page.getByTestId('nav-tab-Stories').click();
    await expect(page).toHaveURL(/\/stories/);
    await expect(page.getByTestId('published-stories-screen')).toBeVisible();
  });
});
