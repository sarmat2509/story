import { ElevenLabsProvider } from '../../providers/audio/elevenlabs/ElevenLabsProvider';
import type { SynthesizeRequest, SynthesizeResult } from '../../providers/base/IAudioProvider';
import { logger } from '../../utils/logger';

/**
 * Extended ElevenLabs provider for testing v3 features
 * NOT FOR PRODUCTION USE - testing only
 * 
 * Adds support for:
 * - Custom model selection (v2, v3)
 * - SSML markup (<break> tags)
 * - Eleven v3 pause tags ([short pause], [pause], [long pause])
 * - Eleven v3 audio tags ([PAUSES], [WHISPERING], [NERVOUS], [LOUDLY], [GASP])
 */
export class ElevenLabsTestProvider extends ElevenLabsProvider {
  private readonly apiKey: string;

  constructor(apiKey: string) {
    super(apiKey);
    this.apiKey = apiKey;
  }

  /**
   * Synthesize with custom model and raw text (supports SSML and v3 tags)
   */
  async synthesizeWithModel(
    request: SynthesizeRequest & { 
      model?: string;  // Allow custom model selection
      rawText?: string; // Allow raw SSML/tagged text
    }
  ): Promise<SynthesizeResult> {
    const { text, rawText, voiceId, language, prosody, model, outputFormat = 'mp3' } = request;
    
    // Use rawText if provided (for SSML/v3 tags), otherwise use text
    const textToSynthesize = rawText || text;
    
    logger.info(
      {
        textLength: textToSynthesize.length,
        voiceId,
        language,
        model: model || 'eleven_multilingual_v2',
        hasSSML: textToSynthesize.includes('<break'),
        hasV3Tags: textToSynthesize.includes('[pause]') || textToSynthesize.includes('[PAUSES]'),
      },
      'Synthesizing audio with test provider'
    );

    const startTime = Date.now();
    
    // Custom voice settings with extended prosody support
    const voiceSettings: any = {
      stability: (prosody as any)?.stability ?? 0.5,
      similarity_boost: (prosody as any)?.similarity_boost ?? 0.75,
      style: (prosody as any)?.style ?? 0.0,
      use_speaker_boost: (prosody as any)?.use_speaker_boost ?? true,
    };

    // Only include speed if it's different from 1.0
    // (some models handle speed differently)
    if (prosody?.speed && prosody.speed !== 1.0) {
      voiceSettings.speed = prosody.speed;
    }

    try {
      const response = await fetch(
        `https://api.elevenlabs.io/v1/text-to-speech/${voiceId}`,
        {
          method: 'POST',
          headers: {
            'Accept': 'audio/mpeg',
            'Content-Type': 'application/json',
            'xi-api-key': this.apiKey,
          },
          body: JSON.stringify({
            text: textToSynthesize,
            model_id: model || 'eleven_multilingual_v2',
            voice_settings: voiceSettings,
          }),
        }
      );

      if (!response.ok) {
        const errorText = await response.text();
        logger.error(
          {
            status: response.status,
            errorText,
            model: model || 'eleven_multilingual_v2',
            voiceId,
          },
          'ElevenLabs API error'
        );
        throw new Error(`ElevenLabs API error: ${response.status} - ${errorText}`);
      }

      const arrayBuffer = await response.arrayBuffer();
      const audioBuffer = Buffer.from(arrayBuffer);

      const generationTime = Date.now() - startTime;

      // Calculate approximate duration (rough estimate)
      const wordCount = text.split(/\s+/).length;
      const baseSpeed = 150; // words per minute
      const speedMultiplier = prosody?.speed || 1.0;
      const durationSeconds = (wordCount / baseSpeed) * 60 / speedMultiplier;

      logger.info(
        {
          voiceId,
          model: model || 'eleven_multilingual_v2',
          textLength: textToSynthesize.length,
          audioSizeBytes: audioBuffer.length,
          durationSeconds,
          generationTimeMs: generationTime,
        },
        'Audio synthesized successfully'
      );

      return {
        audioData: audioBuffer,
        mimeType: 'audio/mpeg',
        durationSeconds,
        format: 'mp3',
        metadata: {
          characterCount: textToSynthesize.length,
          model: model || 'eleven_multilingual_v2',
          generationTimeMs: generationTime,
        },
      };
    } catch (error: any) {
      logger.error(
        { 
          error: error.message, 
          voiceId, 
          model: model || 'eleven_multilingual_v2',
          textLength: textToSynthesize.length 
        },
        'Audio synthesis failed'
      );
      throw error;
    }
  }
}
