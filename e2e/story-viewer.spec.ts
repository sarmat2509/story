import { test, expect } from './support/fixtures';

test.describe('story viewer', () => {
  test('opens a private story from the library and renders prose scenes', async ({
    page,
    authenticatedParent,
  }) => {
    void authenticatedParent;
    await page.setViewportSize({ width: 1280, height: 900 });

    await page.goto('/me/stories');
    await expect(page.getByTestId('library-screen')).toBeVisible();

    await page.getByTestId('story-card-private-story-magic-audio').click();
    await expect(page).toHaveURL(/\/me\/stories\/private-story-magic-audio/);
    await expect(page.getByText(/moon lantern/)).toBeVisible();
    await expect(page.getByText(/silver stepping stones/)).toBeVisible();
    await expect(page.getByRole('button', { exact: true, name: 'Publish' })).toBeVisible();
  });

  test('submits a generated-content report from the story viewer', async ({
    page,
    authenticatedParent,
  }) => {
    void authenticatedParent;
    await page.setViewportSize({ width: 1280, height: 900 });

    await page.goto('/me/stories/private-story-magic-audio');
    await expect(page.getByText(/moon lantern/)).toBeVisible();

    await page.getByTestId('feedback-header-button').click();
    await expect(page.getByTestId('feedback-dialog')).toBeVisible({ timeout: 15_000 });
    await expect(page.getByTestId('feedback-content-report-notice')).toBeVisible();
    await expect(page.getByTestId('feedback-topic-unsafe_content')).toBeVisible();

    await page
      .getByTestId('feedback-message')
      .fill('Please review this generated story content for the family safety queue.');

    await page.getByTestId('feedback-submit').click();

    await expect(page.getByTestId('feedback-report-id')).toContainText('feedback-e2e-1');
  });

  test.describe('continuation generation lifecycle', () => {
    test.use({ apiScenario: 'story-continuation-retry' });

    test('retries a failed continuation and opens the completed story', async ({
      page,
      authenticatedParent,
    }) => {
      void authenticatedParent;
      await page.setViewportSize({ width: 1280, height: 900 });

      await page.goto('/me/stories/private-story-magic-audio');
      await expect(page.getByTestId('continue-story-button')).toBeVisible();

      await page.getByTestId('continue-story-button').click();
      await expect(page.getByTestId('generation-progress-modal')).toBeVisible();
      await expect(page.getByTestId('generation-progress-retry')).toBeVisible();

      await page.getByTestId('generation-progress-retry').click();
      await expect(page.getByTestId('generation-progress-percentage')).toHaveText('58%');
      await expect(page.getByTestId('generation-progress-view-story')).toBeVisible({
        timeout: 10_000,
      });

      await page.getByTestId('generation-progress-view-story').click();
      await expect(page).toHaveURL(/\/me\/stories\/private-story-space/);
      await expect(page.getByText(/rocket learned to whisper/)).toBeVisible();
    });
  });

  test.describe('declarative review and publish responses', () => {
    test.use({ apiScenario: 'story-review-publish' });

    test('requires parent approval before publishing a child-created story', async ({
      page,
      authenticatedParent,
    }) => {
      void authenticatedParent;
      await page.setViewportSize({ width: 1280, height: 900 });

      await page.goto('/me/stories');
      await page.getByTestId('story-card-private-story-child-review').click();
      await expect(page).toHaveURL(/\/me\/stories\/private-story-child-review/);
      await expect(page.getByText('Parent review needed')).toBeVisible();
      const publishButton = page.getByRole('button', { exact: true, name: 'Publish' });
      await expect(publishButton).toHaveAttribute('aria-disabled', 'true');

      await page.getByText('Approve', { exact: true }).click();

      await expect(page.getByText('Approve', { exact: true })).toHaveCount(0);
      await expect(page.getByText('Approved by parent')).toBeVisible();
      await expect(publishButton).toBeEnabled();

      await publishButton.click();
      await expect(page.getByTestId('publish-share-dialog')).toBeVisible();
      await expect(page.getByTestId('publish-share-public-notice')).toHaveCount(0);

      await page.getByTestId('publish-share-visibility-public').click();
      await expect(page.getByTestId('publish-share-public-notice')).toBeVisible();

      await page.getByTestId('publish-share-submit').click();
      await expect(page.getByTestId('publish-share-url')).toHaveValue(/private-story-child-review/);
    });
  });
});
