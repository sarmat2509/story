import { TextToSpeechClient } from '@google-cloud/text-to-speech';
import { SynthesizeRequest, SynthesizeResult, Voice, VoiceCatalogEntry } from '../../base/IAudioProvider';
import type { TtsSpeechTagCatalog } from '../../base/TtsSpeechTagCatalog';
import { buildGoogleGeminiTtsSpeechTagCatalog } from '../ttsSpeechTagCatalogs';
import { BaseAudioProvider } from '../../base/BaseAudioProvider';
import { GOOGLE_TTS_VOICE_CATALOG } from './voices';
import { GoogleTagProcessor } from './GoogleTagProcessor';
import { logger } from '../../../utils/logger';

export class GoogleTTSProvider extends BaseAudioProvider {
  private client: TextToSpeechClient;
  private model: string;
  private projectId: string;
  private tagProcessor: GoogleTagProcessor;
  
  constructor(projectId: string, credentials: string, model: string = 'gemini-2.5-flash-tts') {
    super();
    this.projectId = projectId;
    this.model = model;
    this.tagProcessor = new GoogleTagProcessor();
    
    // Initialize client with service account credentials
    this.client = new TextToSpeechClient({
      keyFilename: credentials,
    });
  }

  protected getProviderName(): string {
    return 'Google TTS';
  }

  getMaxCharsPerChunk(): number {
    return 2000; // Google TTS: 4000 bytes limit; UTF-8 ~2 bytes/char
  }

  getMaxConcurrency(_planSlug?: string): number {
    return 10; // 100 concurrent/project per docs; 10 per user conservative
  }

  protected isValidVoiceId(voiceId: string): boolean {
    // Google TTS accepts any valid voice name
    // Validate against known catalog or allow any string
    return GOOGLE_TTS_VOICE_CATALOG.some(v => v.providerVoiceId === voiceId) || 
           /^[a-zA-Z]+$/.test(voiceId);
  }

  protected async performHealthCheck(): Promise<void> {
    await this.client.listVoices({});
  }
  
  async synthesize(request: SynthesizeRequest): Promise<SynthesizeResult> {
    // Validate input
    this.validateSynthesizeRequest(request);
    
    const { text, voiceId, language, prosody, synthesizeStylePromptEn } = request;

    // Process tags using abstract interface
    const processed = this.tagProcessor.process(text, prosody);

    const styleFromLlm = synthesizeStylePromptEn?.trim();
    const tagProcessorPrompt = processed.emotionalControl?.value?.trim();
    const mergedPrompt = [styleFromLlm, tagProcessorPrompt].filter(Boolean).join('\n\n') || undefined;

    // Call Google TTS API with retry and timeout
    return this.retryWithBackoff(async () => {
      return this.withTimeout(
        this.performSynthesis(processed.text, voiceId, language, mergedPrompt),
        this.timeoutMs,
        'Google TTS synthesis'
      );
    }, 1, 'synthesize');
  }

  private async performSynthesis(
    text: string, 
    voiceId: string, 
    language: string, 
    prompt?: string
  ): Promise<SynthesizeResult> {
    // Build input object - prompt is a system instruction for Gemini-TTS
    const input: any = { text };
    if (prompt) {
      input.prompt = prompt;
    }

    const [response] = await this.client.synthesizeSpeech({
      input,
      voice: {
        languageCode: this.mapLanguageCode(language),
        name: voiceId,
        // Model name is required for Gemini-TTS voices (note the underscore)
        // Using any to bypass TypeScript until package updates
        modelName: this.model,
      } as any,
      audioConfig: {
        audioEncoding: 'MP3',
        sampleRateHertz: 24000,
      },
    });
    
    if (!response.audioContent) {
      throw new Error('No audio content returned from Google TTS');
    }
    
    return {
      audioData: Buffer.from(response.audioContent as Uint8Array),
      mimeType: 'audio/mpeg',
      durationSeconds: this.estimateDuration(text),
      format: 'mp3',
      metadata: { 
        characterCount: text.length, 
        model: this.model,
      },
    };
  }
  
  async getVoices(language?: string): Promise<Voice[]> {
    return this.retryWithBackoff(async () => {
      const [response] = await this.client.listVoices({});
      
      const voices = response.voices
        ?.filter(v => !language || v.languageCodes?.includes(this.mapLanguageCode(language)))
        .map(v => ({
          id: v.name || '',
          name: v.name || '',
          language: this.unmapLanguageCode(v.languageCodes?.[0] || ''),
          gender: this.mapGender(v.ssmlGender),
        }));
      
      return voices || [];
    }, 1, 'getVoices');
  }
  
  async getVoice(voiceId: string): Promise<Voice | null> {
    try {
      const voices = await this.getVoices();
      return voices.find(v => v.id === voiceId) || null;
    } catch (error: any) {
      logger.error({ error: error.message, voiceId }, 'Failed to get voice');
      return null;
    }
  }
  
  /**
   * Get default voice catalog for database seeding
   */
  getDefaultVoices(): VoiceCatalogEntry[] {
    return GOOGLE_TTS_VOICE_CATALOG;
  }
  
  private mapLanguageCode(lang: string): string {
    const mapping: Record<string, string> = {
      uk: 'uk-UA',
      en: 'en-US',
      ru: 'ru-RU',
      es: 'es-ES',
      de: 'de-DE',
      fr: 'fr-FR',
      pl: 'pl-PL',
    };
    return mapping[lang] || 'en-US';
  }
  
  private unmapLanguageCode(langCode: string): string {
    const mapping: Record<string, string> = {
      'uk-UA': 'uk',
      'en-US': 'en',
      'en-GB': 'en',
      'ru-RU': 'ru',
      'es-ES': 'es',
      'de-DE': 'de',
      'fr-FR': 'fr',
      'pl-PL': 'pl',
    };
    return mapping[langCode] || 'en';
  }
  
  private mapGender(ssmlGender: any): 'male' | 'female' | 'neutral' {
    if (ssmlGender === 'MALE') return 'male';
    if (ssmlGender === 'FEMALE') return 'female';
    return 'neutral';
  }

  getTtsSpeechTagCatalog(): TtsSpeechTagCatalog {
    return buildGoogleGeminiTtsSpeechTagCatalog();
  }
}
