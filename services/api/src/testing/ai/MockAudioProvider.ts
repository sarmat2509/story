import type {
  IAudioProvider,
  SynthesizeRequest,
  SynthesizeResult,
  Voice,
  VoiceCatalogEntry,
} from '../../providers/base/IAudioProvider';
import type { TtsSpeechTagCatalog } from '../../providers/base/TtsSpeechTagCatalog';

export type MockAudioStep =
  | { kind: 'synthesize'; response: SynthesizeResult }
  | { kind: 'error'; error: Error };

const NO_MARKUP_CATALOG: TtsSpeechTagCatalog = {
  markupModel: 'none_use_instructions',
  inlineBracketTags: [],
  wrappingTagNames: [],
  promptConstraints: [],
  pauseInstructionsForLlm: '',
};

/** Strict TTS mock. It returns only queued audio bytes and records the real request. */
export class MockAudioProvider implements IAudioProvider {
  readonly requests: SynthesizeRequest[] = [];
  readonly voiceQueries: Array<string | undefined> = [];
  private readonly steps: MockAudioStep[];

  constructor(
    steps: MockAudioStep[] = [],
    private readonly voices: Voice[] = [
      {
        id: 'mock-narrator',
        name: 'Mock Narrator',
        language: 'en',
        gender: 'neutral',
        provider: 'openai',
        dbId: '00000000-0000-4000-8000-000000000001',
      },
    ],
    private readonly catalog: TtsSpeechTagCatalog = NO_MARKUP_CATALOG
  ) {
    this.steps = [...steps];
  }

  queueSynthesis(response: SynthesizeResult): this {
    this.steps.push({ kind: 'synthesize', response });
    return this;
  }

  queueError(error: Error | string): this {
    this.steps.push({ kind: 'error', error: typeof error === 'string' ? new Error(error) : error });
    return this;
  }

  async synthesize(request: SynthesizeRequest): Promise<SynthesizeResult> {
    this.requests.push(request);
    const step = this.steps.shift();
    if (!step) throw new Error('Unexpected audio AI synthesis call');
    if (step.kind === 'error') throw step.error;
    return {
      ...structuredClone({ ...step.response, audioData: undefined }),
      audioData: Buffer.from(step.response.audioData),
    } as SynthesizeResult;
  }

  async getVoices(language?: string): Promise<Voice[]> {
    this.voiceQueries.push(language);
    return structuredClone(
      language ? this.voices.filter((voice) => voice.language === language) : this.voices
    );
  }

  async getVoice(voiceId: string): Promise<Voice | null> {
    return structuredClone(this.voices.find((voice) => voice.id === voiceId) || null);
  }

  async healthCheck(): Promise<boolean> {
    return true;
  }

  getDefaultVoices(): VoiceCatalogEntry[] {
    return [];
  }

  getMaxCharsPerChunk(): number {
    return 4096;
  }

  getMaxConcurrency(): number {
    return 4;
  }

  getTtsSpeechTagCatalog(): TtsSpeechTagCatalog {
    return this.catalog;
  }

  assertExhausted(): void {
    if (this.steps.length > 0) {
      throw new Error(`Unused audio mock responses: ${this.steps.length}`);
    }
  }
}
