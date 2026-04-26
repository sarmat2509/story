import OpenAI from 'openai';
import { SynthesizeRequest, SynthesizeResult, Voice, VoiceCatalogEntry } from '../../base/IAudioProvider';
import type { TtsSpeechTagCatalog } from '../../base/TtsSpeechTagCatalog';
import { buildOpenAiTtsSpeechTagCatalog } from '../ttsSpeechTagCatalogs';
import { BaseAudioProvider } from '../../base/BaseAudioProvider';
import { OPENAI_TTS_VOICE_CATALOG } from './voices';
import { OpenAITagProcessor } from './OpenAITagProcessor';
import { logger } from '../../../utils/logger';

// Valid OpenAI voice IDs
const VALID_OPENAI_VOICES = [
  'alloy', 'ash', 'ballad', 'coral', 'echo', 
  'fable', 'nova', 'onyx', 'sage', 'shimmer', 
  'verse', 'marin', 'cedar'
] as const;

type OpenAIVoice = typeof VALID_OPENAI_VOICES[number];

export class OpenAITTSProvider extends BaseAudioProvider {
  private client: OpenAI;
  private model: string;
  private tagProcessor: OpenAITagProcessor;
  
  constructor(apiKey: string, model: string = 'gpt-4o-mini-tts') {
    super();
    this.client = new OpenAI({ apiKey });
    this.model = model;
    this.tagProcessor = new OpenAITagProcessor();
  }

  protected getProviderName(): string {
    return 'OpenAI TTS';
  }

  getMaxCharsPerChunk(): number {
    return 4000; // OpenAI TTS: 4096 char limit
  }

  getMaxConcurrency(_planSlug?: string): number {
    return 10;
  }

  protected isValidVoiceId(voiceId: string): boolean {
    return VALID_OPENAI_VOICES.includes(voiceId as any);
  }

  protected async performHealthCheck(): Promise<void> {
    // Make a minimal test request
    await this.client.audio.speech.create({
      model: this.model,
      voice: 'alloy',
      input: 'test',
    });
  }
  
  async synthesize(request: SynthesizeRequest): Promise<SynthesizeResult> {
    // Validate input
    this.validateSynthesizeRequest(request);
    
    const { text, voiceId, prosody } = request;
    
    // Process tags using abstract interface
    const processed = this.tagProcessor.process(text, prosody);
    
    // Call OpenAI TTS API with retry and timeout
    return this.retryWithBackoff(async () => {
      return this.withTimeout(
        this.performSynthesis(processed.text, voiceId as OpenAIVoice, processed.emotionalControl?.value, prosody?.speed),
        this.timeoutMs,
        'OpenAI TTS synthesis'
      );
    }, 1, 'synthesize');
  }

  private async performSynthesis(
    text: string,
    voiceId: OpenAIVoice,
    instructions?: string,
    speed?: number
  ): Promise<SynthesizeResult> {
    const response = await this.client.audio.speech.create({
      model: this.model,
      voice: voiceId,
      input: text,
      instructions: instructions, // Only for gpt-4o-mini-tts
      response_format: 'mp3',
      speed: speed || 1.0,
    });
    
    const audioBuffer = Buffer.from(await response.arrayBuffer());
    
    return {
      audioData: audioBuffer,
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
    // OpenAI has fixed set of voices - return from catalog
    return OPENAI_TTS_VOICE_CATALOG
      .filter(v => !language || v.language === language)
      .map(v => ({
        id: v.providerVoiceId,
        name: v.name,
        language: v.language,
        gender: v.gender as 'male' | 'female' | 'neutral',
      }));
  }
  
  async getVoice(voiceId: string): Promise<Voice | null> {
    const voice = OPENAI_TTS_VOICE_CATALOG.find(v => v.providerVoiceId === voiceId);
    if (!voice) return null;
    
    return {
      id: voice.providerVoiceId,
      name: voice.name,
      language: voice.language,
      gender: voice.gender as 'male' | 'female' | 'neutral',
    };
  }
  
  /**
   * Get default voice catalog for database seeding
   */
  getDefaultVoices(): VoiceCatalogEntry[] {
    return OPENAI_TTS_VOICE_CATALOG;
  }

  getTtsSpeechTagCatalog(): TtsSpeechTagCatalog {
    return buildOpenAiTtsSpeechTagCatalog();
  }
}
