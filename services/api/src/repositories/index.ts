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
import { LlmTurnaroundCacheRepository } from './LlmTurnaroundCacheRepository';
import { OutfitPlateCacheRepository } from './OutfitPlateCacheRepository';
import { StoryOutfitPlateCacheRepository } from './StoryOutfitPlateCacheRepository';
import { AlignmentRepository } from './AlignmentRepository';
import { AiUsageRepository } from './AiUsageRepository';
import { UsageEventsRepository } from './UsageEventsRepository';
import { StoryRatingRepository } from './StoryRatingRepository';
import { PasswordResetTokenRepository } from './PasswordResetTokenRepository';
import { ImageValidationRepository } from './ImageValidationRepository';
import { StoryDirectorSceneRepository } from './StoryDirectorSceneRepository';
import { AdminConfigRepository } from './AdminConfigRepository';
import { FeedbackRepository } from './FeedbackRepository';
import { AdminDashboardRepository } from './AdminDashboardRepository';
import { BundleRepository } from './BundleRepository';
import { UserConsentRepository } from './UserConsentRepository';
import { DataPrivacyRequestRepository } from './DataPrivacyRequestRepository';

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
export { LlmTurnaroundCacheRepository } from './LlmTurnaroundCacheRepository';
export { OutfitPlateCacheRepository } from './OutfitPlateCacheRepository';
export { StoryOutfitPlateCacheRepository } from './StoryOutfitPlateCacheRepository';
export { AlignmentRepository } from './AlignmentRepository';
export { AiUsageRepository } from './AiUsageRepository';
export { UsageEventsRepository } from './UsageEventsRepository';
export { StoryRatingRepository } from './StoryRatingRepository';
export { PasswordResetTokenRepository } from './PasswordResetTokenRepository';
export { ImageValidationRepository } from './ImageValidationRepository';
export { StoryDirectorSceneRepository } from './StoryDirectorSceneRepository';
export { AdminConfigRepository } from './AdminConfigRepository';
export { FeedbackRepository } from './FeedbackRepository';
export { AdminDashboardRepository } from './AdminDashboardRepository';
export { BundleRepository } from './BundleRepository';
export { UserConsentRepository } from './UserConsentRepository';
export { DataPrivacyRequestRepository } from './DataPrivacyRequestRepository';

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
let llmTurnaroundCacheRepo: LlmTurnaroundCacheRepository;
let outfitPlateCacheRepo: OutfitPlateCacheRepository;
let storyOutfitPlateCacheRepo: StoryOutfitPlateCacheRepository;
let alignmentRepo: AlignmentRepository;
let aiUsageRepo: AiUsageRepository;
let usageEventsRepo: UsageEventsRepository;
let storyRatingRepo: StoryRatingRepository;
let passwordResetTokenRepo: PasswordResetTokenRepository;
let imageValidationRepo: ImageValidationRepository;
let storyDirectorSceneRepo: StoryDirectorSceneRepository;
let adminConfigRepo: AdminConfigRepository;
let feedbackRepo: FeedbackRepository;
let adminDashboardRepo: AdminDashboardRepository;
let bundleRepo: BundleRepository;
let userConsentRepo: UserConsentRepository;
let dataPrivacyRequestRepo: DataPrivacyRequestRepository;

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

export function getLlmTurnaroundCacheRepository(): LlmTurnaroundCacheRepository {
  if (!llmTurnaroundCacheRepo) llmTurnaroundCacheRepo = new LlmTurnaroundCacheRepository(db);
  return llmTurnaroundCacheRepo;
}

export function getOutfitPlateCacheRepository(): OutfitPlateCacheRepository {
  if (!outfitPlateCacheRepo) outfitPlateCacheRepo = new OutfitPlateCacheRepository(db);
  return outfitPlateCacheRepo;
}

export function getStoryOutfitPlateCacheRepository(): StoryOutfitPlateCacheRepository {
  if (!storyOutfitPlateCacheRepo)
    storyOutfitPlateCacheRepo = new StoryOutfitPlateCacheRepository(db);
  return storyOutfitPlateCacheRepo;
}

export function getAlignmentRepository(): AlignmentRepository {
  if (!alignmentRepo) alignmentRepo = new AlignmentRepository(db);
  return alignmentRepo;
}

export function getAiUsageRepository(): AiUsageRepository {
  if (!aiUsageRepo) aiUsageRepo = new AiUsageRepository(db);
  return aiUsageRepo;
}

export function getUsageEventsRepository(): UsageEventsRepository {
  if (!usageEventsRepo) usageEventsRepo = new UsageEventsRepository(db);
  return usageEventsRepo;
}

export function getStoryRatingRepository(): StoryRatingRepository {
  if (!storyRatingRepo) storyRatingRepo = new StoryRatingRepository(db);
  return storyRatingRepo;
}

export function getPasswordResetTokenRepository(): PasswordResetTokenRepository {
  if (!passwordResetTokenRepo) passwordResetTokenRepo = new PasswordResetTokenRepository(db);
  return passwordResetTokenRepo;
}

export function getImageValidationRepository(): ImageValidationRepository {
  if (!imageValidationRepo) imageValidationRepo = new ImageValidationRepository(db);
  return imageValidationRepo;
}

export function getStoryDirectorSceneRepository(): StoryDirectorSceneRepository {
  if (!storyDirectorSceneRepo) storyDirectorSceneRepo = new StoryDirectorSceneRepository(db);
  return storyDirectorSceneRepo;
}

export function getAdminConfigRepository(): AdminConfigRepository {
  if (!adminConfigRepo) adminConfigRepo = new AdminConfigRepository(db);
  return adminConfigRepo;
}

export function getFeedbackRepository(): FeedbackRepository {
  if (!feedbackRepo) feedbackRepo = new FeedbackRepository(db);
  return feedbackRepo;
}

export function getAdminDashboardRepository(): AdminDashboardRepository {
  if (!adminDashboardRepo) adminDashboardRepo = new AdminDashboardRepository(db);
  return adminDashboardRepo;
}

export function getBundleRepository(): BundleRepository {
  if (!bundleRepo) bundleRepo = new BundleRepository(db);
  return bundleRepo;
}

export function getUserConsentRepository(): UserConsentRepository {
  if (!userConsentRepo) userConsentRepo = new UserConsentRepository(db);
  return userConsentRepo;
}

export function getDataPrivacyRequestRepository(): DataPrivacyRequestRepository {
  if (!dataPrivacyRequestRepo) dataPrivacyRequestRepo = new DataPrivacyRequestRepository(db);
  return dataPrivacyRequestRepo;
}
