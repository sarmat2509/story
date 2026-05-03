import { eq, inArray, or } from 'drizzle-orm';
import db from '../db';
import * as schema from '../db/schema';

export type JsonExportValue =
  | string
  | number
  | boolean
  | null
  | JsonExportValue[]
  | { [key: string]: JsonExportValue };

export interface UserDataExportPackage {
  schemaVersion: string;
  generatedAt: string;
  userId: string;
  omittedSensitiveFields: string[];
  account: JsonExportValue;
  family: JsonExportValue;
  stories: JsonExportValue;
  billingAndUsage: JsonExportValue;
  support: JsonExportValue;
}

export function serializeForDataExport(value: unknown): JsonExportValue {
  if (value === null || value === undefined) {
    return null;
  }
  if (value instanceof Date) {
    return value.toISOString();
  }
  if (Array.isArray(value)) {
    return value.map(serializeForDataExport);
  }
  if (typeof value === 'object') {
    return Object.fromEntries(
      Object.entries(value as Record<string, unknown>).map(([key, item]) => [
        key,
        serializeForDataExport(item),
      ])
    );
  }
  if (typeof value === 'string' || typeof value === 'number' || typeof value === 'boolean') {
    return value;
  }
  return String(value);
}

export function omitKeys<T extends Record<string, unknown>>(value: T, keys: string[]): Record<string, unknown> {
  const clone: Record<string, unknown> = { ...value };
  for (const key of keys) {
    delete clone[key];
  }
  return clone;
}

export function sanitizeUserForDataExport(row: schema.User): Record<string, unknown> {
  return omitKeys(row as unknown as Record<string, unknown>, ['passwordHash']);
}

export function sanitizeStoryForDataExport(row: schema.Story): Record<string, unknown> {
  return omitKeys(row as unknown as Record<string, unknown>, ['shareToken']);
}

export function sanitizeChildProfileForDataExport(row: schema.ChildProfile): Record<string, unknown> {
  return omitKeys(row as unknown as Record<string, unknown>, [
    'childModePasscodeHash',
    'childModePasscodeSetAt',
  ]);
}

export function sanitizeAssetForDataExport(row: schema.Asset): Record<string, unknown> {
  return omitKeys(row as unknown as Record<string, unknown>, ['signedUrl', 'signedUrlExpiresAt']);
}

async function selectStoryScopedRows<T>(
  storyIds: string[],
  query: (ids: string[]) => Promise<T[]>
): Promise<T[]> {
  if (storyIds.length === 0) {
    return [];
  }
  return query(storyIds);
}

export async function buildUserDataExport(userId: string): Promise<UserDataExportPackage | null> {
  const [user] = await db
    .select()
    .from(schema.users)
    .where(eq(schema.users.id, userId))
    .limit(1);

  if (!user) {
    return null;
  }

  const [
    oauthIdentities,
    sessions,
    consents,
    userFeedback,
    privacyRequests,
    childProfiles,
    characters,
    usageEvents,
    subscription,
    bundleGrants,
    storyRequests,
    storySeries,
    seriesSchedules,
    stories,
    aiUsageEvents,
  ] = await Promise.all([
    db
      .select({
        id: schema.oauthIdentities.id,
        userId: schema.oauthIdentities.userId,
        provider: schema.oauthIdentities.provider,
        providerUserId: schema.oauthIdentities.providerUserId,
        providerEmail: schema.oauthIdentities.providerEmail,
        tokenExpiresAt: schema.oauthIdentities.tokenExpiresAt,
        createdAt: schema.oauthIdentities.createdAt,
        updatedAt: schema.oauthIdentities.updatedAt,
      })
      .from(schema.oauthIdentities)
      .where(eq(schema.oauthIdentities.userId, userId)),
    db
      .select({
        id: schema.sessions.id,
        userId: schema.sessions.userId,
        mode: schema.sessions.mode,
        parentUserId: schema.sessions.parentUserId,
        childProfileId: schema.sessions.childProfileId,
        scopes: schema.sessions.scopes,
        deviceName: schema.sessions.deviceName,
        deviceType: schema.sessions.deviceType,
        ipAddress: schema.sessions.ipAddress,
        userAgent: schema.sessions.userAgent,
        createdAt: schema.sessions.createdAt,
        lastActiveAt: schema.sessions.lastActiveAt,
        expiresAt: schema.sessions.expiresAt,
        revokedAt: schema.sessions.revokedAt,
      })
      .from(schema.sessions)
      .where(eq(schema.sessions.userId, userId)),
    db.select().from(schema.userConsentRecords).where(eq(schema.userConsentRecords.userId, userId)),
    db.select().from(schema.userFeedback).where(eq(schema.userFeedback.userId, userId)),
    db.select().from(schema.dataPrivacyRequests).where(eq(schema.dataPrivacyRequests.userId, userId)),
    db.select().from(schema.childProfiles).where(eq(schema.childProfiles.userId, userId)),
    db.select().from(schema.characters).where(eq(schema.characters.userId, userId)),
    db.select().from(schema.usageEvents).where(eq(schema.usageEvents.userId, userId)),
    db.select().from(schema.userSubscriptions).where(eq(schema.userSubscriptions.userId, userId)).limit(1),
    db.select().from(schema.userBundleGrants).where(eq(schema.userBundleGrants.userId, userId)),
    db.select().from(schema.storyRequests).where(eq(schema.storyRequests.userId, userId)),
    db.select().from(schema.storySeries).where(eq(schema.storySeries.userId, userId)),
    db.select().from(schema.seriesSchedules).where(eq(schema.seriesSchedules.userId, userId)),
    db.select().from(schema.stories).where(eq(schema.stories.userId, userId)),
    db.select().from(schema.aiUsageEvents).where(eq(schema.aiUsageEvents.userId, userId)),
  ]);

  const storyIds = stories.map((story) => story.id);
  const childProfileIds = childProfiles.map((childProfile) => childProfile.id);
  const characterIds = characters.map((character) => character.id);

  const generatedReferenceFilters = [
    storyIds.length > 0 ? inArray(schema.generatedReferences.storyId, storyIds) : null,
    characterIds.length > 0 ? inArray(schema.generatedReferences.characterId, characterIds) : null,
    childProfileIds.length > 0
      ? inArray(schema.generatedReferences.childProfileId, childProfileIds)
      : null,
  ].filter(Boolean);

  const [
    storyCharacters,
    scenes,
    assets,
    generatedReferences,
    imageValidationResults,
    storyDirectorScenes,
    batchImagePending,
    audioAssets,
    alignments,
    storyRatings,
  ] = await Promise.all([
    selectStoryScopedRows(storyIds, (ids) =>
      db.select().from(schema.storyCharacters).where(inArray(schema.storyCharacters.storyId, ids))
    ),
    selectStoryScopedRows(storyIds, (ids) =>
      db.select().from(schema.scenes).where(inArray(schema.scenes.storyId, ids))
    ),
    selectStoryScopedRows(storyIds, (ids) =>
      db.select().from(schema.assets).where(inArray(schema.assets.storyId, ids))
    ),
    generatedReferenceFilters.length > 0
      ? db
          .select()
          .from(schema.generatedReferences)
          .where(or(...generatedReferenceFilters as [NonNullable<typeof generatedReferenceFilters[number]>, ...NonNullable<typeof generatedReferenceFilters[number]>[]]))
      : Promise.resolve([]),
    selectStoryScopedRows(storyIds, (ids) =>
      db.select().from(schema.imageValidationResults).where(inArray(schema.imageValidationResults.storyId, ids))
    ),
    selectStoryScopedRows(storyIds, (ids) =>
      db.select().from(schema.storyDirectorScenes).where(inArray(schema.storyDirectorScenes.storyId, ids))
    ),
    selectStoryScopedRows(storyIds, (ids) =>
      db.select().from(schema.batchImagePending).where(inArray(schema.batchImagePending.storyId, ids))
    ),
    selectStoryScopedRows(storyIds, (ids) =>
      db.select().from(schema.audioAssets).where(inArray(schema.audioAssets.storyId, ids))
    ),
    selectStoryScopedRows(storyIds, (ids) =>
      db.select().from(schema.alignments).where(inArray(schema.alignments.storyId, ids))
    ),
    selectStoryScopedRows(storyIds, (ids) =>
      db.select().from(schema.storyRatings).where(inArray(schema.storyRatings.storyId, ids))
    ),
  ]);

  return {
    schemaVersion: '2026-05-01',
    generatedAt: new Date().toISOString(),
    userId,
    omittedSensitiveFields: [
      'users.passwordHash',
      'oauth_identities.accessToken',
      'oauth_identities.refreshToken',
      'sessions.token',
      'password_reset_tokens.*',
      'child_profiles.child_mode_passcode_hash',
      'child_profiles.child_mode_passcode_set_at',
      'child_profiles.childModePasscodeHash',
      'child_profiles.childModePasscodeSetAt',
      'stories.shareToken',
      'assets.signedUrl',
      'assets.signedUrlExpiresAt',
    ],
    account: serializeForDataExport({
      user: sanitizeUserForDataExport(user),
      oauthIdentities,
      sessions,
      consents,
    }),
    family: serializeForDataExport({
      childProfiles: childProfiles.map(sanitizeChildProfileForDataExport),
      characters,
    }),
    stories: serializeForDataExport({
      storyRequests,
      storySeries,
      seriesSchedules,
      stories: stories.map(sanitizeStoryForDataExport),
      storyCharacters,
      scenes,
      assets: assets.map(sanitizeAssetForDataExport),
      generatedReferences,
      imageValidationResults,
      storyDirectorScenes,
      batchImagePending,
      audioAssets,
      alignments,
      storyRatings,
      aiUsageEvents,
    }),
    billingAndUsage: serializeForDataExport({
      subscription: subscription[0] ?? null,
      bundleGrants,
      usageEvents,
    }),
    support: serializeForDataExport({
      userFeedback,
      privacyRequests,
    }),
  };
}
