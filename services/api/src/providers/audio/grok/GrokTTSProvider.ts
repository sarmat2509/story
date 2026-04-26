import { SynthesizeRequest, SynthesizeResult, Voice, VoiceCatalogEntry } from '../../base/IAudioProvider';
import type { TtsSpeechTagCatalog } from '../../base/TtsSpeechTagCatalog';
import { buildGrokSpeechTagCatalog } from '../ttsSpeechTagCatalogs';
import { BaseAudioProvider } from '../../base/BaseAudioProvider';
import { GROK_TTS_VOICE_CATALOG } from './voices';
import { isGrokBlockedForStoryLanguage } from './supportedLocales';
import { logger } from '../../../utils/logger';

const XAI_TTS_URL = 'https://api.x.ai/v1/tts';
const XAI_TTS_VOICES_URL = 'https://api.x.ai/v1/tts/voices';

const VALID_GROK_VOICE_IDS = new Set(
  GROK_TTS_VOICE_CATALOG.map((v) => v.providerVoiceId.toLowerCase())
);

/**
 * Map app locale (story / user language) to xAI `language` parameter (BCP-47 or `auto`).
 */
export function mapAppLocaleToXaiLanguage(locale: string): string {
  const map: Record<string, string> = {
    en: 'en',
    ru: 'ru',
    es: 'es-ES',
    de: 'de',
    fr: 'fr',
    pl: 'auto',
  };
  return map[locale] ?? 'auto';
}

export class GrokTTSProvider extends BaseAudioProvider {
  private readonly apiKey: string;

  constructor(apiKey: string) {
    super();
    if (!apiKey) {
      throw new Error('Grok/xAI API key is required (GROK_API_KEY or XAI_API_KEY)');
    }
    this.apiKey = apiKey;
  }

  protected getProviderName(): string {
    return 'Grok TTS';
  }

  getMaxCharsPerChunk(): number {
    return 14_000; // xAI unary limit 15_000 characters
  }

  getMaxConcurrency(_planSlug?: string): number {
    return 6;
  }

  protected isValidVoiceId(voiceId: string): boolean {
    return VALID_GROK_VOICE_IDS.has(voiceId.trim().toLowerCase());
  }

  protected async performHealthCheck(): Promise<void> {
    const response = await fetch(XAI_TTS_VOICES_URL, {
      method: 'GET',
      headers: {
        Authorization: `Bearer ${this.apiKey}`,
      },
    });
    if (!response.ok) {
      const body = await response.text().catch(() => '');
      throw new Error(`Grok TTS voices health check failed: ${response.status} ${body}`);
    }
  }

  async synthesize(request: SynthesizeRequest): Promise<SynthesizeResult> {
    this.validateSynthesizeRequest(request);

    if (isGrokBlockedForStoryLanguage(request.language)) {
      throw new Error(
        'Grok (xAI) TTS is not supported for Ukrainian (locale uk). Use another TTS provider.'
      );
    }

    const { text, voiceId, language } = request;

    return this.retryWithBackoff(
      async () =>
        this.withTimeout(this.performSynthesis(text, voiceId, language), this.timeoutMs, 'Grok TTS synthesis'),
      1,
      'synthesize'
    );
  }

  private async performSynthesis(text: string, voiceId: string, language: string): Promise<SynthesizeResult> {
    const xaiLanguage = mapAppLocaleToXaiLanguage(language);
    const normalizedVoice = voiceId.trim().toLowerCase();

    const response = await fetch(XAI_TTS_URL, {
      method: 'POST',
      headers: {
        Authorization: `Bearer ${this.apiKey}`,
        'Content-Type': 'application/json',
      },
      body: JSON.stringify({
        text,
        voice_id: normalizedVoice,
        language: xaiLanguage,
        output_format: {
          codec: 'mp3',
          sample_rate: 24000,
          bit_rate: 128000,
        },
      }),
    });

    if (!response.ok) {
      const errText = await response.text().catch(() => '');
      logger.error(
        { status: response.status, bodyPreview: errText.slice(0, 500) },
        'Grok TTS request failed'
      );
      const msg =
        response.status === 400
          ? `invalid request: Grok TTS ${response.status}: ${errText}`
          : `Grok TTS error ${response.status}: ${errText}`;
      throw new Error(msg);
    }

    const audioBuffer = Buffer.from(await response.arrayBuffer());

    return {
      audioData: audioBuffer,
      mimeType: 'audio/mpeg',
      durationSeconds: this.estimateDuration(text),
      format: 'mp3',
      metadata: {
        characterCount: text.length,
        model: 'xai-tts',
      },
    };
  }

  async getVoices(language?: string): Promise<Voice[]> {
    return GROK_TTS_VOICE_CATALOG.filter((v) => !language || v.language === language).map((v) => ({
      id: v.providerVoiceId,
      name: v.name,
      language: v.language,
      gender: v.gender,
      provider: 'grok',
      description: v.description,
    }));
  }

  async getVoice(voiceId: string): Promise<Voice | null> {
    const v = GROK_TTS_VOICE_CATALOG.find((e) => e.providerVoiceId.toLowerCase() === voiceId.trim().toLowerCase());
    if (!v) return null;
    return {
      id: v.providerVoiceId,
      name: v.name,
      language: v.language,
      gender: v.gender,
      provider: 'grok',
      description: v.description,
    };
  }

  getDefaultVoices(): VoiceCatalogEntry[] {
    return GROK_TTS_VOICE_CATALOG;
  }

  getTtsSpeechTagCatalog(): TtsSpeechTagCatalog {
    return buildGrokSpeechTagCatalog();
  }
}
