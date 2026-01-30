import dotenv from 'dotenv';
import path from 'path';

// Load .env from workspace root (monorepo structure)
// When compiled, files are in dist/, so we need to go up 4 levels: dist/config -> dist -> api -> services -> root
const envPath = path.resolve(__dirname, '../../../../.env');
dotenv.config({ path: envPath });

// Debug: Log if OAuth credentials are loaded
if (process.env.NODE_ENV === 'development') {
  console.log('🔐 OAuth Config Check:');
  console.log('  ENV path:', envPath);
  console.log('  GOOGLE_CLIENT_ID:', process.env.GOOGLE_CLIENT_ID ? 'Set ✓' : 'Missing ✗');
  console.log('  GOOGLE_CLIENT_SECRET:', process.env.GOOGLE_CLIENT_SECRET ? 'Set ✓' : 'Missing ✗');
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
    geminiApiKey: process.env.GEMINI_API_KEY || '',
    geminiVisionModel: process.env.GEMINI_VISION_MODEL || 'gemini-2.5-flash',
    elevenLabsApiKey: process.env.ELEVENLABS_API_KEY || '',
    modelVersion: process.env.AI_MODEL_VERSION || 'gemini-2.5-flash',
    maxRetries: parseInt(process.env.AI_MAX_RETRIES || '3', 10),
    timeoutMs: parseInt(process.env.AI_TIMEOUT_MS || '30000', 10),
  },
  
  // Image Generation
  image: {
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
  },
  
  // Nano Banana Pro (Gemini 2.5 Flash Image) - for cartoon/illustration with character consistency
  nanoBanana: {
    model: process.env.NANO_BANANA_MODEL || 'gemini-2.5-flash-image', // or 'gemini-3.0-pro-image' for better quality
    aspectRatio: process.env.NANO_BANANA_ASPECT_RATIO || '16:9',
    enableReferenceImages: process.env.ENABLE_FIRST_IMAGE_REFERENCE !== 'false', // Enabled by default
  },
  
  // Audio/TTS Generation (M5)
  audio: {
    provider: process.env.AUDIO_PROVIDER || 'elevenlabs',
    elevenlabs: {
      apiKey: process.env.ELEVENLABS_API_KEY || '',
      model: process.env.ELEVENLABS_MODEL || 'eleven_multilingual_v2',
    },
    // Default voices per language
    defaultVoice: {
      uk: process.env.DEFAULT_VOICE_UK || '',
      en: process.env.DEFAULT_VOICE_EN || '',
      ru: process.env.DEFAULT_VOICE_RU || '',
      es: process.env.DEFAULT_VOICE_ES || '',
    },
    maxRetries: parseInt(process.env.AUDIO_MAX_RETRIES || '3', 10),
    retryDelayMs: parseInt(process.env.AUDIO_RETRY_DELAY_MS || '2000', 10),
    maxTextLength: parseInt(process.env.AUDIO_MAX_TEXT_LENGTH || '5000', 10),
    timeoutMs: parseInt(process.env.AUDIO_TIMEOUT_MS || '30000', 10), // 30 seconds
    cache: {
      ttl: parseInt(process.env.AUDIO_CACHE_TTL || '2592000', 10), // 30 days
    },
    // Rate limiting (M5+)
    maxConcurrency: parseInt(process.env.AUDIO_MAX_CONCURRENCY || '4', 10), // Free tier default
    defaultCharacterLimit: parseInt(process.env.AUDIO_DEFAULT_CHARACTER_LIMIT || '10000', 10),
    quotaRefreshIntervalMs: parseInt(process.env.AUDIO_QUOTA_REFRESH_INTERVAL_MS || '300000', 10), // 5 min
    queueTimeoutMs: parseInt(process.env.AUDIO_QUEUE_TIMEOUT_MS || '300000', 10), // 5 min
    safetyMargin: parseFloat(process.env.AUDIO_SAFETY_MARGIN || '0.9'), // Use 90% of quota
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
    secret: process.env.JWT_SECRET || 'kazka_plus_super_secret_key_change_in_production_2026',
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
      iosClientId: process.env.GOOGLE_IOS_CLIENT_ID || '',
      androidClientId: process.env.GOOGLE_ANDROID_CLIENT_ID || '',
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
  
  // Feature Flags
  features: {
    enableCharacterAnalysis: process.env.ENABLE_CHARACTER_ANALYSIS !== 'false', // Enabled by default
  },
};

export default config;
