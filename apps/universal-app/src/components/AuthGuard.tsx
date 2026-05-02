import React, { useEffect, useState } from 'react';
import { View, ActivityIndicator } from 'react-native';
import { useNavigation } from '@react-navigation/native';
import type { NavigationProp } from '@react-navigation/native';
import type { MainDrawerParamList } from '@/types/navigation';
import { hasAuthStoreHydrated, useAuthStore } from '@/store/authStore';
import { theme } from '@/theme';

type AuthGuardProps = {
  children: React.ReactNode;
};

/**
 * Redirects to Welcome (HP) when user is not authenticated.
 * Use to wrap auth-only screens (Dashboard, Wizard, Library, etc.).
 */
export function AuthGuard({ children }: AuthGuardProps) {
  const isAuthenticated = useAuthStore((state) => state.isAuthenticated);
  const isLoading = useAuthStore((state) => state.isLoading);
  const [hasHydrated, setHasHydrated] = useState(hasAuthStoreHydrated);
  const navigation = useNavigation<NavigationProp<MainDrawerParamList>>();

  useEffect(() => {
    const persistApi = (useAuthStore as typeof useAuthStore & {
      persist?: {
        hasHydrated: () => boolean;
        onFinishHydration: (listener: () => void) => () => void;
      };
    }).persist;

    if (!persistApi || persistApi.hasHydrated()) {
      setHasHydrated(true);
      return;
    }

    return persistApi.onFinishHydration(() => {
      setHasHydrated(true);
    });
  }, []);

  useEffect(() => {
    if (hasHydrated && !isLoading && !isAuthenticated) {
      navigation.navigate('Welcome');
    }
  }, [hasHydrated, isAuthenticated, isLoading, navigation]);

  if (!hasHydrated || isLoading || !isAuthenticated) {
    return (
      <View style={{ flex: 1, justifyContent: 'center', alignItems: 'center', backgroundColor: theme.colors.background.primary }}>
        <ActivityIndicator size="large" color={theme.colors.interactive.primary} />
      </View>
    );
  }

  return <>{children}</>;
}
