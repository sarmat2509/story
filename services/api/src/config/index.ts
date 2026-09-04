// Single entry point: docker-compose. Env comes from env_file (.env.local or .env.production).

import fs from 'fs';
import path from 'path';

/** Monorepo root (`story/`), from `services/api/src/config` → `config` → `src` → `api` → `services` → repo. */
const REPO_ROOT_FOR_SECRETS = path.join(__dirname, '../../../../');
const CAPTCHA_ACTIONS = ['login', 'register', 'password_reset', 'feedback'] as const;

function parseCaptchaRequiredActions(raw: string | undefined): string[] {
  const values = (raw || '')
    .split(',')
    .map((value) => value.trim())
    .filter(Boolean);
  const invalid = values.filter((value) => !CAPTCHA_ACTIONS.includes(value as typeof CAPTCHA_ACTIONS[number]));
  if (invalid.length > 0) {
    throw new Error(
      `CAPTCHA_REQUIRED_ACTIONS contains unsupported action(s): ${invalid.join(', ')}`
    );
  }
  return Array.from(new Set(values));
}

function parseStripePriceIds(raw: string | undefined): Record<string, string> {
  return (raw || '')
    .split(',')
    .reduce<Record<string, string>>((acc, pair) => {
      const [slug, priceId] = pair.trim().split(':');
      if (slug && priceId) acc[slug] = priceId;
      return acc;
    }, {});
}

function firstEnvValue(...names: string[]): string {
  for (const name of names) {
    const value = process.env[name]?.trim();
    if (value) return value;
  }
  return '';
}

function optionalPositiveIntegerEnv(...names: string[]): number | null {
  for (const name of names) {
    const raw = process.env[name]?.trim();
    if (!raw) continue;
    const parsed = Number(raw);
    if (!Number.isInteger(parsed) || parsed < 1) {
      throw new Error(`${name} must be a positive integer`);
    }
    return parsed;
  }
  return null;
}

const SIMPLE_IMAGE_MODEL =
  firstEnvValue('SIMPLE_IMAGE_MODEL', 'NANO_BANANA_MODEL') || 'gemini-3.1-flash-lite-image';
const COMPLEX_IMAGE_MODEL =
  firstEnvValue('COMPLEX_IMAGE_MODEL', 'GRAPHIC_NOVEL_IMAGE_MODEL', 'NANO_BANANA_MODEL') ||
  'gemini-3.1-flash-image';

/**
 * When `.env.local` reuses Docker's `GOOGLE_APPLICATION_CREDENTIALS=/app/secrets/foo.json`
 * but the API runs on the host, map to `./secrets/foo.json` at repo root (same layout as compose).
 */
function resolveDockerAppSecretsPathToRepo(dockerPath: string): string | null {
  const m = dockerPath.match(/^\/app\/secrets\/([^/]+)$/);
  if (!m?.[1]) return null;
  const local = path.join(REPO_ROOT_FOR_SECRETS, 'secrets', m[1]);
  try {
    if (fs.existsSync(local)) return local;
  } catch {
    /* ignore */
  }
  return null;
}

/** Prefer a credentials path that exists on disk (Docker paths often break local CLI). */
function resolveGoogleServiceAccountKeyPath(): string {
  const candidates = [
    process.env.GOOGLE_APPLICATION_CREDENTIALS?.trim(),
    process.env.GOOGLE_CLOUD_CREDENTIALS?.trim(),
  ].filter((p): p is string => !!p);
  for (const p of candidates) {
    try {
      if (fs.existsSync(p)) return p;
      const mapped = resolveDockerAppSecretsPathToRepo(p);
      if (mapped) return mapped;
    } catch {
      /* ignore */
    }
  }
  return '';
}

// Debug: Log if OAuth credentials are loaded
if (process.env.NODE_ENV === 'development') {
  console.log('🔐 OAuth Config Check:');
  console.log('  GOOGLE_CLIENT_ID:', process.env.GOOGLE_CLIENT_ID ? 'Set ✓' : 'Missing ✗');
  console.log('  GOOGLE_CLIENT_SECRET:', process.env.GOOGLE_CLIENT_SECRET ? 'Set ✓' : 'Missing ✗');
  console.log(
    '  ELEVENLABS_API_KEY:',
    process.env.ELEVENLABS_API_KEY
      ? `Set ✓ (length: ${process.env.ELEVENLABS_API_KEY.length})`
      : 'Missing ✗'
  );
  console.log(
    '  ENABLE_ENVIRONMENT_REFERENCE:',
    process.env.ENABLE_ENVIRONMENT_REFERENCE === 'true' ? 'true ✓' : 'false'
  );
}

// Validate required environment variables in production
function validateProductionConfig() {
  if (process.env.NODE_ENV === 'production') {
    const required = [
      'JWT_SECRET',
      'ENCRYPTION_KEY',
      'DATABASE_URL',
      'GOOGLE_CLIENT_ID',
      'GOOGLE_CLIENT_SECRET',
      'GOOGLE_CALLBACK_URL',
      'WEB_APP_URL',
      'RESEND_API_KEY',
      'FROM_EMAIL',
    ];

    const missing = required.filter((key) => !process.env[key]);

    if (missing.length > 0) {
      throw new Error(
        `Missing required environment variables in production: ${missing.join(', ')}`
      );
    }

    // Validate JWT_SECRET strength
    if (process.env.JWT_SECRET!.length < 32) {
      throw new Error('JWT_SECRET must be at least 32 characters in production');
    }

    // Validate ENCRYPTION_KEY format
    if (process.env.ENCRYPTION_KEY!.length !== 64) {
      throw new Error('ENCRYPTION_KEY must be 64 hex characters (32 bytes) in production');
    }

    // Warn about default values
    if (process.env.JWT_SECRET?.includes('change_in_production')) {
      throw new Error('JWT_SECRET must be changed from default value in production');
    }

    if (process.env.FROM_EMAIL === 'noreply@wondertales.com') {
      throw new Error('FROM_EMAIL must be changed from default value in production');
    }

    const captchaActions = parseCaptchaRequiredActions(process.env.CAPTCHA_REQUIRED_ACTIONS);
    if (captchaActions.length > 0 && !process.env.TURNSTILE_SECRET_KEY?.trim()) {
      throw new Error('TURNSTILE_SECRET_KEY is required when CAPTCHA_REQUIRED_ACTIONS is set');
    }

    const textVendor = process.env.AI_TEXT_VENDOR || 'gemini';
    const directorTextVendor = (process.env.AI_DIRECTOR_TEXT_VENDOR || '').trim() || textVendor;
    const needsOpenAiKey = textVendor === 'openai' || directorTextVendor === 'openai';
    if (needsOpenAiKey && !process.env.OPENAI_API_KEY?.trim()) {
      throw new Error(
        'OPENAI_API_KEY is required in production when AI_TEXT_VENDOR or AI_DIRECTOR_TEXT_VENDOR is openai'
      );
    }
  }
}

// Run validation
validateProductionConfig();

export const config = {
  port: parseInt(process.env.PORT || '3000', 10),
  nodeEnv: process.env.NODE_ENV || 'development',
  apiVersion: process.env.API_VERSION || 'v1',

  // AI Providers
  ai: {
    textVendor: process.env.AI_TEXT_VENDOR || 'gemini',
    imageVendor: process.env.AI_IMAGE_VENDOR || 'gemini',
    ttsVendor: process.env.AI_TTS_VENDOR || 'elevenlabs',
    alignmentVendor: process.env.AI_ALIGNMENT_VENDOR || 'elevenlabs', // M6: Forced alignment provider
    geminiApiKey: process.env.GEMINI_API_KEY || '',
    geminiVisionModel: process.env.GEMINI_VISION_MODEL || 'gemini-2.5-flash',
    openaiApiKey: process.env.OPENAI_API_KEY || '',
    openaiModel: process.env.OPENAI_TEXT_MODEL || 'gpt-5.2',
    openaiValidationModel: process.env.OPENAI_VALIDATION_MODEL || 'gpt-4o',
    /** Primary text/vision provider for image validation; defaults to Gemini. */
    validationTextVendor: (process.env.AI_VALIDATION_TEXT_VENDOR || '').trim() || 'gemini',
    /** Dedicated provider for full-story prose coherence validation. */
    storyValidationTextVendor:
      (process.env.AI_STORY_VALIDATION_TEXT_VENDOR || '').trim() || 'openai',
    openaiStoryValidationModel:
      process.env.OPENAI_STORY_VALIDATION_MODEL ||
      process.env.AI_DIRECTOR_OPENAI_MODEL ||
      process.env.OPENAI_TEXT_MODEL ||
      'gpt-5.2',
    geminiStoryValidationModel:
      process.env.GEMINI_STORY_VALIDATION_MODEL ||
      process.env.GEMINI_VALIDATION_MODEL ||
      'gemini-3.1-flash-lite',
    /** When set, Director (`callDirector`) uses this text vendor; otherwise same as textVendor */
    directorTextVendor: (process.env.AI_DIRECTOR_TEXT_VENDOR || '').trim() || undefined,
    /** OpenAI model for Director only; falls back to OPENAI_TEXT_MODEL default */
    openaiDirectorModel:
      process.env.AI_DIRECTOR_OPENAI_MODEL || process.env.OPENAI_TEXT_MODEL || 'gpt-5.2',
    elevenLabsApiKey: process.env.ELEVENLABS_API_KEY || '',
    // Structured text (Director, validation, etc.): GEMINI_TEXT_MODEL overrides legacy AI_MODEL_VERSION
    modelVersion:
      process.env.GEMINI_TEXT_MODEL || process.env.AI_MODEL_VERSION || 'gemini-3-flash-preview',
    /**
     * Structured JSON for deferred TTS prosody (full `taggedText` echo). Gemini 3 preview can hit
     * MAX_TOKENS when internal thinking competes with long JSON output — default to 2.5 Flash here only.
     */
    ttsProsodyTagsModel:
      (process.env.GEMINI_TTS_PROSODY_MODEL || '').trim() || 'gemini-2.5-flash',
    validationModel: process.env.GEMINI_VALIDATION_MODEL || 'gemini-3.1-flash-lite',
    geminiContextCacheMinEstimatedTokens: parseInt(
      process.env.GEMINI_CONTEXT_CACHE_MIN_ESTIMATED_TOKENS || '1024',
      10
    ),
    geminiContextCacheMinShare: parseFloat(process.env.GEMINI_CONTEXT_CACHE_MIN_SHARE || '0.5'),
    maxRetries: parseInt(process.env.AI_MAX_RETRIES || '3', 10),
    timeoutMs: parseInt(process.env.AI_TIMEOUT_MS || '30000', 10),
  },

  // Image Generation
  image: {
    skipGeneration: process.env.SKIP_IMAGE_GENERATION === 'true',
    /** Optional cost guard for graphic-novel and mixed-story comic pages. Empty means full length. */
    graphicNovelMaxPageCount: optionalPositiveIntegerEnv(
      'GRAPHIC_NOVEL_MAX_PAGE_COUNT',
      'COMIC_MAX_PAGE_COUNT'
    ),
    /** Simple visual path: ordinary story illustrations. */
    simpleProvider: firstEnvValue('SIMPLE_IMAGE_PROVIDER', 'IMAGE_PROVIDER') || 'nanobananapro',
    simpleModel: SIMPLE_IMAGE_MODEL,
    /** Complex visual path: graphic-novel and mixed-story comic pages. */
    complexProvider:
      firstEnvValue('COMPLEX_IMAGE_PROVIDER', 'GRAPHIC_NOVEL_IMAGE_PROVIDER') || 'nanobananapro',
    complexModel: COMPLEX_IMAGE_MODEL,
    /** Optional override for reward map tile images only. Falls back to Nano Banana model. */
    mapTileModel: (process.env.MAP_TILE_IMAGE_MODEL || '').trim(),
    gemini: {
      projectId: process.env.GOOGLE_CLOUD_PROJECT || '',
      location: process.env.GOOGLE_CLOUD_LOCATION || 'us-central1',
      batchGcsBucket: process.env.BATCH_IMAGE_GCS_BUCKET || '', // For scheduled continuation batch (Vertex AI)
      batchModel: process.env.GEMINI_BATCH_MODEL || 'gemini-3.1-flash-image',
      scheduledEnvironmentBatchModel:
        process.env.GEMINI_SCHEDULED_ENVIRONMENT_BATCH_MODEL || 'gemini-3.1-flash-lite-image',
    },
    defaultStyle: 'soft_watercolor',
    defaultAspectRatio: '16:9',
    maxRetries: parseInt(process.env.IMAGE_MAX_RETRIES || '3', 10),
    retryDelayMs: parseInt(process.env.IMAGE_RETRY_DELAY_MS || '2000', 10),
    // RPM Rate Limiting
    rpmQuotaRefreshIntervalMs: parseInt(
      process.env.IMAGE_RPM_QUOTA_REFRESH_INTERVAL_MS || '300000',
      10
    ), // 5 minutes
    rpmDefaultLimit: parseInt(process.env.IMAGE_RPM_DEFAULT_LIMIT || '150', 10), // Default RPM for Tier 1
    rpmSafetyMargin: parseFloat(process.env.IMAGE_RPM_SAFETY_MARGIN || '0.9'), // Use 90% of limit
    queueTimeoutMs: parseInt(process.env.IMAGE_QUEUE_TIMEOUT_MS || '300000', 10), // 5 minutes max wait in queue
    // Post-generation validation (Gemini Vision)
    enableValidation: process.env.ENABLE_IMAGE_VALIDATION === 'true',
    /**
     * Story illustrations must never contain leaked reference labels or descriptive UI blocks.
     * This is a product invariant, not an experiment toggle.
     */
    validationCheckTextOrSymbols: true,
    validationMaxRetries: parseInt(process.env.IMAGE_VALIDATION_MAX_RETRIES || '2', 10),
    /** When validation fails, use one image-edit repair pass instead of full regeneration. */
    validationUseEditRepair: process.env.IMAGE_VALIDATION_USE_EDIT_REPAIR === 'true',
    /** Scene image accepted when computeValidationScore(...) is strictly greater than this (no LLM isValid). */
    validationMinAcceptScore: parseInt(process.env.IMAGE_VALIDATION_MIN_ACCEPT_SCORE || '85', 10),
    /** Validation-only downscale for the generated scene image sent to the vision model. */
    validationSceneMaxSide: parseInt(process.env.IMAGE_VALIDATION_SCENE_MAX_SIDE || '1024', 10),
    /** Validation-only downscale for per-character identity reference images. */
    validationReferenceMaxSide: parseInt(
      process.env.IMAGE_VALIDATION_REFERENCE_MAX_SIDE || '768',
      10
    ),
    // Legacy single cap (prefer bucket limits below for Gemini 3.1 image)
    maxReferenceImages: parseInt(process.env.IMAGE_MAX_REFERENCE_IMAGES || '14', 10),
    /** Identity refs: turnaround / child / character sheets (Gemini 3.1: up to 4) */
    maxCharacterReferenceImages: parseInt(
      process.env.IMAGE_MAX_CHARACTER_REFERENCE_IMAGES || '4',
      10
    ),
    /** Environment + outfit plates + non-character refs (Gemini 3.1: up to 10) */
    maxObjectReferenceImages: parseInt(process.env.IMAGE_MAX_OBJECT_REFERENCE_IMAGES || '10', 10),
    enableOutfitPlate: process.env.ENABLE_OUTFIT_PLATE === 'true',
    outfitPlateMaxPerScene: parseInt(process.env.OUTFIT_PLATE_MAX_PER_SCENE || '2', 10),
    outfitPlateCatalogSimilarityThreshold: parseFloat(
      process.env.OUTFIT_PLATE_CATALOG_SIMILARITY_THRESHOLD || '0.82'
    ),
    outfitPlateDefaultOutfitTolerance: parseFloat(
      process.env.OUTFIT_PLATE_DEFAULT_OUTFIT_TOLERANCE || '0.03'
    ),
    // Validation scoring: absolute penalties (subtracted from 100)
    validationScoring: {
      // Per-character penalties (subtracted from 100)
      recognizablePenalty: parseInt(process.env.IMAGE_SCORE_PENALTY_RECOGNIZABLE || '20', 10),
      missingCharacterPenalty: parseInt(
        process.env.IMAGE_SCORE_PENALTY_MISSING_CHARACTER || '32',
        10
      ),
      duplicatedPenalty: parseInt(process.env.IMAGE_SCORE_PENALTY_DUPLICATED || '15', 10),
      matchesColorsPenalty: parseInt(process.env.IMAGE_SCORE_PENALTY_MATCHES_COLORS || '10', 10),
      matchesOutfitPenalty: parseInt(process.env.IMAGE_SCORE_PENALTY_MATCHES_OUTFIT || '20', 10),
      // Global penalties
      characterCountMismatchPenalty: parseInt(
        process.env.IMAGE_SCORE_PENALTY_CHARACTER_COUNT_MISMATCH || '16',
        10
      ),
      characterCountMismatchMaxPenalty: parseInt(
        process.env.IMAGE_SCORE_PENALTY_CHARACTER_COUNT_MISMATCH_MAX || '35',
        10
      ),
      textPenalty: parseInt(process.env.IMAGE_SCORE_PENALTY_TEXT || '5', 10),
      unexpectedCharsPenalty: parseInt(process.env.IMAGE_SCORE_PENALTY_UNEXPECTED || '3', 10),
      artifactsPenalty: parseInt(process.env.IMAGE_SCORE_PENALTY_ARTIFACTS || '10', 10),
      /** Per false identity flag (face/hair/age/proportions) for humans who have a turnaround reference in this validation call */
      humanIdentityFlagPenalty: parseInt(
        process.env.IMAGE_SCORE_PENALTY_HUMAN_IDENTITY_FLAG || '8',
        10
      ),
      /** If recognizableScore is below this for a human with ref, apply humanLowRecognizableExtraPenalty */
      humanLowRecognizableThreshold: parseFloat(
        process.env.IMAGE_SCORE_HUMAN_LOW_REC_THRESHOLD || '0.75'
      ),
      humanLowRecognizableExtraPenalty: parseInt(
        process.env.IMAGE_SCORE_PENALTY_HUMAN_LOW_REC || '5',
        10
      ),
      /** Applied when the validator's characterKind disagrees with the expected roster kind. */
      kindMismatchPenalty: parseInt(process.env.IMAGE_SCORE_PENALTY_KIND_MISMATCH || '45', 10),
    },
    // Turnaround sheet generation is mandatory for every visual character.
    turnaroundModel: process.env.TURNAROUND_MODEL || 'gemini-3-pro-image-preview',
    // Parallel streams for image generation within a single story (turnarounds + scene images)
    parallelStreams: parseInt(process.env.IMAGE_PARALLEL_STREAMS || '2', 10),
    // Environment image reference (Gemini 2.5 Flash Image via API key)
    enableEnvironmentReference: process.env.ENABLE_ENVIRONMENT_REFERENCE === 'true',
    environmentEmbeddingSimilarityThreshold: parseFloat(
      process.env.ENVIRONMENT_EMBEDDING_SIMILARITY_THRESHOLD || '0.9'
    ),
    llmTurnaroundEmbeddingSimilarityThreshold: parseFloat(
      process.env.LLM_TURNAROUND_EMBEDDING_SIMILARITY_THRESHOLD || '0.95'
    ),
    // Generate environment references for every unique environment unless a reusable match is found.
    skipEnvImageForSingleScene: process.env.SKIP_ENV_IMAGE_FOR_SINGLE_SCENE === 'true',
    environmentImageStyle:
      process.env.ENVIRONMENT_IMAGE_STYLE ||
      'style-neutral full-color location design plate, clean readable shapes, natural color blocking, soft directional light, visible form shading, material identity cues, atmospheric depth, clear spatial layout',
  },

  // OpenAI Image (GPT Image via Responses API) - for character consistency with input_fidelity
  openaiImage: {
    mainlineModel: process.env.OPENAI_IMAGE_MAINLINE_MODEL || 'gpt-4.1',
    quality: process.env.OPENAI_IMAGE_QUALITY || 'medium', // low | medium | high | auto
  },

  // Nano Banana image provider defaults to the simple image route.
  nanoBanana: {
    model: SIMPLE_IMAGE_MODEL,
    aspectRatio: process.env.NANO_BANANA_ASPECT_RATIO || '16:9',
    imageSize: process.env.NANO_BANANA_IMAGE_SIZE || '1K', // Output resolution: 1K | 2K | 4K
    enableReferenceImages: process.env.ENABLE_FIRST_IMAGE_REFERENCE !== 'false', // Enabled by default
    enableFilesApi: process.env.NANO_BANANA_ENABLE_FILES_API === 'true', // Off by default — upload turnarounds to Google Files API
    maxPromptLength: parseInt(process.env.NANO_BANANA_MAX_PROMPT_LENGTH || '2000', 10), // Max chars before truncation
  },

  // Seedream (BytePlus ModelArk) - OpenAI-compatible image generation with references
  seedream: {
    apiKey: process.env.SEEDREAM_API_KEY || process.env.ARK_API_KEY || '',
    baseUrl:
      process.env.SEEDREAM_BASE_URL ||
      process.env.ARK_BASE_URL ||
      'https://ark.ap-southeast.bytepluses.com/api/v3',
    model: process.env.SEEDREAM_MODEL || 'seedream-4-5-251128',
    /** Optional explicit size. Empty means provider maps app aspect ratios to supported pixel sizes. */
    size: (process.env.SEEDREAM_SIZE || '').trim(),
    outputFormat: process.env.SEEDREAM_OUTPUT_FORMAT || 'jpeg',
    responseFormat: process.env.SEEDREAM_RESPONSE_FORMAT || 'b64_json',
    watermark: process.env.SEEDREAM_WATERMARK === 'true',
    optimizePromptMode: (process.env.SEEDREAM_OPTIMIZE_PROMPT_MODE || '').trim(),
    timeoutMs: parseInt(process.env.SEEDREAM_TIMEOUT_MS || '180000', 10),
  },

  // Audio/TTS Generation (M5)
  audio: {
    provider: process.env.AUDIO_PROVIDER || 'elevenlabs', // 'elevenlabs' | 'google' | 'openai' | 'grok'
    premiumProvider: process.env.AUDIO_PREMIUM_PROVIDER || 'elevenlabs', // Premium provider for Fairyworld plan
    elevenlabs: {
      apiKey: process.env.ELEVENLABS_API_KEY || '',
      model: process.env.ELEVENLABS_MODEL || 'eleven_v3',
    },
    // NEW: Google Cloud TTS configuration
    google: {
      projectId: process.env.GOOGLE_CLOUD_PROJECT || '',
      credentials: resolveGoogleServiceAccountKeyPath(),
      model: process.env.GOOGLE_TTS_MODEL || 'gemini-3.1-flash-tts-preview',
      location: process.env.GOOGLE_TTS_LOCATION || 'global', // or 'us', 'eu'
    },
    // NEW: OpenAI TTS configuration
    openai: {
      apiKey: process.env.OPENAI_API_KEY || '',
      model: process.env.OPENAI_TTS_MODEL || 'gpt-4o-mini-tts', // or 'tts-1', 'tts-1-hd'
    },
    // xAI Grok TTS (https://api.x.ai/v1/tts)
    grok: {
      apiKey: process.env.GROK_API_KEY || process.env.XAI_API_KEY || '',
    },
    // Default voices per language
    defaultVoice: {
      uk: process.env.DEFAULT_VOICE_UK || '',
      en: process.env.DEFAULT_VOICE_EN || '',
      ru: process.env.DEFAULT_VOICE_RU || '',
      es: process.env.DEFAULT_VOICE_ES || '',
      fr: process.env.DEFAULT_VOICE_FR || '',
      de: process.env.DEFAULT_VOICE_DE || '',
    },
    maxRetries: parseInt(process.env.AUDIO_MAX_RETRIES || '3', 10),
    retryDelayMs: parseInt(process.env.AUDIO_RETRY_DELAY_MS || '2000', 10),
    maxTextLength: parseInt(process.env.AUDIO_MAX_TEXT_LENGTH || '100000', 10), // Increased - chunking handles it
    chunkSize: parseInt(process.env.AUDIO_CHUNK_SIZE || '4500', 10), // Safety margin under ElevenLabs 5k limit
    timeoutMs: parseInt(process.env.AUDIO_TIMEOUT_MS || '120000', 10), // 120 seconds (2 min) - ElevenLabs needs time for long audio generation
    cache: {
      ttl: parseInt(process.env.AUDIO_CACHE_TTL || '2592000', 10), // 30 days
    },
    // Rate limiting (M5+)
    maxConcurrency: parseInt(process.env.AUDIO_MAX_CONCURRENCY || '4', 10), // Free tier default
    defaultCharacterLimit: parseInt(process.env.AUDIO_DEFAULT_CHARACTER_LIMIT || '10000', 10),
    quotaRefreshIntervalMs: parseInt(process.env.AUDIO_QUOTA_REFRESH_INTERVAL_MS || '300000', 10), // 5 min
    queueTimeoutMs: parseInt(process.env.AUDIO_QUEUE_TIMEOUT_MS || '300000', 10), // 5 min
    safetyMargin: parseFloat(process.env.AUDIO_SAFETY_MARGIN || '0.9'), // Use 90% of quota
    /** When true: writer prompts omit audio-tag rules; TTS prosody tags are added in AudioDomainService before synthesis. */
    deferAudioTagsToTts: true,
    // Concurrency limits by plan (ElevenLabs Multilingual v2)
    concurrency: {
      free: 2,
      starter: 3,
      creator: 5,
      pro: 10,
      scale: 15,
      enterprise: 30,
    },
  },

  // Google Cloud (for Quotas API)
  googleCloud: {
    project: process.env.GOOGLE_CLOUD_PROJECT || '',
    credentials: process.env.GOOGLE_CLOUD_CREDENTIALS || '', // Path to service account JSON
    location: process.env.GOOGLE_CLOUD_LOCATION || 'us-central1',
  },

  // Database
  database: {
    url: process.env.DATABASE_URL || 'postgresql://kazka:devpass@localhost:5432/kazka_dev',
  },

  // JWT
  jwt: {
    secret: process.env.JWT_SECRET || 'wondertales_super_secret_key_change_in_production_2026',
    expiresIn: process.env.JWT_EXPIRES_IN || '7d',
  },

  // Session
  session: {
    expiresIn: process.env.SESSION_EXPIRES_IN || '30d',
    childExpiresIn: process.env.CHILD_SESSION_EXPIRES_IN || '8h',
    childIdleTimeout: process.env.CHILD_SESSION_IDLE_TIMEOUT || '2h',
  },

  // Google APIs
  google: {
    apiKey: process.env.GOOGLE_API_KEY || process.env.GEMINI_API_KEY || '', // For Gemini APIs (Vision, Image generation)
  },

  // OAuth
  oauth: {
    google: {
      clientId: process.env.GOOGLE_CLIENT_ID || '',
      clientSecret: process.env.GOOGLE_CLIENT_SECRET || '',
      callbackUrl: process.env.GOOGLE_CALLBACK_URL || 'http://localhost:3000/auth/google/callback',
      // Mobile client IDs for token verification
      iosClientId: process.env.GOOGLE_IOS_CLIENT_ID || process.env.GOOGLE_CLIENT_ID_IOS || '',
      androidClientId:
        process.env.GOOGLE_ANDROID_CLIENT_ID || process.env.GOOGLE_CLIENT_ID_ANDROID || '',
    },
    apple: {
      clientId: process.env.APPLE_CLIENT_ID || '',
      teamId: process.env.APPLE_TEAM_ID || '',
      keyId: process.env.APPLE_KEY_ID || '',
      privateKey: process.env.APPLE_PRIVATE_KEY || '',
      callbackUrl: process.env.APPLE_CALLBACK_URL || 'http://localhost:3000/auth/apple/callback',
    },
  },

  // Storage
  storage: {
    provider: (process.env.STORAGE_PROVIDER || 'local') as 'aws' | 'local',
    bucket: process.env.STORAGE_BUCKET || '',
    region: process.env.STORAGE_REGION || 'eu-central-1',
    accessKey: process.env.STORAGE_ACCESS_KEY || '',
    secretKey: process.env.STORAGE_SECRET_KEY || '',
    cdnUrl: process.env.STORAGE_CDN_URL || '',
  },

  // Orphan storage cleanup scheduler
  orphanStorageCleanup: {
    enabled: process.env.ORPHAN_STORAGE_CLEANUP_ENABLED === 'true',
    apply: process.env.ORPHAN_STORAGE_CLEANUP_APPLY === 'true',
    storageRoot: process.env.ORPHAN_STORAGE_CLEANUP_STORAGE_ROOT || '',
    intervalMs: parseInt(process.env.ORPHAN_STORAGE_CLEANUP_INTERVAL_MS || '86400000', 10),
    initialDelayMs: parseInt(
      process.env.ORPHAN_STORAGE_CLEANUP_INITIAL_DELAY_MS || '300000',
      10
    ),
    maxDelete: parseInt(process.env.ORPHAN_STORAGE_CLEANUP_MAX_DELETE || '100', 10),
    minAgeHours: parseFloat(process.env.ORPHAN_STORAGE_CLEANUP_MIN_AGE_HOURS || '168'),
  },

  // Email (Resend)
  email: {
    resendApiKey: process.env.RESEND_API_KEY || '',
    fromEmail: process.env.FROM_EMAIL || 'noreply@wondertales.com',
  },

  // Human verification (Cloudflare Turnstile)
  captcha: {
    turnstileSecretKey: process.env.TURNSTILE_SECRET_KEY || '',
    requiredActions: parseCaptchaRequiredActions(process.env.CAPTCHA_REQUIRED_ACTIONS),
  },

  // Published stories (static HTML output + SSR)
  web: {
    webAppUrl:
      process.env.WEB_APP_URL ||
      process.env.EXPO_PUBLIC_WEB_APP_URL ||
      'https://app.wondertales.com',
    corsAllowedOrigins:
      process.env.CORS_ALLOWED_ORIGINS ||
      process.env.WEB_APP_URL ||
      process.env.EXPO_PUBLIC_WEB_APP_URL ||
      '',
    apiPublicUrl:
      process.env.API_PUBLIC_URL ||
      process.env.WEB_APP_URL ||
      process.env.EXPO_PUBLIC_API_BASE_URL ||
      'https://api.wondertales.com',
    webBundleUrl: process.env.WEB_BUNDLE_URL || '/static/js/bundle.js', // SPA bundle for authenticated SSR handoff
    webBuildId:
      process.env.WEB_BUILD_ID ||
      process.env.SOURCE_VERSION ||
      process.env.COMMIT_SHA ||
      process.env.HOSTNAME ||
      'dev', // For SSR/cache-busting versioning
    supportEmail: process.env.SUPPORT_EMAIL || 'support@wondertales.art',
  },

  // Feature Flags
  features: {
    enableCharacterAnalysis: process.env.ENABLE_CHARACTER_ANALYSIS !== 'false', // Enabled by default
    enableRealPayments: process.env.ENABLE_REAL_PAYMENTS === 'true', // M1: Stripe/RevenueCat; false = stub (PUT /plans/upgrade)
    /** When true, logs the complete Director LLM prompt (search app.log for msg "Director full prompt"). Large. */
    logDirectorFullPrompt: process.env.LOG_DIRECTOR_FULL_PROMPT === 'true',
  },

  // Stripe (M1 Payment Integration)
  stripe: {
    secretKey: process.env.STRIPE_SECRET_KEY || '',
    webhookSecret: process.env.STRIPE_WEBHOOK_SECRET || '',
    priceIds: parseStripePriceIds(process.env.STRIPE_PRICE_IDS),
    priceIdsByCurrency: {
      USD: parseStripePriceIds(process.env.STRIPE_PRICE_IDS_USD || process.env.STRIPE_PRICE_IDS),
      EUR: parseStripePriceIds(process.env.STRIPE_PRICE_IDS_EUR),
    },
    /** Keys `bundleSlug:planSlug` → Stripe Price ID (one-time). Example: bundle_small:free:price_xxx */
    bundlePriceIds: (process.env.STRIPE_BUNDLE_PRICE_IDS || '')
      .split(',')
      .reduce<Record<string, string>>((acc, part) => {
        const t = part.trim();
        if (!t) return acc;
        const i = t.indexOf(':');
        const j = t.indexOf(':', i + 1);
        if (i < 1 || j <= i + 1) return acc;
        const bundleSlug = t.slice(0, i);
        const planSlug = t.slice(i + 1, j);
        const priceId = t.slice(j + 1);
        if (bundleSlug && planSlug && priceId) acc[`${bundleSlug}:${planSlug}`] = priceId;
        return acc;
      }, {}),
  },

  // RevenueCat (native App Store / Google Play subscriptions)
  revenueCat: {
    webhookAuthorization: process.env.REVENUECAT_WEBHOOK_AUTHORIZATION || '',
    entitlementPlanMap: (process.env.REVENUECAT_ENTITLEMENT_PLAN_MAP || '')
      .split(',')
      .reduce<Record<string, string>>((acc, pair) => {
        const [entitlementId, planSlug] = pair.trim().split(':');
        if (entitlementId && planSlug) acc[entitlementId] = planSlug;
        return acc;
      }, {}),
    productPlanMap: (process.env.REVENUECAT_PRODUCT_PLAN_MAP || '')
      .split(',')
      .reduce<Record<string, string>>((acc, pair) => {
        const t = pair.trim();
        const i = t.lastIndexOf(':');
        if (i < 1) return acc;
        const productId = t.slice(0, i);
        const planSlug = t.slice(i + 1);
        if (productId && planSlug) acc[productId] = planSlug;
        return acc;
      }, {}),
  },

  // Job Queue Concurrency (fallbacks if rate limiter unavailable)
  queue: {
    textConcurrency: parseInt(process.env.TEXT_QUEUE_CONCURRENCY || '3', 10),
    imageConcurrency: parseInt(process.env.IMAGE_QUEUE_CONCURRENCY || '10', 10),
    audioConcurrency: parseInt(process.env.AUDIO_QUEUE_CONCURRENCY || '2', 10),
    instantConcurrency: parseInt(process.env.INSTANT_QUEUE_CONCURRENCY || '3', 10),
    pollIntervalMs: parseInt(process.env.QUEUE_POLL_INTERVAL_MS || '1000', 10),
    runWorkers: process.env.RUN_JOB_WORKERS !== 'false',
    runHttpServer: process.env.RUN_HTTP_SERVER !== 'false',
  },

  generation: {
    activeRequestTtlMs: parseInt(process.env.GENERATION_ACTIVE_REQUEST_TTL_MS || '600000', 10),
    staleRequestCleanupLimit: parseInt(process.env.GENERATION_STALE_REQUEST_CLEANUP_LIMIT || '100', 10),
  },

  costControls: {
    // Calibrated from fully tracked current averages using the regular-story safety multiplier.
    storyWarnUsd: parseFloat(process.env.COST_CONTROL_STORY_WARN_USD || '1.25'),
    graphicNovelWarnUsd: parseFloat(process.env.COST_CONTROL_GRAPHIC_NOVEL_WARN_USD || '2.75'),
    mixedStoryWarnUsd: parseFloat(process.env.COST_CONTROL_MIXED_STORY_WARN_USD || '1.10'),
    dailyWarnUsd: parseFloat(process.env.COST_CONTROL_DAILY_WARN_USD || '25'),
    monthlyWarnUsd: parseFloat(process.env.COST_CONTROL_MONTHLY_WARN_USD || '500'),
    userDailyWarnUsd: parseFloat(process.env.COST_CONTROL_USER_DAILY_WARN_USD || '15'),
    queueDepthWarn: parseInt(process.env.COST_CONTROL_QUEUE_DEPTH_WARN || '20', 10),
  },

  // Text Generation Rate Limiting
  text: {
    rpmDefaultLimit: parseInt(process.env.TEXT_RPM_DEFAULT_LIMIT || '10', 10),
    rpmQuotaRefreshIntervalMs: parseInt(
      process.env.TEXT_RPM_QUOTA_REFRESH_INTERVAL_MS || '300000',
      10
    ),
    rpmSafetyMargin: parseFloat(process.env.TEXT_RPM_SAFETY_MARGIN || '0.9'),
    queueTimeoutMs: parseInt(process.env.TEXT_QUEUE_TIMEOUT_MS || '300000', 10),
    validationConcurrency: parseInt(process.env.TEXT_VALIDATION_CONCURRENCY || '3', 10),
  },
};

/**
 * Get ElevenLabs concurrency limit for a given plan
 * @param planSlug - Plan identifier (free, starter, creator, pro, scale, enterprise)
 * @returns Concurrency limit for the plan
 */
export function getConcurrencyLimitForPlan(planSlug?: string): number {
  const slug = planSlug || 'free';
  const limits = config.audio.concurrency as Record<string, number>;
  return limits[slug] || limits.free;
}

export function getValidationTextModelOverride(): string | undefined {
  const validationVendor = (config.ai.validationTextVendor || 'gemini').trim().toLowerCase();

  if (validationVendor === 'openai' && config.ai.openaiApiKey?.trim()) {
    return config.ai.openaiValidationModel;
  }

  if (config.ai.geminiApiKey?.trim()) {
    return config.ai.validationModel;
  }

  if (config.ai.openaiApiKey?.trim()) {
    return config.ai.openaiValidationModel;
  }

  return undefined;
}

export function getValidationTextModelLabel(): string {
  return (
    getValidationTextModelOverride() ??
    config.ai.validationModel ??
    config.ai.geminiVisionModel ??
    'unknown'
  );
}

export function getStoryValidationTextModelOverride(): string | undefined {
  const vendor = (config.ai.storyValidationTextVendor || 'openai').trim().toLowerCase();

  if (vendor === 'openai' && config.ai.openaiApiKey?.trim()) {
    return config.ai.openaiStoryValidationModel;
  }

  if (vendor === 'gemini' && config.ai.geminiApiKey?.trim()) {
    return config.ai.geminiStoryValidationModel;
  }

  if (config.ai.openaiApiKey?.trim()) return config.ai.openaiStoryValidationModel;
  if (config.ai.geminiApiKey?.trim()) return config.ai.geminiStoryValidationModel;
  return undefined;
}

export default config;
