/**
 * ElevenLabs v3 Audio Tags Reference
 * Based on official documentation: https://elevenlabs.io/docs/overview/capabilities/text-to-speech/best-practices#prompting-eleven-v3-alpha
 * 
 * CRITICAL: These are the EXACT formats supported by ElevenLabs v3.
 * Using incorrect formats (e.g., [whispers] instead of [whisper]) will cause tags to be spoken literally!
 * 
 * Format rules:
 * - All lowercase only (NOT [WHISPER] or [Whisper])
 * - Singular or present continuous forms (NOT plural like [whispers])
 * - Use EXACTLY as listed below
 */

export const AUDIO_TAGS = {
  // Emotions & Directions (from official "Enhance" prompt)
  emotions: [
    'happy', 'sad', 'excited', 'angry', 'nervous', 'curious', 
    'surprised', 'annoyed', 'appalled', 'thoughtful', 'mischievously',
    'sarcastic', 'crying', 'frustrated'
  ],
  
  // Voice Delivery (CORRECTED: singular forms only)
  delivery: [
    'whisper', 'shouting',  // NOT 'whispers' or 'shouts'
  ],
  
  // Non-verbal Sounds (CORRECTED: use present continuous or singular)
  nonVerbal: [
    'laughing', 'chuckles', 'sighs',  // NOT 'laughs' or 'giggles'
    'exhales sharply', 'inhales deeply', 'swallows', 'gulps',
    'clears throat', 'snorts', 'wheezing'
  ],
  
  // Timing & Pacing
  timing: [
    'short pause', 'pause', 'long pause',
    'rushed', 'stammers', 'drawn out', 'slows down', 'deliberate'
  ],
  
  // Character Performance (use sparingly for children's content)
  character: [
    'strong French accent', 'strong British accent', 
    'strong Australian accent', 'pirate voice'
  ],
  
  // Sound Effects (limited support - avoid in children's content)
  soundEffects: [
    'applause', 'clapping', 'explosion', 'gunshot' // NOT recommended for children
  ]
} as const;

/**
 * Get all available audio tags as flat array
 */
export function getAllAudioTags(): string[] {
  return Object.values(AUDIO_TAGS).flat();
}

/**
 * Check if a tag is valid
 */
export function isValidAudioTag(tag: string): boolean {
  return getAllAudioTags().includes(tag.toLowerCase());
}
