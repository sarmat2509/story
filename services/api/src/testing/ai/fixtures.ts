import type { SceneValidationResult } from '../../ai/types';
import type { GeneratedImage } from '../../providers/base/IImageProvider';
import type { SynthesizeResult } from '../../providers/base/IAudioProvider';
import type { AlignmentResult } from '../../providers/base/IAlignmentProvider';
import type { StoryQuizPayloadApi } from '@wondertales/shared';

export const MOCK_PLAIN_STORY = `title: The Lantern Path

description: Two friends find their way home by helping each other.

---
[warm] Mira found a small lantern beside the quiet path.
---
[happy] She shared its light with Leo, and together they reached home.`;

export const MOCK_DIRECTOR_RESPONSE = {
  characters: [
    {
      name: 'Mira',
      type: 'person',
      description: 'A curious child with a red scarf.',
      role: 'hero',
    },
  ],
  environments: [
    {
      id: 'env_lantern_path',
      name: 'Lantern Path',
      description: 'A quiet woodland path at sunset.',
    },
  ],
  outfits: [
    {
      id: 'outfit_mira_path',
      characterName: 'Mira',
      description: 'red scarf and blue jacket',
    },
  ],
  mapTile: {
    description: 'A winding lantern path through the woods.',
    requiredFeatures: ['winding path', 'two lanterns'],
  },
  illustrations: [
    {
      environmentId: 'env_lantern_path',
      primaryRead: 'Mira lifts the lantern',
      sceneVisual: {
        setting: 'Mira stands on the path with a lantern.',
        cameraComposition: {
          shot: 'medium shot',
          characters: [
            {
              name: 'Mira',
              description: 'holding the lantern with both hands',
              outfitId: 'outfit_mira_path',
            },
          ],
        },
        lighting: 'warm sunset light',
      },
    },
  ],
};

export const MOCK_MAP_TILE_BRIEF = {
  description: 'A winding lantern path through the woods.',
  requiredFeatures: ['winding path', 'two lanterns'],
};

export const MOCK_VALID_SCENE: SceneValidationResult = {
  sceneId: 1,
  isValid: true,
  violations: [],
};

export const MOCK_BATCH_VALIDATION = { failedScenes: [] };

export const MOCK_REGENERATED_SCENES = {
  scenes: [{ sceneId: 1, text: 'Mira calmly shared the lantern with her friend.' }],
};

const ONE_PIXEL_PNG = Buffer.from(
  'iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAQAAAC1HAwCAAAAC0lEQVR42mP8/x8AAwMCAO+/p9sAAAAASUVORK5CYII=',
  'base64'
);

export function mockGeneratedImage(): GeneratedImage {
  return {
    imageData: Buffer.from(ONE_PIXEL_PNG),
    mimeType: 'image/png',
    width: 1,
    height: 1,
    format: 'png',
    requestManifest: { provider: 'mock' },
  };
}

export function mockSynthesizedAudio(): SynthesizeResult {
  return {
    audioData: Buffer.from('mock-mp3-audio'),
    mimeType: 'audio/mpeg',
    durationSeconds: 2,
    format: 'mp3',
    providerRequestId: 'mock-audio-request-1',
    metadata: { characterCount: 16, model: 'mock-tts' },
  };
}

export const MOCK_ALIGNMENT: AlignmentResult = {
  characters: [
    { text: 'H', start: 0, end: 0.1 },
    { text: 'i', start: 0.1, end: 0.2 },
  ],
  words: [{ text: 'Hi', start: 0, end: 0.2, confidence: 1 }],
  averageConfidence: 1,
  language: 'en',
  metadata: { provider: 'mock', model: 'mock-alignment', durationSeconds: 0.2 },
};

export const MOCK_CHILD_PHOTO_VALIDATION = {
  hasHumanSubject: true,
  humanSubjectCount: 1,
  primarySubject: 'human' as const,
  confidence: 0.94,
  reason: 'A clear person is the main subject.',
};

export const MOCK_FACE_DEDUPLICATION = {
  groups: [
    {
      groupId: '1',
      photoIndices: [0],
      characterType: 'person' as const,
      suggestedName: 'Child with a red scarf',
    },
  ],
};

export const MOCK_CHARACTER_ANALYSIS = {
  suggestedName: 'Mira',
  detailedDescription: 'A cheerful child wearing a red scarf.',
  appearanceTraits: null,
  clothing: null,
  distinctiveFeatures: ['red scarf'],
};

export const MOCK_CHARACTER_IDENTITY_MATCH = {
  sameCharacter: true,
  confidence: 0.98,
  colorMatch: 'strong' as const,
  shapeMatch: 'strong' as const,
  recognizability: 'strong' as const,
  stableFeatureMatches: ['hair', 'face shape'],
  differences: [],
  reason: 'The stable visual features match.',
};

export const MOCK_TTS_PROSODY = {
  taggedText: '[warm] Hello from the story.',
  vendorStylePromptEn: 'Warm, gentle bedtime narration.',
};

export const MOCK_TRANSLATIONS_JSON = JSON.stringify({
  uk: 'Ліхтар',
  ru: 'Фонарь',
  en: 'Lantern',
  es: 'Linterna',
  de: 'Laterne',
  fr: 'Lanterne',
  pl: 'Latarnia',
});

export function mockStoryQuizPayload(): StoryQuizPayloadApi {
  return {
    title: 'Think After the Story',
    language: 'en',
    sourceAgeGroup: '6-8',
    quizAgeBucket: '6-8',
    sections: [
      {
        rubric: 'check_reward',
        title: 'Check Yourself and Unlock a Prize',
        activityIds: ['check_1', 'check_2', 'check_3', 'check_4', 'check_5', 'check_6'],
      },
      {
        rubric: 'think_talk',
        title: 'I Wonder What You Think',
        activityIds: ['talk_1', 'talk_2', 'talk_3'],
      },
    ],
    activities: [
      {
        id: 'check_1',
        rubric: 'check_reward',
        kind: 'find_evidence',
        interactionType: 'evidence_choice',
        resultKind: 'text_supported',
        deliveryMode: 'self_read',
        question: 'Which event gives the clearest clue?',
        options: [
          { id: 'a', label: 'Mira found the lantern', sceneId: 1 },
          { id: 'b', label: 'Mira went to sleep', sceneId: 2 },
        ],
        correctOptionId: 'a',
        evidenceSceneIds: [1],
        hint: 'Look for the lantern.',
      },
      {
        id: 'check_2',
        rubric: 'check_reward',
        kind: 'cause_effect_chain',
        interactionType: 'single_choice',
        resultKind: 'objective',
        deliveryMode: 'self_read',
        question: 'What happened after Mira shared the light?',
        options: [
          { id: 'a', label: 'The friends found the path home' },
          { id: 'b', label: 'The lantern disappeared' },
        ],
        correctOptionId: 'a',
      },
      {
        id: 'check_3',
        rubric: 'check_reward',
        kind: 'compare_characters',
        interactionType: 'multi_select',
        resultKind: 'objective',
        deliveryMode: 'self_read',
        question: 'Which clues describe Mira?',
        options: [
          { id: 'a', label: 'Helpful' },
          { id: 'b', label: 'Careful' },
          { id: 'c', label: 'Unkind' },
        ],
        correctOptionIds: ['a', 'b'],
      },
      {
        id: 'check_4',
        rubric: 'check_reward',
        kind: 'sequence_three_events',
        interactionType: 'sequence_order',
        resultKind: 'objective',
        deliveryMode: 'self_read',
        question: 'Put the events in story order.',
        options: [
          { id: 'first', label: 'Mira found a lantern' },
          { id: 'second', label: 'Mira shared its light' },
          { id: 'third', label: 'The friends reached home' },
        ],
        preferredOrderIds: ['first', 'second', 'third'],
      },
      {
        id: 'check_5',
        rubric: 'check_reward',
        kind: 'color_mood',
        interactionType: 'color_choice',
        resultKind: 'objective',
        deliveryMode: 'self_read',
        question: 'What color best matches the lantern light?',
        options: [
          { id: 'gold', label: 'Warm gold', colorHex: '#FBBF24' },
          { id: 'blue', label: 'Cold blue', colorHex: '#3B82F6' },
        ],
        correctOptionId: 'gold',
      },
      {
        id: 'check_6',
        rubric: 'check_reward',
        kind: 'helper_choice',
        interactionType: 'branch_choice',
        resultKind: 'objective',
        deliveryMode: 'self_read',
        question: 'What helped the friends get home?',
        options: [
          { id: 'together', label: 'They shared the light' },
          { id: 'alone', label: 'They walked alone' },
        ],
        correctOptionId: 'together',
      },
      {
        id: 'talk_1',
        rubric: 'think_talk',
        kind: 'what_if',
        interactionType: 'single_choice',
        resultKind: 'reflective',
        deliveryMode: 'self_read',
        question: 'What would you do if a friend could not see the path?',
        options: [
          { id: 'share', label: 'Share my light' },
          { id: 'ask', label: 'Ask how I can help' },
        ],
      },
      {
        id: 'talk_2',
        rubric: 'think_talk',
        kind: 'emotion_change',
        interactionType: 'rating_scale',
        resultKind: 'reflective',
        deliveryMode: 'self_read',
        question: 'How brave would you feel on the dark path?',
        options: [
          { id: 'little', label: 'A little' },
          { id: 'some', label: 'Somewhat brave' },
          { id: 'lots', label: 'Very brave' },
        ],
      },
      {
        id: 'talk_3',
        rubric: 'think_talk',
        kind: 'what_if',
        interactionType: 'branch_choice',
        resultKind: 'reflective',
        deliveryMode: 'self_read',
        question: 'Which advice fits this story?',
        options: [
          { id: 'share', label: 'Share what can help others' },
          { id: 'hide', label: 'Keep every useful thing hidden' },
        ],
      },
    ],
    reward: {
      label: 'Reader Spark',
      unlockPolicy: 'complete_check_reward',
      bonusRules: ['first_attempt', 'used_evidence'],
    },
    createdAt: '2026-01-01T00:00:00.000Z',
  };
}
