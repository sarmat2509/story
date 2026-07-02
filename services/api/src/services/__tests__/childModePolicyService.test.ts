import assert from 'node:assert';
import { DEFAULT_CHILD_MODE_SETTINGS } from '../childModeControlsService';
import {
  ChildModePolicyError,
  assertChildStoryRequestControls,
} from '../childModePolicyService';

const baseInput = {
  uiLocale: 'uk',
  storyLanguage: 'uk',
  childProfileId: 'child-1',
} as any;

function assertPolicyError(fn: () => unknown, code: ChildModePolicyError['code']) {
  assert.throws(
    fn,
    (error) => error instanceof ChildModePolicyError && error.code === code
  );
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
    () => assertChildStoryRequestControls({
      sessionChildProfileId: 'child-1',
      input: { ...baseInput, childProfileId: 'child-2' },
      settings: DEFAULT_CHILD_MODE_SETTINGS,
      dailyCreatedCount: 0,
      monthlyCreatedCount: 0,
    }),
    'CHILD_PROFILE_MISMATCH'
  );

  assertPolicyError(
    () => assertChildStoryRequestControls({
      sessionChildProfileId: 'child-1',
      input: { ...baseInput, userNotes: 'Make it about a dragon' },
      settings: { ...DEFAULT_CHILD_MODE_SETTINGS, freeTextPromptsEnabled: false },
      dailyCreatedCount: 0,
      monthlyCreatedCount: 0,
    }),
    'CHILD_FREE_TEXT_DISABLED'
  );

  assertPolicyError(
    () => assertChildStoryRequestControls({
      sessionChildProfileId: 'child-1',
      input: { ...baseInput, storyLanguage: 'en' },
      settings: { ...DEFAULT_CHILD_MODE_SETTINGS, allowedLanguageCodes: ['uk'] },
      dailyCreatedCount: 0,
      monthlyCreatedCount: 0,
    }),
    'CHILD_LANGUAGE_NOT_ALLOWED'
  );

  assertPolicyError(
    () => assertChildStoryRequestControls({
      sessionChildProfileId: 'child-1',
      input: { ...baseInput, goal: 'courage' },
      settings: { ...DEFAULT_CHILD_MODE_SETTINGS, allowedThemeSlugs: ['kindness'] },
      dailyCreatedCount: 0,
      monthlyCreatedCount: 0,
    }),
    'CHILD_THEME_NOT_ALLOWED'
  );

  assertPolicyError(
    () => assertChildStoryRequestControls({
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
    () => assertChildStoryRequestControls({
      sessionChildProfileId: 'child-1',
      input: { ...baseInput, selectedChildren: ['child-2'] },
      settings: DEFAULT_CHILD_MODE_SETTINGS,
      dailyCreatedCount: 0,
      monthlyCreatedCount: 0,
    }),
    'CHILD_SIBLINGS_DISABLED'
  );

  assertPolicyError(
    () => assertChildStoryRequestControls({
      sessionChildProfileId: 'child-1',
      input: baseInput,
      settings: { ...DEFAULT_CHILD_MODE_SETTINGS, dailyGenerationLimit: 1 },
      dailyCreatedCount: 1,
      monthlyCreatedCount: 1,
    }),
    'CHILD_DAILY_LIMIT_REACHED'
  );

  console.log('childModePolicyService tests passed');
})();
