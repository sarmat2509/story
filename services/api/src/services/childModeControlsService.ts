import type { ChildModeSettingsInput } from '@wondertales/shared';
import type { ChildProfile } from '../db/schema';
import { getChildProfileRepository, getSessionRepository } from '../repositories';
import { createSession, getChildSessionActiveAfter, type SessionData } from './sessionService';
import { hashPassword, verifyPassword } from './passwordService';
import { logger } from '../utils/logger';

export interface ChildModeSettings {
  storyGenerationEnabled: boolean;
  publicStoriesEnabled: boolean;
  dailyGenerationLimit: number | null;
  dailyAudioGenerationLimit: number | null;
  monthlyGenerationLimit: number | null;
  allowedThemeSlugs: string[];
  allowedLanguageCodes: string[];
  allowedCharacterIds: string[];
  freeTextPromptsEnabled: boolean;
  audioGenerationEnabled: boolean;
  parentReviewRequired: boolean;
  allowSiblingCharacters: boolean;
  allowSharedFamilyStories: boolean;
}

export interface ChildModeControls {
  childModeEnabled: boolean;
  childModeSettings: ChildModeSettings;
  childModePasscodeConfigured: boolean;
  activeSessionCount: number;
}

export interface CreateChildModeSessionInput {
  userId: string;
  childProfileId: string;
  deviceName?: string;
  deviceType?: 'ios' | 'android' | 'web';
  ipAddress?: string;
  userAgent?: string;
}

export const DEFAULT_CHILD_MODE_SETTINGS: ChildModeSettings = {
  storyGenerationEnabled: true,
  publicStoriesEnabled: true,
  dailyGenerationLimit: null,
  dailyAudioGenerationLimit: null,
  monthlyGenerationLimit: null,
  allowedThemeSlugs: [],
  allowedLanguageCodes: [],
  allowedCharacterIds: [],
  freeTextPromptsEnabled: true,
  audioGenerationEnabled: true,
  parentReviewRequired: false,
  allowSiblingCharacters: false,
  allowSharedFamilyStories: false,
};

export class ChildModeError extends Error {
  constructor(
    message: string,
    public readonly code: 'CHILD_PROFILE_NOT_FOUND' | 'CHILD_MODE_DISABLED',
    public readonly statusCode: number
  ) {
    super(message);
  }
}

export class ChildModePasscodeError extends Error {
  constructor(
    message: string,
    public readonly code:
      | 'CHILD_MODE_PASSCODE_REQUIRED'
      | 'CHILD_MODE_PASSCODE_NOT_CONFIGURED'
      | 'CHILD_MODE_PASSCODE_INVALID',
    public readonly statusCode: number
  ) {
    super(message);
  }
}

function normalizeOptionalLimit(value: unknown, fallback: number | null): number | null {
  if (value === null) return null;
  if (typeof value === 'number' && Number.isInteger(value) && value >= 0) return value;
  return fallback;
}

function normalizeStringArray(value: unknown, fallback: string[]): string[] {
  if (!Array.isArray(value)) return fallback;
  return [...new Set(value.filter((item): item is string => typeof item === 'string' && item.trim().length > 0))];
}

function normalizeBoolean(value: unknown, fallback: boolean): boolean {
  return typeof value === 'boolean' ? value : fallback;
}

export function normalizeChildModeSettings(raw: unknown): ChildModeSettings {
  const input = raw && typeof raw === 'object' ? raw as Record<string, unknown> : {};

  return {
    storyGenerationEnabled: normalizeBoolean(
      input.storyGenerationEnabled,
      DEFAULT_CHILD_MODE_SETTINGS.storyGenerationEnabled
    ),
    publicStoriesEnabled: normalizeBoolean(
      input.publicStoriesEnabled,
      DEFAULT_CHILD_MODE_SETTINGS.publicStoriesEnabled
    ),
    dailyGenerationLimit: normalizeOptionalLimit(
      input.dailyGenerationLimit,
      DEFAULT_CHILD_MODE_SETTINGS.dailyGenerationLimit
    ),
    dailyAudioGenerationLimit: normalizeOptionalLimit(
      input.dailyAudioGenerationLimit,
      DEFAULT_CHILD_MODE_SETTINGS.dailyAudioGenerationLimit
    ),
    monthlyGenerationLimit: normalizeOptionalLimit(
      input.monthlyGenerationLimit,
      DEFAULT_CHILD_MODE_SETTINGS.monthlyGenerationLimit
    ),
    allowedThemeSlugs: normalizeStringArray(
      input.allowedThemeSlugs,
      DEFAULT_CHILD_MODE_SETTINGS.allowedThemeSlugs
    ),
    allowedLanguageCodes: normalizeStringArray(
      input.allowedLanguageCodes,
      DEFAULT_CHILD_MODE_SETTINGS.allowedLanguageCodes
    ),
    allowedCharacterIds: normalizeStringArray(
      input.allowedCharacterIds,
      DEFAULT_CHILD_MODE_SETTINGS.allowedCharacterIds
    ),
    freeTextPromptsEnabled: normalizeBoolean(
      input.freeTextPromptsEnabled,
      DEFAULT_CHILD_MODE_SETTINGS.freeTextPromptsEnabled
    ),
    audioGenerationEnabled: normalizeBoolean(
      input.audioGenerationEnabled,
      DEFAULT_CHILD_MODE_SETTINGS.audioGenerationEnabled
    ),
    parentReviewRequired: normalizeBoolean(
      input.parentReviewRequired,
      DEFAULT_CHILD_MODE_SETTINGS.parentReviewRequired
    ),
    allowSiblingCharacters: normalizeBoolean(
      input.allowSiblingCharacters,
      DEFAULT_CHILD_MODE_SETTINGS.allowSiblingCharacters
    ),
    allowSharedFamilyStories: normalizeBoolean(
      input.allowSharedFamilyStories,
      DEFAULT_CHILD_MODE_SETTINGS.allowSharedFamilyStories
    ),
  };
}

export function mergeChildModeSettings(
  current: unknown,
  patch: ChildModeSettingsInput | undefined
): ChildModeSettings {
  return normalizeChildModeSettings({
    ...normalizeChildModeSettings(current),
    ...(patch || {}),
  });
}

export function buildChildModeControls(
  profile: Pick<ChildProfile, 'childModeEnabled' | 'childModeSettings' | 'childModePasscodeHash'>,
  activeSessionCount = 0
): ChildModeControls {
  return {
    childModeEnabled: profile.childModeEnabled === true,
    childModeSettings: normalizeChildModeSettings(profile.childModeSettings),
    childModePasscodeConfigured: Boolean(profile.childModePasscodeHash),
    activeSessionCount,
  };
}

export function buildChildSessionScopes(settings: ChildModeSettings): string[] {
  const scopes = ['child_mode'];
  if (settings.freeTextPromptsEnabled) scopes.push('story:free_text');
  if (settings.audioGenerationEnabled) scopes.push('story:audio');
  return scopes;
}

async function requireOwnedChildProfile(userId: string, childProfileId: string): Promise<ChildProfile> {
  const profile = await getChildProfileRepository().findById(childProfileId, userId);
  if (!profile) {
    throw new ChildModeError('Child profile not found', 'CHILD_PROFILE_NOT_FOUND', 404);
  }
  return profile;
}

export async function getChildModeControls(
  userId: string,
  childProfileId: string
): Promise<ChildModeControls> {
  const profile = await requireOwnedChildProfile(userId, childProfileId);
  const counts = await getChildModeSessionCounts([childProfileId]);
  return buildChildModeControls(profile, counts.get(childProfileId) || 0);
}

export async function getChildModeSessionCounts(childProfileIds: string[]): Promise<Map<string, number>> {
  return getSessionRepository().countActiveChildSessionsByProfileIds(
    childProfileIds,
    getChildSessionActiveAfter()
  );
}

export async function updateChildModeControls(
  userId: string,
  childProfileId: string,
  input: {
    childModeEnabled?: boolean;
    childModeSettings?: ChildModeSettingsInput;
    childModePasscode?: string;
  }
): Promise<ChildModeControls> {
  const profile = await requireOwnedChildProfile(userId, childProfileId);
  const nextSettings = mergeChildModeSettings(profile.childModeSettings, input.childModeSettings);
  const passcode = input.childModePasscode?.trim();
  if (passcode !== undefined && (passcode.length < 4 || passcode.length > 128)) {
    throw new ChildModePasscodeError(
      'Child Mode exit passcode must be between 4 and 128 characters',
      'CHILD_MODE_PASSCODE_REQUIRED',
      400
    );
  }
  const nextPasscodeHash = passcode ? await hashPassword(passcode) : undefined;
  const nextEnabled = input.childModeEnabled ?? profile.childModeEnabled;
  if (nextEnabled && !profile.childModePasscodeHash && !nextPasscodeHash) {
    throw new ChildModePasscodeError(
      'Child Mode exit passcode is required before enabling Child Mode',
      'CHILD_MODE_PASSCODE_REQUIRED',
      400
    );
  }

  const updated = await getChildProfileRepository().update(childProfileId, userId, {
    childModeEnabled: nextEnabled,
    ...(nextPasscodeHash
      ? {
          childModePasscodeHash: nextPasscodeHash,
          childModePasscodeSetAt: new Date(),
        }
      : {}),
    childModeSettings: nextSettings,
    updatedAt: new Date(),
  });

  logger.info({
    userId,
    childProfileId,
    childModeEnabled: updated.childModeEnabled,
  }, 'Updated child mode controls');

  return getChildModeControls(userId, childProfileId);
}

export async function createChildModeSession(input: CreateChildModeSessionInput): Promise<{
  profile: ChildProfile;
  session: SessionData;
}> {
  const profile = await requireOwnedChildProfile(input.userId, input.childProfileId);
  const controls = buildChildModeControls(profile);

  if (!controls.childModeEnabled) {
    throw new ChildModeError('Child Mode is not enabled for this child', 'CHILD_MODE_DISABLED', 403);
  }

  if (!controls.childModePasscodeConfigured) {
    throw new ChildModePasscodeError(
      'Child Mode exit passcode is not configured',
      'CHILD_MODE_PASSCODE_NOT_CONFIGURED',
      409
    );
  }

  const session = await createSession({
    userId: input.userId,
    mode: 'child',
    parentUserId: input.userId,
    childProfileId: input.childProfileId,
    scopes: buildChildSessionScopes(controls.childModeSettings),
    deviceName: input.deviceName,
    deviceType: input.deviceType,
    ipAddress: input.ipAddress,
    userAgent: input.userAgent,
  });

  logger.info({
    userId: input.userId,
    childProfileId: input.childProfileId,
    sessionId: session.id,
  }, 'Created child mode session');

  return { profile, session };
}

export async function verifyChildModePasscode(
  userId: string,
  childProfileId: string,
  passcode: string
): Promise<void> {
  const profile = await requireOwnedChildProfile(userId, childProfileId);
  if (!profile.childModePasscodeHash) {
    throw new ChildModePasscodeError(
      'Child Mode exit passcode is not configured',
      'CHILD_MODE_PASSCODE_NOT_CONFIGURED',
      403
    );
  }

  const valid = await verifyPassword(passcode, profile.childModePasscodeHash);
  if (!valid) {
    throw new ChildModePasscodeError(
      'Child Mode passcode is invalid',
      'CHILD_MODE_PASSCODE_INVALID',
      401
    );
  }
}

export async function revokeChildModeSessions(userId: string, childProfileId: string): Promise<number> {
  await requireOwnedChildProfile(userId, childProfileId);
  const revokedCount = await getSessionRepository().deleteByChildProfileId(childProfileId);
  logger.info({ userId, childProfileId, revokedCount }, 'Revoked child mode sessions');
  return revokedCount;
}
