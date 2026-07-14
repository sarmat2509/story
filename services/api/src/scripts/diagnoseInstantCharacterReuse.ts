/**
 * Print the durable instant-character identity trace for one story request.
 *
 * Usage:
 *   pnpm api:script sh -c \
 *     'cd /app/services/api && pnpm exec tsx src/scripts/diagnoseInstantCharacterReuse.ts <requestId>'
 */

import { and, asc, eq, inArray } from 'drizzle-orm';
import { closeDatabaseConnection, db } from '../db';
import { characters, storyGenerationStageEvents, storyRequests } from '../db/schema';

function stripUrlQuery(value: unknown): unknown {
  if (value instanceof Date) {
    return value.toISOString();
  }
  if (typeof value === 'string' && value.includes('/api/v1/assets/')) {
    return value.split('?')[0];
  }
  if (Array.isArray(value)) {
    return value.map(stripUrlQuery);
  }
  if (value && typeof value === 'object') {
    return Object.fromEntries(
      Object.entries(value as Record<string, unknown>).map(([key, entry]) => [
        key,
        stripUrlQuery(entry),
      ])
    );
  }
  return value;
}

async function main(): Promise<void> {
  const requestId = process.argv[2];
  if (!requestId) {
    throw new Error('Usage: diagnoseInstantCharacterReuse.ts <requestId>');
  }

  const [request] = await db
    .select({
      id: storyRequests.id,
      userId: storyRequests.userId,
      status: storyRequests.status,
      progress: storyRequests.progress,
      storyId: storyRequests.storyId,
      selectedCharacters: storyRequests.selectedCharacters,
      errorMessage: storyRequests.errorMessage,
      intermediateData: storyRequests.intermediateData,
      createdAt: storyRequests.createdAt,
      updatedAt: storyRequests.updatedAt,
    })
    .from(storyRequests)
    .where(eq(storyRequests.id, requestId));

  if (!request) {
    throw new Error(`Story request not found: ${requestId}`);
  }

  const identityEvents = await db
    .select({
      id: storyGenerationStageEvents.id,
      status: storyGenerationStageEvents.status,
      cacheStatus: storyGenerationStageEvents.cacheStatus,
      provider: storyGenerationStageEvents.provider,
      model: storyGenerationStageEvents.model,
      durationMs: storyGenerationStageEvents.durationMs,
      metadata: storyGenerationStageEvents.metadata,
      createdAt: storyGenerationStageEvents.createdAt,
    })
    .from(storyGenerationStageEvents)
    .where(
      and(
        eq(storyGenerationStageEvents.storyRequestId, requestId),
        eq(storyGenerationStageEvents.operation, 'character_identity_match')
      )
    )
    .orderBy(asc(storyGenerationStageEvents.createdAt));

  const selectedCharacterIds = Array.isArray(request.selectedCharacters)
    ? request.selectedCharacters.filter(
        (value): value is string => typeof value === 'string' && value.length > 0
      )
    : [];
  const selectedCharacterRows = selectedCharacterIds.length
    ? await db
        .select({
          id: characters.id,
          name: characters.name,
          type: characters.type,
          subtype: characters.subtype,
          isHidden: characters.isHidden,
          hasDescriptionEmbedding: characters.descriptionEmbedding,
          referencePhotos: characters.referencePhotos,
          turnaroundSheet: characters.turnaroundSheet,
          createdAt: characters.createdAt,
        })
        .from(characters)
        .where(inArray(characters.id, selectedCharacterIds))
    : [];

  const checkpoint = (request.intermediateData ?? {}) as Record<string, unknown>;
  const report = stripUrlQuery({
    request: {
      id: request.id,
      userId: request.userId,
      status: request.status,
      progress: request.progress,
      storyId: request.storyId,
      errorMessage: request.errorMessage,
      selectedCharacterIds,
      createdAt: request.createdAt,
      updatedAt: request.updatedAt,
    },
    checkpoint: {
      instantMode: checkpoint.instantMode ?? null,
      characterSetupComplete: checkpoint.characterSetupComplete ?? null,
      photoGroups: checkpoint.photoGroups ?? [],
      createdCharacterIds: checkpoint.createdCharacterIds ?? [],
      matchedCharacterIds: checkpoint.matchedCharacterIds ?? [],
      characterIdentityDiagnostics: checkpoint.characterIdentityDiagnostics ?? [],
      note:
        request.intermediateData == null
          ? 'Checkpoint cleared after successful image generation; use durableIdentityEvents below.'
          : null,
    },
    selectedCharacters: selectedCharacterRows.map((character) => ({
      ...character,
      hasDescriptionEmbedding: Array.isArray(character.hasDescriptionEmbedding),
      hasTurnaround: Boolean(
        character.turnaroundSheet &&
        typeof character.turnaroundSheet === 'object' &&
        (character.turnaroundSheet as Record<string, unknown>).url
      ),
    })),
    durableIdentityEvents: identityEvents,
  });

  console.log(JSON.stringify(report, null, 2));
}

main()
  .catch((error) => {
    console.error(error instanceof Error ? error.message : error);
    process.exitCode = 1;
  })
  .finally(async () => {
    await closeDatabaseConnection();
  });
