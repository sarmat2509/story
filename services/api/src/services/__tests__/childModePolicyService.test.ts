import assert from 'node:assert';
import { DEFAULT_CHILD_MODE_SETTINGS } from '../childModeControlsService';
import {
  ChildModePolicyError,
  assertChildAudioGenerationControls,
  assertChildQuizGenerationControls,
  assertChildStoryContinuationControls,
  assertChildStoryRequestControls,
} from '../childModePolicyService';

const baseInput = {
  uiLocale: 'uk',
  storyLanguage: 'uk',
  childProfileId: 'child-1',
} as any;

function assertPolicyError(fn: () => unknown, code: ChildModePolicyError['code']) {
  assert.throws(fn, (error) => error instanceof ChildModePolicyError && error.code === code);
}

void (async function main() {
  assert.deepStrictEqual(
    assertChildStoryRequestControls({
      sessionChildProfileId: 'child-1',
      input: baseInput,
      settings: DEFAULT_CHILD_MODE_SETTINGS,
      dailyCreatedCount: 0,
      monthlyCreatedCount: 0,
    }),
    {
      parentReviewRequired: false,
      settings: DEFAULT_CHILD_MODE_SETTINGS,
    },
    'open defaults allow a basic child story request without parent review'
  );

  assertPolicyError(
    () =>
      assertChildStoryRequestControls({
        sessionChildProfileId: 'child-1',
        input: baseInput,
        settings: { ...DEFAULT_CHILD_MODE_SETTINGS, storyGenerationEnabled: false },
        dailyCreatedCount: 0,
        monthlyCreatedCount: 0,
      }),
    'CHILD_STORY_GENERATION_DISABLED'
  );

  assertPolicyError(
    () =>
      assertChildStoryRequestControls({
        sessionChildProfileId: 'child-1',
        input: { ...baseInput, childProfileId: 'child-2' },
        settings: DEFAULT_CHILD_MODE_SETTINGS,
        dailyCreatedCount: 0,
        monthlyCreatedCount: 0,
      }),
    'CHILD_PROFILE_MISMATCH'
  );

  assertPolicyError(
    () =>
      assertChildStoryRequestControls({
        sessionChildProfileId: 'child-1',
        input: { ...baseInput, userNotes: 'Make it about a dragon' },
        settings: { ...DEFAULT_CHILD_MODE_SETTINGS, freeTextPromptsEnabled: false },
        dailyCreatedCount: 0,
        monthlyCreatedCount: 0,
      }),
    'CHILD_FREE_TEXT_DISABLED'
  );

  assertPolicyError(
    () =>
      assertChildStoryRequestControls({
        sessionChildProfileId: 'child-1',
        input: { ...baseInput, storyLanguage: 'en' },
        settings: { ...DEFAULT_CHILD_MODE_SETTINGS, allowedLanguageCodes: ['uk'] },
        dailyCreatedCount: 0,
        monthlyCreatedCount: 0,
      }),
    'CHILD_LANGUAGE_NOT_ALLOWED'
  );

  assertPolicyError(
    () =>
      assertChildStoryRequestControls({
        sessionChildProfileId: 'child-1',
        input: { ...baseInput, goal: 'courage' },
        settings: { ...DEFAULT_CHILD_MODE_SETTINGS, allowedThemeSlugs: ['kindness'] },
        dailyCreatedCount: 0,
        monthlyCreatedCount: 0,
      }),
    'CHILD_THEME_NOT_ALLOWED'
  );

  assertPolicyError(
    () =>
      assertChildStoryRequestControls({
        sessionChildProfileId: 'child-1',
        input: { ...baseInput, selectedCharacters: ['character-2'] },
        settings: { ...DEFAULT_CHILD_MODE_SETTINGS, allowedCharacterIds: ['character-1'] },
        dailyCreatedCount: 0,
        monthlyCreatedCount: 0,
      }),
    'CHILD_CHARACTER_NOT_ALLOWED'
  );

  assert.deepStrictEqual(
    assertChildStoryRequestControls({
      sessionChildProfileId: 'child-1',
      input: { ...baseInput, selectedCharacters: ['self-character'] },
      settings: { ...DEFAULT_CHILD_MODE_SETTINGS, allowedCharacterIds: ['character-1'] },
      dailyCreatedCount: 0,
      monthlyCreatedCount: 0,
      selfCharacterIds: ['self-character'],
    }),
    {
      parentReviewRequired: false,
      settings: { ...DEFAULT_CHILD_MODE_SETTINGS, allowedCharacterIds: ['character-1'] },
    },
    'child mode whitelist allows the active child mirror character'
  );

  assertPolicyError(
    () =>
      assertChildStoryRequestControls({
        sessionChildProfileId: 'child-1',
        input: { ...baseInput, selectedChildren: ['child-2'] },
        settings: DEFAULT_CHILD_MODE_SETTINGS,
        dailyCreatedCount: 0,
        monthlyCreatedCount: 0,
      }),
    'CHILD_SIBLINGS_DISABLED'
  );

  assertPolicyError(
    () =>
      assertChildStoryRequestControls({
        sessionChildProfileId: 'child-1',
        input: { ...baseInput, selectedCharacters: ['sibling-character'] },
        settings: DEFAULT_CHILD_MODE_SETTINGS,
        dailyCreatedCount: 0,
        monthlyCreatedCount: 0,
        selectedCharacterChildProfileIds: ['child-2'],
      }),
    'CHILD_SIBLINGS_DISABLED'
  );

  assert.doesNotThrow(
    () =>
      assertChildStoryRequestControls({
        sessionChildProfileId: 'child-1',
        input: { ...baseInput, selectedCharacters: ['sibling-character'] },
        settings: { ...DEFAULT_CHILD_MODE_SETTINGS, allowSiblingCharacters: true },
        dailyCreatedCount: 0,
        monthlyCreatedCount: 0,
        selectedCharacterChildProfileIds: ['child-2'],
      }),
    'sibling mirror characters are allowed only when the parent enables them'
  );

  assertPolicyError(
    () =>
      assertChildStoryRequestControls({
        sessionChildProfileId: 'child-1',
        input: baseInput,
        settings: { ...DEFAULT_CHILD_MODE_SETTINGS, dailyGenerationLimit: 1 },
        dailyCreatedCount: 1,
        monthlyCreatedCount: 1,
      }),
    'CHILD_DAILY_LIMIT_REACHED'
  );

  assertPolicyError(
    () =>
      assertChildStoryRequestControls({
        sessionChildProfileId: 'child-1',
        input: baseInput,
        settings: { ...DEFAULT_CHILD_MODE_SETTINGS, monthlyGenerationLimit: 3 },
        dailyCreatedCount: 0,
        monthlyCreatedCount: 3,
      }),
    'CHILD_MONTHLY_LIMIT_REACHED'
  );

  assert.deepStrictEqual(
    assertChildStoryRequestControls({
      sessionChildProfileId: 'child-1',
      input: baseInput,
      settings: { ...DEFAULT_CHILD_MODE_SETTINGS, parentReviewRequired: true },
      dailyCreatedCount: 0,
      monthlyCreatedCount: 0,
    }).parentReviewRequired,
    true,
    'parent review setting is carried into the story creation decision'
  );

  assertPolicyError(
    () =>
      assertChildStoryContinuationControls({
        settings: { ...DEFAULT_CHILD_MODE_SETTINGS, storyContinuationEnabled: false },
        dailyCreatedCount: 0,
        monthlyCreatedCount: 0,
      }),
    'CHILD_STORY_CONTINUATION_DISABLED'
  );

  assert.doesNotThrow(
    () =>
      assertChildStoryContinuationControls({
        settings: DEFAULT_CHILD_MODE_SETTINGS,
        dailyCreatedCount: 0,
        monthlyCreatedCount: 0,
      }),
    'child continuations are enabled by default'
  );

  assert.deepStrictEqual(
    assertChildStoryContinuationControls({
      settings: {
        ...DEFAULT_CHILD_MODE_SETTINGS,
        storyContinuationEnabled: true,
        parentReviewRequired: true,
      },
      dailyCreatedCount: 0,
      monthlyCreatedCount: 0,
    }).parentReviewRequired,
    true,
    'enabled child continuations carry the parent-review requirement'
  );

  assertPolicyError(
    () =>
      assertChildStoryContinuationControls({
        settings: {
          ...DEFAULT_CHILD_MODE_SETTINGS,
          storyGenerationEnabled: false,
          storyContinuationEnabled: true,
        },
        dailyCreatedCount: 0,
        monthlyCreatedCount: 0,
      }),
    'CHILD_STORY_GENERATION_DISABLED'
  );

  assertPolicyError(
    () =>
      assertChildStoryContinuationControls({
        settings: {
          ...DEFAULT_CHILD_MODE_SETTINGS,
          storyContinuationEnabled: true,
          dailyGenerationLimit: 1,
        },
        dailyCreatedCount: 1,
        monthlyCreatedCount: 1,
      }),
    'CHILD_DAILY_LIMIT_REACHED'
  );

  assertPolicyError(
    () =>
      assertChildAudioGenerationControls({
        settings: { ...DEFAULT_CHILD_MODE_SETTINGS, audioGenerationEnabled: false },
        dailyGeneratedCount: 0,
      }),
    'CHILD_AUDIO_DISABLED'
  );

  assertPolicyError(
    () =>
      assertChildAudioGenerationControls({
        settings: { ...DEFAULT_CHILD_MODE_SETTINGS, dailyAudioGenerationLimit: 2 },
        dailyGeneratedCount: 2,
      }),
    'CHILD_DAILY_AUDIO_LIMIT_REACHED'
  );

  assertPolicyError(
    () =>
      assertChildQuizGenerationControls({
        ...DEFAULT_CHILD_MODE_SETTINGS,
        quizGenerationEnabled: false,
      }),
    'CHILD_SESSION_QUIZ_DISABLED'
  );

  console.log('childModePolicyService tests passed');
})();
