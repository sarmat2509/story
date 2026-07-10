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

    const feedbackRequestPromise = page.waitForRequest(
      (request) =>
        request.method() === 'POST' && new URL(request.url()).pathname === '/api/v1/feedback'
    );
    await page.getByTestId('feedback-submit').click();
    const feedbackRequest = await feedbackRequestPromise;

    expect(feedbackRequest.postDataJSON()).toMatchObject({
      category: 'bug',
      support_topic: 'unsafe_content',
      reported_screen: 'story_viewer',
      story_id: 'private-story-magic-audio',
      content_type: 'story',
      platform: 'web',
    });
    await expect(page.getByTestId('feedback-report-id')).toContainText('feedback-e2e-1');
  });

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

    const reviewRequestPromise = page.waitForRequest(
      (request) =>
        request.method() === 'PATCH' &&
        new URL(request.url()).pathname ===
          '/api/v1/stories/private-story-child-review/parent-review'
    );
    await page.getByText('Approve', { exact: true }).click();
    const reviewRequest = await reviewRequestPromise;
    expect(reviewRequest.postDataJSON()).toMatchObject({ status: 'approved' });

    await expect(page.getByText('Approve', { exact: true })).toHaveCount(0);
    await expect(page.getByText('Approved by parent')).toBeVisible();
    await expect(publishButton).toBeEnabled();

    await publishButton.click();
    await expect(page.getByTestId('publish-share-dialog')).toBeVisible();
    await expect(page.getByTestId('publish-share-public-notice')).toHaveCount(0);

    await page.getByTestId('publish-share-visibility-public').click();
    await expect(page.getByTestId('publish-share-public-notice')).toBeVisible();

    const publishRequestPromise = page.waitForRequest(
      (request) =>
        request.method() === 'PATCH' &&
        new URL(request.url()).pathname === '/api/v1/stories/private-story-child-review'
    );
    await page.getByTestId('publish-share-submit').click();
    const publishRequest = await publishRequestPromise;

    expect(publishRequest.postDataJSON()).toMatchObject({
      is_published: true,
      visibility: 'public',
      cover_asset_id: 'asset-child-review-1',
    });
    await expect(page.getByTestId('publish-share-url')).toHaveValue(/private-story-child-review/);
  });
});
