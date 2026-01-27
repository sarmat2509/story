import { eq, and } from 'drizzle-orm';
import db from '../db';
import { childProfiles, type ChildProfile, type NewChildProfile } from '../db/schema';
import { logger } from '../utils/logger';
import * as planService from './planService';

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
