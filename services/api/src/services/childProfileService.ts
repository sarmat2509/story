import { and, count, eq, sql } from 'drizzle-orm';
import {
  getCharacterRepository,
  getChildProfileRepository,
  getSessionRepository,
  getStoryRepository,
} from '../repositories';
import * as schema from '../db/schema';
import type { Character, ChildProfile, NewCharacter, NewChildProfile } from '../db/schema';
import { logger } from '../utils/logger';
import { recordUsage } from './aiUsageService';
import * as planService from './planService';
import { collectEntityAssetPaths, deleteEntityAssets } from './entityAssetCleanupService';
import { translateChildDescription } from './translationService';
import { DEFAULT_CHILD_MODE_SETTINGS } from './childModeControlsService';
import {
  ChildProfileLimitError,
  calculateChildProfileLimit,
  extractChildProfileLimit,
  isChildProfileLimitError,
} from './childProfileLimitService';

export {
  ChildProfileLimitError,
  calculateChildProfileLimit,
  isChildProfileLimitError,
} from './childProfileLimitService';

// Age calculation helpers
export interface AgeData {
  ageMonths: number;
  ageYears: number;
  remainingMonths: number;
  ageGroup: string;
  isBirthdayToday: boolean;
  daysUntilBirthday: number;
}

export function getAgeData(birthDate: Date): AgeData {
  const now = new Date();
  const birth = new Date(birthDate);
  
  // Calculate age in months
  let ageMonths = (now.getFullYear() - birth.getFullYear()) * 12;
  ageMonths += now.getMonth() - birth.getMonth();
  if (now.getDate() < birth.getDate()) {
    ageMonths--;
  }
  
  // Calculate years and remaining months
  const ageYears = Math.floor(ageMonths / 12);
  const remainingMonths = ageMonths % 12;
  
  // Check if birthday is today
  const isBirthdayToday = now.getMonth() === birth.getMonth() && now.getDate() === birth.getDate();
  
  // Calculate days until next birthday
  const nextBirthday = new Date(now.getFullYear(), birth.getMonth(), birth.getDate());
  if (nextBirthday < now) {
    nextBirthday.setFullYear(nextBirthday.getFullYear() + 1);
  }
  const daysUntilBirthday = Math.ceil((nextBirthday.getTime() - now.getTime()) / (1000 * 60 * 60 * 24));
  
  // Calculate age group
  const ageGroup = calculateAgeGroup(ageMonths);
  
  return {
    ageMonths,
    ageYears,
    remainingMonths,
    ageGroup,
    isBirthdayToday,
    daysUntilBirthday
  };
}

export function calculateAgeGroup(ageMonths: number): string {
  if (ageMonths < 12) return '0-1';
  if (ageMonths < 24) return '1y';
  if (ageMonths < 48) return '2-3';
  if (ageMonths < 72) return '4-5';
  if (ageMonths < 108) return '6-8';
  return '9-12';
}

export function buildDeletedChildProfileTombstone(): Partial<Omit<NewChildProfile, 'userId'>> {
  return {
    name: 'Deleted child profile',
    birthDate: '1970-01-01',
    storyCreationMode: 'instant',
    storyTextSizeMultiplier: 1,
    languages: [],
    referencePhotos: null,
    appearanceTraits: null,
    personality: null,
    interests: null,
    sensitivities: null,
    familyCast: null,
    aiGeneratedDescription: null,
    descriptionEn: null,
    descriptionLanguage: null,
    clothing: null,
    distinctiveFeatures: null,
    turnaroundSheet: null,
    authorPseudonym: null,
    authorAboutMe: null,
    childModeEnabled: false,
    childModeSettings: DEFAULT_CHILD_MODE_SETTINGS,
    isActive: false,
  } as Partial<Omit<NewChildProfile, 'userId'>>;
}

/**
 * Trigger async translation of child description to English.
 * Non-blocking: if it fails, image generation falls back to the original description.
 */
function triggerDescriptionTranslation(profile: ChildProfile): void {
  const description = profile.aiGeneratedDescription;
  if (!description) return;

  const usageContext = { userId: profile.userId, childProfileId: profile.id };
  translateChildDescription(profile, { onUsage: (u) => recordUsage(u, usageContext) }).catch(err => {
    logger.error(
      { err, childId: profile.id, childName: profile.name },
      'Child description translation failed — will use original description in prompts',
    );
  });
}

function childProfileToCharacterData(profile: ChildProfile): Omit<NewCharacter, 'id'> {
  const description = profile.aiGeneratedDescription || profile.descriptionEn || null;
  return {
    userId: profile.userId,
    childProfileId: profile.id,
    name: profile.name,
    type: 'person',
    subtype: 'child',
    referencePhotos: profile.referencePhotos,
    appearanceTraits: profile.appearanceTraits,
    personality: profile.personality,
    description,
    aiGeneratedDescription: profile.aiGeneratedDescription,
    clothing: profile.clothing,
    distinctiveFeatures: profile.distinctiveFeatures,
    turnaroundSheet: profile.turnaroundSheet,
    descriptionEn: profile.descriptionEn,
    descriptionLanguage: profile.descriptionLanguage,
    isHidden: false,
    createdByMode: 'parent',
    createdByChildProfileId: null,
    isActive: profile.isActive,
  } as Omit<NewCharacter, 'id'>;
}

function isUniqueViolation(error: unknown): boolean {
  return typeof error === 'object' && error !== null && (error as { code?: string }).code === '23505';
}

export async function syncChildProfileCharacter(profile: ChildProfile): Promise<Character> {
  const characterRepo = getCharacterRepository();
  const existing = await characterRepo.findByChildProfileId(profile.userId, profile.id, {
    includeInactive: true,
  });
  const data = childProfileToCharacterData(profile);

  if (existing) {
    const { userId: _userId, ...updateData } = data;
    const updated = await characterRepo.update(existing.id, profile.userId, updateData);
    logger.info(
      {
        userId: profile.userId,
        profileId: profile.id,
        characterId: updated.id,
      },
      'Synced child profile mirror character'
    );
    return updated;
  }

  let created: Character;
  try {
    created = await characterRepo.create(data);
  } catch (error) {
    if (!isUniqueViolation(error)) {
      throw error;
    }
    const racedCharacter = await characterRepo.findByChildProfileId(profile.userId, profile.id, {
      includeInactive: true,
    });
    if (!racedCharacter) {
      throw error;
    }
    const { userId: _userId, ...updateData } = data;
    created = await characterRepo.update(racedCharacter.id, profile.userId, updateData);
  }
  logger.info(
    {
      userId: profile.userId,
      profileId: profile.id,
      characterId: created.id,
    },
    'Created child profile mirror character'
  );
  return created;
}

export async function syncChildProfileCharactersForUser(userId: string): Promise<Character[]> {
  const profiles = await getChildProfileRepository().findByUserId(userId);
  const synced: Character[] = [];
  for (const profile of profiles) {
    synced.push(await syncChildProfileCharacter(profile));
  }
  return synced;
}

async function deactivateChildProfileCharacter(
  profile: ChildProfile,
  options: { hardDeleteWhenUnused?: boolean } = {}
): Promise<void> {
  const characterRepo = getCharacterRepository();
  const character = await characterRepo.findByChildProfileId(profile.userId, profile.id, {
    includeInactive: true,
  });
  if (!character) return;

  const usageCount =
    (await characterRepo.countStoriesUsingCharacter(character.id)) +
    (await characterRepo.countStoryRequestsUsingCharacter(character.id, profile.userId));

  if (options.hardDeleteWhenUnused && usageCount === 0) {
    await characterRepo.hardDelete(character.id, profile.userId);
    logger.info(
      { userId: profile.userId, profileId: profile.id, characterId: character.id },
      'Hard-deleted unused child profile mirror character'
    );
    return;
  }

  await characterRepo.softDelete(character.id, profile.userId);
  logger.info(
    { userId: profile.userId, profileId: profile.id, characterId: character.id, usageCount },
    'Soft-deleted child profile mirror character'
  );
}

// Child profile CRUD
export async function createChildProfile(
  userId: string,
  data: Omit<NewChildProfile, 'userId'>
): Promise<ChildProfile> {
  const newProfile: NewChildProfile = {
    ...data,
    userId
  };

  const profile = await getStoryRepository().transaction(async (tx) => {
    await tx.execute(sql`SELECT pg_advisory_xact_lock(hashtext(${`child_profiles:${userId}`})::bigint)`);

    const [subscription] = await tx
      .select({
        planId: schema.userSubscriptions.planId,
      })
      .from(schema.userSubscriptions)
      .where(eq(schema.userSubscriptions.userId, userId))
      .limit(1);

    let planLimit: number | null = null;
    if (subscription) {
      const [featureRow] = await tx
        .select({
          value: schema.planFeatures.value,
        })
        .from(schema.planFeatures)
        .innerJoin(schema.features, eq(schema.planFeatures.featureId, schema.features.id))
        .where(
          and(
            eq(schema.planFeatures.planId, subscription.planId),
            eq(schema.features.slug, 'child_profiles_limit')
          )
        )
        .limit(1);
      planLimit = extractChildProfileLimit(featureRow?.value);
    }

    const [countRow] = await tx
      .select({ count: count() })
      .from(schema.childProfiles)
      .where(
        and(
          eq(schema.childProfiles.userId, userId),
          eq(schema.childProfiles.isActive, true)
        )
      );

    const currentProfiles = Number(countRow?.count ?? 0);
    const quota = calculateChildProfileLimit({
      planLimit,
      currentProfiles,
      requestedQty: 1,
    });

    if (!quota.allowed) {
      logger.warn({ userId, limit: quota.limit, current: currentProfiles }, 'Child profiles limit reached');
      throw new ChildProfileLimitError({
        message: 'Child profiles limit reached for your plan',
        limit: quota.limit,
        used: currentProfiles,
        remaining: quota.remaining,
      });
    }

    const [created] = await tx
      .insert(schema.childProfiles)
      .values(newProfile)
      .returning();

    if (!created) {
      throw new Error('Failed to create child profile');
    }

    return created;
  });
  
  logger.info({ userId, profileId: profile.id, name: profile.name }, 'Created child profile');

  await syncChildProfileCharacter(profile);
  
  // Trigger async translation of description to English
  triggerDescriptionTranslation(profile);
  
  return profile;
}

export async function getChildProfiles(userId: string): Promise<ChildProfile[]> {
  const profiles = await getChildProfileRepository().findByUserId(userId);
  logger.debug({ userId, count: profiles.length }, 'Fetched child profiles');
  return profiles;
}

export async function getChildProfileById(
  id: string,
  userId: string
): Promise<ChildProfile | null> {
  return getChildProfileRepository().findById(id, userId);
}

export async function updateChildProfile(
  id: string,
  userId: string,
  data: Partial<Omit<NewChildProfile, 'userId'>>
): Promise<ChildProfile> {
  const childProfileRepo = getChildProfileRepository();

  // Ownership check
  const existing = await childProfileRepo.findById(id, userId);
  if (!existing) {
    throw new Error('Child profile not found');
  }
  
  const updated = await childProfileRepo.update(id, userId, data);
  
  if (!updated) {
    throw new Error('Failed to update child profile');
  }
  
  logger.info({ userId, profileId: id }, 'Updated child profile');

  await syncChildProfileCharacter(updated);
  
  // Re-translate description if it changed
  if (data.aiGeneratedDescription) {
    triggerDescriptionTranslation(updated);
  }
  
  return updated;
}

export async function deleteChildProfile(id: string, userId: string): Promise<void> {
  const childProfileRepo = getChildProfileRepository();

  // Ownership check
  const existing = await childProfileRepo.findById(id, userId);
  if (!existing) {
    throw new Error('Child profile not found');
  }

  const usageCount = await childProfileRepo.countStoryUsage(id, userId);
  const assetPaths = collectEntityAssetPaths({
    referencePhotos: existing.referencePhotos,
    turnaroundSheet: existing.turnaroundSheet,
  });

  if (usageCount > 0) {
    await deactivateChildProfileCharacter(existing);
    await deleteEntityAssets(assetPaths);
    const revokedSessionCount = await getSessionRepository().deleteByChildProfileId(id);
    await childProfileRepo.anonymizeAndSoftDelete(id, userId, buildDeletedChildProfileTombstone());
    logger.info(
      { userId, profileId: id, usageCount, deletedAssetCount: assetPaths.length, revokedSessionCount },
      'Child profile anonymized because it is used in stories or requests'
    );
    return;
  }

  await deactivateChildProfileCharacter(existing, { hardDeleteWhenUnused: true });
  await deleteEntityAssets(assetPaths);
  await childProfileRepo.hardDelete(id, userId);

  logger.info({ userId, profileId: id, deletedAssetCount: assetPaths.length }, 'Child profile hard deleted with related assets');
}
