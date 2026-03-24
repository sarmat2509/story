import React, { useEffect } from 'react';
import { View, ActivityIndicator } from 'react-native';
import { useNavigation } from '@react-navigation/native';
import type { NavigationProp } from '@react-navigation/native';
import type { MainDrawerParamList } from '@/types/navigation';
import { useAuthStore } from '@/store/authStore';
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
  const navigation = useNavigation<NavigationProp<MainDrawerParamList>>();

  useEffect(() => {
    if (!isAuthenticated) {
      navigation.navigate('Welcome');
    }
  }, [isAuthenticated, navigation]);

  if (!isAuthenticated) {
    return (
      <View style={{ flex: 1, justifyContent: 'center', alignItems: 'center', backgroundColor: theme.colors.background.primary }}>
        <ActivityIndicator size="large" color={theme.colors.interactive.primary} />
      </View>
    );
  }

  return <>{children}</>;
}
