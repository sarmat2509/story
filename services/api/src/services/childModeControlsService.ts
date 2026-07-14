import type { ChildModeSettingsInput } from '@wondertales/shared';
import type { ChildProfile, User } from '../db/schema';
import {
  getChildProfileRepository,
  getPasswordResetTokenRepository,
  getSessionRepository,
  getUserRepository,
} from '../repositories';
import { createSession, getChildSessionActiveAfter, type SessionData } from './sessionService';
import { hashPassword, verifyPassword } from './passwordService';
import { sendChildModeRecoveryEmail } from './emailService';
import { logger } from '../utils/logger';
import config from '../config';
import { FAMILY_STORIES_READ_SCOPE } from './childStoryAccessService';

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
  quizGenerationEnabled: boolean;
  parentReviewRequired: boolean;
  allowSiblingCharacters: boolean;
  allowSharedFamilyStories: boolean;
}

export interface ChildModeControls {
  childModeEnabled: boolean;
  childModeSettings: ChildModeSettings;
  /** Parent account-level exit passcode status. The legacy field name is kept for API compatibility. */
  childModePasscodeConfigured: boolean;
  activeSessionCount: number;
}

export interface ChildModeExitPasscodeStatus {
  configured: boolean;
  setAt: Date | null;
}

export interface UpdateChildModeExitPasscodeResult {
  user: User;
  childModeExitPasscode: ChildModeExitPasscodeStatus;
}

export interface CreateChildModeSessionInput {
  userId: string;
  childProfileId: string;
  deviceName?: string;
  deviceType?: 'ios' | 'android' | 'web';
  ipAddress?: string;
  userAgent?: string;
}

export interface ChildModeRecoveryTokenResult {
  user: User;
  childProfileId: string | null;
  childSessionId: string | null;
}

const CHILD_MODE_RECOVERY_TOKEN_EXPIRY_MINUTES = 30;

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
  quizGenerationEnabled: true,
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

export class ChildModeRecoveryError extends Error {
  constructor(
    message: string,
    public readonly code: 'CHILD_MODE_RECOVERY_INVALID' | 'CHILD_MODE_RECOVERY_USER_NOT_FOUND',
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
  return [
    ...new Set(
      value.filter((item): item is string => typeof item === 'string' && item.trim().length > 0)
    ),
  ];
}

function normalizeBoolean(value: unknown, fallback: boolean): boolean {
  return typeof value === 'boolean' ? value : fallback;
}

export function normalizeChildModeSettings(raw: unknown): ChildModeSettings {
  const input = raw && typeof raw === 'object' ? (raw as Record<string, unknown>) : {};

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
    quizGenerationEnabled: normalizeBoolean(
      input.quizGenerationEnabled,
      DEFAULT_CHILD_MODE_SETTINGS.quizGenerationEnabled
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
  activeSessionCount = 0,
  childModePasscodeConfigured = false
): ChildModeControls {
  return {
    childModeEnabled: profile.childModeEnabled === true,
    childModeSettings: normalizeChildModeSettings(profile.childModeSettings),
    childModePasscodeConfigured,
    activeSessionCount,
  };
}

export function buildChildModeExitPasscodeStatus(
  user: Pick<User, 'childModeExitPasscodeHash' | 'childModeExitPasscodeSetAt'> | null
): ChildModeExitPasscodeStatus {
  return {
    configured: Boolean(user?.childModeExitPasscodeHash),
    setAt: user?.childModeExitPasscodeSetAt ?? null,
  };
}

export function buildChildSessionScopes(settings: ChildModeSettings): string[] {
  const scopes = ['child_mode'];
  if (settings.freeTextPromptsEnabled) scopes.push('story:free_text');
  if (settings.audioGenerationEnabled) scopes.push('story:audio');
  if (settings.quizGenerationEnabled) scopes.push('story:quiz');
  if (settings.allowSharedFamilyStories) scopes.push(FAMILY_STORIES_READ_SCOPE);
  return scopes;
}

async function requireOwnedChildProfile(
  userId: string,
  childProfileId: string
): Promise<ChildProfile> {
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
  const passcodeStatus = await getChildModeExitPasscodeStatus(userId);
  return buildChildModeControls(
    profile,
    counts.get(childProfileId) || 0,
    passcodeStatus.configured
  );
}

export async function getChildModeSessionCounts(
  childProfileIds: string[]
): Promise<Map<string, number>> {
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
  }
): Promise<ChildModeControls> {
  const profile = await requireOwnedChildProfile(userId, childProfileId);
  const nextSettings = mergeChildModeSettings(profile.childModeSettings, input.childModeSettings);
  const nextEnabled = input.childModeEnabled ?? profile.childModeEnabled;

  const updated = await getChildProfileRepository().update(childProfileId, userId, {
    childModeEnabled: nextEnabled,
    childModeSettings: nextSettings,
    updatedAt: new Date(),
  });

  const sessionRepo = getSessionRepository();
  const updatedSessionCount = nextEnabled
    ? await sessionRepo.updateChildSessionScopes(
        childProfileId,
        buildChildSessionScopes(nextSettings)
      )
    : await sessionRepo.deleteByChildProfileId(childProfileId);

  logger.info(
    {
      userId,
      childProfileId,
      childModeEnabled: updated.childModeEnabled,
      updatedSessionCount,
    },
    'Updated child mode controls'
  );

  return getChildModeControls(userId, childProfileId);
}

export async function createChildModeSession(input: CreateChildModeSessionInput): Promise<{
  profile: ChildProfile;
  session: SessionData;
}> {
  const profile = await requireOwnedChildProfile(input.userId, input.childProfileId);
  const passcodeStatus = await getChildModeExitPasscodeStatus(input.userId);
  const controls = buildChildModeControls(profile, 0, passcodeStatus.configured);

  if (!controls.childModeEnabled) {
    throw new ChildModeError(
      'Child Mode is not enabled for this child',
      'CHILD_MODE_DISABLED',
      403
    );
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

  logger.info(
    {
      userId: input.userId,
      childProfileId: input.childProfileId,
      sessionId: session.id,
    },
    'Created child mode session'
  );

  return { profile, session };
}

export async function verifyChildModePasscode(
  userId: string,
  childProfileId: string,
  passcode: string
): Promise<void> {
  await requireOwnedChildProfile(userId, childProfileId);
  const user = await getUserRepository().findById(userId);
  if (!user?.childModeExitPasscodeHash) {
    throw new ChildModePasscodeError(
      'Child Mode exit passcode is not configured',
      'CHILD_MODE_PASSCODE_NOT_CONFIGURED',
      403
    );
  }

  const valid = await verifyPassword(passcode, user.childModeExitPasscodeHash);
  if (!valid) {
    throw new ChildModePasscodeError(
      'Child Mode passcode is invalid',
      'CHILD_MODE_PASSCODE_INVALID',
      401
    );
  }
}

export async function getChildModeExitPasscodeStatus(
  userId: string
): Promise<ChildModeExitPasscodeStatus> {
  const user = await getUserRepository().findById(userId);
  return buildChildModeExitPasscodeStatus(user);
}

export async function updateChildModeExitPasscode(
  userId: string,
  input: {
    oldPasscode?: string;
    newPasscode: string;
  }
): Promise<UpdateChildModeExitPasscodeResult> {
  const user = await getUserRepository().findById(userId);
  const newPasscode = input.newPasscode.trim();

  if (!user) {
    throw new ChildModePasscodeError(
      'Parent account was not found',
      'CHILD_MODE_PASSCODE_NOT_CONFIGURED',
      404
    );
  }

  if (newPasscode.length < 4 || newPasscode.length > 128) {
    throw new ChildModePasscodeError(
      'Child Mode exit passcode must be between 4 and 128 characters',
      'CHILD_MODE_PASSCODE_REQUIRED',
      400
    );
  }

  if (user.childModeExitPasscodeHash) {
    const oldPasscode = input.oldPasscode?.trim();
    if (!oldPasscode) {
      throw new ChildModePasscodeError(
        'Current Child Mode exit passcode is required',
        'CHILD_MODE_PASSCODE_REQUIRED',
        400
      );
    }

    const oldPasscodeValid = await verifyPassword(oldPasscode, user.childModeExitPasscodeHash);
    if (!oldPasscodeValid) {
      throw new ChildModePasscodeError(
        'Current Child Mode exit passcode is invalid',
        'CHILD_MODE_PASSCODE_INVALID',
        401
      );
    }
  }

  const updatedUser = await getUserRepository().update(userId, {
    childModeExitPasscodeHash: await hashPassword(newPasscode),
    childModeExitPasscodeSetAt: new Date(),
  });

  logger.info({ userId }, 'Updated account-level Child Mode exit passcode');

  return {
    user: updatedUser,
    childModeExitPasscode: buildChildModeExitPasscodeStatus(updatedUser),
  };
}

function buildChildModeRecoveryLink(token: string, preferredLocale?: string | null): string {
  const locale = preferredLocale?.slice(0, 2).toLowerCase();
  const localePrefix = locale && locale !== 'uk' ? `/${locale}` : '';
  const baseUrl = config.web.webAppUrl.replace(/\/+$/, '');
  return `${baseUrl}${localePrefix}/auth/child-mode-recovery?token=${encodeURIComponent(token)}`;
}

function getStringMetadataValue(metadata: unknown, key: string): string | null {
  if (!metadata || typeof metadata !== 'object' || Array.isArray(metadata)) {
    return null;
  }
  const value = (metadata as Record<string, unknown>)[key];
  return typeof value === 'string' && value.trim() ? value : null;
}

export async function requestChildModeExitPasscodeRecovery(
  userId: string,
  childProfileId: string,
  childSessionId: string
): Promise<void> {
  await requireOwnedChildProfile(userId, childProfileId);
  const user = await getUserRepository().findById(userId);

  if (!user) {
    throw new ChildModeRecoveryError(
      'Parent account was not found',
      'CHILD_MODE_RECOVERY_USER_NOT_FOUND',
      404
    );
  }

  const tokenRepo = getPasswordResetTokenRepository();
  const expiresAt = new Date(Date.now() + CHILD_MODE_RECOVERY_TOKEN_EXPIRY_MINUTES * 60 * 1000);
  const tokenRow = await tokenRepo.create(user.id, expiresAt, {
    purpose: 'child_mode_recovery',
    metadata: {
      childProfileId,
      childSessionId,
    },
  });

  await sendChildModeRecoveryEmail(
    user.email,
    buildChildModeRecoveryLink(tokenRow.token, user.preferredLocale),
    user.preferredLocale
  );

  logger.info(
    { userId, childProfileId, childSessionId },
    'Child Mode exit passcode recovery email requested'
  );
}

export async function consumeChildModeExitPasscodeRecoveryToken(
  token: string
): Promise<ChildModeRecoveryTokenResult> {
  const tokenRepo = getPasswordResetTokenRepository();
  const tokenRow = await tokenRepo.findByToken(token, 'child_mode_recovery');

  if (!tokenRow) {
    throw new ChildModeRecoveryError(
      'Child Mode recovery link is invalid or expired',
      'CHILD_MODE_RECOVERY_INVALID',
      400
    );
  }

  const user = await getUserRepository().findById(tokenRow.userId);
  await tokenRepo.deleteByToken(token);

  if (!user) {
    throw new ChildModeRecoveryError(
      'Parent account was not found',
      'CHILD_MODE_RECOVERY_USER_NOT_FOUND',
      404
    );
  }

  return {
    user,
    childProfileId: getStringMetadataValue(tokenRow.metadata, 'childProfileId'),
    childSessionId: getStringMetadataValue(tokenRow.metadata, 'childSessionId'),
  };
}

export async function revokeChildModeSessions(
  userId: string,
  childProfileId: string
): Promise<number> {
  await requireOwnedChildProfile(userId, childProfileId);
  const revokedCount = await getSessionRepository().deleteByChildProfileId(childProfileId);
  logger.info({ userId, childProfileId, revokedCount }, 'Revoked child mode sessions');
  return revokedCount;
}
