/**
 * Repository Layer - Centralized database query management
 *
 * All database queries should go through repository classes.
 * Singleton instances are injected with the shared db connection.
 */

import db from '../db';

import { UserRepository } from './UserRepository';
import { OAuthRepository } from './OAuthRepository';
import { SessionRepository } from './SessionRepository';
import { PlanRepository } from './PlanRepository';
import { ChildProfileRepository } from './ChildProfileRepository';
import { CharacterRepository } from './CharacterRepository';
import { StoryRepository } from './StoryRepository';
import { SceneRepository } from './SceneRepository';
import { AssetRepository } from './AssetRepository';
import { VoiceRepository } from './VoiceRepository';
import { DictionaryRepository } from './DictionaryRepository';
import { PolicyRepository } from './PolicyRepository';
import { EnvironmentImageCacheRepository } from './EnvironmentImageCacheRepository';
import { StoryEnvironmentCacheRepository } from './StoryEnvironmentCacheRepository';
import { AlignmentRepository } from './AlignmentRepository';
import { AiUsageRepository } from './AiUsageRepository';
import { StoryRatingRepository } from './StoryRatingRepository';
import { PasswordResetTokenRepository } from './PasswordResetTokenRepository';

// Re-export classes for type usage
export { UserRepository } from './UserRepository';
export { OAuthRepository } from './OAuthRepository';
export { SessionRepository } from './SessionRepository';
export { PlanRepository } from './PlanRepository';
export { ChildProfileRepository } from './ChildProfileRepository';
export { CharacterRepository } from './CharacterRepository';
export { StoryRepository } from './StoryRepository';
export { SceneRepository } from './SceneRepository';
export { AssetRepository } from './AssetRepository';
export { VoiceRepository } from './VoiceRepository';
export { DictionaryRepository } from './DictionaryRepository';
export { PolicyRepository } from './PolicyRepository';
export { EnvironmentImageCacheRepository } from './EnvironmentImageCacheRepository';
export { StoryEnvironmentCacheRepository } from './StoryEnvironmentCacheRepository';
export { AlignmentRepository } from './AlignmentRepository';
export { AiUsageRepository } from './AiUsageRepository';
export { StoryRatingRepository } from './StoryRatingRepository';
export { PasswordResetTokenRepository } from './PasswordResetTokenRepository';

// Singleton instances
let userRepo: UserRepository;
let oauthRepo: OAuthRepository;
let sessionRepo: SessionRepository;
let planRepo: PlanRepository;
let childProfileRepo: ChildProfileRepository;
let characterRepo: CharacterRepository;
let storyRepo: StoryRepository;
let sceneRepo: SceneRepository;
let assetRepo: AssetRepository;
let voiceRepo: VoiceRepository;
let dictionaryRepo: DictionaryRepository;
let policyRepo: PolicyRepository;
let environmentImageCacheRepo: EnvironmentImageCacheRepository;
let storyEnvironmentCacheRepo: StoryEnvironmentCacheRepository;
let alignmentRepo: AlignmentRepository;
let aiUsageRepo: AiUsageRepository;
let storyRatingRepo: StoryRatingRepository;
let passwordResetTokenRepo: PasswordResetTokenRepository;

export function getUserRepository(): UserRepository {
  if (!userRepo) userRepo = new UserRepository(db);
  return userRepo;
}

export function getOAuthRepository(): OAuthRepository {
  if (!oauthRepo) oauthRepo = new OAuthRepository(db);
  return oauthRepo;
}

export function getSessionRepository(): SessionRepository {
  if (!sessionRepo) sessionRepo = new SessionRepository(db);
  return sessionRepo;
}

export function getPlanRepository(): PlanRepository {
  if (!planRepo) planRepo = new PlanRepository(db);
  return planRepo;
}

export function getChildProfileRepository(): ChildProfileRepository {
  if (!childProfileRepo) childProfileRepo = new ChildProfileRepository(db);
  return childProfileRepo;
}

export function getCharacterRepository(): CharacterRepository {
  if (!characterRepo) characterRepo = new CharacterRepository(db);
  return characterRepo;
}

export function getStoryRepository(): StoryRepository {
  if (!storyRepo) storyRepo = new StoryRepository(db);
  return storyRepo;
}

export function getSceneRepository(): SceneRepository {
  if (!sceneRepo) sceneRepo = new SceneRepository(db);
  return sceneRepo;
}

export function getAssetRepository(): AssetRepository {
  if (!assetRepo) assetRepo = new AssetRepository(db);
  return assetRepo;
}

export function getVoiceRepository(): VoiceRepository {
  if (!voiceRepo) voiceRepo = new VoiceRepository(db);
  return voiceRepo;
}

export function getDictionaryRepository(): DictionaryRepository {
  if (!dictionaryRepo) dictionaryRepo = new DictionaryRepository(db);
  return dictionaryRepo;
}

export function getPolicyRepository(): PolicyRepository {
  if (!policyRepo) policyRepo = new PolicyRepository(db);
  return policyRepo;
}

export function getEnvironmentImageCacheRepository(): EnvironmentImageCacheRepository {
  if (!environmentImageCacheRepo)
    environmentImageCacheRepo = new EnvironmentImageCacheRepository(db);
  return environmentImageCacheRepo;
}

export function getStoryEnvironmentCacheRepository(): StoryEnvironmentCacheRepository {
  if (!storyEnvironmentCacheRepo)
    storyEnvironmentCacheRepo = new StoryEnvironmentCacheRepository(db);
  return storyEnvironmentCacheRepo;
}

export function getAlignmentRepository(): AlignmentRepository {
  if (!alignmentRepo) alignmentRepo = new AlignmentRepository(db);
  return alignmentRepo;
}

export function getAiUsageRepository(): AiUsageRepository {
  if (!aiUsageRepo) aiUsageRepo = new AiUsageRepository(db);
  return aiUsageRepo;
}

export function getStoryRatingRepository(): StoryRatingRepository {
  if (!storyRatingRepo) storyRatingRepo = new StoryRatingRepository(db);
  return storyRatingRepo;
}

export function getPasswordResetTokenRepository(): PasswordResetTokenRepository {
  if (!passwordResetTokenRepo)
    passwordResetTokenRepo = new PasswordResetTokenRepository(db);
  return passwordResetTokenRepo;
}
