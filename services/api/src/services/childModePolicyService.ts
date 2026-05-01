import type { CreateStoryRequestInput } from '@wondertales/shared';
import { getChildProfileRepository, getStoryRepository } from '../repositories';
import {
  buildChildModeControls,
  type ChildModeSettings,
} from './childModeControlsService';

export class ChildModePolicyError extends Error {
  constructor(
    message: string,
    public readonly code:
      | 'CHILD_PROFILE_NOT_FOUND'
      | 'CHILD_PROFILE_MISMATCH'
      | 'CHILD_MODE_DISABLED'
      | 'CHILD_FREE_TEXT_DISABLED'
      | 'CHILD_THEME_NOT_ALLOWED'
      | 'CHILD_LANGUAGE_NOT_ALLOWED'
      | 'CHILD_CHARACTER_NOT_ALLOWED'
      | 'CHILD_SIBLINGS_DISABLED'
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

function startOfDay(date: Date): Date {
  return new Date(date.getFullYear(), date.getMonth(), date.getDate());
}

function startOfMonth(date: Date): Date {
  return new Date(date.getFullYear(), date.getMonth(), 1);
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
}): ChildStoryPolicyDecision {
  const { input, settings, sessionChildProfileId } = params;

  if (input.childProfileId && input.childProfileId !== sessionChildProfileId) {
    throw new ChildModePolicyError(
      'Child session cannot create for another child profile',
      'CHILD_PROFILE_MISMATCH',
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

  if (
    settings.allowedCharacterIds.length > 0 &&
    getSelectedCharacters(input).some((characterId) => !settings.allowedCharacterIds.includes(characterId))
  ) {
    throw new ChildModePolicyError(
      'This character is not allowed in Child Mode',
      'CHILD_CHARACTER_NOT_ALLOWED',
      403
    );
  }

  if (!settings.allowSiblingCharacters && getSelectedChildren(input).length > 0) {
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

  return assertChildStoryRequestControls({
    sessionChildProfileId: params.sessionChildProfileId,
    input: params.input,
    settings: controls.childModeSettings,
    dailyCreatedCount,
    monthlyCreatedCount,
  });
}
