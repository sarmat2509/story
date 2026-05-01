import { getChildProfileRepository, getSessionRepository } from '../repositories';
import type { ChildProfile, NewChildProfile } from '../db/schema';
import { logger } from '../utils/logger';
import { recordUsage } from './aiUsageService';
import * as planService from './planService';
import { collectEntityAssetPaths, deleteEntityAssets } from './entityAssetCleanupService';
import { translateChildDescription } from './translationService';
import { DEFAULT_CHILD_MODE_SETTINGS } from './childModeControlsService';

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

// Child profile CRUD
export async function createChildProfile(
  userId: string,
  data: Omit<NewChildProfile, 'userId'>
): Promise<ChildProfile> {
  const childProfileRepo = getChildProfileRepository();

  // Check child_profiles_limit feature before creating
  const existingProfiles = await getChildProfiles(userId);
  const limit = await planService.getFeatureLimit(userId, 'child_profiles_limit');
  
  if (limit !== null && existingProfiles.length >= limit) {
    logger.warn({ userId, limit, current: existingProfiles.length }, 'Child profiles limit reached');
    throw new Error('Child profiles limit reached for your plan');
  }
  
  const newProfile: NewChildProfile = {
    ...data,
    userId
  };
  
  const profile = await childProfileRepo.create(newProfile);
  
  logger.info({ userId, profileId: profile.id, name: profile.name }, 'Created child profile');
  
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
    await deleteEntityAssets(assetPaths);
    const revokedSessionCount = await getSessionRepository().deleteByChildProfileId(id);
    await childProfileRepo.anonymizeAndSoftDelete(id, userId, buildDeletedChildProfileTombstone());
    logger.info(
      { userId, profileId: id, usageCount, deletedAssetCount: assetPaths.length, revokedSessionCount },
      'Child profile anonymized because it is used in stories or requests'
    );
    return;
  }

  await deleteEntityAssets(assetPaths);
  await childProfileRepo.hardDelete(id, userId);

  logger.info({ userId, profileId: id, deletedAssetCount: assetPaths.length }, 'Child profile hard deleted with related assets');
}
