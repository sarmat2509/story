import React, { useEffect, useState } from 'react';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { GestureHandlerRootView } from 'react-native-gesture-handler';
import { SafeAreaProvider } from 'react-native-safe-area-context';
import { StatusBar } from 'expo-status-bar';
import { LogBox } from 'react-native';
import Toast from 'react-native-toast-message';
import { initI18n } from '@/config/i18n';
import { NavigationContainer } from '@react-navigation/native';
import { ErrorBoundary } from '@/components/ErrorBoundary';
import { AnalyticsProvider } from '@/components/AnalyticsProvider';
import { AnalyticsIdentity } from '@/components/AnalyticsIdentity';
import { useAuthStore } from '@/store/authStore';
import { useMainNavigationStore } from '@/store/mainNavigationStore';
import { navigationRef } from '@/navigation/navigationRef';
import { pushNotificationService } from '@/services/pushNotificationService';
import RootNavigator from '@/navigation/RootNavigator';
import type { MainTabParamList } from '@/types/navigation';

import interopRequireDefault from '@babel/runtime/helpers/interopRequireDefault';
console.log('interopRequireDefault OK', typeof interopRequireDefault);

// Suppress deprecation warnings from React Navigation / RN (library code, not ours)
// pointerEvents: PR closed - style.pointerEvents breaks react-native-web
LogBox.ignoreLogs([
  'props.pointerEvents is deprecated',
  '"shadow*" style props are deprecated',
  'Image: style.resizeMode is deprecated',
]);

const queryClient = new QueryClient({
  defaultOptions: {
    queries: {
      retry: 1,
      refetchOnWindowFocus: false,
    },
    mutations: {
      onError: (error: any) => {
        console.error('Query error:', error);
        // 401 = not authenticated (handled by api client interceptor → logout)
        // 403 = forbidden (rate limit, permission denied, etc.) - not auth
        if (error?.response?.status === 401) {
          console.log('Authentication required - redirecting to login');
        }
      },
    },
  },
});

// Linking configuration for deep links and OAuth callbacks
/** Extract active route (name + params) inside Main from root navigation state for persistence across Tab/Drawer switch. */
function getActiveMainRouteFromState(state: { routes?: { name: string; params?: object; state?: { routes?: { name: string; params?: object }[]; index?: number } }[]; index?: number } | undefined): { name: keyof MainTabParamList; params?: object } | null {
  if (!state?.routes?.length) return null;
  const main = state.routes[state.index ?? 0];
  if (!main || main.name !== 'Main' || !main.state) return null;
  const nested = main.state;
  const idx = nested.index ?? 0;
  const route = nested.routes?.[idx];
  if (!route?.name) return null;
  return { name: route.name as keyof MainTabParamList, params: route.params };
}

const linking: any = {
  prefixes: ['wondertales://', 'http://localhost:8081', 'https://app.wondertales.com'],
  config: {
    screens: {
      ModeSelection: 'mode-selection',
      Main: {
        path: '',
        screens: {
          Welcome: 'welcome',
          Register: 'register',
          ForgotPassword: 'auth/forgot-password',
          ResetPassword: 'auth/reset-password',
          OAuthCallback: 'auth/:provider/callback',
          Dashboard: 'dashboard',
          Wizard: 'wizard',
          Library: 'me/stories',
          LibraryRedirect: 'library',
          Series: 'me/series',
          SeriesDetail: 'me/series/:seriesId',
          Story: 'me/stories/:storyId',
          StoryRedirect: 'story/:storyId',
          Stories: 'stories',
          PublishedStory: 'stories/:slug',
          UnlistedStory: 'u/:token',
          Children: 'children',
          Characters: 'characters',
          Plans: 'pricing',
          Profile: 'profile',
          BillingSuccess: 'billing/success',
          NotFound: '404',
        },
      },
      Admin: {
        path: 'admin',
        screens: {
          AdminStories: 'stories',
          AdminScenesStory: 'stories/:storyId',
          AdminFeedback: 'feedback',
          AdminContentConfig: 'content-config',
          AdminUsers: 'users',
          AdminValidations: 'validations',
          AdminValidationDetail: 'validations/:id',
          AdminScenes: 'scenes',
        },
      },
    },
  },
};

export default function App() {
  const [isReady, setIsReady] = useState(false);
  const setAuthLoading = useAuthStore((state) => state.setLoading);

  useEffect(() => {
    async function prepare() {
      try {
        setAuthLoading(true);
        // Initialize i18n
        await initI18n();
        
        // Auth state is automatically loaded by Zustand persist middleware
        // Wait for hydration
        await new Promise(resolve => setTimeout(resolve, 100));
      } catch (error) {
        console.error('Error during app initialization:', error);
      } finally {
        setAuthLoading(false);
        setIsReady(true);
      }
    }

    prepare();
  }, [setAuthLoading]);

  // Setup push notifications
  useEffect(() => {
    // Request permissions on app start
    pushNotificationService.requestPermissions();

    // Setup notification tap handler
    const unsubscribe = pushNotificationService.setupNotificationListeners();

    return unsubscribe;
  }, []);

  if (!isReady) {
    // TODO: Replace with proper splash screen
    return null;
  }

  return (
    <AnalyticsProvider>
      <SafeAreaProvider>
        <ErrorBoundary>
          <GestureHandlerRootView style={{ flex: 1 }}>
            <QueryClientProvider client={queryClient}>
              <NavigationContainer
                ref={navigationRef}
                linking={linking}
                onStateChange={(state) => {
                  if (useMainNavigationStore.getState().isLayoutTransitionInProgress) return;
                  const route = getActiveMainRouteFromState(state);
                  useMainNavigationStore.getState().setLastMainRoute(route);
                }}
              >
              <StatusBar style="auto" />
              <AnalyticsIdentity />
              <RootNavigator />
              </NavigationContainer>
            </QueryClientProvider>
          </GestureHandlerRootView>
          <Toast />
        </ErrorBoundary>
      </SafeAreaProvider>
    </AnalyticsProvider>
  );
}
