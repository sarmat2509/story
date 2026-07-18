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
import { CharacterOutfitTurnaroundCacheRepository } from './CharacterOutfitTurnaroundCacheRepository';
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
import { ModerationDecisionRepository } from './ModerationDecisionRepository';
import { StoryArtifactRepository } from './StoryArtifactRepository';
import { CollectedStoryArtifactRepository } from './CollectedStoryArtifactRepository';
import { CollectedMapTileRepository } from './CollectedMapTileRepository';
import { StoryQuizRepository } from './StoryQuizRepository';
import { StoryQuizProgressRepository } from './StoryQuizProgressRepository';
import { GraphicNovelRepository } from './GraphicNovelRepository';
import { OpsRuntimeRepository } from './OpsRuntimeRepository';
import { GenerationJobRepository } from './GenerationJobRepository';
import { StoryGenerationStageEventRepository } from './StoryGenerationStageEventRepository';
import { DiscountRepository } from './DiscountRepository';
import { AppReleaseRepository } from './AppReleaseRepository';

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
export { CharacterOutfitTurnaroundCacheRepository } from './CharacterOutfitTurnaroundCacheRepository';
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
export { ModerationDecisionRepository } from './ModerationDecisionRepository';
export { StoryArtifactRepository } from './StoryArtifactRepository';
export { CollectedStoryArtifactRepository } from './CollectedStoryArtifactRepository';
export { CollectedMapTileRepository } from './CollectedMapTileRepository';
export { StoryQuizRepository } from './StoryQuizRepository';
export { StoryQuizProgressRepository } from './StoryQuizProgressRepository';
export { GraphicNovelRepository } from './GraphicNovelRepository';
export { OpsRuntimeRepository } from './OpsRuntimeRepository';
export { GenerationJobRepository } from './GenerationJobRepository';
export { StoryGenerationStageEventRepository } from './StoryGenerationStageEventRepository';
export { DiscountRepository } from './DiscountRepository';
export { AppReleaseRepository } from './AppReleaseRepository';

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
let characterOutfitTurnaroundCacheRepo: CharacterOutfitTurnaroundCacheRepository;
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
let moderationDecisionRepo: ModerationDecisionRepository;
let storyArtifactRepo: StoryArtifactRepository;
let collectedStoryArtifactRepo: CollectedStoryArtifactRepository;
let collectedMapTileRepo: CollectedMapTileRepository;
let storyQuizRepo: StoryQuizRepository;
let storyQuizProgressRepo: StoryQuizProgressRepository;
let graphicNovelRepo: GraphicNovelRepository;
let opsRuntimeRepo: OpsRuntimeRepository;
let generationJobRepo: GenerationJobRepository;
let storyGenerationStageEventRepo: StoryGenerationStageEventRepository;
let discountRepo: DiscountRepository;
let appReleaseRepo: AppReleaseRepository;

export interface RepositoryTestOverrides {
  user?: UserRepository;
  oauth?: OAuthRepository;
  session?: SessionRepository;
  plan?: PlanRepository;
  childProfile?: ChildProfileRepository;
  character?: CharacterRepository;
  story?: StoryRepository;
  scene?: SceneRepository;
  asset?: AssetRepository;
  voice?: VoiceRepository;
  graphicNovel?: GraphicNovelRepository;
  imageValidation?: ImageValidationRepository;
  storyGenerationStageEvent?: StoryGenerationStageEventRepository;
  alignment?: AlignmentRepository;
  aiUsage?: AiUsageRepository;
  dictionary?: DictionaryRepository;
  storyArtifact?: StoryArtifactRepository;
  collectedStoryArtifact?: CollectedStoryArtifactRepository;
  storyQuiz?: StoryQuizRepository;
  storyQuizProgress?: StoryQuizProgressRepository;
  collectedMapTile?: CollectedMapTileRepository;
  usageEvents?: UsageEventsRepository;
  userConsent?: UserConsentRepository;
  dataPrivacyRequest?: DataPrivacyRequestRepository;
  bundle?: BundleRepository;
  passwordResetToken?: PasswordResetTokenRepository;
  discount?: DiscountRepository;
  opsRuntime?: OpsRuntimeRepository;
  generationJob?: GenerationJobRepository;
  appRelease?: AppReleaseRepository;
  storyRating?: StoryRatingRepository;
  feedback?: FeedbackRepository;
  outfitPlateCache?: OutfitPlateCacheRepository;
  storyOutfitPlateCache?: StoryOutfitPlateCacheRepository;
  characterOutfitTurnaroundCache?: CharacterOutfitTurnaroundCacheRepository;
}

let testOverrides: RepositoryTestOverrides | null = null;

/** Replace repository boundaries only; production route/service logic stays unchanged. */
export function installRepositoryTestOverrides(overrides: RepositoryTestOverrides): void {
  if (process.env.NODE_ENV === 'production') {
    throw new Error('Repository test overrides cannot be installed in production');
  }
  testOverrides = { ...overrides };
}

export function clearRepositoryTestOverrides(): void {
  testOverrides = null;
}

export function getUserRepository(): UserRepository {
  if (testOverrides?.user) return testOverrides.user;
  if (!userRepo) userRepo = new UserRepository(db);
  return userRepo;
}

export function getOAuthRepository(): OAuthRepository {
  if (testOverrides?.oauth) return testOverrides.oauth;
  if (!oauthRepo) oauthRepo = new OAuthRepository(db);
  return oauthRepo;
}

export function getSessionRepository(): SessionRepository {
  if (testOverrides?.session) return testOverrides.session;
  if (!sessionRepo) sessionRepo = new SessionRepository(db);
  return sessionRepo;
}

export function getPlanRepository(): PlanRepository {
  if (testOverrides?.plan) return testOverrides.plan;
  if (!planRepo) planRepo = new PlanRepository(db);
  return planRepo;
}

export function getChildProfileRepository(): ChildProfileRepository {
  if (testOverrides?.childProfile) return testOverrides.childProfile;
  if (!childProfileRepo) childProfileRepo = new ChildProfileRepository(db);
  return childProfileRepo;
}

export function getCharacterRepository(): CharacterRepository {
  if (testOverrides?.character) return testOverrides.character;
  if (!characterRepo) characterRepo = new CharacterRepository(db);
  return characterRepo;
}

export function getStoryRepository(): StoryRepository {
  if (testOverrides?.story) return testOverrides.story;
  if (!storyRepo) storyRepo = new StoryRepository(db);
  return storyRepo;
}

export function getGraphicNovelRepository(): GraphicNovelRepository {
  if (testOverrides?.graphicNovel) return testOverrides.graphicNovel;
  if (!graphicNovelRepo) graphicNovelRepo = new GraphicNovelRepository(db);
  return graphicNovelRepo;
}

export function getSceneRepository(): SceneRepository {
  if (testOverrides?.scene) return testOverrides.scene;
  if (!sceneRepo) sceneRepo = new SceneRepository(db);
  return sceneRepo;
}

export function getAssetRepository(): AssetRepository {
  if (testOverrides?.asset) return testOverrides.asset;
  if (!assetRepo) assetRepo = new AssetRepository(db);
  return assetRepo;
}

export function getVoiceRepository(): VoiceRepository {
  if (testOverrides?.voice) return testOverrides.voice;
  if (!voiceRepo) voiceRepo = new VoiceRepository(db);
  return voiceRepo;
}

export function getDictionaryRepository(): DictionaryRepository {
  if (testOverrides?.dictionary) return testOverrides.dictionary;
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
  if (testOverrides?.outfitPlateCache) return testOverrides.outfitPlateCache;
  if (!outfitPlateCacheRepo) outfitPlateCacheRepo = new OutfitPlateCacheRepository(db);
  return outfitPlateCacheRepo;
}

export function getStoryOutfitPlateCacheRepository(): StoryOutfitPlateCacheRepository {
  if (testOverrides?.storyOutfitPlateCache) return testOverrides.storyOutfitPlateCache;
  if (!storyOutfitPlateCacheRepo)
    storyOutfitPlateCacheRepo = new StoryOutfitPlateCacheRepository(db);
  return storyOutfitPlateCacheRepo;
}

export function getCharacterOutfitTurnaroundCacheRepository(): CharacterOutfitTurnaroundCacheRepository {
  if (testOverrides?.characterOutfitTurnaroundCache)
    return testOverrides.characterOutfitTurnaroundCache;
  if (!characterOutfitTurnaroundCacheRepo)
    characterOutfitTurnaroundCacheRepo = new CharacterOutfitTurnaroundCacheRepository(db);
  return characterOutfitTurnaroundCacheRepo;
}

export function getAlignmentRepository(): AlignmentRepository {
  if (testOverrides?.alignment) return testOverrides.alignment;
  if (!alignmentRepo) alignmentRepo = new AlignmentRepository(db);
  return alignmentRepo;
}

export function getAiUsageRepository(): AiUsageRepository {
  if (testOverrides?.aiUsage) return testOverrides.aiUsage;
  if (!aiUsageRepo) aiUsageRepo = new AiUsageRepository(db);
  return aiUsageRepo;
}

export function getUsageEventsRepository(): UsageEventsRepository {
  if (testOverrides?.usageEvents) return testOverrides.usageEvents;
  if (!usageEventsRepo) usageEventsRepo = new UsageEventsRepository(db);
  return usageEventsRepo;
}

export function getStoryRatingRepository(): StoryRatingRepository {
  if (testOverrides?.storyRating) return testOverrides.storyRating;
  if (!storyRatingRepo) storyRatingRepo = new StoryRatingRepository(db);
  return storyRatingRepo;
}

export function getPasswordResetTokenRepository(): PasswordResetTokenRepository {
  if (testOverrides?.passwordResetToken) return testOverrides.passwordResetToken;
  if (!passwordResetTokenRepo) passwordResetTokenRepo = new PasswordResetTokenRepository(db);
  return passwordResetTokenRepo;
}

export function getImageValidationRepository(): ImageValidationRepository {
  if (testOverrides?.imageValidation) return testOverrides.imageValidation;
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
  if (testOverrides?.feedback) return testOverrides.feedback;
  if (!feedbackRepo) feedbackRepo = new FeedbackRepository(db);
  return feedbackRepo;
}

export function getAdminDashboardRepository(): AdminDashboardRepository {
  if (!adminDashboardRepo) adminDashboardRepo = new AdminDashboardRepository(db);
  return adminDashboardRepo;
}

export function getBundleRepository(): BundleRepository {
  if (testOverrides?.bundle) return testOverrides.bundle;
  if (!bundleRepo) bundleRepo = new BundleRepository(db);
  return bundleRepo;
}

export function getUserConsentRepository(): UserConsentRepository {
  if (testOverrides?.userConsent) return testOverrides.userConsent;
  if (!userConsentRepo) userConsentRepo = new UserConsentRepository(db);
  return userConsentRepo;
}

export function getDataPrivacyRequestRepository(): DataPrivacyRequestRepository {
  if (testOverrides?.dataPrivacyRequest) return testOverrides.dataPrivacyRequest;
  if (!dataPrivacyRequestRepo) dataPrivacyRequestRepo = new DataPrivacyRequestRepository(db);
  return dataPrivacyRequestRepo;
}

export function getModerationDecisionRepository(): ModerationDecisionRepository {
  if (!moderationDecisionRepo) moderationDecisionRepo = new ModerationDecisionRepository(db);
  return moderationDecisionRepo;
}

export function getStoryArtifactRepository(): StoryArtifactRepository {
  if (testOverrides?.storyArtifact) return testOverrides.storyArtifact;
  if (!storyArtifactRepo) storyArtifactRepo = new StoryArtifactRepository(db);
  return storyArtifactRepo;
}

export function getCollectedStoryArtifactRepository(): CollectedStoryArtifactRepository {
  if (testOverrides?.collectedStoryArtifact) return testOverrides.collectedStoryArtifact;
  if (!collectedStoryArtifactRepo)
    collectedStoryArtifactRepo = new CollectedStoryArtifactRepository(db);
  return collectedStoryArtifactRepo;
}

export function getCollectedMapTileRepository(): CollectedMapTileRepository {
  if (testOverrides?.collectedMapTile) return testOverrides.collectedMapTile;
  if (!collectedMapTileRepo) collectedMapTileRepo = new CollectedMapTileRepository(db);
  return collectedMapTileRepo;
}

export function getStoryQuizRepository(): StoryQuizRepository {
  if (testOverrides?.storyQuiz) return testOverrides.storyQuiz;
  if (!storyQuizRepo) storyQuizRepo = new StoryQuizRepository(db);
  return storyQuizRepo;
}

export function getStoryQuizProgressRepository(): StoryQuizProgressRepository {
  if (testOverrides?.storyQuizProgress) return testOverrides.storyQuizProgress;
  if (!storyQuizProgressRepo) storyQuizProgressRepo = new StoryQuizProgressRepository(db);
  return storyQuizProgressRepo;
}

export function getOpsRuntimeRepository(): OpsRuntimeRepository {
  if (testOverrides?.opsRuntime) return testOverrides.opsRuntime;
  if (!opsRuntimeRepo) opsRuntimeRepo = new OpsRuntimeRepository(db);
  return opsRuntimeRepo;
}

export function getGenerationJobRepository(): GenerationJobRepository {
  if (testOverrides?.generationJob) return testOverrides.generationJob;
  if (!generationJobRepo) generationJobRepo = new GenerationJobRepository(db);
  return generationJobRepo;
}

export function getStoryGenerationStageEventRepository(): StoryGenerationStageEventRepository {
  if (testOverrides?.storyGenerationStageEvent) return testOverrides.storyGenerationStageEvent;
  if (!storyGenerationStageEventRepo)
    storyGenerationStageEventRepo = new StoryGenerationStageEventRepository(db);
  return storyGenerationStageEventRepo;
}

export function getDiscountRepository(): DiscountRepository {
  if (testOverrides?.discount) return testOverrides.discount;
  if (!discountRepo) discountRepo = new DiscountRepository(db);
  return discountRepo;
}

export function getAppReleaseRepository(): AppReleaseRepository {
  if (testOverrides?.appRelease) return testOverrides.appRelease;
  if (!appReleaseRepo) appReleaseRepo = new AppReleaseRepository(db);
  return appReleaseRepo;
}
