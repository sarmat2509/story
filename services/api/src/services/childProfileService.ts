import { eq, and } from 'drizzle-orm';
import db from '../db';
import { childProfiles, type ChildProfile, type NewChildProfile } from '../db/schema';
import { logger } from '../utils/logger';
import * as planService from './planService';
import { CharacterAnalysisService } from './characterAnalysisService';
import { GeminiTextProvider } from '../providers/text/gemini/GeminiTextProvider';
import { config } from '../config';

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

// Initialize character analysis service (lazy)
let characterAnalysisService: CharacterAnalysisService | null = null;

function getCharacterAnalysisService(): CharacterAnalysisService {
  if (!characterAnalysisService) {
    const textProvider = new GeminiTextProvider(config.google.apiKey);
    characterAnalysisService = new CharacterAnalysisService(textProvider);
  }
  return characterAnalysisService;
}

/**
 * Analyze child profile photos and update with AI-generated description
 * Called after create/update if reference photos exist
 */
async function analyzeChildPhotos(profile: ChildProfile): Promise<void> {
  // Skip if no reference photos
  const referencePhotos = profile.referencePhotos as any;
  if (!referencePhotos || !Array.isArray(referencePhotos) || referencePhotos.length === 0) {
    logger.debug({ profileId: profile.id }, 'No reference photos to analyze');
    return;
  }
  
  // Extract photo URLs
  const photoUrls = referencePhotos
    .filter((photo: any) => photo && photo.url)
    .map((photo: any) => photo.url);
  
  if (photoUrls.length === 0) {
    logger.debug({ profileId: profile.id }, 'No valid photo URLs');
    return;
  }
  
  try {
    logger.info({ 
      profileId: profile.id, 
      photoCount: photoUrls.length 
    }, 'Starting character analysis for child profile');
    
    const analysisService = getCharacterAnalysisService();
    const analysis = await analysisService.analyzeCharacter({
      photos: photoUrls,
      characterType: 'person',
      existingTraits: profile.appearanceTraits as Record<string, any> | undefined
    });
    
    // Update profile with AI-generated fields
    await db
      .update(childProfiles)
      .set({
        aiGeneratedDescription: analysis.detailedDescription,
        clothing: analysis.clothing as any,
        distinctiveFeatures: analysis.distinctiveFeatures as any,
        // Optionally merge AI analysis into existing appearanceTraits
        appearanceTraits: analysis.appearanceTraits ? {
          ...(profile.appearanceTraits as any || {}),
          ...analysis.appearanceTraits
        } as any : profile.appearanceTraits
      })
      .where(eq(childProfiles.id, profile.id));
    
    logger.info({ 
      profileId: profile.id,
      hasDescription: !!analysis.detailedDescription,
      hasClothing: !!analysis.clothing,
      featuresCount: analysis.distinctiveFeatures?.length || 0
    }, 'Character analysis completed for child profile');
  } catch (error) {
    // Log error but don't fail the profile creation/update
    logger.error({ 
      error: error instanceof Error ? {
        message: error.message,
        name: error.name,
        stack: error.stack
      } : String(error),
      profileId: profile.id 
    }, 'Failed to analyze child profile photos - continuing without analysis');
  }
}

// Child profile CRUD
export async function createChildProfile(
  userId: string,
  data: Omit<NewChildProfile, 'userId'>
): Promise<ChildProfile> {
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
  
  const [profile] = await db
    .insert(childProfiles)
    .values(newProfile)
    .returning();
  
  logger.info({ userId, profileId: profile.id, name: profile.name }, 'Created child profile');
  
  // Trigger character analysis asynchronously (don't wait for it)
  if (config.features?.enableCharacterAnalysis !== false) {
    analyzeChildPhotos(profile).catch(err => {
      logger.error({ error: err, profileId: profile.id }, 'Background character analysis failed');
    });
  }
  
  return profile;
}

export async function getChildProfiles(userId: string): Promise<ChildProfile[]> {
  const profiles = await db
    .select()
    .from(childProfiles)
    .where(and(
      eq(childProfiles.userId, userId),
      eq(childProfiles.isActive, true)
    ));
  
  logger.debug({ userId, count: profiles.length }, 'Fetched child profiles');
  return profiles;
}

export async function getChildProfileById(
  id: string,
  userId: string
): Promise<ChildProfile | null> {
  const [profile] = await db
    .select()
    .from(childProfiles)
    .where(and(
      eq(childProfiles.id, id),
      eq(childProfiles.userId, userId),
      eq(childProfiles.isActive, true)
    ))
    .limit(1);
  
  return profile || null;
}

export async function updateChildProfile(
  id: string,
  userId: string,
  data: Partial<Omit<NewChildProfile, 'userId'>>
): Promise<ChildProfile> {
  // Ownership check
  const existing = await getChildProfileById(id, userId);
  if (!existing) {
    throw new Error('Child profile not found');
  }
  
  const [updated] = await db
    .update(childProfiles)
    .set(data)
    .where(and(
      eq(childProfiles.id, id),
      eq(childProfiles.userId, userId)
    ))
    .returning();
  
  if (!updated) {
    throw new Error('Failed to update child profile');
  }
  
  logger.info({ userId, profileId: id }, 'Updated child profile');
  
  // Trigger character analysis if reference photos changed
  if (config.features?.enableCharacterAnalysis !== false && data.referencePhotos) {
    analyzeChildPhotos(updated).catch(err => {
      logger.error({ error: err, profileId: id }, 'Background character analysis failed');
    });
  }
  
  return updated;
}

export async function deleteChildProfile(id: string, userId: string): Promise<void> {
  // Ownership check
  const existing = await getChildProfileById(id, userId);
  if (!existing) {
    throw new Error('Child profile not found');
  }
  
  // Soft delete: set isActive = false
  await db
    .update(childProfiles)
    .set({ isActive: false })
    .where(and(
      eq(childProfiles.id, id),
      eq(childProfiles.userId, userId)
    ));
  
  logger.info({ userId, profileId: id }, 'Deleted (soft) child profile');
}
