import { pgTable, uuid, varchar, text, timestamp, jsonb, uniqueIndex, index, inet, integer, boolean, date, decimal, primaryKey } from 'drizzle-orm/pg-core';

// Users table
export const users = pgTable('users', {
  id: uuid('id').primaryKey().defaultRandom(),
  email: varchar('email', { length: 255 }).notNull().unique(),
  displayName: varchar('display_name', { length: 255 }),
  avatarUrl: text('avatar_url'),
  preferredLocale: varchar('preferred_locale', { length: 5 }).default('uk').notNull(),
  createdAt: timestamp('created_at').defaultNow().notNull(),
  updatedAt: timestamp('updated_at').defaultNow().notNull(),
}, (table) => {
  return {
    emailIdx: uniqueIndex('users_email_idx').on(table.email),
  };
});

// OAuth identities table
export const oauthIdentities = pgTable('oauth_identities', {
  id: uuid('id').primaryKey().defaultRandom(),
  userId: uuid('user_id').references(() => users.id, { onDelete: 'cascade' }).notNull(),
  provider: varchar('provider', { length: 50 }).notNull(), // 'google' | 'apple'
  providerUserId: varchar('provider_user_id', { length: 255 }).notNull(),
  providerEmail: varchar('provider_email', { length: 255 }),
  accessToken: text('access_token'),
  refreshToken: text('refresh_token'),
  tokenExpiresAt: timestamp('token_expires_at'),
  rawUserInfo: jsonb('raw_user_info'),
  createdAt: timestamp('created_at').defaultNow().notNull(),
  updatedAt: timestamp('updated_at').defaultNow().notNull(),
}, (table) => {
  return {
    providerUserIdx: uniqueIndex('oauth_identities_provider_user_idx').on(table.provider, table.providerUserId),
    userIdIdx: index('oauth_identities_user_id_idx').on(table.userId),
  };
});

// Sessions table
export const sessions = pgTable('sessions', {
  id: uuid('id').primaryKey().defaultRandom(),
  userId: uuid('user_id').references(() => users.id, { onDelete: 'cascade' }).notNull(),
  token: varchar('token', { length: 255 }).notNull().unique(),
  deviceName: varchar('device_name', { length: 255 }),
  deviceType: varchar('device_type', { length: 50 }), // 'ios' | 'android' | 'web'
  ipAddress: inet('ip_address'),
  userAgent: text('user_agent'),
  createdAt: timestamp('created_at').defaultNow().notNull(),
  lastActiveAt: timestamp('last_active_at').defaultNow().notNull(),
  expiresAt: timestamp('expires_at').notNull(),
}, (table) => {
  return {
    tokenIdx: uniqueIndex('sessions_token_idx').on(table.token),
    userIdIdx: index('sessions_user_id_idx').on(table.userId),
    expiresAtIdx: index('sessions_expires_at_idx').on(table.expiresAt),
  };
});

// Type exports
export type User = typeof users.$inferSelect;
export type NewUser = typeof users.$inferInsert;

export type OAuthIdentity = typeof oauthIdentities.$inferSelect;
export type NewOAuthIdentity = typeof oauthIdentities.$inferInsert;

export type Session = typeof sessions.$inferSelect;
export type NewSession = typeof sessions.$inferInsert;

// Plans table
export const plans = pgTable('plans', {
  id: uuid('id').primaryKey().defaultRandom(),
  slug: varchar('slug', { length: 50 }).notNull().unique(),
  name: varchar('name', { length: 100 }).notNull(),
  description: text('description'),
  priceMonthly: integer('price_monthly').notNull().default(0),
  pricingCurrency: varchar('pricing_currency', { length: 3 }).notNull().default('UAH'),
  billingPeriod: varchar('billing_period', { length: 20 }).notNull().default('monthly'),
  isActive: boolean('is_active').notNull().default(true),
  sortOrder: integer('sort_order').notNull().default(0),
  metadata: jsonb('metadata'),
  createdAt: timestamp('created_at').defaultNow().notNull(),
  updatedAt: timestamp('updated_at').defaultNow().notNull(),
}, (table) => {
  return {
    slugIdx: uniqueIndex('plans_slug_idx').on(table.slug),
    isActiveIdx: index('plans_is_active_idx').on(table.isActive),
  };
});

// Features table
export const features = pgTable('features', {
  id: uuid('id').primaryKey().defaultRandom(),
  slug: varchar('slug', { length: 100 }).notNull().unique(),
  name: varchar('name', { length: 100 }).notNull(),
  description: text('description'),
  featureType: varchar('feature_type', { length: 20 }).notNull(), // 'boolean' | 'numeric' | 'enum'
  defaultValue: jsonb('default_value').notNull(), // type-specific default
  category: varchar('category', { length: 50 }).notNull(),
  isInternal: boolean('is_internal').notNull().default(false),
  createdAt: timestamp('created_at').defaultNow().notNull(),
  updatedAt: timestamp('updated_at').defaultNow().notNull(),
}, (table) => {
  return {
    slugIdx: uniqueIndex('features_slug_idx').on(table.slug),
    categoryIdx: index('features_category_idx').on(table.category),
  };
});

// Plan features mapping table
export const planFeatures = pgTable('plan_features', {
  id: uuid('id').primaryKey().defaultRandom(),
  planId: uuid('plan_id').references(() => plans.id, { onDelete: 'cascade' }).notNull(),
  featureId: uuid('feature_id').references(() => features.id, { onDelete: 'cascade' }).notNull(),
  value: jsonb('value').notNull(), // type-specific value
  createdAt: timestamp('created_at').defaultNow().notNull(),
  updatedAt: timestamp('updated_at').defaultNow().notNull(),
}, (table) => {
  return {
    planIdIdx: index('plan_features_plan_id_idx').on(table.planId),
    featureIdIdx: index('plan_features_feature_id_idx').on(table.featureId),
    uniqueIdx: uniqueIndex('plan_features_unique_idx').on(table.planId, table.featureId),
  };
});

// User subscriptions table
export const userSubscriptions = pgTable('user_subscriptions', {
  id: uuid('id').primaryKey().defaultRandom(),
  userId: uuid('user_id').references(() => users.id, { onDelete: 'cascade' }).notNull().unique(),
  planId: uuid('plan_id').references(() => plans.id, { onDelete: 'restrict' }).notNull(),
  status: varchar('status', { length: 20 }).notNull().default('active'), // 'active' | 'trialing' | 'canceled' | 'expired'
  trialEndsAt: timestamp('trial_ends_at'),
  storiesUsed: integer('stories_used').notNull().default(0),
  audioMinutesUsed: integer('audio_minutes_used').notNull().default(0),
  resetAt: timestamp('reset_at').notNull(),
  currentPeriodStart: timestamp('current_period_start').notNull(),
  currentPeriodEnd: timestamp('current_period_end').notNull(),
  cancelAtPeriodEnd: boolean('cancel_at_period_end').notNull().default(false),
  metadata: jsonb('metadata'),
  createdAt: timestamp('created_at').defaultNow().notNull(),
  updatedAt: timestamp('updated_at').defaultNow().notNull(),
}, (table) => {
  return {
    userIdIdx: uniqueIndex('user_subscriptions_user_id_idx').on(table.userId),
    planIdIdx: index('user_subscriptions_plan_id_idx').on(table.planId),
    statusIdx: index('user_subscriptions_status_idx').on(table.status),
    resetAtIdx: index('user_subscriptions_reset_at_idx').on(table.resetAt),
  };
});

// Child profiles table
export const childProfiles = pgTable('child_profiles', {
  id: uuid('id').primaryKey().defaultRandom(),
  userId: uuid('user_id').references(() => users.id, { onDelete: 'cascade' }).notNull(),
  name: varchar('name', { length: 100 }).notNull(),
  birthDate: date('birth_date').notNull(),
  gender: varchar('gender', { length: 20 }),
  languages: jsonb('languages').notNull(), // array of language codes
  referencePhotos: jsonb('reference_photos'), // array of photo objects
  appearanceTraits: jsonb('appearance_traits'), // structured appearance data
  personality: jsonb('personality'), // traits and activities
  interests: jsonb('interests'), // array of interests
  sensitivities: jsonb('sensitivities'), // fears and topics to avoid
  familyCast: jsonb('family_cast'), // family member names
  // AI-generated fields from Gemini Vision analysis
  aiGeneratedDescription: text('ai_generated_description'), // Detailed narrative description
  clothing: jsonb('clothing'), // Structured clothing data
  distinctiveFeatures: jsonb('distinctive_features'), // Array of distinctive features
  isActive: boolean('is_active').notNull().default(true),
  createdAt: timestamp('created_at').defaultNow().notNull(),
  updatedAt: timestamp('updated_at').defaultNow().notNull(),
}, (table) => {
  return {
    userIdIdx: index('child_profiles_user_id_idx').on(table.userId),
    birthDateIdx: index('child_profiles_birth_date_idx').on(table.birthDate),
    isActiveIdx: index('child_profiles_is_active_idx').on(table.isActive),
  };
});

// Characters table (pets, family members, imaginary friends)
export const characters = pgTable('characters', {
  id: uuid('id').primaryKey().defaultRandom(),
  userId: uuid('user_id').references(() => users.id, { onDelete: 'cascade' }).notNull(),
  name: varchar('name', { length: 100 }).notNull(),
  type: varchar('type', { length: 50 }).notNull(), // 'pet' | 'family_member' | 'friend' | 'neighbor' | 'imaginary_friend'
  referencePhotos: jsonb('reference_photos'), // array of photo objects
  appearanceTraits: jsonb('appearance_traits'), // type-specific structured data
  personality: jsonb('personality'), // traits and activities
  description: text('description'),
  // AI-generated fields from Gemini Vision analysis
  aiGeneratedDescription: text('ai_generated_description'), // Detailed narrative description
  clothing: jsonb('clothing'), // Structured clothing data
  distinctiveFeatures: jsonb('distinctive_features'), // Array of distinctive features
  isActive: boolean('is_active').notNull().default(true),
  createdAt: timestamp('created_at').defaultNow().notNull(),
  updatedAt: timestamp('updated_at').defaultNow().notNull(),
}, (table) => {
  return {
    userIdIdx: index('characters_user_id_idx').on(table.userId),
    typeIdx: index('characters_type_idx').on(table.type),
    isActiveIdx: index('characters_is_active_idx').on(table.isActive),
  };
});

// Usage events table
export const usageEvents = pgTable('usage_events', {
  id: uuid('id').primaryKey().defaultRandom(),
  userId: uuid('user_id').references(() => users.id, { onDelete: 'cascade' }).notNull(),
  childProfileId: uuid('child_profile_id').references(() => childProfiles.id, { onDelete: 'set null' }),
  eventType: varchar('event_type', { length: 50 }).notNull(), // 'story_created', 'image_generated', 'audio_synthesized'
  resourceType: varchar('resource_type', { length: 50 }).notNull(), // 'story', 'image', 'audio'
  quantity: integer('quantity').notNull().default(1),
  metadata: jsonb('metadata'),
  createdAt: timestamp('created_at').defaultNow().notNull(),
}, (table) => {
  return {
    userIdIdx: index('usage_events_user_id_idx').on(table.userId),
    createdAtIdx: index('usage_events_created_at_idx').on(table.createdAt),
    eventTypeIdx: index('usage_events_type_idx').on(table.eventType),
  };
});

export type Plan = typeof plans.$inferSelect;
export type NewPlan = typeof plans.$inferInsert;

export type Feature = typeof features.$inferSelect;
export type NewFeature = typeof features.$inferInsert;

export type PlanFeature = typeof planFeatures.$inferSelect;
export type NewPlanFeature = typeof planFeatures.$inferInsert;

export type UserSubscription = typeof userSubscriptions.$inferSelect;
export type NewUserSubscription = typeof userSubscriptions.$inferInsert;

export type ChildProfile = typeof childProfiles.$inferSelect;
export type NewChildProfile = typeof childProfiles.$inferInsert;

export type Character = typeof characters.$inferSelect;
export type NewCharacter = typeof characters.$inferInsert;

export type UsageEvent = typeof usageEvents.$inferSelect;
export type NewUsageEvent = typeof usageEvents.$inferInsert;

// ==========================================
// STORY CONFIGURATION TABLES (M3)
// ==========================================

// Story goals table
export const storyGoals = pgTable('story_goals', {
  slug: varchar('slug', { length: 50 }).primaryKey(),
  name: varchar('name', { length: 100 }).notNull(),
  description: text('description').notNull(),
  promptGuidance: text('prompt_guidance').notNull(),
  minAge: integer('min_age').notNull(),
  sortOrder: integer('sort_order').notNull().default(0),
});

// Story tones table
export const storyTones = pgTable('story_tones', {
  slug: varchar('slug', { length: 50 }).primaryKey(),
  name: varchar('name', { length: 100 }).notNull(),
  description: text('description').notNull(),
  promptGuidance: text('prompt_guidance').notNull(),
  writingStyle: text('writing_style').notNull(), // JSON stringified
  sortOrder: integer('sort_order').notNull().default(0),
});

// Content policy rules table
export const contentPolicyRules = pgTable('content_policy_rules', {
  id: varchar('id', { length: 50 }).primaryKey(),
  category: varchar('category', { length: 100 }).notNull(),
  description: text('description').notNull(),
  prohibitedElements: text('prohibited_elements').notNull(), // JSON array
  examples: text('examples').notNull(), // JSON object
  promptGuidance: text('prompt_guidance').notNull(),
  severity: varchar('severity', { length: 20 }).notNull(),
  sortOrder: integer('sort_order').notNull().default(0),
});

// Age engine rules table
export const ageEngineRules = pgTable('age_engine_rules', {
  ageGroup: varchar('age_group', { length: 10 }).primaryKey(),
  sceneCount: integer('scene_count').notNull(),
  wordRangeMin: integer('word_range_min').notNull(),
  wordRangeMax: integer('word_range_max').notNull(),
  maxSentenceLength: integer('max_sentence_length').notNull(),
  vocabulary: varchar('vocabulary', { length: 20 }).notNull(),
  dialogRatio: decimal('dialog_ratio', { precision: 3, scale: 2 }).notNull(),
  themes: text('themes').notNull(), // JSON array
  fearLevel: integer('fear_level').notNull(),
  allowedConflicts: text('allowed_conflicts').notNull(), // JSON array
  additionalRules: text('additional_rules').notNull(),
});

// Scenario cards table
export const scenarioCards = pgTable('scenario_cards', {
  id: varchar('id', { length: 100 }).primaryKey(),
  nameKey: varchar('name_key', { length: 100 }).notNull(),
  descriptionKey: varchar('description_key', { length: 100 }).notNull(),
  icon: varchar('icon', { length: 50 }),
  promptGuidance: text('prompt_guidance').notNull(), // Detailed plot guidance (30-50 words)
  suggestedGoals: text('suggested_goals').notNull(), // JSON array
  ageGroups: text('age_groups').notNull(), // JSON array
  sortOrder: integer('sort_order').notNull().default(0),
  isActive: boolean('is_active').notNull().default(true),
});

// Translations table (M6)
export const translations = pgTable('translations', {
  id: uuid('id').primaryKey().defaultRandom(),
  entityType: varchar('entity_type', { length: 50 }).notNull(), // 'story_goal' | 'story_tone' | 'scenario_card'
  entityId: varchar('entity_id', { length: 100 }).notNull(),
  locale: varchar('locale', { length: 5 }).notNull(), // 'uk' | 'ru' | 'en' | 'es'
  fieldName: varchar('field_name', { length: 50 }).notNull(), // 'name' | 'description'
  value: text('value').notNull(),
  createdAt: timestamp('created_at').defaultNow().notNull(),
  updatedAt: timestamp('updated_at').defaultNow().notNull(),
}, (table) => {
  return {
    uniqueConstraint: uniqueIndex('translations_unique').on(
      table.entityType,
      table.entityId,
      table.locale,
      table.fieldName
    ),
    lookupIdx: index('idx_translations_lookup').on(table.entityType, table.entityId, table.locale),
    entityIdx: index('idx_translations_entity').on(table.entityType, table.entityId),
    localeIdx: index('idx_translations_locale').on(table.locale),
  };
});

// ==========================================
// STORY GENERATION TABLES (M3)
// ==========================================

// Story requests table
export const storyRequests = pgTable('story_requests', {
  id: uuid('id').primaryKey().defaultRandom(),
  userId: uuid('user_id').references(() => users.id, { onDelete: 'cascade' }).notNull(),
  childProfileId: uuid('child_profile_id').references(() => childProfiles.id, { onDelete: 'set null' }),
  
  uiLocale: varchar('ui_locale', { length: 5 }).notNull(),
  storyLanguage: varchar('story_language', { length: 5 }).notNull(),
  goal: varchar('goal', { length: 50 }).references(() => storyGoals.slug),
  tone: varchar('tone', { length: 50 }).references(() => storyTones.slug),
  scenarioCardId: varchar('scenario_card_id', { length: 100 }).references(() => scenarioCards.id),
  imageStyle: varchar('image_style', { length: 50 }), // Image art style (soft_watercolor, etc.)
  userNotes: text('user_notes'),
  selectedCharacters: jsonb('selected_characters'), // Array of character UUIDs selected by user
  selectedChildren: jsonb('selected_children'), // NEW: Array of child profile UUIDs to include in story
  
  status: varchar('status', { length: 20 }).notNull().default('pending'),
  progress: integer('progress').default(0),
  progressData: jsonb('progress_data'), // Task-based progress tracking (activeTasks, completedTasks)
  intermediateData: jsonb('intermediate_data'), // Checkpoints for retry (outline, text, validation)
  
  storyId: uuid('story_id'), // FK constraint added in migration, not in schema to avoid circular reference
  
  errorMessage: text('error_message'),
  retryCount: integer('retry_count').default(0),
  
  createdAt: timestamp('created_at').defaultNow().notNull(),
  updatedAt: timestamp('updated_at').defaultNow().notNull(),
}, (table) => {
  return {
    userIdIdx: index('story_requests_user_id_idx').on(table.userId),
    statusIdx: index('story_requests_status_idx').on(table.status),
    createdAtIdx: index('story_requests_created_at_idx').on(table.createdAt),
  };
});

// Story Series table (M8)
export const storySeries = pgTable('story_series', {
  id: uuid('id').primaryKey().defaultRandom(),
  userId: uuid('user_id').references(() => users.id, { onDelete: 'cascade' }).notNull(),
  childProfileId: uuid('child_profile_id').references(() => childProfiles.id, { onDelete: 'set null' }),
  
  baseTitle: varchar('base_title', { length: 255 }).notNull(),
  language: varchar('language', { length: 5 }).notNull(),
  ageGroup: varchar('age_group', { length: 10 }).notNull(),
  imageStyle: varchar('image_style', { length: 50 }).notNull(),
  tone: varchar('tone', { length: 50 }),
  
  totalParts: integer('total_parts').notNull().default(1),
  storyIds: jsonb('story_ids').notNull().$type<string[]>().default([]),
  continuationContext: jsonb('continuation_context'),
  
  createdAt: timestamp('created_at').defaultNow().notNull(),
  updatedAt: timestamp('updated_at').defaultNow().notNull(),
}, (table) => {
  return {
    userIdIdx: index('story_series_user_id_idx').on(table.userId),
    createdAtIdx: index('story_series_created_at_idx').on(table.createdAt),
  };
});

// Stories table
export const stories = pgTable('stories', {
  id: uuid('id').primaryKey().defaultRandom(),
  userId: uuid('user_id').references(() => users.id, { onDelete: 'cascade' }).notNull(),
  childProfileId: uuid('child_profile_id').references(() => childProfiles.id, { onDelete: 'set null' }),
  storyRequestId: uuid('story_request_id').references(() => storyRequests.id, { onDelete: 'set null' }),
  
  title: varchar('title', { length: 255 }).notNull(),
  language: varchar('language', { length: 5 }).notNull(),
  ageGroup: varchar('age_group', { length: 10 }).notNull(),
  moralTheme: varchar('moral_theme', { length: 50 }).references(() => storyGoals.slug),
  tone: varchar('tone', { length: 50 }).references(() => storyTones.slug),
  
  outline: jsonb('outline'), // EpisodeOutline structure
  scenes: jsonb('scenes').notNull(), // Array of { sceneId, text, visualPrompt, imageUrl } - DEPRECATED, use scenes table
  fullText: text('full_text').notNull(),
  wordCount: integer('word_count'),
  estimatedReadMinutes: integer('estimated_read_minutes'),
  
  modelVersion: varchar('model_version', { length: 50 }),
  generationTimeMs: integer('generation_time_ms'),
  policyChecks: jsonb('policy_checks'),
  metadata: jsonb('metadata'), // NEW: llmGeneratedCharacters, imageStyle, etc
  audioMetadata: jsonb('audio_metadata'), // M5: { voiceId, voiceName, totalDuration, generatedAt, nightMode }
  
  // Series support (M8)
  seriesId: uuid('series_id').references(() => storySeries.id, { onDelete: 'set null' }),
  partNumber: integer('part_number'),
  
  isPublished: boolean('is_published').default(true),
  isFavorite: boolean('is_favorite').default(false),
  
  createdAt: timestamp('created_at').defaultNow().notNull(),
  updatedAt: timestamp('updated_at').defaultNow().notNull(),
}, (table) => {
  return {
    userIdIdx: index('stories_user_id_idx').on(table.userId),
    childProfileIdIdx: index('stories_child_profile_id_idx').on(table.childProfileId),
    languageIdx: index('stories_language_idx').on(table.language),
    ageGroupIdx: index('stories_age_group_idx').on(table.ageGroup),
    createdAtIdx: index('stories_created_at_idx').on(table.createdAt),
    seriesIdIdx: index('stories_series_id_idx').on(table.seriesId),
  };
});

// Story characters junction table
export const storyCharacters = pgTable('story_characters', {
  id: uuid('id').primaryKey().defaultRandom(),
  storyId: uuid('story_id').references(() => stories.id, { onDelete: 'cascade' }).notNull(),
  characterId: uuid('character_id').references(() => characters.id, { onDelete: 'cascade' }).notNull(),
  role: varchar('role', { length: 50 }),
  
  createdAt: timestamp('created_at').defaultNow().notNull(),
}, (table) => {
  return {
    storyIdIdx: index('story_characters_story_id_idx').on(table.storyId),
    characterIdIdx: index('story_characters_character_id_idx').on(table.characterId),
    uniqueIdx: uniqueIndex('story_characters_unique_idx').on(table.storyId, table.characterId),
  };
});

export type StoryGoal = typeof storyGoals.$inferSelect;
export type NewStoryGoal = typeof storyGoals.$inferInsert;

export type StoryTone = typeof storyTones.$inferSelect;
export type NewStoryTone = typeof storyTones.$inferInsert;

export type ContentPolicyRule = typeof contentPolicyRules.$inferSelect;
export type NewContentPolicyRule = typeof contentPolicyRules.$inferInsert;

export type AgeEngineRule = typeof ageEngineRules.$inferSelect;
export type NewAgeEngineRule = typeof ageEngineRules.$inferInsert;

export type ScenarioCard = typeof scenarioCards.$inferSelect;
export type NewScenarioCard = typeof scenarioCards.$inferInsert;

export type Translation = typeof translations.$inferSelect;
export type NewTranslation = typeof translations.$inferInsert;

export type StoryRequest = typeof storyRequests.$inferSelect;
export type NewStoryRequest = typeof storyRequests.$inferInsert;

export type StorySeries = typeof storySeries.$inferSelect;
export type NewStorySeries = typeof storySeries.$inferInsert;

export type Story = typeof stories.$inferSelect;
export type NewStory = typeof stories.$inferInsert;

export type StoryCharacter = typeof storyCharacters.$inferSelect;
export type NewStoryCharacter = typeof storyCharacters.$inferInsert;

// ==========================================
// IMAGE GENERATION TABLES (M4)
// ==========================================

// Scenes table - extracted from stories.scenes jsonb
export const scenes = pgTable('scenes', {
  id: uuid('id').primaryKey().defaultRandom(),
  storyId: uuid('story_id').references(() => stories.id, { onDelete: 'cascade' }).notNull(),
  sceneId: integer('scene_id').notNull(), // sequential: 1, 2, 3...
  
  text: text('text').notNull(),
  visualPrompt: text('visual_prompt').notNull(),
  
  // NEW: Character tracking for reference image selection (M9)
  charactersPresent: jsonb('characters_present').$type<string[]>(),
  isReferenceImage: boolean('is_reference_image').default(false),
  imageUrl: text('image_url'), // Denormalized from assets for quick access
  
  generationParams: jsonb('generation_params'),
  generationTimeMs: integer('generation_time_ms'),
  
  createdAt: timestamp('created_at').defaultNow().notNull(),
  updatedAt: timestamp('updated_at').defaultNow().notNull(),
}, (table) => {
  return {
    storyIdIdx: index('scenes_story_id_idx').on(table.storyId),
    storySceneIdx: index('scenes_story_scene_idx').on(table.storyId, table.sceneId),
    uniqueSceneIdx: uniqueIndex('scenes_unique_idx').on(table.storyId, table.sceneId),
  };
});

// Assets table - storage metadata for images, audio, video
export const assets = pgTable('assets', {
  id: uuid('id').primaryKey().defaultRandom(),
  storyId: uuid('story_id').references(() => stories.id, { onDelete: 'cascade' }).notNull(),
  sceneId: uuid('scene_id').references(() => scenes.id, { onDelete: 'cascade' }),
  
  assetType: varchar('asset_type', { length: 20 }).notNull(), // 'image' | 'audio' | 'video'
  
  // Storage
  storagePath: text('storage_path').notNull(),
  storageUrl: text('storage_url'),
  signedUrl: text('signed_url'),
  signedUrlExpiresAt: timestamp('signed_url_expires_at'),
  
  mimeType: varchar('mime_type', { length: 100 }).notNull(),
  fileSizeBytes: integer('file_size_bytes'),
  
  // Generation metadata
  generationParams: jsonb('generation_params'),
  generationTimeMs: integer('generation_time_ms'),
  
  // Status
  status: varchar('status', { length: 20 }).notNull().default('pending'),
  errorMessage: text('error_message'),
  retryCount: integer('retry_count').default(0),
  
  createdAt: timestamp('created_at').defaultNow().notNull(),
  updatedAt: timestamp('updated_at').defaultNow().notNull(),
}, (table) => {
  return {
    storyIdIdx: index('assets_story_id_idx').on(table.storyId),
    sceneIdIdx: index('assets_scene_id_idx').on(table.sceneId),
    statusIdx: index('assets_status_idx').on(table.status),
    typeIdx: index('assets_type_idx').on(table.assetType),
  };
});

// Generated references table - AI-generated character portraits
export const generatedReferences = pgTable('generated_references', {
  id: uuid('id').primaryKey().defaultRandom(),
  storyId: uuid('story_id').references(() => stories.id, { onDelete: 'cascade' }),
  characterId: uuid('character_id').references(() => characters.id, { onDelete: 'set null' }),
  childProfileId: uuid('child_profile_id').references(() => childProfiles.id, { onDelete: 'set null' }),
  
  characterName: varchar('character_name', { length: 255 }),
  
  assetId: uuid('asset_id').references(() => assets.id, { onDelete: 'cascade' }),
  
  characterDescription: text('character_description').notNull(),
  
  generationParams: jsonb('generation_params'),
  referenceType: varchar('reference_type', { length: 50 }).notNull(),
  source: varchar('source', { length: 50 }),
  
  createdAt: timestamp('created_at').defaultNow().notNull(),
}, (table) => {
  return {
    storyIdIdx: index('generated_refs_story_idx').on(table.storyId),
    characterIdIdx: index('generated_refs_character_idx').on(table.characterId),
    charNameIdx: index('generated_refs_char_name_idx').on(table.storyId, table.characterName),
  };
});

export type Scene = typeof scenes.$inferSelect;
export type NewScene = typeof scenes.$inferInsert;

export type Asset = typeof assets.$inferSelect;
export type NewAsset = typeof assets.$inferInsert;

export type GeneratedReference = typeof generatedReferences.$inferSelect;
export type NewGeneratedReference = typeof generatedReferences.$inferInsert;

// ==========================================
// AUDIO/TTS TABLES (M5)
// ==========================================

// Age groups reference table - manageable via admin UI
export const ageGroups = pgTable('age_groups', {
  id: uuid('id').primaryKey().defaultRandom(),
  slug: varchar('slug', { length: 10 }).notNull().unique(), // '1y', '2-3', '4-5', '6-8', '9-12'
  nameKey: varchar('name_key', { length: 100 }).notNull(), // i18n key: 'age_groups.1y.name'
  minMonths: integer('min_months').notNull(),
  maxMonths: integer('max_months'), // NULL for last group (9-12+)
  sortOrder: integer('sort_order').notNull().default(0),
  isActive: boolean('is_active').notNull().default(true),
  createdAt: timestamp('created_at').defaultNow(),
  updatedAt: timestamp('updated_at').defaultNow(),
}, (table) => {
  return {
    slugIdx: uniqueIndex('age_groups_slug_idx').on(table.slug),
    sortOrderIdx: index('age_groups_sort_order_idx').on(table.sortOrder),
  };
});

// Voice-Age Groups junction table (M2M relationship)
export const voiceAgeGroups = pgTable('voice_age_groups', {
  voiceId: uuid('voice_id').references(() => ttsVoices.id, { onDelete: 'cascade' }).notNull(),
  ageGroupId: uuid('age_group_id').references(() => ageGroups.id, { onDelete: 'cascade' }).notNull(),
}, (table) => {
  return {
    pk: primaryKey({ columns: [table.voiceId, table.ageGroupId] }),
    voiceIdIdx: index('voice_age_groups_voice_id_idx').on(table.voiceId),
    ageGroupIdIdx: index('voice_age_groups_age_group_id_idx').on(table.ageGroupId),
  };
});

// TTS Voices table - available voices catalog
export const ttsVoices = pgTable('tts_voices', {
  id: uuid('id').primaryKey().defaultRandom(),
  
  // Voice identity
  provider: varchar('provider', { length: 50 }).notNull(), // 'elevenlabs' | 'google' | 'azure'
  providerVoiceId: varchar('provider_voice_id', { length: 100 }).notNull(),
  
  // Voice metadata
  name: varchar('name', { length: 100 }).notNull(),
  displayName: varchar('display_name', { length: 100 }).notNull(),
  language: varchar('language', { length: 10 }).notNull(),
  gender: varchar('gender', { length: 20 }), // 'male' | 'female' | 'neutral'
  ageCategory: varchar('age_category', { length: 20 }), // 'child' | 'young_adult' | 'adult' | 'senior'
  description: text('description'),
  
  // NEW: Voice role and tags (M5+)
  roleType: varchar('role_type', { length: 20 }), // 'narrator' | 'character' | 'both'
  voiceTags: varchar('voice_tags').array(), // ['calm', 'energetic', 'wise']
  
  // Voice characteristics
  tags: jsonb('tags'), // ['calm', 'energetic', 'storyteller', 'parent'] - DEPRECATED, use voiceTags
  accent: varchar('accent', { length: 50 }),
  
  // Configuration
  isActive: boolean('is_active').default(true).notNull(),
  isPremium: boolean('is_premium').default(false).notNull(),
  defaultSpeed: decimal('default_speed', { precision: 3, scale: 2 }).default('1.0').notNull(),
  
  // Sample
  sampleAudioUrl: text('sample_audio_url'), // DEPRECATED, use providerPreviewUrl
  providerPreviewUrl: text('provider_preview_url'), // ElevenLabs preview URL for admin playback
  
  createdAt: timestamp('created_at').defaultNow().notNull(),
  updatedAt: timestamp('updated_at').defaultNow().notNull(),
}, (table) => {
  return {
    providerVoiceIdx: uniqueIndex('tts_voices_provider_voice_idx').on(table.provider, table.providerVoiceId),
    languageIdx: index('tts_voices_language_idx').on(table.language),
    isActiveIdx: index('tts_voices_active_idx').on(table.isActive),
  };
});

// Audio assets table - generated audio metadata
export const audioAssets = pgTable('audio_assets', {
  id: uuid('id').primaryKey().defaultRandom(),
  
  // Relations
  storyId: uuid('story_id').references(() => stories.id, { onDelete: 'cascade' }).notNull(),
  
  // Voice info
  voiceId: uuid('voice_id').references(() => ttsVoices.id, { onDelete: 'restrict' }),
  voiceName: varchar('voice_name', { length: 100 }).notNull(),
  language: varchar('language', { length: 10 }).notNull(),
  
  // Prosody settings
  speed: decimal('speed', { precision: 3, scale: 2 }).default('1.0').notNull(),
  pitchShift: integer('pitch_shift').default(0).notNull(),
  nightMode: boolean('night_mode').default(false).notNull(),
  
  // Content hash for caching
  textHash: varchar('text_hash', { length: 64 }).notNull(), // SHA256 of normalized text
  
  // Asset info
  assetId: uuid('asset_id').references(() => assets.id, { onDelete: 'cascade' }).notNull(),
  durationSeconds: decimal('duration_seconds', { precision: 8, scale: 2 }),
  
  // Scene group tracking (M5.2 - Partial chunk support)
  sceneGroupIndex: integer('scene_group_index'), // NULL = final, 0-N = partial chunk
  isFinal: boolean('is_final').default(false).notNull(), // TRUE if final concatenated audio
  retryCount: integer('retry_count').default(0).notNull(), // Number of retry attempts
  
  // Provider info
  provider: varchar('provider', { length: 50 }).notNull().default('elevenlabs'),
  providerRequestId: varchar('provider_request_id', { length: 255 }),
  
  // Status
  status: varchar('status', { length: 50 }).notNull().default('pending'), // 'pending' | 'processing' | 'completed' | 'failed'
  errorMessage: text('error_message'),
  
  createdAt: timestamp('created_at').defaultNow().notNull(),
  updatedAt: timestamp('updated_at').defaultNow().notNull(),
}, (table) => {
  return {
    storyIdIdx: index('audio_assets_story_idx').on(table.storyId),
    statusIdx: index('audio_assets_status_idx').on(table.status),
    cacheIdx: index('audio_assets_cache_idx').on(table.textHash, table.voiceId, table.speed),
    createdAtIdx: index('audio_assets_created_idx').on(table.createdAt),
    sceneGroupIdx: index('audio_assets_scene_group_idx').on(table.storyId, table.sceneGroupIndex, table.status),
  };
});

export type TtsVoice = typeof ttsVoices.$inferSelect;
export type NewTtsVoice = typeof ttsVoices.$inferInsert;

export type AgeGroup = typeof ageGroups.$inferSelect;
export type NewAgeGroup = typeof ageGroups.$inferInsert;

export type VoiceAgeGroup = typeof voiceAgeGroups.$inferSelect;
export type NewVoiceAgeGroup = typeof voiceAgeGroups.$inferInsert;

export type AudioAsset = typeof audioAssets.$inferSelect;
export type NewAudioAsset = typeof audioAssets.$inferInsert;

