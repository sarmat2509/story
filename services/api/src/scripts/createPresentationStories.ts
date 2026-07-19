/**
 * Submit and monitor the canonical presentation stories through the same HTTP
 * endpoints used by the parent artisan wizard.
 *
 * Dry run:
 *   pnpm create:presentation-stories -- --user-id=<uuid> --phase=control
 *
 * Execute the control story/comic/mixed sequentially and wait for every image:
 *   pnpm create:presentation-stories -- --user-id=<uuid> --phase=control --execute
 *
 * Resume the remaining manifest entries after the control pass:
 *   pnpm create:presentation-stories -- --user-id=<uuid> --phase=remaining --execute
 *
 * Remove only manifest-matching requests that omitted selectedChildren:
 *   pnpm create:presentation-stories -- --user-id=<uuid> --cleanup-unpersonalized --execute
 */

import './loadEnvForScripts';

import { CreateStoryRequestSchema } from '@wondertales/shared';
import { and, desc, eq, inArray, ne, sql } from 'drizzle-orm';
import { closeDatabaseConnection, db } from '../db';
import {
  characters,
  childProfiles,
  graphicNovelPages,
  graphicNovelProjects,
  plans,
  scenarioCards,
  scenes,
  stories,
  storyGoals,
  storyRequests,
  usageEvents,
  users,
  userSubscriptions,
} from '../db/schema';
import { generateToken } from '../services/jwtService';
import { createSession, deleteSession } from '../services/sessionService';
import { deleteStory } from '../services/storyOrchestrationService';
import {
  PRESENTATION_CONTROL_STORY_IDS,
  PRESENTATION_STORY_MANIFEST,
  type PresentationStoryDefinition,
  type PresentationStoryFormat,
} from './presentationStoryManifest';

type ResolvedManifestEntry = {
  definition: PresentationStoryDefinition;
  childProfileId: string;
  characterIds: string[];
  ageGroup: string;
  payload: ReturnType<typeof CreateStoryRequestSchema.parse>;
};

type GenerationResult = {
  manifestId: string;
  requestId: string;
  storyId: string;
  title: string;
  format: PresentationStoryFormat;
  imageCount: number;
};

const EXECUTE = process.argv.includes('--execute');
const NO_WAIT = process.argv.includes('--no-wait');
const CLEANUP_UNPERSONALIZED = process.argv.includes('--cleanup-unpersonalized');
const userId =
  process.argv
    .find((arg) => arg.startsWith('--user-id='))
    ?.slice('--user-id='.length)
    .trim() || process.env.PRESENTATION_USER_ID?.trim();
const phase =
  process.argv
    .find((arg) => arg.startsWith('--phase='))
    ?.slice('--phase='.length)
    .trim() || 'all';
const explicitIds =
  process.argv
    .find((arg) => arg.startsWith('--ids='))
    ?.slice('--ids='.length)
    .split(',')
    .map((id) => id.trim())
    .filter(Boolean) ?? [];
const timeoutMinutes = Number(
  process.argv
    .find((arg) => arg.startsWith('--timeout-minutes='))
    ?.slice('--timeout-minutes='.length) || 180
);
const apiBaseUrl = (process.env.PRESENTATION_API_BASE_URL || 'http://127.0.0.1:3000').replace(
  /\/$/,
  ''
);

function asObject(value: unknown): Record<string, unknown> {
  return value && typeof value === 'object' && !Array.isArray(value)
    ? (value as Record<string, unknown>)
    : {};
}

function asStringArray(value: unknown): string[] {
  if (Array.isArray(value)) return value.filter((item): item is string => typeof item === 'string');
  if (typeof value !== 'string') return [];
  try {
    const parsed = JSON.parse(value);
    return Array.isArray(parsed)
      ? parsed.filter((item): item is string => typeof item === 'string')
      : [];
  } catch {
    return [];
  }
}

function ageData(birthDate: string | Date): { ageYears: number; ageGroup: string } {
  const birth = new Date(
    typeof birthDate === 'string' ? `${birthDate.slice(0, 10)}T12:00:00.000Z` : birthDate
  );
  const now = new Date();
  let ageMonths =
    (now.getUTCFullYear() - birth.getUTCFullYear()) * 12 + now.getUTCMonth() - birth.getUTCMonth();
  if (now.getUTCDate() < birth.getUTCDate()) ageMonths -= 1;
  const ageGroup =
    ageMonths < 12
      ? '0-1'
      : ageMonths < 24
        ? '1y'
        : ageMonths < 48
          ? '2-3'
          : ageMonths < 72
            ? '4-5'
            : ageMonths < 108
              ? '6-8'
              : '9-12';
  return { ageYears: Math.floor(ageMonths / 12), ageGroup };
}

function generationKind(value: unknown): PresentationStoryFormat {
  const kind = asObject(value).generationKind;
  return kind === 'graphic_novel' || kind === 'mixed_story' ? kind : 'story';
}

function endpointForFormat(format: PresentationStoryFormat): string {
  if (format === 'graphic_novel') return '/api/v1/graphic-novels';
  if (format === 'mixed_story') return '/api/v1/mixed-stories';
  return '/api/v1/stories';
}

function selectedDefinitions(): readonly PresentationStoryDefinition[] {
  if (explicitIds.length > 0) {
    const requested = new Set(explicitIds);
    const selected = PRESENTATION_STORY_MANIFEST.filter((entry) => requested.has(entry.id));
    const missing = explicitIds.filter((id) => !selected.some((entry) => entry.id === id));
    if (missing.length > 0) throw new Error(`Unknown manifest ids: ${missing.join(', ')}`);
    return selected;
  }
  if (phase === 'control') {
    const control = new Set<string>(PRESENTATION_CONTROL_STORY_IDS);
    return PRESENTATION_STORY_MANIFEST.filter((entry) => control.has(entry.id));
  }
  if (phase === 'remaining') {
    const control = new Set<string>(PRESENTATION_CONTROL_STORY_IDS);
    return PRESENTATION_STORY_MANIFEST.filter((entry) => !control.has(entry.id));
  }
  if (phase === 'all') return PRESENTATION_STORY_MANIFEST;
  throw new Error('Pass --phase=control, --phase=remaining, --phase=all, or --ids=<id,...>');
}

async function resolveManifest(): Promise<ResolvedManifestEntry[]> {
  if (!userId) throw new Error('Pass --user-id=<uuid> or set PRESENTATION_USER_ID');

  const [target] = await db
    .select({
      id: users.id,
      displayName: users.displayName,
      userStatus: users.status,
      subscriptionStatus: userSubscriptions.status,
      subscriptionMetadata: userSubscriptions.metadata,
      planSlug: plans.slug,
    })
    .from(users)
    .innerJoin(userSubscriptions, eq(userSubscriptions.userId, users.id))
    .innerJoin(plans, eq(plans.id, userSubscriptions.planId))
    .where(eq(users.id, userId))
    .limit(1);
  const metadata = asObject(target?.subscriptionMetadata);
  if (
    !target ||
    target.userStatus !== 'active' ||
    target.subscriptionStatus !== 'active' ||
    target.displayName !== 'QA Free User' ||
    target.planSlug !== 'golden' ||
    metadata.source !== 'seedQaTestAccounts' ||
    metadata.code !== 'FREE_USER'
  ) {
    throw new Error('Refusing generation: target is not the guarded QA presentation account');
  }

  const [children, userCharacters, activeScenarioCards, goals] = await Promise.all([
    db
      .select()
      .from(childProfiles)
      .where(and(eq(childProfiles.userId, userId), eq(childProfiles.isActive, true))),
    db
      .select()
      .from(characters)
      .where(
        and(
          eq(characters.userId, userId),
          eq(characters.isActive, true),
          eq(characters.isHidden, false)
        )
      ),
    db.select().from(scenarioCards).where(eq(scenarioCards.isActive, true)),
    db.select().from(storyGoals),
  ]);
  const childByName = new Map(children.map((child) => [child.name, child]));
  const characterByName = new Map(userCharacters.map((character) => [character.name, character]));
  const scenarioById = new Map(activeScenarioCards.map((card) => [card.id, card]));
  const goalBySlug = new Map(goals.map((goal) => [goal.slug, goal]));

  return selectedDefinitions().map((definition) => {
    const child = childByName.get(definition.childName);
    if (!child) throw new Error(`${definition.id}: child ${definition.childName} is missing`);
    const languages = asStringArray(child.languages);
    if (!languages.includes(definition.language)) {
      throw new Error(`${definition.id}: child profile does not include ${definition.language}`);
    }
    const age = ageData(child.birthDate);

    const selected = definition.characterNames.map((name) => {
      const character = characterByName.get(name);
      if (!character) throw new Error(`${definition.id}: character ${name} is missing`);
      if (character.childProfileId !== child.id) {
        throw new Error(`${definition.id}: character ${name} belongs to another child world`);
      }
      if (!asObject(character.turnaroundSheet).url) {
        throw new Error(`${definition.id}: character ${name} has no turnaround`);
      }
      return character;
    });
    if (!asObject(child.turnaroundSheet).url) {
      throw new Error(`${definition.id}: child ${definition.childName} has no turnaround`);
    }

    if (definition.scenarioCardId) {
      const scenario = scenarioById.get(definition.scenarioCardId);
      if (!scenario) {
        throw new Error(`${definition.id}: active scenario ${definition.scenarioCardId} is missing`);
      }
      if (!asStringArray(scenario.ageGroups).includes(age.ageGroup)) {
        throw new Error(
          `${definition.id}: scenario ${definition.scenarioCardId} does not support ${age.ageGroup}`
        );
      }
    }
    const goal = goalBySlug.get(definition.goal);
    if (!goal) throw new Error(`${definition.id}: goal ${definition.goal} is missing`);
    if (goal.minAge > age.ageYears) {
      throw new Error(`${definition.id}: goal ${definition.goal} requires age ${goal.minAge}+`);
    }

    return {
      definition,
      childProfileId: child.id,
      characterIds: selected.map((character) => character.id),
      ageGroup: age.ageGroup,
      payload: CreateStoryRequestSchema.parse({
        childProfileId: child.id,
        uiLocale: definition.language,
        storyLanguage: definition.language,
        goal: definition.goal,
        ...(definition.scenarioCardId && { scenarioCardId: definition.scenarioCardId }),
        imageStyle: definition.imageStyle,
        userNotes: definition.userNotes,
        selectedChildren: [child.id],
        selectedCharacters: selected.map((character) => character.id),
      }),
    };
  });
}

async function findExistingRequest(entry: ResolvedManifestEntry) {
  const candidates = await db
    .select()
    .from(storyRequests)
    .where(
      and(
        eq(storyRequests.userId, userId!),
        eq(storyRequests.childProfileId, entry.childProfileId),
        eq(storyRequests.storyLanguage, entry.definition.language),
        eq(storyRequests.userNotes, entry.definition.userNotes),
        ne(storyRequests.status, 'failed')
      )
    )
    .orderBy(desc(storyRequests.createdAt));
  return candidates.find(
    (candidate) =>
      generationKind(candidate.intermediateData) === entry.definition.format &&
      Array.isArray(candidate.selectedChildren) &&
      candidate.selectedChildren.length === 1 &&
      candidate.selectedChildren[0] === entry.childProfileId
  );
}

async function cleanupUnpersonalizedRequests(): Promise<void> {
  const manifestNotes = PRESENTATION_STORY_MANIFEST.map((entry) => entry.userNotes);
  const candidates = await db
    .select()
    .from(storyRequests)
    .where(
      and(eq(storyRequests.userId, userId!), inArray(storyRequests.userNotes, manifestNotes))
    )
    .orderBy(storyRequests.createdAt);
  const targets = candidates.filter(
    (request) => !Array.isArray(request.selectedChildren) || request.selectedChildren.length === 0
  );
  const active = targets.filter(
    (request) => request.status === 'pending' || request.status === 'processing'
  );
  if (active.length > 0) {
    throw new Error(
      `Refusing cleanup: ${active.length} matching request(s) are still active: ${active
        .map((request) => request.id)
        .join(', ')}`
    );
  }

  const requestedStoryIds = Array.from(
    new Set(
      targets.flatMap((request) => {
        const storyId =
          request.storyId ??
          (typeof asObject(request.intermediateData).storyId === 'string'
            ? (asObject(request.intermediateData).storyId as string)
            : null);
        return storyId ? [storyId] : [];
      })
    )
  );
  const existingStoryIds =
    requestedStoryIds.length > 0
      ? new Set(
          (
            await db
              .select({ id: stories.id })
              .from(stories)
              .where(inArray(stories.id, requestedStoryIds))
          ).map((story) => story.id)
        )
      : new Set<string>();

  console.log(
    JSON.stringify(
      {
        event: 'cleanup_unpersonalized_preview',
        mode: EXECUTE ? 'execute' : 'dry-run',
        requestIds: targets.map((request) => request.id),
        storyIds: [...existingStoryIds],
      },
      null,
      2
    )
  );
  if (!EXECUTE || targets.length === 0) return;

  const releasedUsage: Array<{
    eventType: string;
    referenceType: 'requestId' | 'storyId';
    referenceId: string;
    quantity: number;
  }> = [];
  const releaseMatchingUsage = async (
    referenceType: 'requestId' | 'storyId',
    referenceId: string,
    allowedEventTypes: string[],
    childProfileId: string | null
  ) => {
    const totals = await db
      .select({
        eventType: usageEvents.eventType,
        resourceType: usageEvents.resourceType,
        quantity: sql<number>`sum(${usageEvents.quantity})::int`,
      })
      .from(usageEvents)
      .where(
        and(
          eq(usageEvents.userId, userId!),
          inArray(usageEvents.eventType, allowedEventTypes),
          sql`${usageEvents.metadata}->>${referenceType} = ${referenceId}`
        )
      )
      .groupBy(usageEvents.eventType, usageEvents.resourceType);
    for (const total of totals) {
      if (total.quantity <= 0) continue;
      await db.insert(usageEvents).values({
        userId: userId!,
        childProfileId,
        eventType: total.eventType,
        resourceType: total.resourceType,
        quantity: -total.quantity,
        metadata: {
          [referenceType]: referenceId,
          presentationCleanup: true,
          releaseReason: 'unpersonalized_presentation_cleanup',
        },
      });
      releasedUsage.push({
        eventType: total.eventType,
        referenceType,
        referenceId,
        quantity: total.quantity,
      });
    }
  };

  for (const request of targets) {
    await releaseMatchingUsage(
      'requestId',
      request.id,
      ['story_created', 'graphic_novel_created'],
      request.childProfileId
    );
  }
  for (const storyId of existingStoryIds) {
    const request = targets.find(
      (candidate) =>
        candidate.storyId === storyId || asObject(candidate.intermediateData).storyId === storyId
    );
    await releaseMatchingUsage(
      'storyId',
      storyId,
      ['story_quiz_generated'],
      request?.childProfileId ?? null
    );
  }

  for (const storyId of existingStoryIds) {
    await deleteStory(storyId, userId!);
  }
  await db.delete(storyRequests).where(inArray(storyRequests.id, targets.map((request) => request.id)));
  console.log(
    JSON.stringify({
      event: 'cleanup_unpersonalized_complete',
      deletedRequests: targets.length,
      deletedStories: existingStoryIds.size,
      releasedUsage,
    })
  );
}

async function submitRequest(entry: ResolvedManifestEntry, bearerToken: string): Promise<string> {
  const response = await fetch(`${apiBaseUrl}${endpointForFormat(entry.definition.format)}`, {
    method: 'POST',
    headers: {
      authorization: `Bearer ${bearerToken}`,
      'content-type': 'application/json',
      'user-agent': 'WonderTales presentation story runner',
    },
    body: JSON.stringify(entry.payload),
  });
  const body = (await response.json().catch(() => null)) as
    | { request?: { id?: string }; message?: string; code?: string }
    | null;
  if (response.status !== 201 || !body?.request?.id) {
    throw new Error(
      `${entry.definition.id}: HTTP ${response.status} ${body?.code ?? ''} ${body?.message ?? ''}`.trim()
    );
  }
  return body.request.id;
}

async function monitorGeneration(
  entry: ResolvedManifestEntry,
  requestId: string
): Promise<GenerationResult> {
  const deadline = Date.now() + timeoutMinutes * 60_000;
  let lastProgressKey = '';
  while (Date.now() < deadline) {
    const [request] = await db
      .select()
      .from(storyRequests)
      .where(eq(storyRequests.id, requestId))
      .limit(1);
    if (!request) throw new Error(`${entry.definition.id}: request ${requestId} disappeared`);
    if (request.status === 'failed') {
      throw new Error(`${entry.definition.id}: generation failed: ${request.errorMessage ?? 'unknown'}`);
    }

    const storyId = request.storyId ?? (asObject(request.intermediateData).storyId as string | undefined);
    if (entry.definition.format === 'story') {
      const imageRows = storyId
        ? await db.select({ imageUrl: scenes.imageUrl }).from(scenes).where(eq(scenes.storyId, storyId))
        : [];
      const imageCount = imageRows.filter((scene) => Boolean(scene.imageUrl)).length;
      const progressKey = `${request.status}:${request.progress ?? 0}:${imageCount}`;
      if (progressKey !== lastProgressKey) {
        console.log(
          JSON.stringify({
            event: 'progress',
            manifestId: entry.definition.id,
            requestId,
            status: request.status,
            progress: request.progress,
            imageCount,
          })
        );
        lastProgressKey = progressKey;
      }
      if (storyId && request.status === 'completed' && imageCount >= 3) {
        const [story] = await db
          .select({ title: stories.title })
          .from(stories)
          .where(eq(stories.id, storyId))
          .limit(1);
        return {
          manifestId: entry.definition.id,
          requestId,
          storyId,
          title: story?.title ?? entry.definition.title,
          format: entry.definition.format,
          imageCount,
        };
      }
    } else {
      const [project] = await db
        .select()
        .from(graphicNovelProjects)
        .where(eq(graphicNovelProjects.storyRequestId, requestId))
        .limit(1);
      const pages = project
        ? await db
            .select()
            .from(graphicNovelPages)
            .where(eq(graphicNovelPages.projectId, project.id))
        : [];
      const completedPages = pages.filter(
        (page) => page.status === 'completed' && Boolean(page.imageUrl) && Boolean(page.imageAssetId)
      ).length;
      const failedPages = pages.filter((page) => page.status === 'failed');
      const progressKey = `${request.status}:${request.progress ?? 0}:${project?.status ?? 'none'}:${completedPages}:${failedPages.length}`;
      if (progressKey !== lastProgressKey) {
        console.log(
          JSON.stringify({
            event: 'progress',
            manifestId: entry.definition.id,
            requestId,
            status: request.status,
            progress: request.progress,
            projectStatus: project?.status ?? null,
            completedPages,
            totalPages: project?.pageCount ?? 0,
            failedPages: failedPages.map((page) => page.pageNumber),
          })
        );
        lastProgressKey = progressKey;
      }
      if (project?.status === 'completed_with_errors' || failedPages.length > 0) {
        throw new Error(
          `${entry.definition.id}: comic pages failed: ${failedPages.map((page) => page.pageNumber).join(', ')}`
        );
      }
      if (
        storyId &&
        project?.status === 'completed' &&
        pages.length === project.pageCount &&
        completedPages === project.pageCount
      ) {
        const [story] = await db
          .select({ title: stories.title })
          .from(stories)
          .where(eq(stories.id, storyId))
          .limit(1);
        return {
          manifestId: entry.definition.id,
          requestId,
          storyId,
          title: story?.title ?? entry.definition.title,
          format: entry.definition.format,
          imageCount: completedPages,
        };
      }
    }
    await new Promise((resolve) => setTimeout(resolve, 15_000));
  }
  throw new Error(`${entry.definition.id}: timed out after ${timeoutMinutes} minutes`);
}

async function main(): Promise<void> {
  if (!Number.isFinite(timeoutMinutes) || timeoutMinutes <= 0) {
    throw new Error('--timeout-minutes must be a positive number');
  }
  const manifest = await resolveManifest();
  if (CLEANUP_UNPERSONALIZED) {
    await cleanupUnpersonalizedRequests();
    return;
  }
  console.log(
    JSON.stringify(
      {
        mode: EXECUTE ? 'execute' : 'dry-run',
        phase,
        waitForImages: !NO_WAIT,
        userId,
        entries: manifest.map((entry) => ({
          id: entry.definition.id,
          format: entry.definition.format,
          language: entry.definition.language,
          child: entry.definition.childName,
          ageGroup: entry.ageGroup,
          characters: entry.definition.characterNames,
          scenarioCardId: entry.definition.scenarioCardId ?? null,
          imageStyle: entry.definition.imageStyle,
          title: entry.definition.title,
        })),
      },
      null,
      2
    )
  );
  if (!EXECUTE) return;

  let runnerSession: Awaited<ReturnType<typeof createSession>> | null = null;
  const results: GenerationResult[] = [];
  try {
    for (const entry of manifest) {
      let request = await findExistingRequest(entry);
      if (!request) {
        if (!runnerSession) {
          runnerSession = await createSession({
            userId: userId!,
            mode: 'parent',
            deviceName: 'Presentation story runner',
            deviceType: 'web',
            userAgent: 'WonderTales presentation story runner',
          });
        }
        const bearerToken = generateToken({ userId: userId!, sessionId: runnerSession.id });
        const requestId = await submitRequest(entry, bearerToken);
        request = await db.query.storyRequests.findFirst({
          where: (table, { eq: drizzleEq }) => drizzleEq(table.id, requestId),
        });
        if (!request) throw new Error(`${entry.definition.id}: submitted request is missing`);
        console.log(
          JSON.stringify({ event: 'submitted', manifestId: entry.definition.id, requestId })
        );
      } else {
        console.log(
          JSON.stringify({
            event: 'resumed',
            manifestId: entry.definition.id,
            requestId: request.id,
            status: request.status,
          })
        );
      }

      if (!NO_WAIT) {
        const result = await monitorGeneration(entry, request.id);
        results.push(result);
        console.log(JSON.stringify({ event: 'completed', ...result }));
      }
    }
  } finally {
    if (runnerSession) await deleteSession(runnerSession.token);
  }

  console.log(JSON.stringify({ event: 'run_complete', results }, null, 2));
}

main()
  .catch((error) => {
    console.error(error);
    process.exitCode = 1;
  })
  .finally(async () => {
    await closeDatabaseConnection();
  });
