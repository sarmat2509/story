/**
 * Story Tone to ElevenLabs Voice Settings Mapper
 *
 * Maps story tone to ElevenLabs voice parameters (stability, similarity_boost, style, speed).
 * Story tone was removed from UI; when tone is undefined, returns default (Natural) settings.
 * Night mode still applies for bedtime stories.
 */

export interface ToneVoiceSettings {
  stability: number; // 0-1: Voice consistency (higher = more stable, less expressive)
  similarityBoost: number; // 0-1: Voice similarity (higher = more consistent)
  style: number; // 0-1: Style exaggeration (higher = more dramatic)
  speed: number; // 0.5-2.0: Speech speed multiplier
}

/**
 * Map story tone to ElevenLabs voice settings
 *
 * Parameters explained:
 * - **stability**: For v3 model - three levels only
 *   - 0.0 (Creative): Very expressive, varied (humor, adventure)
 *   - 0.5 (Natural): Balanced, natural (calm, educational, default)
 *   - 1.0 (Robust): Very stable, consistent (lullaby, night mode)
 *
 * - **similarityBoost**: Controls voice consistency
 *   - Low (0.5-0.7): More natural variation
 *   - High (0.8-0.9): Very consistent (bedtime stories)
 *
 * - **style**: Controls dramatic emphasis (v2 only, ignored by v3)
 *   - Low (0-0.2): Natural, subtle
 *   - High (0.3-0.5): More dramatic, emphasized
 *
 * - **speed**: Speech rate
 *   - Slow (0.8-0.9): Calm, lullaby
 *   - Normal (1.0): Educational, default
 *   - Fast (1.1-1.2): Adventure, humor
 */
export function mapToneToVoiceSettings(
  tone: string | null | undefined,
  nightMode: boolean = false
): ToneVoiceSettings {
  // Night mode: всегда максимально стабильный (Robust)
  if (nightMode) {
    return {
      stability: 1.0, // v3 Robust - очень стабильный
      similarityBoost: 0.85,
      style: 0.1,
      speed: 0.85,
    };
  }

  switch (tone) {
    case 'calm':
      // Спокойный - Natural (умеренная стабильность)
      return {
        stability: 0.5, // v3 Natural
        similarityBoost: 0.75,
        style: 0.15,
        speed: 0.95,
      };

    case 'adventure':
      // Приключения - Creative (выразительный)
      return {
        stability: 0.0, // v3 Creative - более выразительный
        similarityBoost: 0.65,
        style: 0.35,
        speed: 1.1,
      };

    case 'humor':
      // Юмор - Creative (очень выразительный)
      return {
        stability: 0.0, // v3 Creative - максимальная выразительность
        similarityBoost: 0.6,
        style: 0.4,
        speed: 1.15,
      };

    case 'lullaby':
      // Колыбельная - Robust (очень стабильный)
      return {
        stability: 1.0, // v3 Robust - максимальная стабильность
        similarityBoost: 0.85,
        style: 0.1,
        speed: 0.8,
      };

    case 'educational':
      // Обучение - Natural (сбалансированный)
      return {
        stability: 0.5, // v3 Natural
        similarityBoost: 0.7,
        style: 0.2,
        speed: 1.0,
      };

    default:
      // По умолчанию - Natural (сбалансированный)
      return {
        stability: 0.5, // v3 Natural
        similarityBoost: 0.75,
        style: 0.2,
        speed: 1.0,
      };
  }
}

/**
 * Example usage in ElevenLabsProvider:
 *
 * ```typescript
 * const toneSettings = mapToneToVoiceSettings(story.tone, prosody?.nightMode);
 *
 * const voiceSettings = {
 *   stability: toneSettings.stability,
 *   similarity_boost: toneSettings.similarityBoost,
 *   style: toneSettings.style,
 *   use_speaker_boost: true,
 * };
 *
 * const effectiveSpeed = (prosody?.speed || 1.0) * toneSettings.speed;
 * ```
 */
