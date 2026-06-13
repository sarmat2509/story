import React, { useEffect } from 'react';
import { View, Text, ActivityIndicator, StyleSheet, Platform } from 'react-native';
import { useTranslation } from 'react-i18next';
import { useAuthStore } from '@/store/authStore';
import { storage } from '@/utils/storage';
import apiClient from '@/api/client';
import { resetToMainRoute } from '@/navigation/navigationRef';
import { applyUserPreferredLocale } from '@/utils/localePreference';
import { getWebHistory, getWebLocation, getWebSearch } from '@/utils/webRuntime';

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
        let token: string | null = null;
        let parentGate = false;

        if (Platform.OS === 'web') {
          const params = new URLSearchParams(getWebSearch() ?? '');
          token = params.get('token');
          parentGate = params.get('parentGate') === 'true';
        }

        if (!token) {
          throw new Error('No token received');
        }

        const history = getWebHistory();
        const location = getWebLocation();
        if (Platform.OS === 'web' && history?.replaceState && location?.pathname) {
          history.replaceState({}, '', location.pathname);
        }

        await storage.setAuthToken(token);

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

        if (Platform.OS === 'web' && typeof window !== 'undefined' && window.sessionStorage) {
          window.sessionStorage.removeItem('oauth_redirect');
        }

        const tabName = parentGate ? 'Children' : 'Dashboard';
        if (
          !resetToMainRoute({ name: tabName }) &&
          Platform.OS === 'web' &&
          typeof window !== 'undefined'
        ) {
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
        const errorMessage = error instanceof Error ? error.message : 'Unknown error';
        console.error('OAuth callback failed', { message: errorMessage });
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
