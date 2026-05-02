import React, { useEffect } from 'react';
import { View, Text, ActivityIndicator, StyleSheet, Platform } from 'react-native';
import { CommonActions } from '@react-navigation/native';
import { useTranslation } from 'react-i18next';
import { useAuthStore } from '@/store/authStore';
import { storage } from '@/utils/storage';
import apiClient from '@/api/client';
import { navigationRef } from '@/navigation/navigationRef';
import { applyUserPreferredLocale } from '@/utils/localePreference';

type PersistedAuthStore = typeof useAuthStore & {
  persist?: {
    hasHydrated: () => boolean;
    onFinishHydration: (callback: () => void) => () => void;
  };
};

function waitForAuthHydration(): Promise<void> {
  const store = useAuthStore as PersistedAuthStore;
  if (!store.persist || store.persist.hasHydrated()) {
    return Promise.resolve();
  }

  return new Promise((resolve) => {
    let finished = false;
    let timeoutId: ReturnType<typeof setTimeout>;
    let unsubscribe = () => {};
    const finish = () => {
      if (finished) return;
      finished = true;
      unsubscribe();
      clearTimeout(timeoutId);
      resolve();
    };
    unsubscribe = store.persist!.onFinishHydration(finish);
    timeoutId = setTimeout(finish, 1000);
  });
}

export default function OAuthCallbackScreen() {
  const { login } = useAuthStore();
  const { t } = useTranslation();

  useEffect(() => {
    async function handleCallback() {
      try {
        console.log('OAuth callback starting...');
        
        // Get token from URL
        let token: string | null = null;
        let isNewUser = false;
        let parentGate = false;

        if (Platform.OS === 'web' && typeof window !== 'undefined') {
          const params = new URLSearchParams(window.location.search);
          token = params.get('token');
          isNewUser = params.get('isNewUser') === 'true';
          parentGate = params.get('parentGate') === 'true';
          console.log('Token from URL:', token ? 'Found' : 'Missing');
          console.log('Is new user:', isNewUser);
        }

        if (!token) {
          throw new Error('No token received');
        }

        // Save token first
        console.log('Saving token to storage...');
        await storage.setAuthToken(token);

        // Fetch user info with the token
        console.log('Fetching user info...');
        const response = await apiClient.get('/api/v1/me', {
          headers: {
            Authorization: `Bearer ${token}`,
          },
        });
        
        const user = response.data.user;

        if (!user) {
          throw new Error('No user data received');
        }

        await waitForAuthHydration();
        await storage.setUser(user);
        await applyUserPreferredLocale(user);
        login(user, token);
        
        console.log('Login successful!');

        // Clear OAuth state
        if (Platform.OS === 'web' && typeof window !== 'undefined' && window.sessionStorage) {
          window.sessionStorage.removeItem('oauth_redirect');
        }

        // Replace URL to remove token from address bar (security)
        if (Platform.OS === 'web' && typeof window !== 'undefined' && window.history?.replaceState) {
          window.history.replaceState({}, '', window.location.pathname);
        }

        // Explicitly navigate to Dashboard (HP for authenticated users)
        if (navigationRef.isReady()) {
          const tabName = parentGate ? 'Children' : 'Dashboard';
          navigationRef.dispatch(
            CommonActions.reset({
              index: 0,
              routes: [{ name: 'Main', state: { routes: [{ name: tabName }], index: 0 } }],
            })
          );
        } else if (Platform.OS === 'web' && typeof window !== 'undefined') {
          window.localStorage?.setItem(
            'auth-storage',
            JSON.stringify({
              state: {
                user,
                token,
                sessionMode: 'parent',
                activeChild: null,
                isAuthenticated: true,
                isLoading: false,
              },
              version: 0,
            })
          );
          window.location.replace(parentGate ? '/children' : '/dashboard');
        }
      } catch (error) {
        console.error('OAuth callback error:', error);
        const errorMessage = error instanceof Error ? error.message : 'Unknown error';
        console.error('Error details:', errorMessage);
        // On error, show alert; user can navigate back to Login from drawer/tabs
        alert(t('auth.oauth_callback_error'));
      }
    }

    handleCallback();
  }, [login, t]);

  return (
    <View style={styles.container}>
      <ActivityIndicator size="large" color="#0ea5e9" />
      <Text style={styles.text}>{t('auth.oauth_callback_loading')}</Text>
    </View>
  );
}

const styles = StyleSheet.create({
  container: {
    flex: 1,
    justifyContent: 'center',
    alignItems: 'center',
    backgroundColor: '#fff',
  },
  text: {
    marginTop: 16,
    fontSize: 16,
    color: '#64748b',
  },
});
