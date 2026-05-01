import { create } from 'zustand';
import { persist, createJSONStorage } from 'zustand/middleware';
import AsyncStorage from '@react-native-async-storage/async-storage';
import { CommonActions } from '@react-navigation/native';
import type { UserApi } from '@wondertales/shared';
import { navigationRef } from '@/navigation/navigationRef';

export type User = UserApi;
export type SessionMode = 'parent' | 'child';
export type ActiveChildSession = {
  id: string;
  name: string;
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
  login: (user: User, token: string, sessionMode?: SessionMode, activeChild?: ActiveChildSession | null) => void;
  enterChildSession: (token: string, child: ActiveChildSession) => void;
  returnToParentSession: (user: User, token: string) => void;
  logout: () => void;
  setLoading: (loading: boolean) => void;
  loadFromStorage: () => Promise<void>;
}

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
      
      login: (user, token, sessionMode = 'parent', activeChild = null) => set({
        user, 
        token, 
        sessionMode,
        activeChild,
        isAuthenticated: true,
        isLoading: false 
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
              routes: [{ name: 'ChildMode' }],
            })
          );
        }
      },

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
              routes: [{ name: 'Main', state: { routes: [{ name: 'Children' }], index: 0 } }],
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
