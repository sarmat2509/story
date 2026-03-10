import { create } from 'zustand';
import { persist, createJSONStorage } from 'zustand/middleware';
import AsyncStorage from '@react-native-async-storage/async-storage';
import { CommonActions } from '@react-navigation/native';
import { navigationRef } from '@/navigation/navigationRef';

export interface User {
  id: string;
  email: string;
  displayName: string | null;
  avatarUrl: string | null;
  preferredLocale: string;
  mode?: 'instant' | 'artisan';
  pseudonym?: string | null;
}

interface AuthState {
  user: User | null;
  token: string | null;
  isAuthenticated: boolean;
  isLoading: boolean;
  
  // Actions
  setUser: (user: User) => void;
  setToken: (token: string) => void;
  login: (user: User, token: string) => void;
  logout: () => void;
  setLoading: (loading: boolean) => void;
  loadFromStorage: () => Promise<void>;
}

export const useAuthStore = create<AuthState>()(
  persist(
    (set, _get) => ({
      user: null,
      token: null,
      isAuthenticated: false,
      isLoading: false,

      setUser: (user) => set({ user, isAuthenticated: true }),
      
      setToken: (token) => set({ token }),
      
      login: (user, token) => set({ 
        user, 
        token, 
        isAuthenticated: true,
        isLoading: false 
      }),
      
      logout: () => {
        set({ user: null, token: null, isAuthenticated: false });
        if (navigationRef.isReady()) {
          navigationRef.dispatch(
            CommonActions.reset({
              index: 0,
              routes: [{ name: 'Main', state: { routes: [{ name: 'Landing' }], index: 0 } }],
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
