/**
 * Read-only integration smoke for database/schema drift and representative core entities.
 *
 * It deliberately uses real repositories instead of repository test overrides. A full-row
 * select catches missing columns (for example stories.publish_characters) before the same
 * mismatch becomes a 500 in an HTTP route.
 *
 * Optional targeted fixtures:
 *   CORE_ENTITY_STORY_IDS=<uuid,uuid>
 *   CORE_ENTITY_CHARACTER_IDS=<uuid,uuid>
 *   CORE_ENTITY_CHILD_PROFILE_IDS=<uuid,uuid>
 */
import assert from 'node:assert/strict';

function requestedIds(name: string): string[] {
  return (process.env[name] ?? '')
    .split(',')
    .map((value) => value.trim())
    .filter(Boolean);
}

async function main(): Promise<void> {
  process.env.RUN_HTTP_SERVER = 'false';
  process.env.RUN_JOB_WORKERS = 'false';
  process.env.WT_SKIP_PROCESS_SIGNAL_HANDLERS = '1';

  const { desc, inArray } = await import('drizzle-orm');
  const { db, closeDatabaseConnection } = await import('../../db');
  const schema = await import('../../db/schema');
  const { getCharacterRepository, getChildProfileRepository, getStoryRepository } =
    await import('../../repositories');
  const { getStoryManifest } = await import('../storyOrchestrationService');

  const storyIds = requestedIds('CORE_ENTITY_STORY_IDS');
  const characterIds = requestedIds('CORE_ENTITY_CHARACTER_IDS');
  const childProfileIds = requestedIds('CORE_ENTITY_CHILD_PROFILE_IDS');

  try {
    // Full-row probes are intentional: Drizzle emits every mapped column, matching repository
    // find/list behavior and exposing a migration that exists in code but is missing in the DB.
    // Default smoke follows the normal list ordering and checks its first (newest) row.
    // Explicit ids are only an optional incident-diagnostics override.
    const storyRows = storyIds.length
      ? await db.select().from(schema.stories).where(inArray(schema.stories.id, storyIds))
      : await db.select().from(schema.stories).orderBy(desc(schema.stories.createdAt)).limit(1);
    const characterRows = characterIds.length
      ? await db.select().from(schema.characters).where(inArray(schema.characters.id, characterIds))
      : await db
          .select()
          .from(schema.characters)
          .orderBy(desc(schema.characters.createdAt))
          .limit(1);
    const childProfileRows = childProfileIds.length
      ? await db
          .select()
          .from(schema.childProfiles)
          .where(inArray(schema.childProfiles.id, childProfileIds))
      : await db
          .select()
          .from(schema.childProfiles)
          .orderBy(desc(schema.childProfiles.createdAt))
          .limit(1);

    // These migration-adjacent tables are part of character/profile/story reads even when empty.
    await db.select().from(schema.savedCharacters).limit(1);
    await db.select().from(schema.storyCharacters).limit(1);
    await db.select().from(schema.alignments).limit(1);

    if (storyIds.length) {
      assert.equal(storyRows.length, storyIds.length, 'every requested story fixture must exist');
    } else {
      assert.equal(storyRows.length, 1, 'the database must contain a story to smoke-test');
    }
    if (characterIds.length) {
      assert.equal(
        characterRows.length,
        characterIds.length,
        'every requested character fixture must exist'
      );
    } else {
      assert.equal(characterRows.length, 1, 'the database must contain a character to smoke-test');
    }
    if (childProfileIds.length) {
      assert.equal(
        childProfileRows.length,
        childProfileIds.length,
        'every requested child-profile fixture must exist'
      );
    } else {
      assert.equal(
        childProfileRows.length,
        1,
        'the database must contain a child profile to smoke-test'
      );
    }

    const storyRepository = getStoryRepository();
    for (const story of storyRows) {
      const ownedStory = await storyRepository.findByIdAndUser(story.id, story.userId);
      assert.equal(ownedStory?.id, story.id, `story repository must read ${story.id}`);

      const manifest = await getStoryManifest(story.id);
      assert.equal(manifest.storyId, story.id, `manifest must preserve story id ${story.id}`);
      assert.ok(Array.isArray(manifest.scenes), `manifest scenes must be an array for ${story.id}`);
      assert.ok(
        Array.isArray(manifest.characters),
        `manifest characters must be an array for ${story.id}`
      );
    }

    const characterRepository = getCharacterRepository();
    for (const character of characterRows) {
      const loaded = await characterRepository.findById(character.id, character.userId);
      if (character.isActive) {
        assert.equal(loaded?.id, character.id, `character repository must read ${character.id}`);
      }
    }

    const childProfileRepository = getChildProfileRepository();
    for (const profile of childProfileRows) {
      const loaded = await childProfileRepository.findById(profile.id, profile.userId);
      if (profile.isActive) {
        assert.equal(loaded?.id, profile.id, `child repository must read ${profile.id}`);
      }
    }

    console.log('core entity readiness passed', {
      storyIds: storyRows.map((story) => story.id),
      characterIds: characterRows.map((character) => character.id),
      childProfileIds: childProfileRows.map((profile) => profile.id),
    });
  } finally {
    await closeDatabaseConnection();
  }
}

main().catch((error) => {
  console.error(error);
  process.exit(1);
});
