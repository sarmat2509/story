/**
 * Generate fresh story narration through the production audio pipeline, pinned
 * to Google Gemini 2.5 Pro TTS. It reuses scene grouping, deferred prosody,
 * storage, asset persistence, usage accounting, and forced alignment.
 *
 * The default is a dry run. `--apply` writes a new final audio asset and makes
 * it the story's current narration; older audio assets are preserved.
 *
 * Usage:
 *   pnpm --filter wondertales-api exec tsx src/scripts/generateStoryAudioWithGeminiProTts.ts -- --slug=misyats-zagubiv-pozikhannya
 *   pnpm --filter wondertales-api exec tsx src/scripts/generateStoryAudioWithGeminiProTts.ts -- --slug=misyats-zagubiv-pozikhannya --voice=Kore --apply
 *   pnpm --filter wondertales-api exec tsx src/scripts/generateStoryAudioWithGeminiProTts.ts -- --story-id=<uuid> --apply
 */

import './loadEnvForScripts';

import type { StoryAudioMetadata } from '@wondertales/shared';

const GEMINI_PRO_TTS_MODEL = 'gemini-2.5-pro-tts';
const DEFAULT_STORY_SLUG = 'misyats-zagubiv-pozikhannya';
const DEFAULT_GOOGLE_VOICE = 'Kore';

type CliOptions = {
  storyId?: string;
  slug?: string;
  voice: string;
  apply: boolean;
};

function readOption(name: string): string | undefined {
  const prefix = `--${name}=`;
  return process.argv.find((arg) => arg.startsWith(prefix))?.slice(prefix.length).trim() || undefined;
}

function parseOptions(): CliOptions {
  const storyId = readOption('story-id');
  const slug = readOption('slug') || (!storyId ? DEFAULT_STORY_SLUG : undefined);
  if (storyId && slug) {
    throw new Error('Use either --story-id or --slug, not both');
  }
  return {
    storyId,
    slug,
    voice: readOption('voice') || DEFAULT_GOOGLE_VOICE,
    apply: process.argv.includes('--apply'),
  };
}

function voiceSupportsLanguage(
  voice: { language: string; supportedLanguages: string[] | null },
  storyLanguage: string
): boolean {
  const target = storyLanguage.slice(0, 2).toLowerCase();
  const supported = voice.supportedLanguages?.length ? voice.supportedLanguages : [voice.language];
  return supported.some((language) => language.slice(0, 2).toLowerCase() === target);
}

async function main(): Promise<void> {
  const options = parseOptions();

  // This must happen before importing the app config/provider graph. Do not
  // change .env.production: this override applies to this one CLI process only.
  process.env.GOOGLE_TTS_MODEL = GEMINI_PRO_TTS_MODEL;

  const [
    { config },
    { getStoryRepository, getSceneRepository, getVoiceRepository, getAlignmentRepository },
    { getAudioProviderByName, getAlignmentProvider },
    { AudioDomainService },
    { groupScenesIntoChunks },
    { resolveStoryAudioScenes },
    { recordUsage },
  ] = await Promise.all([
    import('../config'),
    import('../repositories'),
    import('../services/aiService'),
    import('../domain/audio/AudioDomainService'),
    import('../domain/audio/sceneGrouper'),
    import('../services/storyAudioTextService'),
    import('../services/aiUsageService'),
  ]);

  if (config.audio.google.model !== GEMINI_PRO_TTS_MODEL) {
    throw new Error(
      `Expected Google TTS model ${GEMINI_PRO_TTS_MODEL}, got ${config.audio.google.model || '(empty)'}`
    );
  }

  const storyRepo = getStoryRepository();
  const story = options.storyId
    ? await storyRepo.findById(options.storyId)
    : await storyRepo.findByPublishedSlug(options.slug!);
  if (!story) {
    throw new Error(`Story not found: ${options.storyId || options.slug}`);
  }

  const voice = await getVoiceRepository().findByProviderVoiceId('google', options.voice);
  if (!voice || !voice.isActive) {
    throw new Error(`Active Google TTS voice not found: ${options.voice}`);
  }
  if (!voiceSupportsLanguage(voice, story.language)) {
    throw new Error(`Google voice ${options.voice} does not support story language ${story.language}`);
  }

  const normalizedScenes = await getSceneRepository().findByStoryId(story.id);
  const scenesForAudio = resolveStoryAudioScenes({
    normalizedScenes,
    embeddedScenes: story.scenes,
    fullText: story.fullText,
  });
  if (scenesForAudio.length === 0) {
    throw new Error('Story has no narratable text');
  }

  const googleProvider = getAudioProviderByName('google');
  const concurrencyLimit = Math.min(4, googleProvider.getMaxConcurrency());
  const sceneGroups = groupScenesIntoChunks(
    scenesForAudio,
    concurrencyLimit,
    googleProvider.getMaxCharsPerChunk()
  );

  console.log(JSON.stringify({
    storyId: story.id,
    slug: story.publishedSlug,
    title: story.title,
    language: story.language,
    model: GEMINI_PRO_TTS_MODEL,
    provider: 'google',
    voice: { id: voice.id, providerVoiceId: voice.providerVoiceId, name: voice.name },
    scenes: scenesForAudio.length,
    sceneGroups: sceneGroups.length,
    totalChars: scenesForAudio.reduce((sum, scene) => sum + scene.text.length, 0),
    mode: options.apply ? 'apply' : 'dry-run',
  }, null, 2));

  if (!options.apply) {
    console.log('Dry run only. Add --apply to synthesize and persist fresh Gemini 2.5 Pro TTS audio.');
    return;
  }

  const audioDomain = new AudioDomainService(googleProvider);
  const startedAt = Date.now();
  const result = await audioDomain.synthesizeSceneGroups(
    story,
    sceneGroups,
    { voiceId: voice.id },
    'premium',
    concurrencyLimit,
    {
      forceFreshSynthesis: true,
      onUsage: (usage) => recordUsage(usage, { userId: story.userId, storyId: story.id }),
    }
  );

  const freshStory = await storyRepo.findById(story.id);
  const audioMetadata: StoryAudioMetadata = {
    ...((freshStory?.audioMetadata as StoryAudioMetadata | null) ?? {}),
    voiceId: result.voiceId,
    voiceName: result.voiceName,
    totalDuration: result.duration,
    generatedAt: new Date().toISOString(),
    provider: 'google',
    ttsModel: GEMINI_PRO_TTS_MODEL,
    audioGenerationTimeMs: Date.now() - startedAt,
    error: undefined,
    errorMessage: undefined,
    failedAt: undefined,
  };
  await storyRepo.updateStory(story.id, { audioMetadata, updatedAt: new Date() });

  try {
    const alignmentProvider = getAlignmentProvider();
    const alignment = await audioDomain.generateAlignmentForStory(
      story.id,
      result.assetId,
      alignmentProvider
    );
    await getAlignmentRepository().upsert(story.id, {
      characters: alignment.characters,
      words: alignment.words,
      averageConfidence: alignment.averageConfidence,
      provider: alignmentProvider.getProviderName().toLowerCase(),
      language: alignment.language,
      generatedAt: new Date().toISOString(),
    }, result.assetId);
  } catch (error) {
    console.warn(`Audio generated, but alignment failed: ${(error as Error).message}`);
  }

  if (story.isPublished && story.publishedSlug) {
    await storyRepo.incrementPublicRenderVersion(story.id);
  }

  console.log(JSON.stringify({
    status: 'completed',
    storyId: story.id,
    assetId: result.assetId,
    durationSeconds: result.duration,
    model: GEMINI_PRO_TTS_MODEL,
    cached: result.cached,
  }, null, 2));
}

main().catch((error) => {
  console.error(error instanceof Error ? error.stack || error.message : error);
  process.exit(1);
});
