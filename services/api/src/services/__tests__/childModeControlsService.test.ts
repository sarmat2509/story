import assert from 'node:assert';
import {
  DEFAULT_CHILD_MODE_SETTINGS,
  buildChildModeControls,
  buildChildSessionScopes,
  mergeChildModeSettings,
  normalizeChildModeSettings,
} from '../childModeControlsService';

void (async function main() {
  assert.deepStrictEqual(
    normalizeChildModeSettings(null),
    DEFAULT_CHILD_MODE_SETTINGS,
    'missing settings fall back to safe defaults'
  );

  assert.deepStrictEqual(
    normalizeChildModeSettings({
      dailyGenerationLimit: 3,
      monthlyGenerationLimit: -1,
      allowedThemeSlugs: ['space', 'space', ''],
      allowedLanguageCodes: ['uk', 'en'],
      allowedCharacterIds: ['char-1'],
      storyContinuationEnabled: true,
      freeTextPromptsEnabled: true,
      audioGenerationEnabled: true,
      quizGenerationEnabled: true,
      parentReviewRequired: false,
      allowSiblingCharacters: true,
      allowSharedFamilyStories: true,
    }),
    {
      ...DEFAULT_CHILD_MODE_SETTINGS,
      dailyGenerationLimit: 3,
      allowedThemeSlugs: ['space'],
      allowedLanguageCodes: ['uk', 'en'],
      allowedCharacterIds: ['char-1'],
      storyContinuationEnabled: true,
      freeTextPromptsEnabled: true,
      audioGenerationEnabled: true,
      parentReviewRequired: false,
      allowSiblingCharacters: true,
      allowSharedFamilyStories: true,
    },
    'normalization keeps valid controls and rejects unsafe limit values'
  );

  assert.deepStrictEqual(
    mergeChildModeSettings(
      {
        ...DEFAULT_CHILD_MODE_SETTINGS,
        dailyGenerationLimit: 2,
        audioGenerationEnabled: true,
      },
      {
        freeTextPromptsEnabled: true,
        audioGenerationEnabled: false,
        quizGenerationEnabled: false,
      }
    ),
    {
      ...DEFAULT_CHILD_MODE_SETTINGS,
      dailyGenerationLimit: 2,
      freeTextPromptsEnabled: true,
      audioGenerationEnabled: false,
      quizGenerationEnabled: false,
    },
    'partial patches preserve existing settings'
  );

  assert.deepStrictEqual(
    buildChildModeControls(
      {
        childModeEnabled: true,
        childModeSettings: { freeTextPromptsEnabled: true },
      } as any,
      2,
      true
    ),
    {
      childModeEnabled: true,
      childModeSettings: {
        ...DEFAULT_CHILD_MODE_SETTINGS,
        freeTextPromptsEnabled: true,
      },
      childModePasscodeConfigured: true,
      activeSessionCount: 2,
    },
    'controls response normalizes settings and includes active sessions'
  );

  assert.strictEqual(
    buildChildModeControls({
      childModeEnabled: true,
      childModeSettings: {},
    } as any).childModePasscodeConfigured,
    false,
    'controls response marks missing account-level child mode passcode as not configured'
  );

  assert.deepStrictEqual(
    buildChildSessionScopes({
      ...DEFAULT_CHILD_MODE_SETTINGS,
      freeTextPromptsEnabled: true,
      audioGenerationEnabled: true,
      quizGenerationEnabled: true,
      allowSharedFamilyStories: true,
    }),
    ['child_mode', 'story:free_text', 'story:audio', 'story:quiz', 'family_stories:read'],
    'child session scopes reflect every enabled scoped capability'
  );

  assert.deepStrictEqual(
    buildChildSessionScopes({
      ...DEFAULT_CHILD_MODE_SETTINGS,
      quizGenerationEnabled: false,
    }),
    ['child_mode', 'story:free_text', 'story:audio'],
    'quiz scope is omitted when parent disables quiz generation'
  );

  console.log('childModeControlsService tests passed');
})();
