import type { ChildModeSettingsInput } from '@wondertales/shared';
import type { ChildProfile } from '../db/schema';
import { getChildProfileRepository, getSessionRepository } from '../repositories';
import { createSession, type SessionData } from './sessionService';
import { logger } from '../utils/logger';

export interface ChildModeSettings {
  dailyGenerationLimit: number | null;
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
  dailyGenerationLimit: null,
  monthlyGenerationLimit: null,
  allowedThemeSlugs: [],
  allowedLanguageCodes: [],
  allowedCharacterIds: [],
  freeTextPromptsEnabled: false,
  audioGenerationEnabled: false,
  parentReviewRequired: true,
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
    dailyGenerationLimit: normalizeOptionalLimit(
      input.dailyGenerationLimit,
      DEFAULT_CHILD_MODE_SETTINGS.dailyGenerationLimit
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
  profile: Pick<ChildProfile, 'childModeEnabled' | 'childModeSettings'>,
  activeSessionCount = 0
): ChildModeControls {
  return {
    childModeEnabled: profile.childModeEnabled === true,
    childModeSettings: normalizeChildModeSettings(profile.childModeSettings),
    activeSessionCount,
  };
}

export function buildChildSessionScopes(settings: ChildModeSettings): string[] {
  const scopes = ['child_mode'];
  if (settings.freeTextPromptsEnabled) scopes.push('story:free_text');
  if (settings.audioGenerationEnabled) scopes.push('story:audio');
  if (settings.allowSharedFamilyStories) scopes.push('family_stories:read');
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
  const counts = await getSessionRepository().countActiveChildSessionsByProfileIds([childProfileId]);
  return buildChildModeControls(profile, counts.get(childProfileId) || 0);
}

export async function getChildModeSessionCounts(childProfileIds: string[]): Promise<Map<string, number>> {
  return getSessionRepository().countActiveChildSessionsByProfileIds(childProfileIds);
}

export async function updateChildModeControls(
  userId: string,
  childProfileId: string,
  input: {
    childModeEnabled?: boolean;
    childModeSettings?: ChildModeSettingsInput;
  }
): Promise<ChildModeControls> {
  const profile = await requireOwnedChildProfile(userId, childProfileId);
  const nextSettings = mergeChildModeSettings(profile.childModeSettings, input.childModeSettings);

  const updated = await getChildProfileRepository().update(childProfileId, userId, {
    childModeEnabled: input.childModeEnabled ?? profile.childModeEnabled,
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

export async function revokeChildModeSessions(userId: string, childProfileId: string): Promise<number> {
  await requireOwnedChildProfile(userId, childProfileId);
  const revokedCount = await getSessionRepository().deleteByChildProfileId(childProfileId);
  logger.info({ userId, childProfileId, revokedCount }, 'Revoked child mode sessions');
  return revokedCount;
}
