// Single entry point: docker-compose. Env comes from env_file (.env.local or .env.production).

// Debug: Log if OAuth credentials are loaded
if (process.env.NODE_ENV === 'development') {
  console.log('🔐 OAuth Config Check:');
  console.log('  GOOGLE_CLIENT_ID:', process.env.GOOGLE_CLIENT_ID ? 'Set ✓' : 'Missing ✗');
  console.log('  GOOGLE_CLIENT_SECRET:', process.env.GOOGLE_CLIENT_SECRET ? 'Set ✓' : 'Missing ✗');
  console.log('  ELEVENLABS_API_KEY:', process.env.ELEVENLABS_API_KEY ? `Set ✓ (length: ${process.env.ELEVENLABS_API_KEY.length})` : 'Missing ✗');
  console.log('  ENABLE_ENVIRONMENT_REFERENCE:', process.env.ENABLE_ENVIRONMENT_REFERENCE === 'true' ? 'true ✓' : 'false');
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
    elevenLabsApiKey: process.env.ELEVENLABS_API_KEY || '',
    modelVersion: process.env.AI_MODEL_VERSION || 'gemini-2.5-flash',
    maxRetries: parseInt(process.env.AI_MAX_RETRIES || '3', 10),
    timeoutMs: parseInt(process.env.AI_TIMEOUT_MS || '30000', 10),
  },
  
  // Image Generation
  image: {
    skipGeneration: process.env.SKIP_IMAGE_GENERATION === 'true',
    provider: process.env.IMAGE_PROVIDER || 'nanobananapro', // Default to Nano Banana Pro
    gemini: {
      model: process.env.GEMINI_IMAGE_MODEL || 'imagen-3.0-generate-002', // Legacy Imagen 3
      projectId: process.env.GOOGLE_CLOUD_PROJECT || '',
      location: process.env.GOOGLE_CLOUD_LOCATION || 'us-central1',
    },
    defaultStyle: 'soft_watercolor',
    defaultAspectRatio: '16:9',
    maxRetries: parseInt(process.env.IMAGE_MAX_RETRIES || '3', 10),
    retryDelayMs: parseInt(process.env.IMAGE_RETRY_DELAY_MS || '2000', 10),
    // RPM Rate Limiting
    rpmQuotaRefreshIntervalMs: parseInt(process.env.IMAGE_RPM_QUOTA_REFRESH_INTERVAL_MS || '300000', 10), // 5 minutes
    rpmDefaultLimit: parseInt(process.env.IMAGE_RPM_DEFAULT_LIMIT || '150', 10), // Default RPM for Tier 1
    rpmSafetyMargin: parseFloat(process.env.IMAGE_RPM_SAFETY_MARGIN || '0.9'), // Use 90% of limit
    queueTimeoutMs: parseInt(process.env.IMAGE_QUEUE_TIMEOUT_MS || '300000', 10), // 5 minutes max wait in queue
    // Post-generation validation (Gemini Vision)
    enableValidation: process.env.ENABLE_IMAGE_VALIDATION === 'true',
    validationMaxRetries: parseInt(process.env.IMAGE_VALIDATION_MAX_RETRIES || '2', 10),
    // Max total reference images per API call (turnarounds + scene refs)
    maxReferenceImages: parseInt(process.env.IMAGE_MAX_REFERENCE_IMAGES || '3', 10),
    // Validation scoring: absolute penalties (subtracted from 100)
    validationScoring: {
      // Per-character penalties (subtracted from 100)
      recognizablePenalty: parseInt(process.env.IMAGE_SCORE_PENALTY_RECOGNIZABLE || '20', 10),
      duplicatedPenalty: parseInt(process.env.IMAGE_SCORE_PENALTY_DUPLICATED || '15', 10),
      matchesColorsPenalty: parseInt(process.env.IMAGE_SCORE_PENALTY_MATCHES_COLORS || '10', 10),
      matchesOutfitPenalty: parseInt(process.env.IMAGE_SCORE_PENALTY_MATCHES_OUTFIT || '10', 10),
      // Global penalties
      textPenalty: parseInt(process.env.IMAGE_SCORE_PENALTY_TEXT || '5', 10),
      unexpectedCharsPenalty: parseInt(process.env.IMAGE_SCORE_PENALTY_UNEXPECTED || '3', 10),
      artifactsPenalty: parseInt(process.env.IMAGE_SCORE_PENALTY_ARTIFACTS || '10', 10),
    },
    // Turnaround sheet generation for imaginary characters
    enableTurnaroundSheet: process.env.ENABLE_TURNAROUND_SHEET === 'true',
    turnaroundModel: process.env.TURNAROUND_MODEL || 'gemini-3-pro-image-preview',
    // LLM character turnaround: use Imagen 4 Fast (text-to-image, $0.02) instead of Gemini
    llmTurnaroundUseImagen4Fast: process.env.LLM_TURNAROUND_USE_IMAGEN_4_FAST !== 'false',
    // Parallel streams for image generation within a single story (turnarounds + scene images)
    parallelStreams: parseInt(process.env.IMAGE_PARALLEL_STREAMS || '2', 10),
    // Environment image reference (Imagen 4 Fast)
    enableEnvironmentReference: process.env.ENABLE_ENVIRONMENT_REFERENCE === 'true',
    imagen4Fast: {
      projectId: process.env.GOOGLE_CLOUD_PROJECT || '',
      location: process.env.GOOGLE_CLOUD_LOCATION || 'us-central1',
    },
    environmentEmbeddingSimilarityThreshold: parseFloat(
      process.env.ENVIRONMENT_EMBEDDING_SIMILARITY_THRESHOLD || '0.95'
    ),
    // Skip Imagen 4 for environments with only 1 scene (among scenes with images) — cost optimization
    skipEnvImageForSingleScene: process.env.SKIP_ENV_IMAGE_FOR_SINGLE_SCENE !== 'false',
    environmentImageStyle:
      process.env.ENVIRONMENT_IMAGE_STYLE ||
      'clean line art, simple shapes, clear spatial layout',
  },

  // OpenAI Image (GPT Image via Responses API) - for character consistency with input_fidelity
  openaiImage: {
    mainlineModel: process.env.OPENAI_IMAGE_MAINLINE_MODEL || 'gpt-4.1',
    quality: process.env.OPENAI_IMAGE_QUALITY || 'medium', // low | medium | high | auto
  },
  
  // Nano Banana Pro (Gemini 3 Pro Image) - for cartoon/illustration with character consistency
  nanoBanana: {
    model: process.env.NANO_BANANA_MODEL || 'gemini-3-pro-image-preview', // Upgraded from gemini-2.5-flash-image for better character consistency
    aspectRatio: process.env.NANO_BANANA_ASPECT_RATIO || '16:9',
    imageSize: process.env.NANO_BANANA_IMAGE_SIZE || '1K', // Output resolution: 1K | 2K | 4K
    enableReferenceImages: process.env.ENABLE_FIRST_IMAGE_REFERENCE !== 'false', // Enabled by default
    enableFilesApi: process.env.NANO_BANANA_ENABLE_FILES_API === 'true', // Off by default — upload turnarounds to Google Files API
    maxPromptLength: parseInt(process.env.NANO_BANANA_MAX_PROMPT_LENGTH || '2000', 10), // Max chars before truncation
  },
  
  // Audio/TTS Generation (M5)
  audio: {
    provider: process.env.AUDIO_PROVIDER || 'elevenlabs', // 'elevenlabs' | 'google' | 'openai'
    premiumProvider: process.env.AUDIO_PREMIUM_PROVIDER || 'elevenlabs', // Premium provider for Fairyworld plan
    elevenlabs: {
      apiKey: process.env.ELEVENLABS_API_KEY || '',
      model: process.env.ELEVENLABS_MODEL || 'eleven_v3',
    },
    // NEW: Google Cloud TTS configuration
    google: {
      projectId: process.env.GOOGLE_CLOUD_PROJECT || '',
      credentials: process.env.GOOGLE_APPLICATION_CREDENTIALS || '', // path to JSON
      model: process.env.GOOGLE_TTS_MODEL || 'gemini-2.5-flash-tts',
      location: process.env.GOOGLE_TTS_LOCATION || 'global', // or 'us', 'eu'
    },
    // NEW: OpenAI TTS configuration
    openai: {
      apiKey: process.env.OPENAI_API_KEY || '',
      model: process.env.OPENAI_TTS_MODEL || 'gpt-4o-mini-tts', // or 'tts-1', 'tts-1-hd'
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
      androidClientId: process.env.GOOGLE_ANDROID_CLIENT_ID || process.env.GOOGLE_CLIENT_ID_ANDROID || '',
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
  
  // Email (Resend)
  email: {
    resendApiKey: process.env.RESEND_API_KEY || '',
    fromEmail: process.env.FROM_EMAIL || 'noreply@wondertales.com',
  },

  // Published stories (static HTML output + SSR)
  web: {
    webAppUrl: process.env.WEB_APP_URL || process.env.EXPO_PUBLIC_WEB_APP_URL || 'https://app.wondertales.com',
    apiPublicUrl: process.env.API_PUBLIC_URL || process.env.WEB_APP_URL || process.env.EXPO_PUBLIC_API_BASE_URL || 'https://api.wondertales.com',
    webBundleUrl: process.env.WEB_BUNDLE_URL || '/static/js/bundle.js', // SPA bundle for SSR hydration
    webBuildId: process.env.WEB_BUILD_ID || 'dev', // For cache key versioning
  },

  // Feature Flags
  features: {
    enableCharacterAnalysis: process.env.ENABLE_CHARACTER_ANALYSIS !== 'false', // Enabled by default
    useDirectorFlow: process.env.USE_DIRECTOR_FLOW === 'true', // Plain text + Director for visuals (N scenes only)
  },
  
  // Job Queue Concurrency (fallbacks if rate limiter unavailable)
  queue: {
    textConcurrency: parseInt(process.env.TEXT_QUEUE_CONCURRENCY || '3', 10),
    imageConcurrency: parseInt(process.env.IMAGE_QUEUE_CONCURRENCY || '10', 10),
    audioConcurrency: parseInt(process.env.AUDIO_QUEUE_CONCURRENCY || '2', 10),
    instantConcurrency: parseInt(process.env.INSTANT_QUEUE_CONCURRENCY || '3', 10),
    pollIntervalMs: parseInt(process.env.QUEUE_POLL_INTERVAL_MS || '1000', 10),
  },
  
  // Text Generation Rate Limiting
  text: {
    rpmDefaultLimit: parseInt(process.env.TEXT_RPM_DEFAULT_LIMIT || '10', 10),
    rpmQuotaRefreshIntervalMs: parseInt(process.env.TEXT_RPM_QUOTA_REFRESH_INTERVAL_MS || '300000', 10),
    rpmSafetyMargin: parseFloat(process.env.TEXT_RPM_SAFETY_MARGIN || '0.9'),
    queueTimeoutMs: parseInt(process.env.TEXT_QUEUE_TIMEOUT_MS || '300000', 10),
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

export default config;
