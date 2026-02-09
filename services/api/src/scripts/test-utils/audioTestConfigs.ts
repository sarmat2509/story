/**
 * Test configurations for ElevenLabs audio generation
 * 
 * 6 packages testing different voice settings and pause controls:
 * - Packages 1-3: SSML breaks for v2 models
 * - Packages 4-6: v3 pause and audio tags
 */

export interface AudioTestConfig {
  id: string;
  name: string;
  model: string;
  voiceSettings: {
    stability: number;
    similarity_boost: number;
    style: number;
    speed: number;
    use_speaker_boost: boolean;
  };
  text: string;
  description: string;
}

export const BASE_TEXT = `У невеличкому містечку, де завжди звучав сміх дітей, жила дівчинка на ім'я Міліна.
Вона була не тільки допитливою, а ще й дуже веселою.
Одного дня, коли Міліна гуляла у парку, вона почула дивний звук: «Бууу!».
«Це, мабуть, привид!»`;

export const TEST_CONFIGS: AudioTestConfig[] = [
  // Package 1: Warm Narrator (SSML)
  {
    id: 'pkg1-warm-narrator-ssml',
    name: 'Warm Narrator',
    model: 'eleven_multilingual_v2',
    voiceSettings: {
      stability: 0.55,
      similarity_boost: 0.80,
      style: 0.0,
      speed: 0.95,
      use_speaker_boost: true,
    },
    text: `У невеличкому містечку, де завжди звучав сміх дітей, жила дівчинка на ім'я Міліна. <break time="0.35s" />
Вона була не тільки допитливою, а ще й дуже веселою. <break time="0.35s" />
Одного дня, коли Міліна гуляла у парку, вона почула дивний звук: <break time="0.25s" /> «Бууу!». <break time="0.70s" />
«Це, мабуть, привид!»`,
    description: 'SSML breaks, moderate pauses, warm tone',
  },

  // Package 2: Cinematic (SSML)
  {
    id: 'pkg2-cinematic-ssml',
    name: 'Cinematic',
    model: 'eleven_multilingual_v2',
    voiceSettings: {
      stability: 0.45,
      similarity_boost: 0.78,
      style: 0.0,
      speed: 0.93,
      use_speaker_boost: true,
    },
    text: `У невеличкому містечку, де завжди звучав сміх дітей, жила дівчинка на ім'я Міліна. <break time="0.45s" />
Вона була не тільки допитливою, а ще й дуже веселою. <break time="0.40s" />
Одного дня, коли Міліна гуляла у парку, вона почула дивний звук: <break time="0.50s" /> «Бууу!». <break time="0.90s" />
«Це, мабуть, привид!»`,
    description: 'SSML breaks, longer dramatic pauses, less stable',
  },

  // Package 3: Clear & Stable (SSML)
  {
    id: 'pkg3-clear-stable-ssml',
    name: 'Clear & Stable',
    model: 'eleven_multilingual_v2',
    voiceSettings: {
      stability: 0.70,
      similarity_boost: 0.85,
      style: 0.0,
      speed: 0.98,
      use_speaker_boost: true,
    },
    text: `У невеличкому містечку, де завжди звучав сміх дітей, жила дівчинка на ім'я Міліна. <break time="0.25s" />
Вона була не тільки допитливою, а ще й дуже веселою. <break time="0.25s" />
Одного дня, коли Міліна гуляла у парку, вона почула дивний звук: <break time="0.20s" /> «Бууу!». <break time="0.55s" />
«Це, мабуть, привид!»`,
    description: 'SSML breaks, short pauses, very stable and clear',
  },

  // Package 4: Fairy Tale (SSML adapted from v3)
  {
    id: 'pkg4-fairy-tale-ssml',
    name: 'Fairy Tale',
    model: 'eleven_multilingual_v2',
    voiceSettings: {
      stability: 0.50,
      similarity_boost: 0.78,
      style: 0.0,
      speed: 0.94,
      use_speaker_boost: true,
    },
    text: `У невеличкому містечку, де завжди звучав сміх дітей, жила дівчинка на ім'я Міліна. <break time="0.30s" />
Вона була не тільки допитливою, а ще й дуже веселою. <break time="0.30s" />
Одного дня, коли Міліна гуляла у парку, вона почула дивний звук: <break time="0.40s" /> «Бууу!». <break time="0.80s" />
«Це, мабуть, привид!»`,
    description: 'Fairy tale delivery with medium pauses, moderate stability',
  },

  // Package 5: Suspenseful (SSML adapted from v3)
  {
    id: 'pkg5-suspenseful-ssml',
    name: 'Suspenseful',
    model: 'eleven_multilingual_v2',
    voiceSettings: {
      stability: 0.40,
      similarity_boost: 0.75,
      style: 0.0,
      speed: 0.92,
      use_speaker_boost: true,
    },
    text: `У невеличкому містечку, де завжди звучав сміх дітей, жила дівчинка на ім'я Міліна… <break time="0.30s" />
Вона була не тільки допитливою, а ще й дуже веселою. <break time="0.30s" />
Одного дня, коли Міліна гуляла у парку, вона почула дивний звук: <break time="1.0s" />
«Бууу!». <break time="0.60s" />
«Це, мабуть, привид!»`,
    description: 'Suspenseful build-up with very long pause before scary moment, low stability',
  },

  // Package 6: Dramatic expressive (SSML)
  {
    id: 'pkg6-dramatic-expressive',
    name: 'Dramatic Expressive',
    model: 'eleven_multilingual_v2',
    voiceSettings: {
      stability: 0.35,
      similarity_boost: 0.72,
      style: 0.0,
      speed: 0.90,
      use_speaker_boost: true,
    },
    text: `У невеличкому містечку, де завжди звучав сміх дітей, жила дівчинка на ім'я Міліна… <break time="0.50s" />
Вона була не тільки допитливою, а ще й дуже веселою. <break time="0.35s" />
Одного дня, коли Міліна гуляла у парку, вона почула дивний звук: <break time="0.85s" />
«Бууу!» <break time="0.45s" />
«Це, мабуть, привид!»`,
    description: 'Very expressive with lowest stability and slowest speed for dramatic effect',
  },

  // Package 7: Audio tags test (testing if v2 supports v3-style audio tags)
  {
    id: 'pkg7-audio-tags-test-v2',
    name: 'Audio Tags Test (v3 tags on v2)',
    model: 'eleven_multilingual_v2',
    voiceSettings: {
      stability: 0.45,
      similarity_boost: 0.78,
      style: 0.0,
      speed: 0.94,
      use_speaker_boost: true,
    },
    text: `[PAUSES][WHISPERING] У невеличкому містечку, де завжди звучав сміх дітей, жила дівчинка на ім'я Міліна…
Вона була не тільки допитливою, а ще й дуже веселою.
[NERVOUS][PAUSES] Одного дня, коли Міліна гуляла у парку, вона почула дивний звук:
[LOUDLY] «Бууу!»
[GASP] «Це, мабуть, привид!»`,
    description: 'Testing v3-style audio tags ([PAUSES], [WHISPERING], [NERVOUS], [LOUDLY], [GASP]) on v2 model',
  },

  // Package 8: Audio tags with real v3 model
  {
    id: 'pkg8-audio-tags-v3',
    name: 'Audio Tags (Eleven v3)',
    model: 'eleven_v3',
    voiceSettings: {
      stability: 0.5, // v3 requires: 0.0 (Creative), 0.5 (Natural), or 1.0 (Robust)
      similarity_boost: 0.75,
      style: 0.0,
      speed: 1.0, // v3 may have restrictions on speed
      use_speaker_boost: true,
    },
    text: `[whispers] У невеличкому містечку, де завжди звучав сміх дітей, жила дівчинка на ім'я Міліна…
Вона була не тільки допитливою, а ще й дуже веселою.
[nervous] Одного дня, коли Міліна гуляла у парку, вона почула дивний звук:
[shouts] «Бууу!»
[gasps] «Це, мабуть, привид!»`,
    description: 'Using real v3 audio tags ([whispers], [nervous], [shouts], [gasps]) on eleven_v3 model',
  },
];
