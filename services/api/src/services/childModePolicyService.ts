import type { CreateStoryRequestInput } from '@wondertales/shared';
import {
  getCharacterRepository,
  getChildProfileRepository,
  getStoryRepository,
} from '../repositories';
import { buildChildModeControls, type ChildModeSettings } from './childModeControlsService';
import { getUsageForPeriod } from './usageEventsService';
import { syncChildProfileCharacter } from './childProfileService';

export class ChildModePolicyError extends Error {
  constructor(
    message: string,
    public readonly code:
      | 'CHILD_PROFILE_NOT_FOUND'
      | 'CHILD_PROFILE_MISMATCH'
      | 'CHILD_MODE_DISABLED'
      | 'CHILD_STORY_GENERATION_DISABLED'
      | 'CHILD_STORY_CONTINUATION_DISABLED'
      | 'CHILD_FREE_TEXT_DISABLED'
      | 'CHILD_AUDIO_DISABLED'
      | 'CHILD_SESSION_QUIZ_DISABLED'
      | 'CHILD_PUBLISH_REQUIRES_PARENT_REVIEW'
      | 'CHILD_THEME_NOT_ALLOWED'
      | 'CHILD_LANGUAGE_NOT_ALLOWED'
      | 'CHILD_CHARACTER_NOT_ALLOWED'
      | 'CHILD_SIBLINGS_DISABLED'
      | 'CHILD_DAILY_AUDIO_LIMIT_REACHED'
      | 'CHILD_DAILY_LIMIT_REACHED'
      | 'CHILD_MONTHLY_LIMIT_REACHED',
    public readonly statusCode: number
  ) {
    super(message);
  }
}

export interface ChildStoryPolicyDecision {
  parentReviewRequired: boolean;
  settings: ChildModeSettings;
}

export type ChildStoryContinuationPolicyDecision = ChildStoryPolicyDecision;

function startOfDay(date: Date): Date {
  return new Date(date.getFullYear(), date.getMonth(), date.getDate());
}

function startOfMonth(date: Date): Date {
  return new Date(date.getFullYear(), date.getMonth(), 1);
}

function startOfNextDay(date: Date): Date {
  const start = startOfDay(date);
  return new Date(start.getFullYear(), start.getMonth(), start.getDate() + 1);
}

function getSelectedChildren(input: CreateStoryRequestInput): string[] {
  const selectedChildren = (input as any).selectedChildren;
  return Array.isArray(selectedChildren)
    ? selectedChildren.filter((item): item is string => typeof item === 'string')
    : [];
}

function getSelectedCharacters(input: CreateStoryRequestInput): string[] {
  const selectedCharacters = input.selectedCharacters;
  return Array.isArray(selectedCharacters)
    ? selectedCharacters.filter((item): item is string => typeof item === 'string')
    : [];
}

export function assertChildStoryRequestControls(params: {
  sessionChildProfileId: string;
  input: CreateStoryRequestInput;
  settings: ChildModeSettings;
  dailyCreatedCount: number;
  monthlyCreatedCount: number;
  selfCharacterIds?: string[];
  selectedCharacterChildProfileIds?: string[];
}): ChildStoryPolicyDecision {
  const { input, settings, sessionChildProfileId } = params;

  if (input.childProfileId && input.childProfileId !== sessionChildProfileId) {
    throw new ChildModePolicyError(
      'Child session cannot create for another child profile',
      'CHILD_PROFILE_MISMATCH',
      403
    );
  }

  if (!settings.storyGenerationEnabled) {
    throw new ChildModePolicyError(
      'Story generation is disabled in Child Mode',
      'CHILD_STORY_GENERATION_DISABLED',
      403
    );
  }

  if (!settings.freeTextPromptsEnabled && input.userNotes?.trim()) {
    throw new ChildModePolicyError(
      'Free text prompts are disabled in Child Mode',
      'CHILD_FREE_TEXT_DISABLED',
      403
    );
  }

  if (
    settings.allowedThemeSlugs.length > 0 &&
    input.goal &&
    !settings.allowedThemeSlugs.includes(input.goal)
  ) {
    throw new ChildModePolicyError(
      'This story theme is not allowed in Child Mode',
      'CHILD_THEME_NOT_ALLOWED',
      403
    );
  }

  if (
    settings.allowedLanguageCodes.length > 0 &&
    !settings.allowedLanguageCodes.includes(input.storyLanguage)
  ) {
    throw new ChildModePolicyError(
      'This story language is not allowed in Child Mode',
      'CHILD_LANGUAGE_NOT_ALLOWED',
      403
    );
  }

  const selfCharacterIds = new Set(params.selfCharacterIds ?? []);
  if (
    settings.allowedCharacterIds.length > 0 &&
    getSelectedCharacters(input).some(
      (characterId) =>
        !settings.allowedCharacterIds.includes(characterId) && !selfCharacterIds.has(characterId)
    )
  ) {
    throw new ChildModePolicyError(
      'This character is not allowed in Child Mode',
      'CHILD_CHARACTER_NOT_ALLOWED',
      403
    );
  }

  if (
    !settings.allowSiblingCharacters &&
    (getSelectedChildren(input).some((childId) => childId !== sessionChildProfileId) ||
      (params.selectedCharacterChildProfileIds ?? []).some(
        (childId) => childId !== sessionChildProfileId
      ))
  ) {
    throw new ChildModePolicyError(
      'Sibling characters are disabled in Child Mode',
      'CHILD_SIBLINGS_DISABLED',
      403
    );
  }

  if (
    settings.dailyGenerationLimit !== null &&
    params.dailyCreatedCount >= settings.dailyGenerationLimit
  ) {
    throw new ChildModePolicyError(
      'Daily Child Mode story limit reached',
      'CHILD_DAILY_LIMIT_REACHED',
      429
    );
  }

  if (
    settings.monthlyGenerationLimit !== null &&
    params.monthlyCreatedCount >= settings.monthlyGenerationLimit
  ) {
    throw new ChildModePolicyError(
      'Monthly Child Mode story limit reached',
      'CHILD_MONTHLY_LIMIT_REACHED',
      429
    );
  }

  return {
    parentReviewRequired: settings.parentReviewRequired,
    settings,
  };
}

export async function assertChildStoryRequestAllowed(params: {
  parentUserId: string;
  sessionChildProfileId: string;
  input: CreateStoryRequestInput;
  now?: Date;
}): Promise<ChildStoryPolicyDecision> {
  const profile = await getChildProfileRepository().findById(
    params.sessionChildProfileId,
    params.parentUserId
  );

  if (!profile) {
    throw new ChildModePolicyError('Child profile not found', 'CHILD_PROFILE_NOT_FOUND', 404);
  }

  const controls = buildChildModeControls(profile);
  if (!controls.childModeEnabled) {
    throw new ChildModePolicyError(
      'Child Mode is not enabled for this child',
      'CHILD_MODE_DISABLED',
      403
    );
  }

  const now = params.now ?? new Date();
  const selectedCharacterIds = [...new Set(getSelectedCharacters(params.input))];
  const selfCharacter =
    selectedCharacterIds.length > 0 ? await syncChildProfileCharacter(profile) : null;
  const [dailyCreatedCount, monthlyCreatedCount] = await Promise.all([
    getStoryRepository().countChildCreatedRequestsSince(
      params.parentUserId,
      params.sessionChildProfileId,
      startOfDay(now)
    ),
    getStoryRepository().countChildCreatedRequestsSince(
      params.parentUserId,
      params.sessionChildProfileId,
      startOfMonth(now)
    ),
  ]);

  let selectedCharacterChildProfileIds: string[] = [];
  if (selectedCharacterIds.length > 0) {
    const childCharacters = await getCharacterRepository().findByIds(
      params.parentUserId,
      selectedCharacterIds,
      { accessibleByChildProfileId: params.sessionChildProfileId }
    );
    if (childCharacters.length !== selectedCharacterIds.length) {
      throw new ChildModePolicyError(
        'This character is not allowed in Child Mode',
        'CHILD_CHARACTER_NOT_ALLOWED',
        403
      );
    }
    selectedCharacterChildProfileIds = childCharacters
      .map((character) => character.childProfileId)
      .filter((childProfileId): childProfileId is string => Boolean(childProfileId));
  }

  return assertChildStoryRequestControls({
    sessionChildProfileId: params.sessionChildProfileId,
    input: params.input,
    settings: controls.childModeSettings,
    dailyCreatedCount,
    monthlyCreatedCount,
    selfCharacterIds: selfCharacter ? [selfCharacter.id] : [],
    selectedCharacterChildProfileIds,
  });
}

export function assertChildStoryContinuationControls(params: {
  settings: ChildModeSettings;
  dailyCreatedCount: number;
  monthlyCreatedCount: number;
}): ChildStoryContinuationPolicyDecision {
  const { settings } = params;

  if (!settings.storyGenerationEnabled) {
    throw new ChildModePolicyError(
      'Story generation is disabled in Child Mode',
      'CHILD_STORY_GENERATION_DISABLED',
      403
    );
  }

  if (!settings.storyContinuationEnabled) {
    throw new ChildModePolicyError(
      'Story continuations are disabled in Child Mode',
      'CHILD_STORY_CONTINUATION_DISABLED',
      403
    );
  }

  if (
    settings.dailyGenerationLimit !== null &&
    params.dailyCreatedCount >= settings.dailyGenerationLimit
  ) {
    throw new ChildModePolicyError(
      'Daily Child Mode story limit reached',
      'CHILD_DAILY_LIMIT_REACHED',
      429
    );
  }

  if (
    settings.monthlyGenerationLimit !== null &&
    params.monthlyCreatedCount >= settings.monthlyGenerationLimit
  ) {
    throw new ChildModePolicyError(
      'Monthly Child Mode story limit reached',
      'CHILD_MONTHLY_LIMIT_REACHED',
      429
    );
  }

  return {
    parentReviewRequired: settings.parentReviewRequired,
    settings,
  };
}

export async function assertChildStoryContinuationAllowed(params: {
  parentUserId: string;
  sessionChildProfileId: string;
  now?: Date;
}): Promise<ChildStoryContinuationPolicyDecision> {
  const profile = await getChildProfileRepository().findById(
    params.sessionChildProfileId,
    params.parentUserId
  );

  if (!profile) {
    throw new ChildModePolicyError('Child profile not found', 'CHILD_PROFILE_NOT_FOUND', 404);
  }

  const controls = buildChildModeControls(profile);
  if (!controls.childModeEnabled) {
    throw new ChildModePolicyError(
      'Child Mode is not enabled for this child',
      'CHILD_MODE_DISABLED',
      403
    );
  }

  const now = params.now ?? new Date();
  const [dailyCreatedCount, monthlyCreatedCount] = await Promise.all([
    getStoryRepository().countChildCreatedRequestsSince(
      params.parentUserId,
      params.sessionChildProfileId,
      startOfDay(now)
    ),
    getStoryRepository().countChildCreatedRequestsSince(
      params.parentUserId,
      params.sessionChildProfileId,
      startOfMonth(now)
    ),
  ]);

  return assertChildStoryContinuationControls({
    settings: controls.childModeSettings,
    dailyCreatedCount,
    monthlyCreatedCount,
  });
}

export function assertChildAudioGenerationControls(params: {
  settings: ChildModeSettings;
  dailyGeneratedCount: number | null;
}): ChildModeSettings {
  const { settings, dailyGeneratedCount } = params;

  if (!settings.audioGenerationEnabled) {
    throw new ChildModePolicyError(
      'Audio generation is disabled in Child Mode',
      'CHILD_AUDIO_DISABLED',
      403
    );
  }

  if (
    settings.dailyAudioGenerationLimit !== null &&
    dailyGeneratedCount !== null &&
    dailyGeneratedCount >= settings.dailyAudioGenerationLimit
  ) {
    throw new ChildModePolicyError(
      'Daily Child Mode audio limit reached',
      'CHILD_DAILY_AUDIO_LIMIT_REACHED',
      429
    );
  }

  return settings;
}

export async function assertChildAudioGenerationAllowed(params: {
  parentUserId: string;
  sessionChildProfileId: string;
  now?: Date;
}): Promise<ChildModeSettings> {
  const profile = await getChildProfileRepository().findById(
    params.sessionChildProfileId,
    params.parentUserId
  );

  if (!profile) {
    throw new ChildModePolicyError('Child profile not found', 'CHILD_PROFILE_NOT_FOUND', 404);
  }

  const controls = buildChildModeControls(profile);
  if (!controls.childModeEnabled) {
    throw new ChildModePolicyError(
      'Child Mode is not enabled for this child',
      'CHILD_MODE_DISABLED',
      403
    );
  }

  const settings = controls.childModeSettings;
  assertChildAudioGenerationControls({ settings, dailyGeneratedCount: null });

  if (settings.dailyAudioGenerationLimit !== null) {
    const now = params.now ?? new Date();
    const usage = await getUsageForPeriod(
      params.parentUserId,
      startOfDay(now),
      startOfNextDay(now),
      'audio_synthesized',
      { childProfileId: params.sessionChildProfileId }
    );

    return assertChildAudioGenerationControls({ settings, dailyGeneratedCount: usage });
  }

  return settings;
}

export function assertChildQuizGenerationControls(settings: ChildModeSettings): ChildModeSettings {
  if (!settings.quizGenerationEnabled) {
    throw new ChildModePolicyError(
      'Quiz generation is disabled in Child Mode',
      'CHILD_SESSION_QUIZ_DISABLED',
      403
    );
  }
  return settings;
}

export async function assertChildQuizGenerationAllowed(params: {
  parentUserId: string;
  sessionChildProfileId: string;
}): Promise<ChildModeSettings> {
  const profile = await getChildProfileRepository().findById(
    params.sessionChildProfileId,
    params.parentUserId
  );

  if (!profile) {
    throw new ChildModePolicyError('Child profile not found', 'CHILD_PROFILE_NOT_FOUND', 404);
  }

  const controls = buildChildModeControls(profile);
  if (!controls.childModeEnabled) {
    throw new ChildModePolicyError(
      'Child Mode is not enabled for this child',
      'CHILD_MODE_DISABLED',
      403
    );
  }

  return assertChildQuizGenerationControls(controls.childModeSettings);
}

export async function assertChildPublishAllowed(params: {
  parentUserId: string;
  sessionChildProfileId: string;
}): Promise<ChildModeSettings> {
  const profile = await getChildProfileRepository().findById(
    params.sessionChildProfileId,
    params.parentUserId
  );

  if (!profile) {
    throw new ChildModePolicyError('Child profile not found', 'CHILD_PROFILE_NOT_FOUND', 404);
  }

  const controls = buildChildModeControls(profile);
  if (!controls.childModeEnabled) {
    throw new ChildModePolicyError(
      'Child Mode is not enabled for this child',
      'CHILD_MODE_DISABLED',
      403
    );
  }

  if (controls.childModeSettings.parentReviewRequired) {
    throw new ChildModePolicyError(
      'Parent review is required before this child can publish stories',
      'CHILD_PUBLISH_REQUIRES_PARENT_REVIEW',
      403
    );
  }

  return controls.childModeSettings;
}
