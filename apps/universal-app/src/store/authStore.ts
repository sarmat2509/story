import { create } from 'zustand';
import { persist, createJSONStorage } from 'zustand/middleware';
import AsyncStorage from '@react-native-async-storage/async-storage';
import { CommonActions } from '@react-navigation/native';
import type { ChildModeSettings, UserApi } from '@wondertales/shared';
import { navigationRef } from '@/navigation/navigationRef';

export type User = UserApi;
export type SessionMode = 'parent' | 'child';
export type ActiveChildSession = {
  id: string;
  name: string;
  storyCreationMode?: 'instant' | 'artisan';
  age?: {
    years: number;
    months: number;
    totalMonths: number;
    ageGroup: string;
    isBirthdayToday: boolean;
    daysUntilBirthday: number;
  };
  authorPseudonym?: string | null;
  authorAboutMe?: string | null;
  referencePhotos?: Array<{ url: string }>;
  turnaroundSheet?: {
    url: string;
    frontUrl?: string;
    frontThumbnailUrl?: string;
    generatedAt?: string;
  };
  childMode?: {
    childModeEnabled: boolean;
    childModeSettings: ChildModeSettings;
    activeSessionCount?: number;
  };
};

interface AuthState {
  user: User | null;
  token: string | null;
  sessionMode: SessionMode;
  activeChild: ActiveChildSession | null;
  isAuthenticated: boolean;
  isLoading: boolean;

  // Actions
  setUser: (user: User) => void;
  setToken: (token: string) => void;
  login: (
    user: User,
    token: string,
    sessionMode?: SessionMode,
    activeChild?: ActiveChildSession | null
  ) => void;
  enterChildSession: (token: string, child: ActiveChildSession) => void;
  updateActiveChildMode: (childMode: NonNullable<ActiveChildSession['childMode']>) => void;
  setParentSession: (user: User, token: string) => void;
  returnToParentSession: (user: User, token: string) => void;
  logout: () => void;
  setLoading: (loading: boolean) => void;
  loadFromStorage: () => Promise<void>;
}

type PersistedAuthStore = {
  persist?: {
    hasHydrated: () => boolean;
    onFinishHydration: (listener: (state: AuthState) => void) => () => void;
  };
};

export const useAuthStore = create<AuthState>()(
  persist(
    (set, _get) => ({
      user: null,
      token: null,
      sessionMode: 'parent',
      activeChild: null,
      isAuthenticated: false,
      isLoading: false,

      setUser: (user) => set({ user, isAuthenticated: true }),

      setToken: (token) => set({ token }),

      login: (user, token, sessionMode = 'parent', activeChild = null) =>
        set({
          user,
          token,
          sessionMode,
          activeChild,
          isAuthenticated: true,
          isLoading: false,
        }),

      enterChildSession: (token, child) => {
        set({
          token,
          sessionMode: 'child',
          activeChild: child,
          isAuthenticated: true,
          isLoading: false,
        });
        if (navigationRef.isReady()) {
          navigationRef.dispatch(
            CommonActions.reset({
              index: 0,
              routes: [{ name: 'Main', state: { routes: [{ name: 'Dashboard' }], index: 0 } }],
            })
          );
        }
      },

      updateActiveChildMode: (childMode) =>
        set((state) => ({
          activeChild: state.activeChild
            ? {
                ...state.activeChild,
                childMode: {
                  ...state.activeChild.childMode,
                  ...childMode,
                },
              }
            : null,
        })),

      setParentSession: (user, token) =>
        set({
          user,
          token,
          sessionMode: 'parent',
          activeChild: null,
          isAuthenticated: true,
          isLoading: false,
        }),

      returnToParentSession: (user, token) => {
        set({
          user,
          token,
          sessionMode: 'parent',
          activeChild: null,
          isAuthenticated: true,
          isLoading: false,
        });
        if (navigationRef.isReady()) {
          navigationRef.dispatch(
            CommonActions.reset({
              index: 0,
              routes: [{ name: 'Main', state: { routes: [{ name: 'Dashboard' }], index: 0 } }],
            })
          );
        }
      },

      logout: () => {
        set({
          user: null,
          token: null,
          sessionMode: 'parent',
          activeChild: null,
          isAuthenticated: false,
        });
        if (navigationRef.isReady()) {
          navigationRef.dispatch(
            CommonActions.reset({
              index: 0,
              routes: [{ name: 'Main', state: { routes: [{ name: 'Welcome' }], index: 0 } }],
            })
          );
        }
      },

      setLoading: (loading) => set({ isLoading: loading }),

      loadFromStorage: async () => {
        // This is handled automatically by persist middleware
      },
    }),
    {
      name: 'auth-storage',
      storage: createJSONStorage(() => AsyncStorage),
    }
  )
);

export function hasAuthStoreHydrated(): boolean {
  return (useAuthStore as PersistedAuthStore).persist?.hasHydrated() ?? true;
}

export function waitForAuthStoreHydration(): Promise<void> {
  const persistApi = (useAuthStore as PersistedAuthStore).persist;

  if (!persistApi || persistApi.hasHydrated()) {
    return Promise.resolve();
  }

  return new Promise((resolve) => {
    const unsubscribe = persistApi.onFinishHydration(() => {
      unsubscribe();
      resolve();
    });

    if (persistApi.hasHydrated()) {
      unsubscribe();
      resolve();
    }
  });
}
