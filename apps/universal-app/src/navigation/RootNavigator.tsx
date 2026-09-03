import React from 'react';
import { View, ActivityIndicator, Platform } from 'react-native';
import { createNativeStackNavigator } from '@react-navigation/native-stack';
import { useAuthStore } from '@/store/authStore';
import { theme } from '@/theme';
import MainNavigator from './MainNavigator';
import AdminNavigator from '@/admin/navigation/AdminNavigator';
import ModeSelectionScreen from '@/screens/onboarding/ModeSelectionScreen';
import OAuthCallbackScreen from '@/screens/auth/OAuthCallbackScreen';
import { getWebPathname } from '@/utils/webRuntime';
import type { RootStackParamList } from '@/types/navigation';
import { ProductTourProvider } from '@/features/productTour/ProductTourProvider';

const Stack = createNativeStackNavigator<RootStackParamList>();

function isWebOAuthCallbackPath(): boolean {
  const pathname = getWebPathname();
  return pathname ? /^\/(?:[a-z]{2}\/)?auth\/[^/]+\/callback\/?$/.test(pathname) : false;
}

export default function RootNavigator() {
  const { isAuthenticated, isLoading, user, sessionMode } = useAuthStore();

  // Parent-managed first-launch flow. Undefined means an older persisted user object:
  // do not force onboarding until the API explicitly returns false for new accounts.
  const needsModeSelection =
    isAuthenticated &&
    sessionMode !== 'child' &&
    user?.onboardingCompleted === false &&
    user?.productTourCompleted !== false;

  // Show loading while auth state is being restored from storage
  if (isLoading) {
    return (
      <View
        style={{
          flex: 1,
          justifyContent: 'center',
          alignItems: 'center',
          backgroundColor: theme.colors.background.primary,
        }}
      >
        <ActivityIndicator size="large" color={theme.colors.interactive.primary} />
      </View>
    );
  }

  const isOAuthCallback = isWebOAuthCallbackPath();
  const isChildSession = isAuthenticated && sessionMode === 'child' && !isOAuthCallback;
  const navigatorKey = isOAuthCallback
    ? 'oauth-callback'
    : isChildSession
      ? 'child-main'
      : isAuthenticated
        ? 'parent-main'
        : 'public-main';

  const initialRoute = isOAuthCallback
    ? 'OAuthCallback'
    : isChildSession
      ? 'Main'
      : needsModeSelection
        ? 'ModeSelection'
        : 'Main';

  return (
    <ProductTourProvider>
      <Stack.Navigator
        key={navigatorKey}
        screenOptions={{ headerShown: false }}
        initialRouteName={initialRoute}
      >
        <Stack.Screen name="OAuthCallback" component={OAuthCallbackScreen} />
        <Stack.Screen name="ModeSelection" component={ModeSelectionScreen} />
        <Stack.Screen name="Main" component={MainNavigator} />
        {!isChildSession && Platform.OS === 'web' ? (
          <Stack.Screen name="Admin" component={AdminNavigator} />
        ) : null}
      </Stack.Navigator>
    </ProductTourProvider>
  );
}
