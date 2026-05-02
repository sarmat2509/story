import React, { useEffect, useState } from 'react';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { GestureHandlerRootView } from 'react-native-gesture-handler';
import { SafeAreaProvider } from 'react-native-safe-area-context';
import { StatusBar } from 'expo-status-bar';
import { LogBox, Platform } from 'react-native';
import Toast from 'react-native-toast-message';
import { initI18n } from '@/config/i18n';
import i18n from '@/config/i18n';
import { storage } from '@/utils/storage';
import {
  NavigationContainer,
  getPathFromState as defaultGetPathFromState,
  getStateFromPath as defaultGetStateFromPath,
} from '@react-navigation/native';
import { ErrorBoundary } from '@/components/ErrorBoundary';
import { AnalyticsProvider } from '@/components/AnalyticsProvider';
import { AnalyticsIdentity } from '@/components/AnalyticsIdentity';
import { useAuthStore } from '@/store/authStore';
import { useMainNavigationStore } from '@/store/mainNavigationStore';
import { navigationRef } from '@/navigation/navigationRef';
import { pushNotificationService } from '@/services/pushNotificationService';
import RootNavigator from '@/navigation/RootNavigator';
import OAuthCallbackScreen from '@/screens/auth/OAuthCallbackScreen';
import { getPublicSeoLocaleOverrideFromPath } from '@/utils/publicSeoLocale';
import type { MainTabParamList } from '@/types/navigation';
import { APP_ROUTE_PATHS, isValidLocale } from '@wondertales/shared';

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

function getLocaleFromWebPath(path: string): string | null {
  const firstSegment = path
    .split('/')
    .filter(Boolean)[0]
    ?.toLowerCase();

  return firstSegment && isValidLocale(firstSegment) ? firstSegment : null;
}

function stripLocalePrefix(path: string): string {
  const locale = getLocaleFromWebPath(path);
  if (!locale) {
    return path;
  }

  const stripped = path.replace(new RegExp(`^/${locale}(?=/|$)`), '') || '/';
  return stripped.startsWith('/') ? stripped : `/${stripped}`;
}

function preserveOriginalPathOnFocusedRoute(state: any, originalPath: string): any {
  if (!state?.routes?.length) {
    return state;
  }

  const index = state.index ?? 0;

  return {
    ...state,
    routes: state.routes.map((route: any, routeIndex: number) => {
      if (routeIndex !== index) {
        return route;
      }

      if (route.state) {
        return {
          ...route,
          state: preserveOriginalPathOnFocusedRoute(route.state, originalPath),
        };
      }

      return {
        ...route,
        path: originalPath,
      };
    }),
  };
}

function getPreferredWebLocale(): string | null {
  if (typeof window !== 'undefined') {
    const localeFromPath =
      getPublicSeoLocaleOverrideFromPath(window.location.pathname) ||
      getLocaleFromWebPath(window.location.pathname);
    if (localeFromPath) {
      return localeFromPath;
    }
  }

  const i18nLocale = i18n.language?.split('-')[0]?.toLowerCase();
  return i18nLocale && isValidLocale(i18nLocale) ? i18nLocale : null;
}

function addLocalePrefix(path: string): string {
  const locale = getPreferredWebLocale();
  if (!locale || locale === 'uk') {
    return path;
  }

  if (!path.startsWith('/')) {
    return `/${locale}/${path}`;
  }

  if (path === '/') {
    return `/${locale}`;
  }

  if (path === '') {
    return `/${locale}`;
  }

  return path.startsWith(`/${locale}/`) || path === `/${locale}` ? path : `/${locale}${path}`;
}

function isWebOAuthCallbackPath(): boolean {
  if (Platform.OS !== 'web' || typeof window === 'undefined') return false;
  return /^\/(?:[a-z]{2}\/)?auth\/[^/]+\/callback\/?$/.test(window.location.pathname);
}

const linking: any = {
  prefixes: ['wondertales://', 'http://localhost:8081', 'https://app.wondertales.com'],
  getStateFromPath(path: string, options: any) {
    const state = defaultGetStateFromPath(stripLocalePrefix(path), options);
    return state ? preserveOriginalPathOnFocusedRoute(state, path) : state;
  },
  getPathFromState(state: any, options: any) {
    const path = defaultGetPathFromState(state, options);
    return addLocalePrefix(path);
  },
  config: {
    screens: {
      OAuthCallback: 'auth/:provider/callback',
      ModeSelection: APP_ROUTE_PATHS.modeSelection,
      ChildMode: APP_ROUTE_PATHS.childMode,
      Main: {
        path: '',
        screens: {
          Welcome: APP_ROUTE_PATHS.welcome,
          Register: APP_ROUTE_PATHS.register,
          ForgotPassword: 'auth/forgot-password',
          ResetPassword: 'auth/reset-password',
          Dashboard: APP_ROUTE_PATHS.dashboard,
          Wizard: APP_ROUTE_PATHS.wizard,
          Library: APP_ROUTE_PATHS.library,
          LibraryRedirect: 'library',
          Series: APP_ROUTE_PATHS.series,
          SeriesDetail: 'me/series/:seriesId',
          Story: APP_ROUTE_PATHS.story,
          StoryRedirect: APP_ROUTE_PATHS.storyRedirect,
          Stories: APP_ROUTE_PATHS.storiesCatalog,
          PublishedStory: APP_ROUTE_PATHS.publishedStory,
          AuthorProfile: APP_ROUTE_PATHS.authorProfile,
          UnlistedStory: APP_ROUTE_PATHS.unlistedStory,
          Children: APP_ROUTE_PATHS.children,
          Characters: APP_ROUTE_PATHS.characters,
          Plans: APP_ROUTE_PATHS.billingPlans,
          Profile: APP_ROUTE_PATHS.profile,
          LanguageSettings: APP_ROUTE_PATHS.languageSettings,
          ThemeSettings: APP_ROUTE_PATHS.themeSettings,
          BillingSuccess: APP_ROUTE_PATHS.billingSuccess,
          NotFound: '404',
        },
      },
      Admin: {
        path: 'admin',
        screens: {
          AdminDashboard: 'dashboard',
          AdminStories: 'stories',
          AdminScenesStory: 'stories/:storyId',
          AdminFeedback: 'feedback',
          AdminPrivacyRequests: 'privacy-requests',
          AdminContentConfig: 'content-config',
          AdminVoices: 'voices',
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

  useEffect(() => {
    if (!isReady || typeof window === 'undefined') {
      return;
    }

    const syncLanguageFromPath = () => {
      const locale =
        getPublicSeoLocaleOverrideFromPath(window.location.pathname) ||
        getLocaleFromWebPath(window.location.pathname);
      if (!locale || i18n.language === locale) {
        return;
      }

      void i18n.changeLanguage(locale);
      void storage.setLanguage(locale);
    };

    syncLanguageFromPath();
    window.addEventListener('popstate', syncLanguageFromPath);

    return () => {
      window.removeEventListener('popstate', syncLanguageFromPath);
    };
  }, [isReady]);

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

  const isOAuthCallback = isWebOAuthCallbackPath();

  return (
    <AnalyticsProvider>
      <SafeAreaProvider>
        <ErrorBoundary>
          <GestureHandlerRootView style={{ flex: 1 }}>
            <QueryClientProvider client={queryClient}>
              {isOAuthCallback ? (
                <>
                  <StatusBar style="auto" />
                  <AnalyticsIdentity />
                  <OAuthCallbackScreen />
                </>
              ) : (
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
              )}
            </QueryClientProvider>
          </GestureHandlerRootView>
          <Toast />
        </ErrorBoundary>
      </SafeAreaProvider>
    </AnalyticsProvider>
  );
}
