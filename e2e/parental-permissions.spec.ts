import { test, expect } from './support/fixtures';
import { loginAsChild } from './support/auth';

test.describe('child-visible parental permission outcomes', () => {
  test.describe('story generation disabled', () => {
    test.use({ apiScenario: 'child-story-generation-disabled' });

    test('disables the final artisan create action', async ({ page }) => {
      await loginAsChild(page, {
        storyCreationMode: 'artisan',
        storyGenerationEnabled: false,
      });
      await page.setViewportSize({ width: 1280, height: 900 });

      await page.goto('/wizard');
      await page.getByTestId('wizard-scenario-magic_wizards').click();
      await page.getByTestId('wizard-language-en').click();
      await page.getByTestId('wizard-next').click();
      await page.getByTestId('wizard-goal-kindness').click();
      await page.getByTestId('wizard-next').click();

      await expect(page.getByTestId('wizard-create')).toBeDisabled();
    });
  });

  test.describe('story continuation disabled', () => {
    test.use({ apiScenario: 'child-continuation-disabled' });

    test('hides continuation controls from a child story viewer', async ({ page }) => {
      await loginAsChild(page, {
        storyCreationMode: 'artisan',
        storyContinuationEnabled: false,
      });
      await page.setViewportSize({ width: 1280, height: 900 });

      await page.goto('/me/stories/private-story-magic-audio');
      await expect(page.getByText(/moon lantern/)).toBeVisible();
      await expect(page.getByText('Continue story now')).toHaveCount(0);
    });
  });

  test.describe('public stories allowed', () => {
    test.use({ apiScenario: 'child-public-stories-allowed' });

    test('shows and opens the public stories navigation item', async ({ page }) => {
      await loginAsChild(page, { publicStoriesEnabled: true });
      await page.setViewportSize({ width: 390, height: 844 });

      await page.goto('/dashboard');
      await page.getByTestId('nav-tab-more').click();
      await expect(page.getByTestId('nav-more-Stories')).toBeVisible();
      await page.getByTestId('nav-more-Stories').click();
      await expect(page).toHaveURL(/\/stories/);
      await expect(page.getByTestId('published-stories-screen')).toBeVisible();
    });
  });

  test.describe('public stories denied', () => {
    test.use({ apiScenario: 'child-public-stories-denied' });

    test('hides the public stories navigation item', async ({ page }) => {
      await loginAsChild(page, { publicStoriesEnabled: false });
      await page.setViewportSize({ width: 390, height: 844 });

      await page.goto('/dashboard');
      await page.getByTestId('nav-tab-more').click();
      await expect(page.getByTestId('nav-more-Stories')).toHaveCount(0);
    });
  });

  test.describe('free text disabled', () => {
    test.use({ apiScenario: 'child-free-text-disabled' });

    test('removes the own-idea input from the artisan wizard', async ({ page }) => {
      await loginAsChild(page, {
        storyCreationMode: 'artisan',
        freeTextPromptsEnabled: false,
      });
      await page.setViewportSize({ width: 1280, height: 900 });

      await page.goto('/wizard');
      await page.getByTestId('wizard-scenario-magic_wizards').click();
      await page.getByTestId('wizard-language-en').click();
      await page.getByTestId('wizard-next').click();

      await expect(page.getByTestId('wizard-notes')).toHaveCount(0);
    });
  });

  test.describe('audio generation disabled', () => {
    test.use({ apiScenario: 'child-audio-disabled' });

    test('hides audio creation from a story without audio', async ({ page }) => {
      await loginAsChild(page, { audioGenerationEnabled: false });
      await page.setViewportSize({ width: 1280, height: 900 });

      await page.goto('/me/stories/private-story-space');
      await expect(page.getByText(/rocket learned to whisper/)).toBeVisible();
      await expect(page.getByText('Create Audio Story')).toHaveCount(0);
    });
  });

  test.describe('quiz generation disabled', () => {
    test.use({ apiScenario: 'child-quiz-disabled' });

    test('hides the story quiz invitation', async ({ page }) => {
      await loginAsChild(page, { quizGenerationEnabled: false });
      await page.setViewportSize({ width: 1280, height: 900 });

      await page.goto('/me/stories/private-story-magic-audio');
      await expect(page.getByText(/moon lantern/)).toBeVisible();
      await expect(page.getByTestId('story-quiz-invitation')).toHaveCount(0);
    });
  });

  test.describe('sibling characters denied', () => {
    test.use({ apiScenario: 'child-siblings-denied' });

    test('removes a sibling-owned character from the artisan picker', async ({ page }) => {
      await loginAsChild(page, {
        storyCreationMode: 'artisan',
        allowSiblingCharacters: false,
      });
      await page.setViewportSize({ width: 1280, height: 900 });

      await page.goto('/wizard');
      await page.getByTestId('wizard-scenario-magic_wizards').click();
      await page.getByTestId('wizard-language-en').click();
      await page.getByTestId('wizard-next').click();
      await page.getByTestId('wizard-goal-kindness').click();
      await page.getByTestId('wizard-next').click();

      await expect(page.getByTestId('wizard-character-character-e2e-1')).toBeVisible();
      await expect(page.getByTestId('wizard-character-character-e2e-sibling-1')).toHaveCount(0);
    });
  });

  test.describe('sibling characters allowed', () => {
    test.use({ apiScenario: 'child-siblings-allowed' });

    test('shows a sibling-owned character in the artisan picker', async ({ page }) => {
      await loginAsChild(page, {
        storyCreationMode: 'artisan',
        allowSiblingCharacters: true,
      });
      await page.setViewportSize({ width: 1280, height: 900 });

      await page.goto('/wizard');
      await page.getByTestId('wizard-scenario-magic_wizards').click();
      await page.getByTestId('wizard-language-en').click();
      await page.getByTestId('wizard-next').click();
      await page.getByTestId('wizard-goal-kindness').click();
      await page.getByTestId('wizard-next').click();

      await expect(page.getByTestId('wizard-character-character-e2e-sibling-1')).toBeVisible();
    });
  });

  test.describe('parent review required', () => {
    test.use({ apiScenario: 'child-parent-review-required' });

    test('shows the pending parent-review consequence on a child-created story', async ({
      page,
    }) => {
      await loginAsChild(page, { parentReviewRequired: true });
      await page.setViewportSize({ width: 1280, height: 900 });

      await page.goto('/me/stories');
      const pendingStory = page.getByTestId('story-card-private-story-child-review');
      await expect(pendingStory).toBeVisible();
      await expect(page.getByText('Needs review', { exact: true })).toBeVisible();
    });
  });
});
