/**
 * AI Cost Configuration
 * Pricing per model (Vertex AI, OpenAI, ElevenLabs, Google TTS, xAI TTS — April 2026)
 * Sources: Vertex AI Pricing, OpenAI Pricing, ElevenLabs API, Google Cloud TTS,
 *   xAI Text to Speech: https://docs.x.ai/docs/models#text-to-speech ($4.20 / 1M input characters)
 */

export interface TextCostConfig {
  inputPer1M: number;
  outputPer1M: number;
}

export interface ImageTokenCostConfig {
  imageTokens1K?: number;
  imageTokens4K?: number;
  imageTokensPer1K?: number;
  imageRatePer1M: number;
  /** Input (text + reference images) per 1M tokens. Vertex AI bills prompt tokens separately. */
  inputPer1M?: number;
  thinkingRatePer1M?: number;
}

export interface AudioTokenCostConfig {
  inputPer1M: number;
  outputPer1M: number;
  audioTokensPerSecond: number;
}

/** Text token rates also apply to `tts_prosody_tags` usage events (same input/output token units). */
export const AI_COST_CONFIG = {
  text: {
    'gemini-2.5-flash': { inputPer1M: 0.3, outputPer1M: 2.5 } as TextCostConfig,
    'gemini-2.5-flash-lite': { inputPer1M: 0.1, outputPer1M: 0.4 } as TextCostConfig,
    // Google AI paid tier list prices (approx.; verify on https://ai.google.dev/pricing )
    'gemini-3-flash-preview': { inputPer1M: 0.5, outputPer1M: 3.0 } as TextCostConfig,
    'gemini-3.1-flash-lite': { inputPer1M: 0.25, outputPer1M: 1.5 } as TextCostConfig,
    'gemini-3.1-flash-lite-preview': { inputPer1M: 0.25, outputPer1M: 1.5 } as TextCostConfig,
    'gemini-3.5-flash': { inputPer1M: 1.5, outputPer1M: 9.0 } as TextCostConfig,
    'gemini-3.1-pro-preview': { inputPer1M: 2.0, outputPer1M: 12.0 } as TextCostConfig,
    'gemini-3-pro-preview': { inputPer1M: 2.0, outputPer1M: 12.0 } as TextCostConfig,
    'gpt-5.2': { inputPer1M: 1.75, outputPer1M: 14.0 } as TextCostConfig,
    'gpt-4.1': { inputPer1M: 2.0, outputPer1M: 8.0 } as TextCostConfig,
  } as Record<string, TextCostConfig>,

  image: {
    'gemini-3-pro-image-preview': {
      imageTokens1K: 1120,
      imageTokens4K: 2000,
      imageRatePer1M: 120,
      inputPer1M: 2,
      thinkingRatePer1M: 12,
    } as ImageTokenCostConfig,
    'gemini-2.5-flash-image': {
      imageTokensPer1K: 1290,
      imageRatePer1M: 30,
      inputPer1M: 0.3,
      thinkingRatePer1M: 2.5,
    } as ImageTokenCostConfig,
    // Gemini 3.1 Flash Image Preview (Nano Banana) — Vertex AI March 2026
    // Standard: Input $0.50/1M (text+reference images), Output $60/1M (1K=1120 tokens=$0.067)
    // Flex/Batch: Input $0.25/1M, Output $30/1M
    'gemini-3.1-flash-image-preview': {
      imageTokensPer1K: 1120,
      imageRatePer1M: 60,
      inputPer1M: 0.5,
    } as ImageTokenCostConfig,
    'openai-gpt-image': 0.08 as number,
  } as Record<string, number | ImageTokenCostConfig>,

  audio: {
    'elevenlabs-eleven_v3': 0.00012,
    'elevenlabs-eleven_turbo': 0.00006,
    'gemini-2.5-flash-tts': {
      inputPer1M: 0.5,
      outputPer1M: 10.0,
      audioTokensPerSecond: 25,
    } as AudioTokenCostConfig,
    'google-wavenet': 0.000004,
    'google-neural2': 0.000016,
    'gpt-4o-mini-tts': 0.000015,
    /** xAI unary/streaming TTS: billed per input character (not audio duration). */
    'xai-tts': 4.2 / 1_000_000,
  } as Record<string, number | AudioTokenCostConfig>,
};
