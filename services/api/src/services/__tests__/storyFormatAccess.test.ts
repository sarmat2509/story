import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';
import { planAllowsComicFormats } from '@wondertales/shared';
import { clearRepositoryTestOverrides, installRepositoryTestOverrides } from '../../repositories';
import { getPlanFeatures } from '../planService';
import { assertMixedStoryAccessAvailable } from '../mixedStoryAccessService';

const userId = '7d0c4e47-e403-482c-8298-1bf3ebc09792';

const plans = [
  {
    slug: 'free',
    migrationStoryMixPoints: 3_000,
    storyMixPoints: 0,
    stories: 3,
    comics: 0,
    mixed: 0,
    accessible: false,
  },
  {
    slug: 'silver',
    migrationStoryMixPoints: 15_000,
    storyMixPoints: 0,
    stories: 15,
    comics: 0,
    mixed: 0,
    accessible: false,
  },
  {
    slug: 'golden',
    migrationStoryMixPoints: 50_000,
    storyMixPoints: 50_000,
    stories: 50,
    comics: 5,
    mixed: 9,
    accessible: true,
  },
  {
    slug: 'fairyworld',
    migrationStoryMixPoints: 100_000,
    storyMixPoints: 100_000,
    stories: 100,
    comics: 11,
    mixed: 19,
    accessible: true,
  },
] as const;

async function main(): Promise<void> {
  const storyMixMigration = readFileSync(
    resolve(__dirname, '../../../drizzle/0140_story_mix_budget_points.sql'),
    'utf8'
  );
  const disabledMixMigration = readFileSync(
    resolve(__dirname, '../../../drizzle/0141_disable_story_mix_for_free_and_silver.sql'),
    'utf8'
  );
  let activePlan: (typeof plans)[number] = plans[0];

  installRepositoryTestOverrides({
    plan: {
      findSubscriptionByUserId: async () => ({ planId: activePlan.slug }),
      findAllFeaturesForPlan: async () => [
        { slug: 'stories_per_month', value: { limit: activePlan.stories } },
        { slug: 'graphic_novels_per_month', value: { limit: activePlan.comics } },
        { slug: 'mixed_stories_per_month', value: { limit: activePlan.mixed } },
        { slug: 'story_mix_budget_points', value: { limit: activePlan.storyMixPoints } },
      ],
    } as any,
  });

  try {
    for (const expected of plans) {
      activePlan = expected;

      // The migration is the source of production plan limits; verify every row.
      assert.match(
        storyMixMigration,
        new RegExp(
          `\\('\\s*${expected.slug}'\\s*,\\s*${expected.migrationStoryMixPoints}\\s*,\\s*${expected.stories}\\s*,\\s*${expected.comics}\\s*,\\s*${expected.mixed}\\s*\\)`
        ),
        `${expected.slug} should define the expected story-format feature limits`
      );

      const features = await getPlanFeatures(userId);
      assert.equal(features.graphicNovelsPerMonth, expected.comics, `${expected.slug} comic limit`);
      assert.equal(features.mixedStoriesPerMonth, expected.mixed, `${expected.slug} comic-to-text limit`);
      assert.equal(
        planAllowsComicFormats(features.graphicNovelsPerMonth),
        expected.accessible,
        `${expected.slug} comic plan access`
      );

      if (expected.accessible) {
        await assert.doesNotReject(() => assertMixedStoryAccessAvailable(userId));
      } else {
        await assert.rejects(() => assertMixedStoryAccessAvailable(userId), {
          code: 'MIXED_STORY_NOT_AVAILABLE',
          featureSlug: 'mixed_stories_per_month',
        });
      }
    }

    assert.match(
      disabledMixMigration,
      /p\.slug IN \('free', 'silver'\)/,
      'Free and Silver should have story-mix configuration disabled after the base limits migrate'
    );
  } finally {
    clearRepositoryTestOverrides();
  }
}

main().catch((error) => {
  console.error(error);
  process.exitCode = 1;
});
