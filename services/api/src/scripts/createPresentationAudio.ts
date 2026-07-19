/**
 * Generate narration for the 21 canonical presentation stories through the
 * same authenticated HTTP endpoint and durable queue used by the app.
 *
 * Dry run:
 *   pnpm create:presentation-audio -- --user-id=<uuid>
 * Execute and wait for every final audio asset:
 *   pnpm create:presentation-audio -- --user-id=<uuid> --execute
 */

import './loadEnvForScripts';

import { and, desc, eq, inArray } from 'drizzle-orm';
import { closeDatabaseConnection, db } from '../db';
import {
  assets,
  audioAssets,
  plans,
  stories,
  ttsVoices,
  users,
  userSubscriptions,
} from '../db/schema';
import { generateToken } from '../services/jwtService';
import { createSession, deleteSession } from '../services/sessionService';
import {
  PRESENTATION_AUDIO_MANIFEST,
  PRESENTATION_AUDIO_PERIOD,
  type PresentationAudioEntry,
  type PresentationAudioFormat,
  type PresentationAudioLanguage,
} from './presentationAudioManifest';

type VoiceCatalogItem = {
  id: string;
  name: string;
  displayName: string;
  gender: string | null;
  provider: string;
  isPremium: boolean;
  isLocked: boolean;
};

type SelectedVoice = VoiceCatalogItem & { language: PresentationAudioLanguage };

type AudioResult = {
  storyId: string;
  language: PresentationAudioLanguage;
  format: PresentationAudioFormat;
  title: string;
  voiceId: string | null;
  voiceName: string;
  provider: string;
  audioAssetId: string;
  storageAssetId: string;
  storagePath: string;
  durationSeconds: number;
  status: 'completed';
};

const EXECUTE = process.argv.includes('--execute');
const userId =
  process.argv.find((arg) => arg.startsWith('--user-id='))?.slice('--user-id='.length).trim() ||
  process.env.PRESENTATION_USER_ID?.trim();
const timeoutMinutes = Number(
  process.argv
    .find((arg) => arg.startsWith('--timeout-minutes='))
    ?.slice('--timeout-minutes='.length) || 60
);
const maxAttempts = Number(
  process.argv.find((arg) => arg.startsWith('--max-attempts='))?.slice('--max-attempts='.length) || 2
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

function storyFormat(metadata: unknown): PresentationAudioFormat {
  const format = asObject(metadata).storyFormat;
  return format === 'graphic_novel' || format === 'mixed_story' ? format : 'story';
}

async function guardAndValidateStories(): Promise<void> {
  if (!userId) throw new Error('Pass --user-id=<uuid> or set PRESENTATION_USER_ID');
  const [target] = await db
    .select({
      id: users.id,
      displayName: users.displayName,
      userStatus: users.status,
      subscriptionStatus: userSubscriptions.status,
      currentPeriodStart: userSubscriptions.currentPeriodStart,
      currentPeriodEnd: userSubscriptions.currentPeriodEnd,
      metadata: userSubscriptions.metadata,
      planSlug: plans.slug,
    })
    .from(users)
    .innerJoin(userSubscriptions, eq(userSubscriptions.userId, users.id))
    .innerJoin(plans, eq(plans.id, userSubscriptions.planId))
    .where(eq(users.id, userId))
    .limit(1);
  const metadata = asObject(target?.metadata);
  if (
    !target ||
    target.userStatus !== 'active' ||
    target.subscriptionStatus !== 'active' ||
    target.displayName !== 'QA Free User' ||
    target.planSlug !== 'golden' ||
    metadata.source !== 'seedQaTestAccounts' ||
    metadata.code !== 'FREE_USER'
  ) {
    throw new Error('Refusing audio generation: target is not the guarded QA presentation account');
  }
  if (
    target.currentPeriodStart.getTime() !== new Date(PRESENTATION_AUDIO_PERIOD.start).getTime() ||
    target.currentPeriodEnd.getTime() !== new Date(PRESENTATION_AUDIO_PERIOD.end).getTime()
  ) {
    throw new Error('Refusing audio generation: subscription period is not the pinned period');
  }

  const storyIds = PRESENTATION_AUDIO_MANIFEST.map((entry) => entry.storyId);
  const rows = await db
    .select({
      id: stories.id,
      userId: stories.userId,
      language: stories.language,
      title: stories.title,
      metadata: stories.metadata,
      fullText: stories.fullText,
      embeddedScenes: stories.scenes,
    })
    .from(stories)
    .where(inArray(stories.id, storyIds));
  if (rows.length !== storyIds.length) {
    throw new Error(`Expected ${storyIds.length} presentation stories, found ${rows.length}`);
  }
  const rowById = new Map(rows.map((row) => [row.id, row]));
  for (const entry of PRESENTATION_AUDIO_MANIFEST) {
    const row = rowById.get(entry.storyId)!;
    if (row.userId !== userId) throw new Error(`${entry.storyId}: story belongs to another user`);
    if (row.language !== entry.language) {
      throw new Error(`${entry.storyId}: expected language ${entry.language}, found ${row.language}`);
    }
    if (storyFormat(row.metadata) !== entry.format) {
      throw new Error(`${entry.storyId}: expected format ${entry.format}`);
    }
    if (row.title !== entry.title) {
      throw new Error(`${entry.storyId}: expected title ${entry.title}, found ${row.title}`);
    }
    const hasNarration =
      (typeof row.fullText === 'string' && row.fullText.trim().length > 0) ||
      (Array.isArray(row.embeddedScenes) && row.embeddedScenes.length > 0);
    if (!hasNarration) throw new Error(`${entry.storyId}: story has no narration text`);
  }
}

async function fetchVoiceCatalog(
  language: PresentationAudioLanguage,
  bearerToken: string
): Promise<VoiceCatalogItem[]> {
  const response = await fetch(`${apiBaseUrl}/api/v1/voices?language=${language}`, {
    headers: {
      authorization: `Bearer ${bearerToken}`,
      'user-agent': 'WonderTales presentation audio runner',
    },
  });
  const body = (await response.json().catch(() => null)) as
    | { status?: string; data?: VoiceCatalogItem[]; message?: string }
    | null;
  if (!response.ok || body?.status !== 'success' || !Array.isArray(body.data)) {
    throw new Error(`GET voices ${language}: HTTP ${response.status} ${body?.message ?? ''}`.trim());
  }
  return body.data;
}

async function resolveVoices(bearerToken: string): Promise<Map<string, SelectedVoice>> {
  const languages = [...new Set(PRESENTATION_AUDIO_MANIFEST.map((entry) => entry.language))];
  const catalogs = await Promise.all(
    languages.map(async (language) => [language, await fetchVoiceCatalog(language, bearerToken)] as const)
  );
  const selected = new Map<string, SelectedVoice>();
  for (const entry of PRESENTATION_AUDIO_MANIFEST) {
    const catalog = catalogs.find(([language]) => language === entry.language)?.[1] ?? [];
    const voice = catalog.find(
      (candidate) => candidate.name === entry.preferredVoiceName && !candidate.isLocked
    );
    if (!voice) {
      throw new Error(
        `${entry.language}: accessible voice ${entry.preferredVoiceName} is missing from GET /voices`
      );
    }
    selected.set(entry.storyId, { ...voice, language: entry.language });
  }
  return selected;
}

async function findFinalAudio(entry: PresentationAudioEntry): Promise<AudioResult | null> {
  const [row] = await db
    .select({
      audioAssetId: audioAssets.id,
      voiceId: audioAssets.voiceId,
      voiceName: audioAssets.voiceName,
      language: audioAssets.language,
      provider: audioAssets.provider,
      durationSeconds: audioAssets.durationSeconds,
      storageAssetId: assets.id,
      storagePath: assets.storagePath,
      catalogProvider: ttsVoices.provider,
    })
    .from(audioAssets)
    .innerJoin(assets, eq(assets.id, audioAssets.assetId))
    .leftJoin(ttsVoices, eq(ttsVoices.id, audioAssets.voiceId))
    .where(
      and(
        eq(audioAssets.storyId, entry.storyId),
        eq(audioAssets.status, 'completed'),
        eq(audioAssets.isFinal, true)
      )
    )
    .orderBy(desc(audioAssets.createdAt))
    .limit(1);
  if (!row) return null;
  const durationSeconds = Number(row.durationSeconds ?? 0);
  if (!row.storagePath || !Number.isFinite(durationSeconds) || durationSeconds <= 0) return null;
  if (row.language !== entry.language) {
    throw new Error(`${entry.storyId}: final audio language ${row.language} does not match ${entry.language}`);
  }
  return {
    storyId: entry.storyId,
    language: entry.language,
    format: entry.format,
    title: entry.title,
    voiceId: row.voiceId,
    voiceName: row.voiceName,
    provider: row.catalogProvider ?? row.provider,
    audioAssetId: row.audioAssetId,
    storageAssetId: row.storageAssetId,
    storagePath: row.storagePath,
    durationSeconds,
    status: 'completed',
  };
}

async function submitAudio(entry: PresentationAudioEntry, voice: SelectedVoice, bearerToken: string) {
  const response = await fetch(`${apiBaseUrl}/api/v1/stories/${entry.storyId}/audio`, {
    method: 'POST',
    headers: {
      authorization: `Bearer ${bearerToken}`,
      'content-type': 'application/json',
      'user-agent': 'WonderTales presentation audio runner',
    },
    body: JSON.stringify({ voiceId: voice.id, speed: 1, nightMode: false }),
  });
  const body = (await response.json().catch(() => null)) as
    | { status?: string; message?: string; code?: string; jobId?: string }
    | null;
  if (response.status !== 202 && response.status !== 200) {
    throw new Error(
      `${entry.storyId}: POST audio HTTP ${response.status} ${body?.code ?? ''} ${body?.message ?? ''}`.trim()
    );
  }
  console.log(
    JSON.stringify({
      event: response.status === 202 ? 'audio_submitted' : 'audio_already_exists',
      storyId: entry.storyId,
      language: entry.language,
      format: entry.format,
      voiceId: voice.id,
      voiceName: voice.name,
      provider: voice.provider,
      jobId: body?.jobId ?? null,
    })
  );
}

async function waitForFinalAudio(
  entry: PresentationAudioEntry,
  bearerToken: string
): Promise<AudioResult> {
  const deadline = Date.now() + timeoutMinutes * 60_000;
  let lastProgress = '';
  while (Date.now() < deadline) {
    const existing = await findFinalAudio(entry);
    if (existing) return existing;

    const response = await fetch(`${apiBaseUrl}/api/v1/stories/${entry.storyId}/audio-status`, {
      headers: {
        authorization: `Bearer ${bearerToken}`,
        'user-agent': 'WonderTales presentation audio runner',
      },
    });
    const body = (await response.json().catch(() => null)) as
      | {
          status?: string;
          message?: string;
          audioMetadata?: Record<string, unknown> | null;
          jobStatus?: string | null;
          queuePosition?: number | null;
        }
      | null;
    if (!response.ok || body?.status !== 'success') {
      throw new Error(`${entry.storyId}: audio status HTTP ${response.status} ${body?.message ?? ''}`);
    }
    const progress = `${body.jobStatus ?? 'none'}:${body.queuePosition ?? 'none'}`;
    if (progress !== lastProgress) {
      console.log(
        JSON.stringify({
          event: 'audio_progress',
          storyId: entry.storyId,
          language: entry.language,
          jobStatus: body.jobStatus ?? null,
          queuePosition: body.queuePosition ?? null,
        })
      );
      lastProgress = progress;
    }
    if (!body.jobStatus && body.audioMetadata?.error === true) {
      throw new Error(
        `${entry.storyId}: audio generation failed: ${String(body.audioMetadata.errorMessage ?? 'unknown')}`
      );
    }
    await new Promise((resolve) => setTimeout(resolve, 10_000));
  }
  throw new Error(`${entry.storyId}: audio timed out after ${timeoutMinutes} minutes`);
}

async function generateOne(
  entry: PresentationAudioEntry,
  voice: SelectedVoice,
  bearerToken: string
): Promise<AudioResult> {
  const existing = await findFinalAudio(entry);
  if (existing) {
    console.log(JSON.stringify({ event: 'audio_resumed', ...existing }));
    return existing;
  }
  let lastError: unknown;
  for (let attempt = 1; attempt <= maxAttempts; attempt += 1) {
    try {
      await submitAudio(entry, voice, bearerToken);
      const result = await waitForFinalAudio(entry, bearerToken);
      if (result.voiceId !== voice.id) {
        throw new Error(
          `${entry.storyId}: final voice ${result.voiceId} does not match selected voice ${voice.id}`
        );
      }
      return result;
    } catch (error) {
      lastError = error;
      const recovered = await findFinalAudio(entry);
      if (recovered) return recovered;
      console.error(
        JSON.stringify({
          event: 'audio_attempt_failed',
          storyId: entry.storyId,
          attempt,
          maxAttempts,
          error: error instanceof Error ? error.message : String(error),
        })
      );
      if (attempt < maxAttempts) await new Promise((resolve) => setTimeout(resolve, 5_000));
    }
  }
  throw lastError;
}

async function main(): Promise<void> {
  if (!Number.isFinite(timeoutMinutes) || timeoutMinutes <= 0) {
    throw new Error('--timeout-minutes must be a positive number');
  }
  if (!Number.isInteger(maxAttempts) || maxAttempts < 1 || maxAttempts > 3) {
    throw new Error('--max-attempts must be an integer from 1 to 3');
  }
  await guardAndValidateStories();

  const session = await createSession({
    userId: userId!,
    mode: 'parent',
    deviceName: 'Presentation audio runner',
    deviceType: 'web',
    userAgent: 'WonderTales presentation audio runner',
  });
  try {
    const bearerToken = generateToken({ userId: userId!, sessionId: session.id });
    const selectedVoices = await resolveVoices(bearerToken);
    const existing = await Promise.all(PRESENTATION_AUDIO_MANIFEST.map(findFinalAudio));
    console.log(
      JSON.stringify(
        {
          mode: EXECUTE ? 'execute' : 'dry-run',
          userId,
          existingFinalAudio: existing.filter(Boolean).length,
          entries: PRESENTATION_AUDIO_MANIFEST.map((entry, index) => {
            const voice = selectedVoices.get(entry.storyId)!;
            return {
              ...entry,
              voice: {
                id: voice.id,
                name: voice.name,
                displayName: voice.displayName,
                gender: voice.gender,
                provider: voice.provider,
                isPremium: voice.isPremium,
                isLocked: voice.isLocked,
              },
              existing: existing[index],
            };
          }),
        },
        null,
        2
      )
    );
    if (!EXECUTE) return;

    const results: AudioResult[] = [];
    for (const entry of PRESENTATION_AUDIO_MANIFEST) {
      const result = await generateOne(entry, selectedVoices.get(entry.storyId)!, bearerToken);
      results.push(result);
      console.log(JSON.stringify({ event: 'audio_completed', ...result }));
    }
    console.log(JSON.stringify({ event: 'audio_run_complete', count: results.length, results }, null, 2));
  } finally {
    await deleteSession(session.token);
  }
}

main()
  .catch((error) => {
    console.error(error);
    process.exitCode = 1;
  })
  .finally(async () => {
    await closeDatabaseConnection();
  });
