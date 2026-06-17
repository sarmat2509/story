type Translate = (key: string, options?: Record<string, unknown>) => string;

type ApiErrorLike = {
  response?: {
    data?: {
      code?: string;
    };
  };
};

const API_ERROR_KEY_BY_CODE: Record<string, string> = {
  AUTHENTICATION_REQUIRED: 'authentication_required',
  PARENT_SESSION_REQUIRED: 'parent_session_required',
  OAUTH_ONLY: 'oauth_only',
  EMAIL_ALREADY_REGISTERED: 'email_already_registered',
  CONSENT_REQUIRED: 'consent_required',
  INVALID_OR_EXPIRED_TOKEN: 'invalid_or_expired_token',
  GOOGLE_OAUTH_NOT_CONFIGURED: 'google_oauth_not_configured',
  APPLE_OAUTH_NOT_CONFIGURED: 'apple_oauth_not_configured',
  PARENT_GATE_PASSWORD_UNAVAILABLE: 'parent_gate_password_unavailable',
  PARENT_GATE_FAILED: 'parent_gate_failed',
  REAL_PAYMENTS_DISABLED: 'real_payments_disabled',
  NO_SUBSCRIPTION: 'no_subscription',
  SUBSCRIPTION_PERIOD_EXPIRED: 'subscription_period_expired',
  STORY_LIMIT_EXCEEDED: 'story_limit_exceeded',
  IMAGE_GENERATION_NOT_AVAILABLE: 'image_generation_not_available',
  IMAGES_PER_STORY_LIMIT_EXCEEDED: 'images_per_story_limit_exceeded',
  AUDIO_LIMIT_EXCEEDED: 'audio_limit_exceeded',
  AUDIO_NOT_AVAILABLE: 'audio_not_available',
  PREMIUM_VOICE_REQUIRED: 'premium_voice_required',
  VOICE_NOT_FOUND: 'voice_not_found',
  VOICE_INACTIVE: 'voice_inactive',
  SERIES_ACCESS_REQUIRED: 'series_access_required',
  FEATURE_NOT_AVAILABLE: 'feature_not_available',
  STORY_FROM_DRAWING_REQUIRED: 'story_from_drawing_required',
  CHILD_PROFILE_LIMIT_EXCEEDED: 'child_profile_limit_exceeded',
  EXPENSIVE_GENERATION_RATE_LIMITED: 'expensive_generation_rate_limited',
  CHILD_DATA_CONSENT_REQUIRED: 'child_data_consent_required',
  CHILD_MODE_PASSCODE_REQUIRED: 'child_mode_passcode_required',
  CHILD_MODE_PASSCODE_NOT_CONFIGURED: 'child_mode_passcode_not_configured',
  CHILD_MODE_PASSCODE_INVALID: 'child_mode_passcode_invalid',
  CHILD_MODE_RECOVERY_INVALID: 'child_mode_recovery_invalid',
  CHILD_MODE_RECOVERY_USER_NOT_FOUND: 'child_mode_recovery_invalid',
  PROMPT_SAFETY_BLOCKED: 'prompt_safety_blocked',
  PROMPT_SAFETY_REJECTED: 'prompt_safety_blocked',
  PHOTO_URL_NOT_ALLOWED: 'photo_input_invalid',
  PHOTO_PATH_INVALID: 'photo_input_invalid',
  PHOTO_TYPE_NOT_ALLOWED: 'photo_input_invalid',
  PHOTO_OWNER_MISMATCH: 'photo_owner_mismatch',
};

export function getApiErrorCode(error: unknown): string | null {
  const code = (error as ApiErrorLike | null)?.response?.data?.code;
  return typeof code === 'string' && code.length > 0 ? code : null;
}

export function getLocalizedApiError(
  t: Translate,
  error: unknown,
  fallbackKey = 'errors.try_again'
): string {
  const code = getApiErrorCode(error);
  const apiErrorKey = code ? API_ERROR_KEY_BY_CODE[code] : null;

  if (apiErrorKey) {
    const localized = t(`api_errors.${apiErrorKey}`, { defaultValue: '' });
    if (localized) {
      return localized;
    }
  }

  return t(fallbackKey, {
    defaultValue: t('errors.try_again', { defaultValue: 'Please try again' }),
  });
}
