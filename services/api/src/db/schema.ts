import {
  pgTable,
  uuid,
  varchar,
  text,
  timestamp,
  jsonb,
  uniqueIndex,
  index,
  inet,
  integer,
  boolean,
  date,
  decimal,
  primaryKey,
} from 'drizzle-orm/pg-core';
import { sql } from 'drizzle-orm';

// Users table
export const users = pgTable(
  'users',
  {
    id: uuid('id').primaryKey().defaultRandom(),
    email: varchar('email', { length: 255 }).notNull().unique(),
    passwordHash: varchar('password_hash', { length: 255 }),
    displayName: varchar('display_name', { length: 255 }),
    pseudonym: varchar('pseudonym', { length: 100 }),
    aboutMe: text('about_me'),
    avatarUrl: text('avatar_url'),
    preferredLocale: varchar('preferred_locale', { length: 5 }).default('uk').notNull(),
    preferredBillingCurrency: varchar('preferred_billing_currency', { length: 3 })
      .default('EUR')
      .notNull(),
    mode: varchar('mode', { length: 20 }).default('instant').notNull(), // 'instant' | 'artisan'
    onboardingCompleted: boolean('onboarding_completed').notNull().default(false),
    stripeCustomerId: varchar('stripe_customer_id', { length: 255 }),
    /** Application role: 'user' | 'admin' */
    role: varchar('role', { length: 20 }).notNull().default('user'),
    /** Account access status: active users can authenticate and generate content. */
    status: varchar('status', { length: 20 }).notNull().default('active'),
    suspendedAt: timestamp('suspended_at', { withTimezone: true }),
    suspendedReason: text('suspended_reason'),
    suspendedByUserId: uuid('suspended_by_user_id'),
    /** Active UI theme palette id (see @wondertales/shared THEME_PALETTE_IDS) */
    themePalette: varchar('theme_palette', { length: 32 }).notNull().default('dusk_lavender'),
    childModeExitPasscodeHash: text('child_mode_exit_passcode_hash'),
    childModeExitPasscodeSetAt: timestamp('child_mode_exit_passcode_set_at'),
    createdAt: timestamp('created_at').defaultNow().notNull(),
    updatedAt: timestamp('updated_at').defaultNow().notNull(),
  },
  (table) => {
    return {
      emailIdx: uniqueIndex('users_email_idx').on(table.email),
    };
  }
);

// OAuth identities table
export const oauthIdentities = pgTable(
  'oauth_identities',
  {
    id: uuid('id').primaryKey().defaultRandom(),
    userId: uuid('user_id')
      .references(() => users.id, { onDelete: 'cascade' })
      .notNull(),
    provider: varchar('provider', { length: 50 }).notNull(), // 'google' | 'apple'
    providerUserId: varchar('provider_user_id', { length: 255 }).notNull(),
    providerEmail: varchar('provider_email', { length: 255 }),
    accessToken: text('access_token'),
    refreshToken: text('refresh_token'),
    tokenExpiresAt: timestamp('token_expires_at'),
    rawUserInfo: jsonb('raw_user_info'),
    createdAt: timestamp('created_at').defaultNow().notNull(),
    updatedAt: timestamp('updated_at').defaultNow().notNull(),
  },
  (table) => {
    return {
      providerUserIdx: uniqueIndex('oauth_identities_provider_user_idx').on(
        table.provider,
        table.providerUserId
      ),
      userIdIdx: index('oauth_identities_user_id_idx').on(table.userId),
    };
  }
);

// Sessions table
export const sessions = pgTable(
  'sessions',
  {
    id: uuid('id').primaryKey().defaultRandom(),
    userId: uuid('user_id')
      .references(() => users.id, { onDelete: 'cascade' })
      .notNull(),
    mode: varchar('mode', { length: 20 }).default('parent').notNull(), // 'parent' | 'child'
    parentUserId: uuid('parent_user_id').references(() => users.id, { onDelete: 'cascade' }),
    childProfileId: uuid('child_profile_id').references(() => childProfiles.id, {
      onDelete: 'cascade',
    }),
    scopes: jsonb('scopes').default([]).notNull(),
    token: varchar('token', { length: 255 }).notNull().unique(),
    deviceName: varchar('device_name', { length: 255 }),
    deviceType: varchar('device_type', { length: 50 }), // 'ios' | 'android' | 'web'
    ipAddress: inet('ip_address'),
    userAgent: text('user_agent'),
    createdAt: timestamp('created_at').defaultNow().notNull(),
    lastActiveAt: timestamp('last_active_at').defaultNow().notNull(),
    expiresAt: timestamp('expires_at').notNull(),
    revokedAt: timestamp('revoked_at'),
  },
  (table) => {
    return {
      tokenIdx: uniqueIndex('sessions_token_idx').on(table.token),
      userIdIdx: index('sessions_user_id_idx').on(table.userId),
      modeIdx: index('sessions_mode_idx').on(table.mode),
      parentUserIdIdx: index('sessions_parent_user_id_idx').on(table.parentUserId),
      childProfileIdIdx: index('sessions_child_profile_id_idx').on(table.childProfileId),
      expiresAtIdx: index('sessions_expires_at_idx').on(table.expiresAt),
      revokedAtIdx: index('sessions_revoked_at_idx').on(table.revokedAt),
    };
  }
);

// Password reset tokens table
export const passwordResetTokens = pgTable(
  'password_reset_tokens',
  {
    id: uuid('id').primaryKey().defaultRandom(),
    userId: uuid('user_id')
      .references(() => users.id, { onDelete: 'cascade' })
      .notNull(),
    token: varchar('token', { length: 255 }).notNull().unique(),
    purpose: varchar('purpose', { length: 50 }).notNull().default('password_reset'),
    metadata: jsonb('metadata').notNull().default({}),
    expiresAt: timestamp('expires_at').notNull(),
    createdAt: timestamp('created_at').defaultNow().notNull(),
  },
  (table) => {
    return {
      tokenIdx: uniqueIndex('password_reset_tokens_token_idx').on(table.token),
      userIdIdx: index('password_reset_tokens_user_id_idx').on(table.userId),
      purposeIdx: index('password_reset_tokens_purpose_idx').on(table.purpose),
      expiresAtIdx: index('password_reset_tokens_expires_at_idx').on(table.expiresAt),
    };
  }
);

// User feedback table (bug reports, feature requests)
export const userFeedback = pgTable(
  'user_feedback',
  {
    id: uuid('id').primaryKey().defaultRandom(),
    userId: uuid('user_id').references(() => users.id, { onDelete: 'set null' }),
    category: varchar('category', { length: 20 }).notNull(), // 'bug' | 'feature' | 'other'
    message: text('message').notNull(),
    email: varchar('email', { length: 255 }),
    screenshotUrl: text('screenshot_url'),
    context: jsonb('context').default({}), // { platform, userAgent, url?, reportedScreen }
    createdAt: timestamp('created_at').defaultNow().notNull(),
  },
  (table) => {
    return {
      userIdIdx: index('user_feedback_user_id_idx').on(table.userId),
      createdAtIdx: index('user_feedback_created_at_idx').on(table.createdAt),
      categoryIdx: index('user_feedback_category_idx').on(table.category),
    };
  }
);

export type UserFeedback = typeof userFeedback.$inferSelect;
export type NewUserFeedback = typeof userFeedback.$inferInsert;

// Data privacy request queue for export/deletion support workflows
export const dataPrivacyRequests = pgTable(
  'data_privacy_requests',
  {
    id: uuid('id').primaryKey().defaultRandom(),
    userId: uuid('user_id').references(() => users.id, { onDelete: 'set null' }),
    requesterEmail: varchar('requester_email', { length: 255 }),
    requestType: varchar('request_type', { length: 20 }).notNull(), // 'export' | 'deletion'
    status: varchar('status', { length: 20 }).notNull().default('open'), // 'open' | 'in_review' | 'fulfilled' | 'rejected' | 'canceled'
    message: text('message'),
    adminNotes: text('admin_notes'),
    reviewedByUserId: uuid('reviewed_by_user_id').references(() => users.id, {
      onDelete: 'set null',
    }),
    reviewedAt: timestamp('reviewed_at', { withTimezone: true }),
    fulfilledAt: timestamp('fulfilled_at', { withTimezone: true }),
    createdAt: timestamp('created_at', { withTimezone: true }).defaultNow().notNull(),
    updatedAt: timestamp('updated_at', { withTimezone: true }).defaultNow().notNull(),
  },
  (table) => {
    return {
      userIdIdx: index('data_privacy_requests_user_id_idx').on(table.userId, table.createdAt),
      statusIdx: index('data_privacy_requests_status_idx').on(table.status, table.createdAt),
      requestTypeIdx: index('data_privacy_requests_request_type_idx').on(
        table.requestType,
        table.createdAt
      ),
    };
  }
);

export type DataPrivacyRequest = typeof dataPrivacyRequests.$inferSelect;
export type NewDataPrivacyRequest = typeof dataPrivacyRequests.$inferInsert;

// Type exports
export type User = typeof users.$inferSelect;
export type NewUser = typeof users.$inferInsert;

export type OAuthIdentity = typeof oauthIdentities.$inferSelect;
export type NewOAuthIdentity = typeof oauthIdentities.$inferInsert;

export type Session = typeof sessions.$inferSelect;
export type NewSession = typeof sessions.$inferInsert;

export type PasswordResetToken = typeof passwordResetTokens.$inferSelect;
export type NewPasswordResetToken = typeof passwordResetTokens.$inferInsert;

// User consent records (legal/account/child data consent audit log)
export const userConsentRecords = pgTable(
  'user_consent_records',
  {
    id: uuid('id').primaryKey().defaultRandom(),
    userId: uuid('user_id')
      .references(() => users.id, { onDelete: 'cascade' })
      .notNull(),
    consentType: varchar('consent_type', { length: 64 }).notNull(),
    documentVersion: varchar('document_version', { length: 64 }).notNull(),
    acceptedAt: timestamp('accepted_at', { withTimezone: true }).defaultNow().notNull(),
    ipAddress: inet('ip_address'),
    userAgent: text('user_agent'),
    context: jsonb('context').default({}).notNull(),
    createdAt: timestamp('created_at', { withTimezone: true }).defaultNow().notNull(),
  },
  (table) => {
    return {
      userTypeIdx: index('user_consent_records_user_type_idx').on(
        table.userId,
        table.consentType,
        table.acceptedAt
      ),
      uniqueUserTypeVersionIdx: uniqueIndex('user_consent_records_user_type_version_uidx').on(
        table.userId,
        table.consentType,
        table.documentVersion
      ),
    };
  }
);

export type UserConsentRecord = typeof userConsentRecords.$inferSelect;
export type NewUserConsentRecord = typeof userConsentRecords.$inferInsert;

// Plans table
export const plans = pgTable(
  'plans',
  {
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
  },
  (table) => {
    return {
      slugIdx: uniqueIndex('plans_slug_idx').on(table.slug),
      isActiveIdx: index('plans_is_active_idx').on(table.isActive),
    };
  }
);

export const planPrices = pgTable(
  'plan_prices',
  {
    id: uuid('id').primaryKey().defaultRandom(),
    planId: uuid('plan_id')
      .references(() => plans.id, { onDelete: 'cascade' })
      .notNull(),
    pricingCurrency: varchar('pricing_currency', { length: 3 }).notNull(),
    priceMonthly: integer('price_monthly').notNull(),
    stripePriceId: varchar('stripe_price_id', { length: 255 }),
    createdAt: timestamp('created_at').defaultNow().notNull(),
    updatedAt: timestamp('updated_at').defaultNow().notNull(),
  },
  (table) => {
    return {
      planCurrencyIdx: uniqueIndex('plan_prices_plan_currency_uidx').on(
        table.planId,
        table.pricingCurrency
      ),
      planIdIdx: index('plan_prices_plan_id_idx').on(table.planId),
      currencyIdx: index('plan_prices_currency_idx').on(table.pricingCurrency),
    };
  }
);

// Features table
export const features = pgTable(
  'features',
  {
    id: uuid('id').primaryKey().defaultRandom(),
    slug: varchar('slug', { length: 100 }).notNull().unique(),
    name: varchar('name', { length: 100 }).notNull(),
    description: text('description'),
    featureType: varchar('feature_type', { length: 20 }).notNull(), // 'boolean' | 'numeric' | 'enum'
    defaultValue: jsonb('default_value').notNull(), // type-specific default
    category: varchar('category', { length: 50 }).notNull(),
    createdAt: timestamp('created_at').defaultNow().notNull(),
    updatedAt: timestamp('updated_at').defaultNow().notNull(),
  },
  (table) => {
    return {
      slugIdx: uniqueIndex('features_slug_idx').on(table.slug),
      categoryIdx: index('features_category_idx').on(table.category),
    };
  }
);

// Plan features mapping table
export const planFeatures = pgTable(
  'plan_features',
  {
    id: uuid('id').primaryKey().defaultRandom(),
    planId: uuid('plan_id')
      .references(() => plans.id, { onDelete: 'cascade' })
      .notNull(),
    featureId: uuid('feature_id')
      .references(() => features.id, { onDelete: 'cascade' })
      .notNull(),
    value: jsonb('value').notNull(), // type-specific value
    createdAt: timestamp('created_at').defaultNow().notNull(),
    updatedAt: timestamp('updated_at').defaultNow().notNull(),
  },
  (table) => {
    return {
      planIdIdx: index('plan_features_plan_id_idx').on(table.planId),
      featureIdIdx: index('plan_features_feature_id_idx').on(table.featureId),
      uniqueIdx: uniqueIndex('plan_features_unique_idx').on(table.planId, table.featureId),
    };
  }
);

// User subscriptions table
export const userSubscriptions = pgTable(
  'user_subscriptions',
  {
    id: uuid('id').primaryKey().defaultRandom(),
    userId: uuid('user_id')
      .references(() => users.id, { onDelete: 'cascade' })
      .notNull()
      .unique(),
    planId: uuid('plan_id')
      .references(() => plans.id, { onDelete: 'restrict' })
      .notNull(),
    status: varchar('status', { length: 20 }).notNull().default('active'), // Stripe/app status: active, trialing, past_due, unpaid, canceled, expired
    trialEndsAt: timestamp('trial_ends_at'),
    storiesUsed: integer('stories_used').notNull().default(0),
    audioMinutesUsed: integer('audio_minutes_used').notNull().default(0),
    resetAt: timestamp('reset_at').notNull(),
    currentPeriodStart: timestamp('current_period_start').notNull(),
    currentPeriodEnd: timestamp('current_period_end').notNull(),
    cancelAtPeriodEnd: boolean('cancel_at_period_end').notNull().default(false),
    stripeSubscriptionId: varchar('stripe_subscription_id', { length: 255 }),
    paymentProvider: varchar('payment_provider', { length: 20 }), // 'stripe' | 'revenuecat' | null
    metadata: jsonb('metadata'),
    createdAt: timestamp('created_at').defaultNow().notNull(),
    updatedAt: timestamp('updated_at').defaultNow().notNull(),
  },
  (table) => {
    return {
      userIdIdx: uniqueIndex('user_subscriptions_user_id_idx').on(table.userId),
      planIdIdx: index('user_subscriptions_plan_id_idx').on(table.planId),
      statusIdx: index('user_subscriptions_status_idx').on(table.status),
      resetAtIdx: index('user_subscriptions_reset_at_idx').on(table.resetAt),
    };
  }
);

// Story bundles (extra story + audio quota for current billing period)
export const storyBundles = pgTable(
  'story_bundles',
  {
    id: uuid('id').primaryKey().defaultRandom(),
    slug: varchar('slug', { length: 64 }).notNull().unique(),
    name: varchar('name', { length: 200 }).notNull(),
    extraStories: integer('extra_stories').notNull(),
    extraAudio: integer('extra_audio').notNull(),
    sortOrder: integer('sort_order').notNull().default(0),
    isActive: boolean('is_active').notNull().default(true),
    createdAt: timestamp('created_at').defaultNow().notNull(),
    updatedAt: timestamp('updated_at').defaultNow().notNull(),
  },
  (table) => ({
    activeSortIdx: index('story_bundles_active_sort_idx').on(table.isActive, table.sortOrder),
  })
);

export const planBundlePrices = pgTable(
  'plan_bundle_prices',
  {
    id: uuid('id').primaryKey().defaultRandom(),
    planId: uuid('plan_id')
      .references(() => plans.id, { onDelete: 'cascade' })
      .notNull(),
    bundleId: uuid('bundle_id')
      .references(() => storyBundles.id, { onDelete: 'cascade' })
      .notNull(),
    priceMinor: integer('price_minor').notNull(),
    pricingCurrency: varchar('pricing_currency', { length: 3 }).notNull().default('USD'),
    stripePriceId: varchar('stripe_price_id', { length: 255 }),
    createdAt: timestamp('created_at').defaultNow().notNull(),
    updatedAt: timestamp('updated_at').defaultNow().notNull(),
  },
  (table) => ({
    planBundleCurrencyUnique: uniqueIndex('plan_bundle_prices_plan_bundle_currency_uidx').on(
      table.planId,
      table.bundleId,
      table.pricingCurrency
    ),
    planIdIdx: index('plan_bundle_prices_plan_id_idx').on(table.planId),
    bundleIdIdx: index('plan_bundle_prices_bundle_id_idx').on(table.bundleId),
  })
);

export const userBundleGrants = pgTable(
  'user_bundle_grants',
  {
    id: uuid('id').primaryKey().defaultRandom(),
    userId: uuid('user_id')
      .references(() => users.id, { onDelete: 'cascade' })
      .notNull(),
    bundleId: uuid('bundle_id')
      .references(() => storyBundles.id, { onDelete: 'restrict' })
      .notNull(),
    subscriptionPeriodStart: timestamp('subscription_period_start').notNull(),
    subscriptionPeriodEnd: timestamp('subscription_period_end').notNull(),
    extraStories: integer('extra_stories').notNull(),
    extraAudio: integer('extra_audio').notNull(),
    source: varchar('source', { length: 20 }).notNull().default('stripe'),
    stripeCheckoutSessionId: varchar('stripe_checkout_session_id', { length: 255 }),
    createdAt: timestamp('created_at').defaultNow().notNull(),
  },
  (table) => ({
    userPeriodIdx: index('user_bundle_grants_user_period_idx').on(
      table.userId,
      table.subscriptionPeriodStart,
      table.subscriptionPeriodEnd
    ),
  })
);

export type StoryBundle = typeof storyBundles.$inferSelect;
export type NewStoryBundle = typeof storyBundles.$inferInsert;
export type PlanBundlePrice = typeof planBundlePrices.$inferSelect;
export type NewPlanBundlePrice = typeof planBundlePrices.$inferInsert;
export type UserBundleGrant = typeof userBundleGrants.$inferSelect;
export type NewUserBundleGrant = typeof userBundleGrants.$inferInsert;

// Child profiles table
export const childProfiles = pgTable(
  'child_profiles',
  {
    id: uuid('id').primaryKey().defaultRandom(),
    userId: uuid('user_id')
      .references(() => users.id, { onDelete: 'cascade' })
      .notNull(),
    name: varchar('name', { length: 100 }).notNull(),
    birthDate: date('birth_date').notNull(),
    storyCreationMode: varchar('story_creation_mode', { length: 20 }).notNull().default('instant'),
    languages: jsonb('languages').notNull(), // array of language codes
    referencePhotos: jsonb('reference_photos'), // array of photo objects
    appearanceTraits: jsonb('appearance_traits'), // structured appearance data
    personality: jsonb('personality'), // traits and activities
    interests: jsonb('interests'), // array of interests
    sensitivities: jsonb('sensitivities'), // fears and topics to avoid
    familyCast: jsonb('family_cast'), // family member names
    // AI-generated fields from Gemini Vision analysis
    aiGeneratedDescription: text('ai_generated_description'), // Detailed narrative description
    descriptionEn: text('description_en'), // English translation of description for image prompts
    descriptionLanguage: varchar('description_language', { length: 10 }), // Language code of original description (e.g. 'uk', 'en', 'fr')
    clothing: jsonb('clothing'), // Structured clothing data
    distinctiveFeatures: jsonb('distinctive_features'), // Array of distinctive features
    turnaroundSheet: jsonb('turnaround_sheet'), // { url, generatedAt, sourcePhotoUrl } for 3D turnaround model sheet
    authorPseudonym: varchar('author_pseudonym', { length: 100 }),
    authorAboutMe: text('author_about_me'),
    childModeEnabled: boolean('child_mode_enabled').notNull().default(false),
    childModePasscodeHash: text('child_mode_passcode_hash'),
    childModePasscodeSetAt: timestamp('child_mode_passcode_set_at'),
    childModeSettings: jsonb('child_mode_settings').notNull().default({
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
    }),
    isActive: boolean('is_active').notNull().default(true),
    createdAt: timestamp('created_at').defaultNow().notNull(),
    updatedAt: timestamp('updated_at').defaultNow().notNull(),
  },
  (table) => {
    return {
      userIdIdx: index('child_profiles_user_id_idx').on(table.userId),
      birthDateIdx: index('child_profiles_birth_date_idx').on(table.birthDate),
      childModeEnabledIdx: index('child_profiles_child_mode_enabled_idx').on(
        table.childModeEnabled
      ),
      isActiveIdx: index('child_profiles_is_active_idx').on(table.isActive),
    };
  }
);

// Characters table (people, pets, imaginary creatures)
export const characters = pgTable(
  'characters',
  {
    id: uuid('id').primaryKey().defaultRandom(),
    userId: uuid('user_id')
      .references(() => users.id, { onDelete: 'cascade' })
      .notNull(),
    childProfileId: uuid('child_profile_id').references(() => childProfiles.id, {
      onDelete: 'set null',
    }),
    name: varchar('name', { length: 100 }).notNull(),
    type: varchar('type', { length: 50 }).notNull(), // 'person' | 'animal' | 'imaginary'
    subtype: varchar('subtype', { length: 50 }), // 'mother', 'dog', 'dragon', etc.
    referencePhotos: jsonb('reference_photos'), // array of photo objects
    appearanceTraits: jsonb('appearance_traits'), // type-specific structured data
    personality: jsonb('personality'), // traits and activities
    description: text('description'),
    // AI-generated fields from Gemini Vision analysis
    aiGeneratedDescription: text('ai_generated_description'), // Detailed narrative description
    clothing: jsonb('clothing'), // Structured clothing data
    distinctiveFeatures: jsonb('distinctive_features'), // Array of distinctive features
    turnaroundSheet: jsonb('turnaround_sheet'), // { url, generatedAt, sourcePhotoUrl } for imaginary characters
    descriptionEn: text('description_en'), // English translation of description for image prompts
    descriptionLanguage: varchar('description_language', { length: 10 }), // Language code of original description (e.g. 'uk', 'en', 'fr')
    isHidden: boolean('is_hidden').notNull().default(false), // LLM-generated characters hidden from UI
    descriptionEmbedding: jsonb('description_embedding'), // Gemini text-embedding-004 vector (number[]) for similarity matching
    createdByMode: varchar('created_by_mode', { length: 20 }).notNull().default('parent'), // 'parent' | 'child'
    createdByChildProfileId: uuid('created_by_child_profile_id').references(
      () => childProfiles.id,
      { onDelete: 'set null' }
    ),
    isActive: boolean('is_active').notNull().default(true),
    createdAt: timestamp('created_at').defaultNow().notNull(),
    updatedAt: timestamp('updated_at').defaultNow().notNull(),
  },
  (table) => {
    return {
      userIdIdx: index('characters_user_id_idx').on(table.userId),
      childProfileIdIdx: index('characters_child_profile_id_idx').on(table.childProfileId),
      typeIdx: index('characters_type_idx').on(table.type),
      createdByModeIdx: index('characters_created_by_mode_idx').on(table.createdByMode),
      createdByChildProfileIdIdx: index('characters_created_by_child_profile_id_idx').on(
        table.createdByChildProfileId
      ),
      isActiveIdx: index('characters_is_active_idx').on(table.isActive),
    };
  }
);

// Usage events table
export const usageEvents = pgTable(
  'usage_events',
  {
    id: uuid('id').primaryKey().defaultRandom(),
    userId: uuid('user_id')
      .references(() => users.id, { onDelete: 'cascade' })
      .notNull(),
    childProfileId: uuid('child_profile_id').references(() => childProfiles.id, {
      onDelete: 'set null',
    }),
    eventType: varchar('event_type', { length: 50 }).notNull(), // 'story_created', 'image_generated', 'audio_synthesized'
    resourceType: varchar('resource_type', { length: 50 }).notNull(), // 'story', 'image', 'audio'
    quantity: integer('quantity').notNull().default(1),
    metadata: jsonb('metadata'),
    createdAt: timestamp('created_at').defaultNow().notNull(),
  },
  (table) => {
    return {
      userIdIdx: index('usage_events_user_id_idx').on(table.userId),
      createdAtIdx: index('usage_events_created_at_idx').on(table.createdAt),
      eventTypeIdx: index('usage_events_type_idx').on(table.eventType),
    };
  }
);

export type Plan = typeof plans.$inferSelect;
export type NewPlan = typeof plans.$inferInsert;
export type PlanPrice = typeof planPrices.$inferSelect;
export type NewPlanPrice = typeof planPrices.$inferInsert;

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

// Content policy rules table
export const contentPolicyRules = pgTable('content_policy_rules', {
  id: varchar('id', { length: 50 }).primaryKey(),
  category: varchar('category', { length: 100 }).notNull(),
  promptGuidance: text('prompt_guidance').notNull(),
  sortOrder: integer('sort_order').notNull().default(0),
});

// Age engine rules table
export const ageEngineRules = pgTable('age_engine_rules', {
  ageGroup: varchar('age_group', { length: 10 }).primaryKey(),
  sceneCount: integer('scene_count').notNull(),
  wordRangeMin: integer('word_range_min').notNull(),
  wordRangeMax: integer('word_range_max').notNull(),
  maxSentenceLength: integer('max_sentence_length').notNull(),
  dialogRatio: decimal('dialog_ratio', { precision: 3, scale: 2 }).notNull(),
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

// Scenario plot examples table (diverse settings per scenario card)
export const scenarioPlotExamples = pgTable('scenario_plot_examples', {
  id: uuid('id').primaryKey().defaultRandom(),
  scenarioCardId: varchar('scenario_card_id', { length: 100 })
    .references(() => scenarioCards.id, { onDelete: 'cascade' })
    .notNull(),
  setting: text('setting').notNull(),
  sortOrder: integer('sort_order').notNull().default(0),
  isActive: boolean('is_active').notNull().default(true),
  createdAt: timestamp('created_at', { withTimezone: true }).notNull().defaultNow(),
});

// Scenario world rules table (world rules per scenario card)
export const scenarioWorldRules = pgTable('scenario_world_rules', {
  id: uuid('id').primaryKey().defaultRandom(),
  scenarioCardId: varchar('scenario_card_id', { length: 100 })
    .references(() => scenarioCards.id, { onDelete: 'cascade' })
    .notNull(),
  name: varchar('name', { length: 100 }).notNull(),
  description: text('description').notNull(),
  sortOrder: integer('sort_order').notNull().default(0),
  isActive: boolean('is_active').notNull().default(true),
  createdAt: timestamp('created_at', { withTimezone: true }).notNull().defaultNow(),
});

// Story artifact catalog used as concrete closing keepsakes in generated stories
export const storyArtifacts = pgTable(
  'story_artifacts',
  {
    id: uuid('id').primaryKey().defaultRandom(),
    artifactCode: varchar('artifact_code', { length: 3 }).notNull(),
    title: varchar('title', { length: 120 }).notNull(),
    description: text('description').notNull(),
    imagePath: text('image_path').notNull(),
    semanticTags: jsonb('semantic_tags').$type<string[]>().notNull().default([]),
    scenarioAffinities: jsonb('scenario_affinities').$type<string[]>().notNull().default([]),
    descriptionEmbedding: jsonb('description_embedding').$type<number[]>(),
    embeddingModel: varchar('embedding_model', { length: 80 }),
    isActive: boolean('is_active').notNull().default(true),
    createdAt: timestamp('created_at', { withTimezone: true }).notNull().defaultNow(),
    updatedAt: timestamp('updated_at', { withTimezone: true }).notNull().defaultNow(),
  },
  (table) => {
    return {
      artifactCodeIdx: uniqueIndex('story_artifacts_artifact_code_uidx').on(table.artifactCode),
      activeIdx: index('story_artifacts_active_idx').on(table.isActive),
      scenarioAffinitiesIdx: index('story_artifacts_scenario_affinities_idx').on(
        table.scenarioAffinities
      ),
      semanticTagsIdx: index('story_artifacts_semantic_tags_idx').on(table.semanticTags),
    };
  }
);

// Translations table (M6)
export const translations = pgTable(
  'translations',
  {
    id: uuid('id').primaryKey().defaultRandom(),
    entityType: varchar('entity_type', { length: 50 }).notNull(), // 'story_goal' | 'scenario_card' | 'character'
    entityId: varchar('entity_id', { length: 100 }).notNull(),
    locale: varchar('locale', { length: 5 }).notNull(), // 'uk' | 'ru' | 'en' | 'es'
    fieldName: varchar('field_name', { length: 50 }).notNull(), // 'name' | 'description'
    value: text('value').notNull(),
    createdAt: timestamp('created_at').defaultNow().notNull(),
    updatedAt: timestamp('updated_at').defaultNow().notNull(),
  },
  (table) => {
    return {
      uniqueConstraint: uniqueIndex('translations_unique').on(
        table.entityType,
        table.entityId,
        table.locale,
        table.fieldName
      ),
      lookupIdx: index('idx_translations_lookup').on(
        table.entityType,
        table.entityId,
        table.locale
      ),
      entityIdx: index('idx_translations_entity').on(table.entityType, table.entityId),
      localeIdx: index('idx_translations_locale').on(table.locale),
    };
  }
);

// ==========================================
// STORY GENERATION TABLES (M3)
// ==========================================

// Story requests table
export const storyRequests = pgTable(
  'story_requests',
  {
    id: uuid('id').primaryKey().defaultRandom(),
    userId: uuid('user_id')
      .references(() => users.id, { onDelete: 'cascade' })
      .notNull(),
    childProfileId: uuid('child_profile_id').references(() => childProfiles.id, {
      onDelete: 'set null',
    }),

    uiLocale: varchar('ui_locale', { length: 5 }).notNull(),
    storyLanguage: varchar('story_language', { length: 5 }).notNull(),
    goal: varchar('goal', { length: 50 }).references(() => storyGoals.slug),
    scenarioCardId: varchar('scenario_card_id', { length: 100 }).references(() => scenarioCards.id),
    imageStyle: varchar('image_style', { length: 50 }), // Image art style (soft_watercolor, etc.)
    userNotes: text('user_notes'),
    selectedCharacters: jsonb('selected_characters'), // Array of character UUIDs selected by user
    selectedChildren: jsonb('selected_children'), // NEW: Array of child profile UUIDs to include in story
    createdByMode: varchar('created_by_mode', { length: 20 }).notNull().default('parent'), // 'parent' | 'child'
    createdByChildProfileId: uuid('created_by_child_profile_id').references(
      () => childProfiles.id,
      { onDelete: 'set null' }
    ),
    parentReviewRequired: boolean('parent_review_required').notNull().default(false),

    status: varchar('status', { length: 20 }).notNull().default('pending'),
    progress: integer('progress').default(0),
    progressData: jsonb('progress_data'), // Task-based progress tracking (activeTasks, completedTasks)
    intermediateData: jsonb('intermediate_data'), // Checkpoints for retry (outline, text, validation)

    storyId: uuid('story_id'), // FK constraint added in migration, not in schema to avoid circular reference

    errorMessage: text('error_message'),
    retryCount: integer('retry_count').default(0),

    createdAt: timestamp('created_at').defaultNow().notNull(),
    updatedAt: timestamp('updated_at').defaultNow().notNull(),
  },
  (table) => {
    return {
      userIdIdx: index('story_requests_user_id_idx').on(table.userId),
      createdByModeIdx: index('story_requests_created_by_mode_idx').on(table.createdByMode),
      createdByChildProfileIdIdx: index('story_requests_created_by_child_profile_id_idx').on(
        table.createdByChildProfileId
      ),
      statusIdx: index('story_requests_status_idx').on(table.status),
      createdAtIdx: index('story_requests_created_at_idx').on(table.createdAt),
    };
  }
);

// Story Series table (M8)
export const storySeries = pgTable(
  'story_series',
  {
    id: uuid('id').primaryKey().defaultRandom(),
    userId: uuid('user_id')
      .references(() => users.id, { onDelete: 'cascade' })
      .notNull(),
    childProfileId: uuid('child_profile_id').references(() => childProfiles.id, {
      onDelete: 'set null',
    }),

    baseTitle: varchar('base_title', { length: 255 }).notNull(),
    language: varchar('language', { length: 5 }).notNull(),
    ageGroup: varchar('age_group', { length: 10 }).notNull(),
    imageStyle: varchar('image_style', { length: 50 }).notNull(),

    totalParts: integer('total_parts').notNull().default(1),
    storyIds: jsonb('story_ids').notNull().$type<string[]>().default([]),
    continuationContext: jsonb('continuation_context'),

    createdAt: timestamp('created_at').defaultNow().notNull(),
    updatedAt: timestamp('updated_at').defaultNow().notNull(),
  },
  (table) => {
    return {
      userIdIdx: index('story_series_user_id_idx').on(table.userId),
      createdAtIdx: index('story_series_created_at_idx').on(table.createdAt),
    };
  }
);

// Series schedules (scheduled continuations)
export const seriesSchedules = pgTable(
  'series_schedules',
  {
    id: uuid('id').primaryKey().defaultRandom(),
    seriesId: uuid('series_id')
      .references(() => storySeries.id, { onDelete: 'cascade' })
      .notNull(),
    userId: uuid('user_id')
      .references(() => users.id, { onDelete: 'cascade' })
      .notNull(),
    cadence: varchar('cadence', { length: 20 }).notNull(),
    runAtTime: varchar('run_at_time', { length: 10 }).notNull(),
    nextRunAt: timestamp('next_run_at', { withTimezone: true }).notNull(),
    scheduledAt: timestamp('scheduled_at', { withTimezone: true }).notNull().defaultNow(),
    createdAt: timestamp('created_at', { withTimezone: true }).notNull().defaultNow(),
  },
  (table) => ({
    seriesIdUnique: uniqueIndex('series_schedules_series_id_unique').on(table.seriesId),
    nextRunIdx: index('idx_series_schedules_next_run').on(table.nextRunAt),
  })
);

// Stories table
export const stories = pgTable(
  'stories',
  {
    id: uuid('id').primaryKey().defaultRandom(),
    userId: uuid('user_id')
      .references(() => users.id, { onDelete: 'cascade' })
      .notNull(),
    childProfileId: uuid('child_profile_id').references(() => childProfiles.id, {
      onDelete: 'set null',
    }),
    storyRequestId: uuid('story_request_id').references(() => storyRequests.id, {
      onDelete: 'set null',
    }),

    title: varchar('title', { length: 255 }).notNull(),
    language: varchar('language', { length: 5 }).notNull(),
    ageGroup: varchar('age_group', { length: 10 }).notNull(),
    moralTheme: varchar('moral_theme', { length: 50 }).references(() => storyGoals.slug),

    outline: jsonb('outline'), // EpisodeOutline structure
    scenes: jsonb('scenes').notNull(), // Array of { sceneId, text, visualPrompt, imageUrl } - DEPRECATED, use scenes table
    fullText: text('full_text').notNull(),
    wordCount: integer('word_count'),
    /** Small tangible token label from `{...}` in resolution scene prose (writer convention). */
    closingKeepsakeLabel: varchar('closing_keepsake_label', { length: 500 }),
    closingArtifactId: uuid('closing_artifact_id').references(() => storyArtifacts.id, {
      onDelete: 'set null',
    }),

    modelVersion: varchar('model_version', { length: 50 }),
    generationTimeMs: integer('generation_time_ms'),
    policyChecks: jsonb('policy_checks'),
    metadata: jsonb('metadata'), // NEW: llmGeneratedCharacters, imageStyle, etc
    audioMetadata: jsonb('audio_metadata'), // M5: { voiceId, voiceName, totalDuration, generatedAt, nightMode }
    createdByMode: varchar('created_by_mode', { length: 20 }).notNull().default('parent'), // 'parent' | 'child'
    createdByChildProfileId: uuid('created_by_child_profile_id').references(
      () => childProfiles.id,
      { onDelete: 'set null' }
    ),
    parentReviewStatus: varchar('parent_review_status', { length: 20 })
      .notNull()
      .default('not_required'), // 'not_required' | 'pending' | 'approved' | 'rejected'

    // Series support (M8)
    seriesId: uuid('series_id').references(() => storySeries.id, { onDelete: 'set null' }),
    partNumber: integer('part_number'),

    isPublished: boolean('is_published').default(false),
    isFavorite: boolean('is_favorite').default(false),

    publishedAt: timestamp('published_at'),
    publishedSlug: varchar('published_slug', { length: 100 }),
    authorDisplayName: varchar('author_display_name', { length: 100 }),
    authorType: varchar('author_type', { length: 20 }).notNull().default('user'), // 'user' | 'child'
    authorChildProfileId: uuid('author_child_profile_id').references(() => childProfiles.id, {
      onDelete: 'set null',
    }),
    visibility: varchar('visibility', { length: 20 }).default('public'), // 'public' | 'unlisted'
    shareToken: varchar('share_token', { length: 64 }), // For unlisted: token for /u/:token URL
    coverAssetId: uuid('cover_asset_id').references(() => assets.id, { onDelete: 'set null' }),
    publicRenderVersion: integer('public_render_version').default(1), // Bump on publish/unpublish/audio/alignment/theme
    showOnHomePage: boolean('show_on_home_page').default(false).notNull(),

    ratingSum: integer('rating_sum').default(0).notNull(),
    ratingCount: integer('rating_count').default(0).notNull(),

    hidden: boolean('hidden').default(false).notNull(),

    createdAt: timestamp('created_at').defaultNow().notNull(),
    updatedAt: timestamp('updated_at').defaultNow().notNull(),
  },
  (table) => {
    return {
      userIdIdx: index('stories_user_id_idx').on(table.userId),
      childProfileIdIdx: index('stories_child_profile_id_idx').on(table.childProfileId),
      createdByModeIdx: index('stories_created_by_mode_idx').on(table.createdByMode),
      createdByChildProfileIdIdx: index('stories_created_by_child_profile_id_idx').on(
        table.createdByChildProfileId
      ),
      authorTypeIdx: index('stories_author_type_idx').on(table.authorType),
      authorChildProfileIdIdx: index('stories_author_child_profile_id_idx').on(
        table.authorChildProfileId
      ),
      parentReviewStatusIdx: index('stories_parent_review_status_idx').on(table.parentReviewStatus),
      languageIdx: index('stories_language_idx').on(table.language),
      ageGroupIdx: index('stories_age_group_idx').on(table.ageGroup),
      closingArtifactIdIdx: index('stories_closing_artifact_id_idx').on(table.closingArtifactId),
      createdAtIdx: index('stories_created_at_idx').on(table.createdAt),
      seriesIdIdx: index('stories_series_id_idx').on(table.seriesId),
      shareTokenIdx: index('stories_share_token_idx').on(table.shareToken),
      coverAssetIdIdx: index('stories_cover_asset_id_idx').on(table.coverAssetId),
    };
  }
);

// User/child collections of story artifacts acquired from generated stories.
export const collectedStoryArtifacts = pgTable(
  'collected_story_artifacts',
  {
    id: uuid('id').primaryKey().defaultRandom(),
    userId: uuid('user_id')
      .references(() => users.id, { onDelete: 'cascade' })
      .notNull(),
    childProfileId: uuid('child_profile_id').references(() => childProfiles.id, {
      onDelete: 'cascade',
    }),
    artifactId: uuid('artifact_id')
      .references(() => storyArtifacts.id, { onDelete: 'cascade' })
      .notNull(),
    storyId: uuid('story_id')
      .references(() => stories.id, { onDelete: 'cascade' })
      .notNull(),
    acquiredLabel: varchar('acquired_label', { length: 500 }),
    acquiredAt: timestamp('acquired_at', { withTimezone: true }).notNull().defaultNow(),
    createdAt: timestamp('created_at', { withTimezone: true }).notNull().defaultNow(),
    updatedAt: timestamp('updated_at', { withTimezone: true }).notNull().defaultNow(),
  },
  (table) => ({
    userChildAcquiredIdx: index('collected_story_artifacts_user_child_acquired_idx').on(
      table.userId,
      table.childProfileId,
      table.acquiredAt
    ),
    artifactIdx: index('collected_story_artifacts_artifact_id_idx').on(table.artifactId),
    storyIdx: index('collected_story_artifacts_story_id_idx').on(table.storyId),
  })
);

// User/child collections of generated story map tiles, including board placement.
export const collectedMapTiles = pgTable(
  'collected_map_tiles',
  {
    id: uuid('id').primaryKey().defaultRandom(),
    userId: uuid('user_id')
      .references(() => users.id, { onDelete: 'cascade' })
      .notNull(),
    childProfileId: uuid('child_profile_id').references(() => childProfiles.id, {
      onDelete: 'cascade',
    }),
    storyId: uuid('story_id')
      .references(() => stories.id, { onDelete: 'cascade' })
      .notNull(),
    assetId: uuid('asset_id').notNull(),
    acquiredLabel: varchar('acquired_label', { length: 500 }),
    maskId: varchar('mask_id', { length: 160 }).notNull(),
    connectors: jsonb('connectors').$type<Record<string, string>>().notNull().default({}),
    location: varchar('location', { length: 20 }).notNull().default('inventory'),
    boardX: integer('board_x'),
    boardY: integer('board_y'),
    inventoryOrder: integer('inventory_order').notNull().default(0),
    acquiredAt: timestamp('acquired_at', { withTimezone: true }).notNull().defaultNow(),
    createdAt: timestamp('created_at', { withTimezone: true }).notNull().defaultNow(),
    updatedAt: timestamp('updated_at', { withTimezone: true }).notNull().defaultNow(),
  },
  (table) => ({
    parentStoryIdx: uniqueIndex('collected_map_tiles_parent_story_uidx')
      .on(table.userId, table.storyId)
      .where(sql`${table.childProfileId} IS NULL`),
    childStoryIdx: uniqueIndex('collected_map_tiles_child_story_uidx')
      .on(table.userId, table.childProfileId, table.storyId)
      .where(sql`${table.childProfileId} IS NOT NULL`),
    userChildLocationIdx: index('collected_map_tiles_user_child_location_idx').on(
      table.userId,
      table.childProfileId,
      table.location,
      table.inventoryOrder
    ),
    boardIdx: index('collected_map_tiles_board_idx').on(
      table.userId,
      table.childProfileId,
      table.boardX,
      table.boardY
    ),
    storyIdx: index('collected_map_tiles_story_id_idx').on(table.storyId),
    assetIdx: index('collected_map_tiles_asset_id_idx').on(table.assetId),
  })
);

// Safe moderation audit trail for support review. Stores categories/codes and hashed refs, not raw child content.
export const moderationDecisionEvents = pgTable(
  'moderation_decision_events',
  {
    id: uuid('id').primaryKey().defaultRandom(),
    userId: uuid('user_id').references(() => users.id, { onDelete: 'set null' }),
    storyId: uuid('story_id').references(() => stories.id, { onDelete: 'set null' }),
    storyRequestId: uuid('story_request_id').references(() => storyRequests.id, {
      onDelete: 'set null',
    }),
    childProfileId: uuid('child_profile_id').references(() => childProfiles.id, {
      onDelete: 'set null',
    }),
    stage: varchar('stage', { length: 80 }).notNull(),
    source: varchar('source', { length: 120 }).notNull(),
    subjectType: varchar('subject_type', { length: 40 }).notNull(),
    subjectRefHash: varchar('subject_ref_hash', { length: 64 }),
    decision: varchar('decision', { length: 40 }).notNull(),
    code: varchar('code', { length: 120 }),
    category: varchar('category', { length: 120 }),
    ruleId: varchar('rule_id', { length: 160 }),
    metadata: jsonb('metadata').default({}).notNull(),
    createdAt: timestamp('created_at', { withTimezone: true }).defaultNow().notNull(),
  },
  (table) => {
    return {
      createdAtIdx: index('moderation_decision_events_created_at_idx').on(table.createdAt),
      userCreatedAtIdx: index('moderation_decision_events_user_created_at_idx').on(
        table.userId,
        table.createdAt
      ),
      storyCreatedAtIdx: index('moderation_decision_events_story_created_at_idx').on(
        table.storyId,
        table.createdAt
      ),
      decisionCreatedAtIdx: index('moderation_decision_events_decision_created_at_idx').on(
        table.decision,
        table.createdAt
      ),
      stageCreatedAtIdx: index('moderation_decision_events_stage_created_at_idx').on(
        table.stage,
        table.createdAt
      ),
    };
  }
);

// Story ratings (public voting, 1-5 emoji scale)
export const storyRatings = pgTable(
  'story_ratings',
  {
    id: uuid('id').primaryKey().defaultRandom(),
    storyId: uuid('story_id')
      .references(() => stories.id, { onDelete: 'cascade' })
      .notNull(),
    voterId: varchar('voter_id', { length: 64 }).notNull(),
    ipAddress: inet('ip_address').notNull(),
    rating: integer('rating').notNull(), // 1-5
    createdAt: timestamp('created_at').defaultNow().notNull(),
  },
  (table) => {
    return {
      storyIdIdx: index('idx_story_ratings_story').on(table.storyId),
      uniqueVoterIdx: uniqueIndex('story_ratings_story_voter_unique').on(
        table.storyId,
        table.voterId
      ),
      uniqueIpIdx: uniqueIndex('story_ratings_story_ip_unique').on(table.storyId, table.ipAddress),
    };
  }
);

// Story characters junction table
export const storyCharacters = pgTable(
  'story_characters',
  {
    id: uuid('id').primaryKey().defaultRandom(),
    storyId: uuid('story_id')
      .references(() => stories.id, { onDelete: 'cascade' })
      .notNull(),
    characterId: uuid('character_id')
      .references(() => characters.id, { onDelete: 'cascade' })
      .notNull(),
    role: varchar('role', { length: 255 }),

    createdAt: timestamp('created_at').defaultNow().notNull(),
  },
  (table) => {
    return {
      storyIdIdx: index('story_characters_story_id_idx').on(table.storyId),
      characterIdIdx: index('story_characters_character_id_idx').on(table.characterId),
      uniqueIdx: uniqueIndex('story_characters_unique_idx').on(table.storyId, table.characterId),
    };
  }
);

// AI usage events table (cost tracking)
export const aiUsageEvents = pgTable(
  'ai_usage_events',
  {
    id: uuid('id').primaryKey().defaultRandom(),
    userId: uuid('user_id').references(() => users.id, { onDelete: 'cascade' }),
    storyId: uuid('story_id').references(() => stories.id, { onDelete: 'set null' }),
    characterId: uuid('character_id').references(() => characters.id, { onDelete: 'set null' }),
    childProfileId: uuid('child_profile_id').references(() => childProfiles.id, {
      onDelete: 'set null',
    }),

    provider: varchar('provider', { length: 50 }).notNull(),
    operation: varchar('operation', { length: 80 }).notNull(),
    model: varchar('model', { length: 100 }),

    inputUnits: integer('input_units'),
    outputUnits: integer('output_units'),
    costUsd: decimal('cost_usd', { precision: 12, scale: 8 }),
    durationMs: integer('duration_ms'),

    metadata: jsonb('metadata'),
    createdAt: timestamp('created_at').defaultNow().notNull(),
  },
  (table) => {
    return {
      userIdCreatedAtIdx: index('idx_ai_usage_user_created').on(table.userId, table.createdAt),
      storyIdIdx: index('idx_ai_usage_story').on(table.storyId),
      providerOpIdx: index('idx_ai_usage_provider_op').on(table.provider, table.operation),
    };
  }
);

/** Vision model validation per image attempt (analytics; image_storage_path matches asset path convention). */
export const imageValidationResults = pgTable(
  'image_validation_results',
  {
    id: uuid('id').primaryKey().defaultRandom(),
    storyId: uuid('story_id')
      .references(() => stories.id, { onDelete: 'cascade' })
      .notNull(),
    sceneIndex: integer('scene_index').notNull(),
    attempt: integer('attempt').notNull(),
    imageStoragePath: text('image_storage_path').notNull(),
    validationScore: integer('validation_score'),
    validationStatus: varchar('validation_status', { length: 40 }).notNull().default('completed'),
    visionModel: varchar('vision_model', { length: 100 }),
    requestManifest: jsonb('request_manifest'),
    providerError: text('provider_error'),
    result: jsonb('result').notNull(),
    createdAt: timestamp('created_at', { withTimezone: true }).defaultNow().notNull(),
  },
  (table) => ({
    storyIdx: index('idx_image_validation_results_story').on(table.storyId),
    storySceneCreatedIdx: index('idx_image_validation_results_story_scene_created').on(
      table.storyId,
      table.sceneIndex,
      table.createdAt
    ),
  })
);

export const storyDirectorScenes = pgTable(
  'story_director_scenes',
  {
    id: uuid('id').primaryKey().defaultRandom(),
    storyId: uuid('story_id')
      .references(() => stories.id, { onDelete: 'cascade' })
      .notNull(),
    sceneIndex: integer('scene_index').notNull(),
    environmentId: text('environment_id'),
    characterOutfitIds: jsonb('character_outfit_ids'),
    sceneVisual: jsonb('scene_visual'),
    illustrationBlockIndex: integer('illustration_block_index').notNull(),
    isBlockAnchor: boolean('is_block_anchor').notNull(),
    createdAt: timestamp('created_at', { withTimezone: true }).defaultNow().notNull(),
  },
  (table) => ({
    storyIdx: index('idx_story_director_scenes_story').on(table.storyId),
    storySceneIdx: index('idx_story_director_scenes_story_scene').on(
      table.storyId,
      table.sceneIndex
    ),
  })
);

export type StoryGoal = typeof storyGoals.$inferSelect;
export type NewStoryGoal = typeof storyGoals.$inferInsert;

export type ContentPolicyRule = typeof contentPolicyRules.$inferSelect;
export type NewContentPolicyRule = typeof contentPolicyRules.$inferInsert;

export type AgeEngineRule = typeof ageEngineRules.$inferSelect;
export type NewAgeEngineRule = typeof ageEngineRules.$inferInsert;

export type ScenarioCard = typeof scenarioCards.$inferSelect;
export type NewScenarioCard = typeof scenarioCards.$inferInsert;

export type ScenarioPlotExample = typeof scenarioPlotExamples.$inferSelect;
export type NewScenarioPlotExample = typeof scenarioPlotExamples.$inferInsert;

export type ScenarioWorldRule = typeof scenarioWorldRules.$inferSelect;
export type NewScenarioWorldRule = typeof scenarioWorldRules.$inferInsert;

export type StoryArtifact = typeof storyArtifacts.$inferSelect;
export type NewStoryArtifact = typeof storyArtifacts.$inferInsert;

export type Translation = typeof translations.$inferSelect;
export type NewTranslation = typeof translations.$inferInsert;

export type StoryRequest = typeof storyRequests.$inferSelect;
export type NewStoryRequest = typeof storyRequests.$inferInsert;

export type StorySeries = typeof storySeries.$inferSelect;
export type NewStorySeries = typeof storySeries.$inferInsert;

export type Story = typeof stories.$inferSelect;
export type NewStory = typeof stories.$inferInsert;

export type CollectedStoryArtifact = typeof collectedStoryArtifacts.$inferSelect;
export type NewCollectedStoryArtifact = typeof collectedStoryArtifacts.$inferInsert;

export type CollectedMapTile = typeof collectedMapTiles.$inferSelect;
export type NewCollectedMapTile = typeof collectedMapTiles.$inferInsert;

export const storyQuizzes = pgTable(
  'story_quizzes',
  {
    id: uuid('id').primaryKey().defaultRandom(),
    storyId: uuid('story_id')
      .references(() => stories.id, { onDelete: 'cascade' })
      .notNull(),
    userId: uuid('user_id')
      .references(() => users.id, { onDelete: 'cascade' })
      .notNull(),
    childProfileId: uuid('child_profile_id').references(() => childProfiles.id, {
      onDelete: 'set null',
    }),
    language: varchar('language', { length: 10 }).notNull(),
    sourceAgeGroup: varchar('source_age_group', { length: 20 }).notNull(),
    quizAgeBucket: varchar('quiz_age_bucket', { length: 10 }).notNull(),
    promptVersion: varchar('prompt_version', { length: 40 }).notNull(),
    sourceFingerprint: varchar('source_fingerprint', { length: 64 }).notNull(),
    status: varchar('status', { length: 20 }).notNull().default('generating'),
    payload: jsonb('payload'),
    errorMessage: text('error_message'),
    generationTimeMs: integer('generation_time_ms'),
    createdAt: timestamp('created_at').defaultNow().notNull(),
    updatedAt: timestamp('updated_at').defaultNow().notNull(),
  },
  (table) => {
    return {
      storyIdIdx: index('story_quizzes_story_id_idx').on(table.storyId),
      userIdIdx: index('story_quizzes_user_id_idx').on(table.userId),
      childProfileIdIdx: index('story_quizzes_child_profile_id_idx').on(table.childProfileId),
      statusIdx: index('story_quizzes_status_idx').on(table.status),
      cacheIdx: uniqueIndex('story_quizzes_cache_uidx').on(
        table.storyId,
        table.language,
        table.quizAgeBucket,
        table.promptVersion,
        table.sourceFingerprint
      ),
    };
  }
);

export type StoryQuiz = typeof storyQuizzes.$inferSelect;
export type NewStoryQuiz = typeof storyQuizzes.$inferInsert;

export const storyQuizProgress = pgTable(
  'story_quiz_progress',
  {
    id: uuid('id').primaryKey().defaultRandom(),
    storyQuizId: uuid('story_quiz_id')
      .references(() => storyQuizzes.id, { onDelete: 'cascade' })
      .notNull(),
    storyId: uuid('story_id')
      .references(() => stories.id, { onDelete: 'cascade' })
      .notNull(),
    userId: uuid('user_id')
      .references(() => users.id, { onDelete: 'cascade' })
      .notNull(),
    childProfileId: uuid('child_profile_id').references(() => childProfiles.id, {
      onDelete: 'set null',
    }),
    ownerType: varchar('owner_type', { length: 20 }).notNull(),
    ownerId: uuid('owner_id').notNull(),
    answers: jsonb('answers').$type<Record<string, unknown>>().notNull().default({}),
    completedCheckRewardAt: timestamp('completed_check_reward_at'),
    createdAt: timestamp('created_at').defaultNow().notNull(),
    updatedAt: timestamp('updated_at').defaultNow().notNull(),
  },
  (table) => {
    return {
      storyQuizIdIdx: index('story_quiz_progress_story_quiz_id_idx').on(table.storyQuizId),
      storyIdIdx: index('story_quiz_progress_story_id_idx').on(table.storyId),
      userIdIdx: index('story_quiz_progress_user_id_idx').on(table.userId),
      childProfileIdIdx: index('story_quiz_progress_child_profile_id_idx').on(
        table.childProfileId
      ),
      ownerIdx: uniqueIndex('story_quiz_progress_owner_uidx').on(
        table.storyQuizId,
        table.ownerType,
        table.ownerId
      ),
    };
  }
);

export type StoryQuizProgress = typeof storyQuizProgress.$inferSelect;
export type NewStoryQuizProgress = typeof storyQuizProgress.$inferInsert;

export type ModerationDecisionEvent = typeof moderationDecisionEvents.$inferSelect;
export type NewModerationDecisionEvent = typeof moderationDecisionEvents.$inferInsert;

export type StoryCharacter = typeof storyCharacters.$inferSelect;
export type NewStoryCharacter = typeof storyCharacters.$inferInsert;

export type StoryRating = typeof storyRatings.$inferSelect;
export type NewStoryRating = typeof storyRatings.$inferInsert;

// Batch image pending (stories waiting for batch images)
export const batchImagePending = pgTable(
  'batch_image_pending',
  {
    id: uuid('id').primaryKey().defaultRandom(),
    storyId: uuid('story_id')
      .references(() => stories.id, { onDelete: 'cascade' })
      .notNull(),
    requestId: uuid('request_id')
      .references(() => storyRequests.id)
      .notNull(),
    scheduleId: uuid('schedule_id').references(() => seriesSchedules.id, { onDelete: 'set null' }),
    createdAt: timestamp('created_at', { withTimezone: true }).notNull().defaultNow(),
  },
  (table) => ({
    createdIdx: index('idx_batch_image_pending_created').on(table.createdAt),
    storyIdx: index('idx_batch_image_pending_story').on(table.storyId),
    scheduleIdx: index('idx_batch_image_pending_schedule').on(table.scheduleId),
  })
);

// Batch image jobs (active batch jobs for polling)
export const batchImageJobs = pgTable(
  'batch_image_jobs',
  {
    id: uuid('id').primaryKey().defaultRandom(),
    batchId: varchar('batch_id', { length: 100 }).notNull(),
    vendor: varchar('vendor', { length: 20 }).notNull(),
    status: varchar('status', { length: 30 }).notNull(),
    pendingIds: uuid('pending_ids').array().notNull(),
    createdAt: timestamp('created_at', { withTimezone: true }).notNull().defaultNow(),
  },
  (table) => ({
    statusIdx: index('idx_batch_image_jobs_status').on(table.status),
    createdIdx: index('idx_batch_image_jobs_created').on(table.createdAt),
  })
);

export type SeriesSchedule = typeof seriesSchedules.$inferSelect;
export type NewSeriesSchedule = typeof seriesSchedules.$inferInsert;
export type BatchImagePending = typeof batchImagePending.$inferSelect;
export type NewBatchImagePending = typeof batchImagePending.$inferInsert;
export type BatchImageJob = typeof batchImageJobs.$inferSelect;
export type NewBatchImageJob = typeof batchImageJobs.$inferInsert;

export type AiUsageEvent = typeof aiUsageEvents.$inferSelect;
export type NewAiUsageEvent = typeof aiUsageEvents.$inferInsert;

export type ImageValidationResultRow = typeof imageValidationResults.$inferSelect;
export type NewImageValidationResultRow = typeof imageValidationResults.$inferInsert;
export type StoryDirectorScene = typeof storyDirectorScenes.$inferSelect;
export type NewStoryDirectorScene = typeof storyDirectorScenes.$inferInsert;

// ==========================================
// IMAGE GENERATION TABLES (M4)
// ==========================================

// Scenes table - extracted from stories.scenes jsonb
export const scenes = pgTable(
  'scenes',
  {
    id: uuid('id').primaryKey().defaultRandom(),
    storyId: uuid('story_id')
      .references(() => stories.id, { onDelete: 'cascade' })
      .notNull(),
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
  },
  (table) => {
    return {
      storyIdIdx: index('scenes_story_id_idx').on(table.storyId),
      storySceneIdx: index('scenes_story_scene_idx').on(table.storyId, table.sceneId),
      uniqueSceneIdx: uniqueIndex('scenes_unique_idx').on(table.storyId, table.sceneId),
    };
  }
);

// Assets table - storage metadata for images, audio, video
export const assets = pgTable(
  'assets',
  {
    id: uuid('id').primaryKey().defaultRandom(),
    storyId: uuid('story_id')
      .references(() => stories.id, { onDelete: 'cascade' })
      .notNull(),
    sceneId: uuid('scene_id').references(() => scenes.id, { onDelete: 'cascade' }),

    assetType: varchar('asset_type', { length: 20 }).notNull(), // 'image' | 'audio' | 'video'

    // Storage
    storagePath: text('storage_path').notNull(),
    storageUrl: text('storage_url'),
    signedUrl: text('signed_url'),
    signedUrlExpiresAt: timestamp('signed_url_expires_at'),

    // Thumbnail (for optimized library preview - 672×384px JPEG)
    thumbnailPath: text('thumbnail_path'),
    thumbnailUrl: text('thumbnail_url'),

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
  },
  (table) => {
    return {
      storyIdIdx: index('assets_story_id_idx').on(table.storyId),
      sceneIdIdx: index('assets_scene_id_idx').on(table.sceneId),
      statusIdx: index('assets_status_idx').on(table.status),
      typeIdx: index('assets_type_idx').on(table.assetType),
    };
  }
);

// Graphic novel generation tables - one project per graphic-novel story.
export const graphicNovelProjects = pgTable(
  'graphic_novel_projects',
  {
    id: uuid('id').primaryKey().defaultRandom(),
    storyId: uuid('story_id')
      .references(() => stories.id, { onDelete: 'cascade' })
      .notNull(),
    storyRequestId: uuid('story_request_id').references(() => storyRequests.id, {
      onDelete: 'set null',
    }),
    userId: uuid('user_id')
      .references(() => users.id, { onDelete: 'cascade' })
      .notNull(),
    language: varchar('language', { length: 5 }).notNull(),
    ageGroup: varchar('age_group', { length: 10 }).notNull(),
    pageCount: integer('page_count').notNull().default(8),
    status: varchar('status', { length: 20 }).notNull().default('generating'),
    scriptJson: jsonb('script_json').notNull(),
    layoutManifest: jsonb('layout_manifest').notNull().default({}),
    createdAt: timestamp('created_at').defaultNow().notNull(),
    updatedAt: timestamp('updated_at').defaultNow().notNull(),
  },
  (table) => {
    return {
      storyIdIdx: uniqueIndex('graphic_novel_projects_story_id_idx').on(table.storyId),
      requestIdIdx: index('graphic_novel_projects_story_request_id_idx').on(table.storyRequestId),
      userIdIdx: index('graphic_novel_projects_user_id_idx').on(table.userId),
      statusIdx: index('graphic_novel_projects_status_idx').on(table.status),
    };
  }
);

export const graphicNovelPages = pgTable(
  'graphic_novel_pages',
  {
    id: uuid('id').primaryKey().defaultRandom(),
    projectId: uuid('project_id')
      .references(() => graphicNovelProjects.id, { onDelete: 'cascade' })
      .notNull(),
    storyId: uuid('story_id')
      .references(() => stories.id, { onDelete: 'cascade' })
      .notNull(),
    pageNumber: integer('page_number').notNull(),
    templateId: varchar('template_id', { length: 20 }).notNull(),
    pageRole: varchar('page_role', { length: 40 }).notNull(),
    layoutJson: jsonb('layout_json').notNull(),
    bubbleLayoutJson: jsonb('bubble_layout_json').notNull().default({}),
    imageAssetId: uuid('image_asset_id').references(() => assets.id, { onDelete: 'set null' }),
    imageUrl: text('image_url'),
    status: varchar('status', { length: 20 }).notNull().default('pending'),
    generationParams: jsonb('generation_params').notNull().default({}),
    errorMessage: text('error_message'),
    createdAt: timestamp('created_at').defaultNow().notNull(),
    updatedAt: timestamp('updated_at').defaultNow().notNull(),
  },
  (table) => {
    return {
      projectIdIdx: index('graphic_novel_pages_project_id_idx').on(table.projectId),
      storyIdIdx: index('graphic_novel_pages_story_id_idx').on(table.storyId),
      uniquePageIdx: uniqueIndex('graphic_novel_pages_project_page_uidx').on(
        table.projectId,
        table.pageNumber
      ),
      statusIdx: index('graphic_novel_pages_status_idx').on(table.status),
      imageAssetIdx: index('graphic_novel_pages_image_asset_id_idx').on(table.imageAssetId),
    };
  }
);

export const graphicNovelPanels = pgTable(
  'graphic_novel_panels',
  {
    id: uuid('id').primaryKey().defaultRandom(),
    pageId: uuid('page_id')
      .references(() => graphicNovelPages.id, { onDelete: 'cascade' })
      .notNull(),
    projectId: uuid('project_id')
      .references(() => graphicNovelProjects.id, { onDelete: 'cascade' })
      .notNull(),
    storyId: uuid('story_id')
      .references(() => stories.id, { onDelete: 'cascade' })
      .notNull(),
    pageNumber: integer('page_number').notNull(),
    panelIndex: integer('panel_index').notNull(),
    panelId: varchar('panel_id', { length: 40 }).notNull(),
    speakerLines: jsonb('speaker_lines').notNull().default([]),
    thoughtLines: jsonb('thought_lines').notNull().default([]),
    caption: text('caption'),
    visualAction: text('visual_action').notNull(),
    charactersPresent: jsonb('characters_present').notNull().default([]),
    artPrompt: text('art_prompt').notNull(),
    bubbleGeometry: jsonb('bubble_geometry').notNull().default([]),
    createdAt: timestamp('created_at').defaultNow().notNull(),
    updatedAt: timestamp('updated_at').defaultNow().notNull(),
  },
  (table) => {
    return {
      pageIdIdx: index('graphic_novel_panels_page_id_idx').on(table.pageId),
      projectIdIdx: index('graphic_novel_panels_project_id_idx').on(table.projectId),
      storyIdIdx: index('graphic_novel_panels_story_id_idx').on(table.storyId),
      uniquePanelIdx: uniqueIndex('graphic_novel_panels_page_panel_uidx').on(
        table.pageId,
        table.panelIndex
      ),
    };
  }
);

// Generated references table - AI-generated character portraits
export const generatedReferences = pgTable(
  'generated_references',
  {
    id: uuid('id').primaryKey().defaultRandom(),
    storyId: uuid('story_id').references(() => stories.id, { onDelete: 'cascade' }),
    characterId: uuid('character_id').references(() => characters.id, { onDelete: 'set null' }),
    childProfileId: uuid('child_profile_id').references(() => childProfiles.id, {
      onDelete: 'set null',
    }),

    characterName: varchar('character_name', { length: 255 }),

    assetId: uuid('asset_id').references(() => assets.id, { onDelete: 'cascade' }),

    characterDescription: text('character_description').notNull(),

    generationParams: jsonb('generation_params'),
    referenceType: varchar('reference_type', { length: 50 }).notNull(),
    source: varchar('source', { length: 50 }),

    createdAt: timestamp('created_at').defaultNow().notNull(),
  },
  (table) => {
    return {
      storyIdIdx: index('generated_refs_story_idx').on(table.storyId),
      characterIdIdx: index('generated_refs_character_idx').on(table.characterId),
      charNameIdx: index('generated_refs_char_name_idx').on(table.storyId, table.characterName),
    };
  }
);

export type Scene = typeof scenes.$inferSelect;
export type NewScene = typeof scenes.$inferInsert;

export type Asset = typeof assets.$inferSelect;
export type NewAsset = typeof assets.$inferInsert;

export type GraphicNovelProject = typeof graphicNovelProjects.$inferSelect;
export type NewGraphicNovelProject = typeof graphicNovelProjects.$inferInsert;

export type GraphicNovelPage = typeof graphicNovelPages.$inferSelect;
export type NewGraphicNovelPage = typeof graphicNovelPages.$inferInsert;

export type GraphicNovelPanel = typeof graphicNovelPanels.$inferSelect;
export type NewGraphicNovelPanel = typeof graphicNovelPanels.$inferInsert;

export type GeneratedReference = typeof generatedReferences.$inferSelect;
export type NewGeneratedReference = typeof generatedReferences.$inferInsert;

// Environment image cache - global reuse by embedding similarity
export const environmentImageCache = pgTable('environment_image_cache', {
  id: uuid('id').primaryKey().defaultRandom(),
  description: text('description').notNull(),
  descriptionEmbedding: jsonb('description_embedding').$type<number[]>().notNull(),
  storagePath: text('storage_path').notNull(),
  storageUrl: text('storage_url'),
  createdAt: timestamp('created_at').defaultNow().notNull(),
});

// Story-environment mapping for continuation (story env id -> cache id)
export const storyEnvironmentCache = pgTable(
  'story_environment_cache',
  {
    storyId: uuid('story_id')
      .references(() => stories.id, { onDelete: 'cascade' })
      .notNull(),
    storyEnvironmentId: varchar('story_environment_id', { length: 100 }).notNull(),
    cacheId: uuid('cache_id')
      .references(() => environmentImageCache.id, { onDelete: 'cascade' })
      .notNull(),
    createdAt: timestamp('created_at').defaultNow().notNull(),
  },
  (table) => ({
    pk: primaryKey({ columns: [table.storyId, table.storyEnvironmentId] }),
    storyIdx: index('story_env_cache_story_idx').on(table.storyId),
    cacheIdx: index('story_env_cache_cache_idx').on(table.cacheId),
  })
);

export type EnvironmentImageCache = typeof environmentImageCache.$inferSelect;
export type NewEnvironmentImageCache = typeof environmentImageCache.$inferInsert;
export type StoryEnvironmentCache = typeof storyEnvironmentCache.$inferSelect;
export type NewStoryEnvironmentCache = typeof storyEnvironmentCache.$inferInsert;

// Outfit plate cache — garment/silhouette reference (Imagen 4 Fast), global reuse by embedding
export const outfitPlateCache = pgTable('outfit_plate_cache', {
  id: uuid('id').primaryKey().defaultRandom(),
  outfitText: text('outfit_text').notNull(),
  descriptionEmbedding: jsonb('description_embedding').$type<number[]>().notNull(),
  imageStyle: varchar('image_style', { length: 100 }).notNull(),
  ageGroup: varchar('age_group', { length: 20 }).notNull(),
  storagePath: text('storage_path').notNull(),
  storageUrl: text('storage_url'),
  createdAt: timestamp('created_at').defaultNow().notNull(),
});

export const storyOutfitPlateCache = pgTable(
  'story_outfit_plate_cache',
  {
    storyId: uuid('story_id')
      .references(() => stories.id, { onDelete: 'cascade' })
      .notNull(),
    characterKey: varchar('character_key', { length: 200 }).notNull(),
    storyEnvironmentId: varchar('story_environment_id', { length: 100 }).notNull(),
    cacheId: uuid('cache_id')
      .references(() => outfitPlateCache.id, { onDelete: 'cascade' })
      .notNull(),
    createdAt: timestamp('created_at').defaultNow().notNull(),
  },
  (table) => ({
    pk: primaryKey({
      columns: [table.storyId, table.characterKey, table.storyEnvironmentId],
    }),
    storyIdx: index('story_outfit_plate_cache_story_idx').on(table.storyId),
    cacheIdx: index('story_outfit_plate_cache_cache_idx').on(table.cacheId),
  })
);

export type OutfitPlateCache = typeof outfitPlateCache.$inferSelect;
export type NewOutfitPlateCache = typeof outfitPlateCache.$inferInsert;
export type StoryOutfitPlateCache = typeof storyOutfitPlateCache.$inferSelect;
export type NewStoryOutfitPlateCache = typeof storyOutfitPlateCache.$inferInsert;

// LLM turnaround cache - global reuse by embedding similarity (LLM characters only)
export const llmTurnaroundCache = pgTable('llm_turnaround_cache', {
  id: uuid('id').primaryKey().defaultRandom(),
  description: text('description').notNull(),
  descriptionEmbedding: jsonb('description_embedding').$type<number[]>().notNull(),
  storagePath: text('storage_path').notNull(),
  frontStoragePath: text('front_storage_path'),
  createdAt: timestamp('created_at').defaultNow().notNull(),
});

export type LlmTurnaroundCache = typeof llmTurnaroundCache.$inferSelect;
export type NewLlmTurnaroundCache = typeof llmTurnaroundCache.$inferInsert;

// ==========================================
// AUDIO/TTS TABLES (M5)
// ==========================================

// Age groups reference table - manageable via admin UI
export const ageGroups = pgTable(
  'age_groups',
  {
    id: uuid('id').primaryKey().defaultRandom(),
    slug: varchar('slug', { length: 10 }).notNull().unique(), // '1y', '2-3', '4-5', '6-8', '9-12'
    nameKey: varchar('name_key', { length: 100 }).notNull(), // i18n key: 'age_groups.1y.name'
    minMonths: integer('min_months').notNull(),
    maxMonths: integer('max_months'), // NULL for last group (9-12+)
    sortOrder: integer('sort_order').notNull().default(0),
    isActive: boolean('is_active').notNull().default(true),
    createdAt: timestamp('created_at').defaultNow(),
    updatedAt: timestamp('updated_at').defaultNow(),
  },
  (table) => {
    return {
      slugIdx: uniqueIndex('age_groups_slug_idx').on(table.slug),
      sortOrderIdx: index('age_groups_sort_order_idx').on(table.sortOrder),
    };
  }
);

// Voice-Age Groups junction table (M2M relationship)
export const voiceAgeGroups = pgTable(
  'voice_age_groups',
  {
    voiceId: uuid('voice_id')
      .references(() => ttsVoices.id, { onDelete: 'cascade' })
      .notNull(),
    ageGroupId: uuid('age_group_id')
      .references(() => ageGroups.id, { onDelete: 'cascade' })
      .notNull(),
  },
  (table) => {
    return {
      pk: primaryKey({ columns: [table.voiceId, table.ageGroupId] }),
      voiceIdIdx: index('voice_age_groups_voice_id_idx').on(table.voiceId),
      ageGroupIdIdx: index('voice_age_groups_age_group_id_idx').on(table.ageGroupId),
    };
  }
);

// TTS Voices table - available voices catalog
export const ttsVoices = pgTable(
  'tts_voices',
  {
    id: uuid('id').primaryKey().defaultRandom(),

    // Voice identity
    provider: varchar('provider', { length: 50 }).notNull(), // 'elevenlabs' | 'google' | 'openai' | 'grok' | ...
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
  },
  (table) => {
    return {
      providerVoiceIdx: uniqueIndex('tts_voices_provider_voice_idx').on(
        table.provider,
        table.providerVoiceId
      ),
      languageIdx: index('tts_voices_language_idx').on(table.language),
      isActiveIdx: index('tts_voices_active_idx').on(table.isActive),
    };
  }
);

// Audio assets table - generated audio metadata
export const audioAssets = pgTable(
  'audio_assets',
  {
    id: uuid('id').primaryKey().defaultRandom(),

    // Relations
    storyId: uuid('story_id')
      .references(() => stories.id, { onDelete: 'cascade' })
      .notNull(),

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
    /** TTS input for this row (vendor markup when deferred prosody applied). Final row: full narration; partials: chunk only. */
    synthesisTaggedText: text('synthesis_tagged_text'),

    // Asset info
    assetId: uuid('asset_id')
      .references(() => assets.id, { onDelete: 'cascade' })
      .notNull(),
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
  },
  (table) => {
    return {
      storyIdIdx: index('audio_assets_story_idx').on(table.storyId),
      statusIdx: index('audio_assets_status_idx').on(table.status),
      cacheIdx: index('audio_assets_cache_idx').on(table.textHash, table.voiceId, table.speed),
      createdAtIdx: index('audio_assets_created_idx').on(table.createdAt),
      sceneGroupIdx: index('audio_assets_scene_group_idx').on(
        table.storyId,
        table.sceneGroupIndex,
        table.status
      ),
    };
  }
);

export type TtsVoice = typeof ttsVoices.$inferSelect;
export type NewTtsVoice = typeof ttsVoices.$inferInsert;

export type AgeGroup = typeof ageGroups.$inferSelect;
export type NewAgeGroup = typeof ageGroups.$inferInsert;

export type VoiceAgeGroup = typeof voiceAgeGroups.$inferSelect;
export type NewVoiceAgeGroup = typeof voiceAgeGroups.$inferInsert;

// Alignments table - forced alignment per story (Phase 2)
export const alignments = pgTable(
  'alignments',
  {
    id: uuid('id').primaryKey().defaultRandom(),
    storyId: uuid('story_id')
      .references(() => stories.id, { onDelete: 'cascade' })
      .notNull(),
    assetId: uuid('asset_id').references(() => assets.id, { onDelete: 'set null' }),
    data: jsonb('data').notNull(), // AlignmentData: characters, words, provider, etc.
    createdAt: timestamp('created_at').defaultNow().notNull(),
    updatedAt: timestamp('updated_at').defaultNow().notNull(),
  },
  (table) => {
    return {
      storyIdIdx: index('alignments_story_id_idx').on(table.storyId),
      assetIdIdx: index('alignments_asset_id_idx').on(table.assetId),
      uniqueStoryIdx: uniqueIndex('alignments_story_unique_idx').on(table.storyId),
    };
  }
);

export type Alignment = typeof alignments.$inferSelect;
export type NewAlignment = typeof alignments.$inferInsert;

export type AudioAsset = typeof audioAssets.$inferSelect;
export type NewAudioAsset = typeof audioAssets.$inferInsert;
