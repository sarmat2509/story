import type { Page } from '@playwright/test';
import { defaultChildModeSettings, testChild, testUser } from './testData';

const authToken = 'e2e-parent-token';
const childAuthToken = 'e2e-child-token';

type ParentLoginOptions = {
  mode?: 'instant' | 'artisan';
  onboardingCompleted?: boolean;
  childModeExitPasscodeConfigured?: boolean;
};

export async function loginAsParent(page: Page, options: ParentLoginOptions = {}) {
  const user = {
    ...testUser,
    mode: options.mode ?? 'artisan',
    onboardingCompleted: options.onboardingCompleted ?? testUser.onboardingCompleted,
    childModeExitPasscodeConfigured:
      options.childModeExitPasscodeConfigured ?? testUser.childModeExitPasscodeConfigured,
  };

  await page.addInitScript(
    ({ user, token }) => {
      const authState = {
        state: {
          user,
          token,
          sessionMode: 'parent',
          activeChild: null,
          isAuthenticated: true,
          isLoading: false,
        },
        version: 0,
      };

      if (!window.localStorage.getItem('auth-storage')) {
        window.localStorage.setItem('auth-storage', JSON.stringify(authState));
        window.localStorage.setItem('@wondertales/auth_token', token);
        window.localStorage.setItem('@wondertales/user', JSON.stringify(user));
      }
      window.localStorage.setItem('@wondertales/language', 'en');
      window.localStorage.setItem('wondertales:analytics-consent', 'denied');
    },
    { user, token: authToken }
  );
}

type ChildLoginOptions = {
  storyCreationMode?: 'instant' | 'artisan';
  publicStoriesEnabled?: boolean;
  storyGenerationEnabled?: boolean;
  storyContinuationEnabled?: boolean;
  allowedLanguageCodes?: string[];
  allowedThemeSlugs?: string[];
  allowedCharacterIds?: string[];
  freeTextPromptsEnabled?: boolean;
  audioGenerationEnabled?: boolean;
  quizGenerationEnabled?: boolean;
  parentReviewRequired?: boolean;
  allowSiblingCharacters?: boolean;
  allowSharedFamilyStories?: boolean;
};

export async function loginAsChild(page: Page, options: ChildLoginOptions = {}) {
  const childModeSettings = {
    ...defaultChildModeSettings,
    publicStoriesEnabled:
      options.publicStoriesEnabled ?? defaultChildModeSettings.publicStoriesEnabled,
    storyGenerationEnabled:
      options.storyGenerationEnabled ?? defaultChildModeSettings.storyGenerationEnabled,
    storyContinuationEnabled:
      options.storyContinuationEnabled ?? defaultChildModeSettings.storyContinuationEnabled,
    allowedLanguageCodes:
      options.allowedLanguageCodes ?? defaultChildModeSettings.allowedLanguageCodes,
    allowedThemeSlugs: options.allowedThemeSlugs ?? defaultChildModeSettings.allowedThemeSlugs,
    allowedCharacterIds:
      options.allowedCharacterIds ?? defaultChildModeSettings.allowedCharacterIds,
    freeTextPromptsEnabled:
      options.freeTextPromptsEnabled ?? defaultChildModeSettings.freeTextPromptsEnabled,
    audioGenerationEnabled:
      options.audioGenerationEnabled ?? defaultChildModeSettings.audioGenerationEnabled,
    quizGenerationEnabled:
      options.quizGenerationEnabled ?? defaultChildModeSettings.quizGenerationEnabled,
    parentReviewRequired:
      options.parentReviewRequired ?? defaultChildModeSettings.parentReviewRequired,
    allowSiblingCharacters:
      options.allowSiblingCharacters ?? defaultChildModeSettings.allowSiblingCharacters,
    allowSharedFamilyStories:
      options.allowSharedFamilyStories ?? defaultChildModeSettings.allowSharedFamilyStories,
  };
  const activeChild = {
    ...testChild,
    storyCreationMode: options.storyCreationMode ?? testChild.storyCreationMode,
    childMode: {
      ...testChild.childMode,
      childModeSettings,
    },
  };
  const user = { ...testUser, mode: 'instant' };

  await page.addInitScript(
    ({ user, activeChild, token }) => {
      const authState = {
        state: {
          user,
          token,
          sessionMode: 'child',
          activeChild,
          isAuthenticated: true,
          isLoading: false,
        },
        version: 0,
      };

      if (!window.localStorage.getItem('auth-storage')) {
        window.localStorage.setItem('auth-storage', JSON.stringify(authState));
        window.localStorage.setItem('@wondertales/auth_token', token);
        window.localStorage.setItem('@wondertales/user', JSON.stringify(user));
      }
      window.localStorage.setItem('@wondertales/language', 'en');
      window.localStorage.setItem('wondertales:analytics-consent', 'denied');
    },
    { user, activeChild, token: childAuthToken }
  );
}
