import type {
  SaveStoryQuizAnswerInputApi,
  StoryQuizAnswerApi,
  StoryQuizApi,
  StoryQuizCandidateApi,
  StoryQuizPayloadApi,
  StoryQuizProgressApi,
  StoryQuizProgressOwnerType,
} from '@wondertales/shared';
import type { ChildProfile, Story, StoryQuiz, StoryRequest } from '../db/schema';
import {
  getChildProfileRepository,
  getSceneRepository,
  getStoryQuizProgressRepository,
  getStoryQuizRepository,
  getStoryRepository,
} from '../repositories';
import {
  StoryQuizAnswerValidationError,
  StoryQuizDomainService,
  buildStoryQuizSourceFingerprint,
  isCheckRewardComplete,
  mergeStoryQuizAnswer,
  normalizeQuizScenes,
} from '../domain/quiz';
import {
  QUIZ_PROMPT_VERSION,
  STORY_QUIZ_GENERATION_STALE_MS,
  normalizeQuizAgeBucket,
} from '../domain/quiz/schemas';
import { getTextProvider } from './aiService';
import { estimateUsageCostUsd, recordUsage } from './aiUsageService';
import { recordUsageEvent } from './usageEventsService';
import { stripAllTags } from '../utils/audioTags';
import { logger } from '../utils/logger';
import type { UsageMetadata } from '../providers/base/UsageMetadata';

export class StoryQuizServiceError extends Error {
  constructor(
    message: string,
    public readonly code:
      | 'QUIZ_NOT_GENERATED'
      | 'QUIZ_GENERATION_IN_PROGRESS'
      | 'STORY_NOT_READY'
      | 'QUIZ_GENERATION_FAILED'
      | 'QUIZ_ANSWER_INVALID',
    public readonly statusCode: number
  ) {
    super(message);
  }
}

interface StoryQuizContext {
  userId: string;
  childProfileId?: string | null;
  sessionMode?: 'parent' | 'child';
}

interface StoryQuizSourceContext {
  sourceAgeGroup: string;
  quizAgeBucket: ReturnType<typeof normalizeQuizAgeBucket>;
  childProfileId: string | null;
  scenes: ReturnType<typeof normalizeQuizScenes>;
  characters: string[];
  sourceFingerprint: string;
}

interface QuizUsageSummary {
  totalCostUsd: number | null;
  inputUnits: number;
  effectiveInputUnits: number;
  outputUnits: number;
  cachedInputUnits: number;
  calls: Array<{
    provider: string;
    operation: string;
    model?: string;
    inputUnits: number;
    effectiveInputUnits: number;
    outputUnits: number;
    cachedInputUnits: number;
    costUsd: number | null;
  }>;
}

function cleanText(value: string | null | undefined): string {
  return stripAllTags(String(value || ''))
    .replace(/\s+/g, ' ')
    .trim();
}

function roundCostUsd(value: number): number {
  return Number(value.toFixed(8));
}

function summarizeQuizUsage(records: UsageMetadata[]): QuizUsageSummary {
  let knownCostTotal = 0;
  let hasUnknownCost = false;
  let inputUnits = 0;
  let effectiveInputUnits = 0;
  let outputUnits = 0;
  let cachedInputUnits = 0;

  const calls = records.map((usage) => {
    const billedInputUnits =
      usage.effectiveInputUnits != null
        ? usage.effectiveInputUnits
        : Math.max(usage.inputUnits - (usage.cachedInputUnits ?? 0), 0);
    const costUsd = estimateUsageCostUsd(usage);
    inputUnits += usage.inputUnits;
    effectiveInputUnits += billedInputUnits;
    outputUnits += usage.outputUnits ?? 0;
    cachedInputUnits += usage.cachedInputUnits ?? 0;
    if (costUsd == null) {
      hasUnknownCost = true;
    } else {
      knownCostTotal += costUsd;
    }

    return {
      provider: usage.provider,
      operation: usage.operation,
      model: usage.model,
      inputUnits: usage.inputUnits,
      effectiveInputUnits: billedInputUnits,
      outputUnits: usage.outputUnits ?? 0,
      cachedInputUnits: usage.cachedInputUnits ?? 0,
      costUsd: costUsd == null ? null : roundCostUsd(costUsd),
    };
  });

  return {
    totalCostUsd: hasUnknownCost ? null : roundCostUsd(knownCostTotal),
    inputUnits,
    effectiveInputUnits,
    outputUnits,
    cachedInputUnits,
    calls,
  };
}

interface StoryQuizProgressOwner {
  ownerType: StoryQuizProgressOwnerType;
  ownerId: string;
  childProfileId: string | null;
}

function resolveProgressOwner(context: StoryQuizContext): StoryQuizProgressOwner {
  if (context.sessionMode === 'child' && context.childProfileId) {
    return {
      ownerType: 'child_profile',
      ownerId: context.childProfileId,
      childProfileId: context.childProfileId,
    };
  }

  return {
    ownerType: 'parent_user',
    ownerId: context.userId,
    childProfileId: null,
  };
}

function rowToProgressApi(row: any): StoryQuizProgressApi {
  return {
    id: row.id,
    storyId: row.storyId,
    storyQuizId: row.storyQuizId,
    userId: row.userId,
    childProfileId: row.childProfileId ?? null,
    ownerType: row.ownerType,
    ownerId: row.ownerId,
    answers: (row.answers as Record<string, StoryQuizAnswerApi> | null) ?? {},
    completedCheckRewardAt: row.completedCheckRewardAt
      ? row.completedCheckRewardAt instanceof Date
        ? row.completedCheckRewardAt.toISOString()
        : String(row.completedCheckRewardAt)
      : null,
    createdAt: row.createdAt instanceof Date ? row.createdAt.toISOString() : String(row.createdAt),
    updatedAt: row.updatedAt instanceof Date ? row.updatedAt.toISOString() : String(row.updatedAt),
  };
}

function rowToApi(row: any, progress?: StoryQuizProgressApi | null): StoryQuizApi {
  return {
    id: row.id,
    storyId: row.storyId,
    childProfileId: row.childProfileId ?? null,
    language: row.language,
    sourceAgeGroup: row.sourceAgeGroup,
    quizAgeBucket: row.quizAgeBucket,
    promptVersion: row.promptVersion,
    sourceFingerprint: row.sourceFingerprint,
    status: row.status,
    payload: (row.payload as StoryQuizPayloadApi | null) ?? null,
    errorMessage: row.errorMessage ?? null,
    generationTimeMs: row.generationTimeMs ?? null,
    progress: progress ?? null,
    createdAt: row.createdAt instanceof Date ? row.createdAt.toISOString() : String(row.createdAt),
    updatedAt: row.updatedAt instanceof Date ? row.updatedAt.toISOString() : String(row.updatedAt),
  };
}

async function getProgressForQuiz(
  quiz: Pick<StoryQuiz, 'id'>,
  context: StoryQuizContext
): Promise<StoryQuizProgressApi | null> {
  const owner = resolveProgressOwner(context);
  const progress = await getStoryQuizProgressRepository().findByOwner({
    storyQuizId: quiz.id,
    ownerType: owner.ownerType,
    ownerId: owner.ownerId,
  });
  return progress ? rowToProgressApi(progress) : null;
}

function isFreshGenerating(row: { status: string; updatedAt: Date | string }): boolean {
  if (row.status !== 'generating') return false;
  const updatedAt =
    row.updatedAt instanceof Date ? row.updatedAt.getTime() : Date.parse(String(row.updatedAt));
  return Number.isFinite(updatedAt) && Date.now() - updatedAt < STORY_QUIZ_GENERATION_STALE_MS;
}

function assertStoryReady(story: Story): void {
  const fullText = cleanText(story.fullText);
  if (!story.title || fullText.length < 20 || story.title === 'Generating...') {
    throw new StoryQuizServiceError(
      'Story is not ready for quiz generation',
      'STORY_NOT_READY',
      409
    );
  }
}

function calculateAgeMonthsAt(birthDate: Date, at: Date): number {
  let ageMonths = (at.getFullYear() - birthDate.getFullYear()) * 12;
  ageMonths += at.getMonth() - birthDate.getMonth();
  if (at.getDate() < birthDate.getDate()) {
    ageMonths -= 1;
  }
  return Math.max(ageMonths, 0);
}

export function ageGroupFromBirthDate(birthDate: Date | string, at = new Date()): string {
  const birth = new Date(birthDate);
  const ageMonths = calculateAgeMonthsAt(birth, at);
  if (ageMonths < 12) return '0-1';
  if (ageMonths < 24) return '1y';
  if (ageMonths < 48) return '2-3';
  if (ageMonths < 72) return '4-5';
  if (ageMonths < 108) return '6-8';
  return '9-12';
}

function parseSelectedChildIds(value: unknown): string[] {
  if (!Array.isArray(value)) return [];
  return value.filter((item): item is string => typeof item === 'string' && item.length > 0);
}

function pushUniqueId(target: string[], value: string | null | undefined): void {
  if (value && !target.includes(value)) {
    target.push(value);
  }
}

export function collectStoryQuizAudienceCandidateIds(
  story: Pick<Story, 'childProfileId' | 'createdByChildProfileId'>,
  request: Pick<
    StoryRequest,
    'selectedChildren' | 'childProfileId' | 'createdByChildProfileId'
  > | null
): string[] {
  const candidateIds: string[] = [];
  for (const selectedId of parseSelectedChildIds(request?.selectedChildren)) {
    pushUniqueId(candidateIds, selectedId);
  }

  pushUniqueId(candidateIds, story.createdByChildProfileId);
  pushUniqueId(candidateIds, request?.createdByChildProfileId);
  pushUniqueId(candidateIds, request?.childProfileId);
  pushUniqueId(candidateIds, story.childProfileId);

  return candidateIds;
}

async function resolveAudienceChildProfile(
  story: Story,
  request: StoryRequest | null
): Promise<ChildProfile | null> {
  const candidateIds = collectStoryQuizAudienceCandidateIds(story, request);

  if (candidateIds.length === 0) return null;
  const profiles = await getChildProfileRepository().findByIds(story.userId, candidateIds);
  return candidateIds
    .map((id) => profiles.find((profile) => profile.id === id) ?? null)
    .find((profile): profile is ChildProfile => Boolean(profile)) ?? null;
}

async function buildSourceContext(story: Story): Promise<StoryQuizSourceContext> {
  const sceneRows = await getSceneRepository().findByStoryId(story.id);
  let scenes = normalizeQuizScenes(
    sceneRows.map((scene) => ({ sceneId: scene.sceneId, text: scene.text }))
  );

  if (scenes.length === 0 && Array.isArray(story.scenes)) {
    scenes = normalizeQuizScenes(
      (story.scenes as Array<{ sceneId?: number; text?: string }>).map((scene) => ({
        sceneId: scene.sceneId,
        text: scene.text,
      }))
    );
  }

  if (scenes.length === 0) {
    const fullText = cleanText(story.fullText);
    if (fullText) {
      scenes = [{ sceneId: 1, text: fullText }];
    }
  }

  const request = story.storyRequestId
    ? await getStoryRepository().findRequestById(story.storyRequestId)
    : null;
  const audienceChild = await resolveAudienceChildProfile(story, request);
  const sourceAgeGroup = audienceChild
    ? ageGroupFromBirthDate(audienceChild.birthDate)
    : story.ageGroup || '4-5';
  const quizAgeBucket = normalizeQuizAgeBucket(sourceAgeGroup);
  const linkedCharacters = await getStoryRepository().findLinkedCharactersByStoryId(story.id);
  const characters = linkedCharacters
    .map((character) => cleanText(character.name))
    .filter((name) => name.length > 0);
  const sourceFingerprint = buildStoryQuizSourceFingerprint({
    title: story.title,
    language: story.language,
    sourceAgeGroup,
    scenes,
    closingKeepsakeLabel: story.closingKeepsakeLabel,
  });

  return {
    sourceAgeGroup,
    quizAgeBucket,
    childProfileId: audienceChild?.id ?? null,
    scenes,
    characters,
    sourceFingerprint,
  };
}

export async function getStoryQuiz(story: Story, context: StoryQuizContext): Promise<StoryQuizApi> {
  assertStoryReady(story);
  const source = await buildSourceContext(story);
  const existing = await getStoryQuizRepository().findByKey({
    storyId: story.id,
    language: story.language,
    quizAgeBucket: source.quizAgeBucket,
    promptVersion: QUIZ_PROMPT_VERSION,
    sourceFingerprint: source.sourceFingerprint,
  });

  if (!existing) {
    throw new StoryQuizServiceError('Quiz has not been generated', 'QUIZ_NOT_GENERATED', 404);
  }
  if (existing.status === 'generating') {
    throw new StoryQuizServiceError(
      'Quiz generation is already in progress',
      'QUIZ_GENERATION_IN_PROGRESS',
      409
    );
  }
  if (existing.status !== 'completed' || !existing.payload) {
    throw new StoryQuizServiceError('Quiz has not been generated', 'QUIZ_NOT_GENERATED', 404);
  }

  return rowToApi(existing, await getProgressForQuiz(existing, context));
}

export async function saveStoryQuizAnswer(
  story: Story,
  context: StoryQuizContext,
  input: { activityId: string } & SaveStoryQuizAnswerInputApi
): Promise<StoryQuizProgressApi> {
  assertStoryReady(story);
  const source = await buildSourceContext(story);
  const quiz = await getStoryQuizRepository().findByKey({
    storyId: story.id,
    language: story.language,
    quizAgeBucket: source.quizAgeBucket,
    promptVersion: QUIZ_PROMPT_VERSION,
    sourceFingerprint: source.sourceFingerprint,
  });

  if (!quiz || quiz.status !== 'completed' || !quiz.payload) {
    throw new StoryQuizServiceError('Quiz has not been generated', 'QUIZ_NOT_GENERATED', 404);
  }

  const owner = resolveProgressOwner(context);
  const repo = getStoryQuizProgressRepository();
  const existing = await repo.findByOwner({
    storyQuizId: quiz.id,
    ownerType: owner.ownerType,
    ownerId: owner.ownerId,
  });
  const currentAnswers =
    (existing?.answers as Record<string, StoryQuizAnswerApi> | undefined) ?? {};
  const payload = quiz.payload as StoryQuizPayloadApi;
  let nextAnswers: Record<string, StoryQuizAnswerApi>;
  try {
    nextAnswers = mergeStoryQuizAnswer(payload, currentAnswers, input.activityId, input);
  } catch (error) {
    if (error instanceof StoryQuizAnswerValidationError) {
      throw new StoryQuizServiceError(error.message, 'QUIZ_ANSWER_INVALID', 400);
    }
    throw error;
  }

  const completedCheckRewardAt = isCheckRewardComplete(payload, nextAnswers)
    ? existing?.completedCheckRewardAt ?? new Date()
    : null;

  const progress = await repo.upsert({
    storyQuizId: quiz.id,
    storyId: story.id,
    userId: context.userId,
    childProfileId: owner.childProfileId,
    ownerType: owner.ownerType,
    ownerId: owner.ownerId,
    answers: nextAnswers,
    completedCheckRewardAt,
  });

  return rowToProgressApi(progress);
}

export async function getStoryQuizCandidateForProgress(
  context: StoryQuizContext
): Promise<StoryQuizCandidateApi | null> {
  const childProfileId =
    context.sessionMode === 'child' ? context.childProfileId ?? undefined : undefined;
  const stories = await getStoryRepository().findQuizCandidateStoriesByUser(context.userId, {
    childProfileId,
    limit: 50,
  });
  const candidates: StoryQuizCandidateApi[] = [];

  for (const story of stories) {
    const source = await buildSourceContext(story);
    const quiz = await getStoryQuizRepository().findByKey({
      storyId: story.id,
      language: story.language,
      quizAgeBucket: source.quizAgeBucket,
      promptVersion: QUIZ_PROMPT_VERSION,
      sourceFingerprint: source.sourceFingerprint,
    });

    if (!quiz) {
      candidates.push({
        storyId: story.id,
        title: cleanText(story.title),
        quizStatus: 'not_generated',
      });
      continue;
    }

    if (quiz.status === 'failed') {
      continue;
    }

    const progress = await getProgressForQuiz(quiz, context);
    if (!progress?.completedCheckRewardAt) {
      candidates.push({
        storyId: story.id,
        title: cleanText(story.title),
        quizStatus: quiz.status as StoryQuizCandidateApi['quizStatus'],
      });
    }
  }

  if (candidates.length === 0) return null;
  return candidates[Math.floor(Math.random() * candidates.length)];
}

export async function generateStoryQuiz(
  story: Story,
  context: StoryQuizContext,
  options: { force?: boolean } = {}
): Promise<StoryQuizApi> {
  assertStoryReady(story);
  const source = await buildSourceContext(story);
  const repo = getStoryQuizRepository();
  const key = {
    storyId: story.id,
    language: story.language,
    quizAgeBucket: source.quizAgeBucket,
    promptVersion: QUIZ_PROMPT_VERSION,
    sourceFingerprint: source.sourceFingerprint,
  };
  const existing = await repo.findByKey(key);

  if (existing?.status === 'completed' && existing.payload && !options.force) {
    return rowToApi(existing, await getProgressForQuiz(existing, context));
  }
  if (existing && isFreshGenerating(existing) && !options.force) {
    throw new StoryQuizServiceError(
      'Quiz generation is already in progress',
      'QUIZ_GENERATION_IN_PROGRESS',
      409
    );
  }

  const generationRow = await repo.upsertGenerating({
    storyId: story.id,
    userId: context.userId,
    childProfileId:
      source.childProfileId ??
      context.childProfileId ??
      story.createdByChildProfileId ??
      story.childProfileId ??
      null,
    language: story.language,
    sourceAgeGroup: source.sourceAgeGroup,
    quizAgeBucket: source.quizAgeBucket,
    promptVersion: QUIZ_PROMPT_VERSION,
    sourceFingerprint: source.sourceFingerprint,
    status: 'generating',
  });

  const startedAt = Date.now();
  const usageRecords: UsageMetadata[] = [];
  const childProfileId =
    source.childProfileId ??
    context.childProfileId ??
    story.createdByChildProfileId ??
    story.childProfileId ??
    null;
  try {
    const domain = new StoryQuizDomainService(getTextProvider());
    const result = await domain.generateQuiz({
      title: cleanText(story.title),
      language: story.language,
      sourceAgeGroup: source.sourceAgeGroup,
      scenes: source.scenes,
      characters: source.characters,
      closingKeepsakeLabel: story.closingKeepsakeLabel,
      scenarioCardName: null,
      onUsage: (usage) => {
        usageRecords.push(usage);
        void recordUsage(usage, {
          userId: context.userId,
          storyId: story.id,
          childProfileId,
        });
      },
    });
    const generationTimeMs = Date.now() - startedAt;
    const completed = await repo.markCompleted(generationRow.id, result.payload, generationTimeMs);
    const usageSummary = summarizeQuizUsage(usageRecords);

    await recordUsageEvent(context.userId, 'story_quiz_generated', 1, {
      childProfileId,
      metadata: {
        storyId: story.id,
        quizId: completed.id,
        promptVersion: QUIZ_PROMPT_VERSION,
        quizAgeBucket: source.quizAgeBucket,
        generationTimeMs,
        aiCostUsd: usageSummary.totalCostUsd,
        aiUsage: usageSummary,
        fallbackUsed: false,
        qualityIssues: result.qualityIssues,
      },
    });

    if (result.qualityIssues.length > 0) {
      logger.warn(
        {
          storyId: story.id,
          quizId: completed.id,
          aiCostUsd: usageSummary.totalCostUsd,
          qualityIssues: result.qualityIssues,
        },
        'Story quiz generated with quality warnings'
      );
    }

    return rowToApi(completed, await getProgressForQuiz(completed, context));
  } catch (error) {
    const message = error instanceof Error ? error.message : 'Unknown quiz generation error';
    await repo.markFailed(generationRow.id, message);
    logger.error({ err: error, storyId: story.id }, 'Story quiz generation failed');
    throw new StoryQuizServiceError(message, 'QUIZ_GENERATION_FAILED', 500);
  }
}
