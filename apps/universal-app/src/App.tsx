import React, { useEffect, useRef, useState } from 'react';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { GestureHandlerRootView } from 'react-native-gesture-handler';
import { SafeAreaProvider } from 'react-native-safe-area-context';
import { StatusBar } from 'expo-status-bar';
import { LogBox, Platform, StyleSheet } from 'react-native';
import Toast, { BaseToast, type ToastConfig } from 'react-native-toast-message';
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
import { AnalyticsConsentBanner } from '@/components/AnalyticsConsentBanner';
import { useAuthStore, waitForAuthStoreHydration } from '@/store/authStore';
import { useMainNavigationStore } from '@/store/mainNavigationStore';
import { navigationRef } from '@/navigation/navigationRef';
import { pushNotificationService } from '@/services/pushNotificationService';
import { configureRevenueCat } from '@/services/revenueCatService';
import { getAnalytics } from '@/services/analytics';
import RootNavigator from '@/navigation/RootNavigator';
import OAuthCallbackScreen from '@/screens/auth/OAuthCallbackScreen';
import {
  getPublicSeoLocaleOverrideFromPath,
  getPublicSeoLocaleOverrideFromSearch,
} from '@/utils/publicSeoLocale';
import { getWebPathname, getWebSearch } from '@/utils/webRuntime';
import type { MainTabParamList } from '@/types/navigation';
import { APP_ROUTE_PATHS, buildPublicAppEntryPath, isValidLocale } from '@wondertales/shared';

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
        const status = error?.response?.status;
        if (typeof status === 'number' && status >= 400 && status < 500) {
          return;
        }
        console.error('Query error:', error);
      },
    },
  },
});

const toastConfig: ToastConfig = {
  success: (props) => (
    <BaseToast
      {...props}
      style={[styles.toast, styles.toastSuccess]}
      contentContainerStyle={styles.toastContent}
      text1Style={styles.toastTitle}
      text1NumberOfLines={3}
      text2Style={styles.toastMessage}
      text2NumberOfLines={4}
    />
  ),
  error: (props) => (
    <BaseToast
      {...props}
      style={[styles.toast, styles.toastError]}
      contentContainerStyle={styles.toastContent}
      text1Style={styles.toastTitle}
      text1NumberOfLines={3}
      text2Style={styles.toastMessage}
      text2NumberOfLines={4}
    />
  ),
  info: (props) => (
    <BaseToast
      {...props}
      style={[styles.toast, styles.toastInfo]}
      contentContainerStyle={styles.toastContent}
      text1Style={styles.toastTitle}
      text1NumberOfLines={3}
      text2Style={styles.toastMessage}
      text2NumberOfLines={4}
    />
  ),
};

const TRACKED_ROUTE_PATTERNS: Record<string, string> = {
  OAuthCallback: 'auth/:provider/callback',
  ModeSelection: APP_ROUTE_PATHS.modeSelection,
  ChildMode: APP_ROUTE_PATHS.childMode,
  Welcome: APP_ROUTE_PATHS.welcome,
  Register: APP_ROUTE_PATHS.register,
  ForgotPassword: 'auth/forgot-password',
  ResetPassword: 'auth/reset-password',
  ChildModeRecovery: 'auth/child-mode-recovery',
  Dashboard: APP_ROUTE_PATHS.dashboard,
  Wizard: APP_ROUTE_PATHS.wizard,
  Library: APP_ROUTE_PATHS.library,
  LibraryRedirect: 'library',
  MapTiles: APP_ROUTE_PATHS.mapTiles,
  Series: APP_ROUTE_PATHS.series,
  SeriesDetail: 'me/series/:seriesId',
  Story: APP_ROUTE_PATHS.story,
  StoryRedirect: APP_ROUTE_PATHS.storyRedirect,
  Stories: APP_ROUTE_PATHS.storiesCatalog,
  PublishedStory: APP_ROUTE_PATHS.publishedStory,
  AuthorProfile: APP_ROUTE_PATHS.authorProfile,
  UnlistedStory: APP_ROUTE_PATHS.unlistedStory,
  Children: APP_ROUTE_PATHS.children,
  ChildDetail: APP_ROUTE_PATHS.childDetail,
  Characters: APP_ROUTE_PATHS.characters,
  Plans: APP_ROUTE_PATHS.billingPlans,
  Profile: APP_ROUTE_PATHS.profile,
  LanguageSettings: APP_ROUTE_PATHS.languageSettings,
  ThemeSettings: APP_ROUTE_PATHS.themeSettings,
  BillingSuccess: APP_ROUTE_PATHS.billingSuccess,
  NotFound: '*',
};

// Linking configuration for deep links and OAuth callbacks
/** Extract active route (name + params) inside Main from root navigation state for persistence across Tab/Drawer switch. */
function getActiveMainRouteFromState(
  state:
    | {
        routes?: {
          name: string;
          params?: object;
          state?: { routes?: { name: string; params?: object }[]; index?: number };
        }[];
        index?: number;
      }
    | undefined
): { name: keyof MainTabParamList; params?: object } | null {
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
  const firstSegment = path.split('/').filter(Boolean)[0]?.toLowerCase();

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

function normalizeLegacyChildDetailPath(path: string): string {
  const [rawPath, rawQuery = ''] = path.split('?');
  const normalizedPath = rawPath.startsWith('/') ? rawPath : `/${rawPath}`;

  if (!/^\/ChildDetail\/?$/.test(normalizedPath)) {
    return path;
  }

  const childId = new URLSearchParams(rawQuery).get('childId');
  if (!childId) {
    return path;
  }

  return `/children/${encodeURIComponent(childId)}`;
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
  const pathname = getWebPathname();
  if (pathname) {
    const localeFromPath =
      getPublicSeoLocaleOverrideFromPath(pathname) || getLocaleFromWebPath(pathname);
    if (localeFromPath) {
      return localeFromPath;
    }
  }

  const localeFromSearch = getPublicSeoLocaleOverrideFromSearch(getWebSearch());
  if (localeFromSearch) {
    return localeFromSearch;
  }

  const i18nLocale = i18n.language?.split('-')[0]?.toLowerCase();
  return i18nLocale && isValidLocale(i18nLocale) ? i18nLocale : null;
}

function addLocalePrefix(path: string): string {
  const locale = getPreferredWebLocale();
  if (!locale) {
    return path;
  }

  return buildPublicAppEntryPath(path, locale);
}

function isWebOAuthCallbackPath(): boolean {
  const pathname = getWebPathname();
  return pathname ? /^\/(?:[a-z]{2}\/)?auth\/[^/]+\/callback\/?$/.test(pathname) : false;
}

function getNavigationPath(routeName: string | undefined): string | undefined {
  if (!routeName) return undefined;
  return TRACKED_ROUTE_PATTERNS[routeName] ?? undefined;
}

const linking: any = {
  prefixes: [
    'wondertales://',
    'http://localhost:8081',
    'http://localhost:8082',
    'https://wondertales.art',
    'https://app.wondertales.com',
  ],
  getStateFromPath(path: string, options: any) {
    const state = defaultGetStateFromPath(
      normalizeLegacyChildDetailPath(stripLocalePrefix(path)),
      options
    );
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
          ChildModeRecovery: 'auth/child-mode-recovery',
          Dashboard: APP_ROUTE_PATHS.dashboard,
          Wizard: APP_ROUTE_PATHS.wizard,
          Library: APP_ROUTE_PATHS.library,
          LibraryRedirect: 'library',
          MapTiles: APP_ROUTE_PATHS.mapTiles,
          Series: APP_ROUTE_PATHS.series,
          SeriesDetail: 'me/series/:seriesId',
          Story: APP_ROUTE_PATHS.story,
          StoryRedirect: APP_ROUTE_PATHS.storyRedirect,
          Stories: APP_ROUTE_PATHS.storiesCatalog,
          PublishedStory: APP_ROUTE_PATHS.publishedStory,
          AuthorProfile: APP_ROUTE_PATHS.authorProfile,
          UnlistedStory: APP_ROUTE_PATHS.unlistedStory,
          Children: APP_ROUTE_PATHS.children,
          ChildDetail: APP_ROUTE_PATHS.childDetail,
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
          AdminImageGenerationDetail:
            'stories/:storyId/scenes/:sceneIndex/generations/:generationIndex',
          AdminScenes: 'scenes',
        },
      },
    },
  },
};

export default function App() {
  const [isReady, setIsReady] = useState(false);
  const lastTrackedRouteKeyRef = useRef<string | null>(null);
  const lastTrackedRouteNameRef = useRef<string | null>(null);
  const setAuthLoading = useAuthStore((state) => state.setLoading);
  const revenueCatUserId = useAuthStore((state) => state.user?.id ?? null);

  useEffect(() => {
    async function prepare() {
      try {
        setAuthLoading(true);
        // Initialize i18n
        await initI18n();

        // Auth state is loaded by Zustand persist middleware; wait for it before
        // mounting deep-linked protected routes so guards do not redirect early.
        await waitForAuthStoreHydration();
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
    if (!isReady || Platform.OS !== 'web') {
      return;
    }

    const syncLanguageFromPath = () => {
      const pathname = getWebPathname();
      if (!pathname) {
        return;
      }

      const locale =
        getPublicSeoLocaleOverrideFromPath(pathname) ||
        getLocaleFromWebPath(pathname) ||
        getPublicSeoLocaleOverrideFromSearch(getWebSearch());
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

  useEffect(() => {
    if (!isReady || Platform.OS === 'web') {
      return;
    }

    configureRevenueCat(revenueCatUserId).catch((error) => {
      console.warn('RevenueCat configuration failed', error);
    });
  }, [isReady, revenueCatUserId]);

  // Setup push notifications
  useEffect(() => {
    // Setup notification tap handler
    const unsubscribe = pushNotificationService.setupNotificationListeners();

    return unsubscribe;
  }, []);

  if (!isReady) {
    // TODO: Replace with proper splash screen
    return null;
  }

  const isOAuthCallback = isWebOAuthCallbackPath();
  const trackNavigation = () => {
    const route = navigationRef.getCurrentRoute();
    const routeName = route?.name;
    const routeKey = route?.key ?? routeName;
    if (!routeName || !routeKey || lastTrackedRouteKeyRef.current === routeKey) return;

    const previousRouteName = lastTrackedRouteNameRef.current;
    const path = getNavigationPath(routeName);
    lastTrackedRouteKeyRef.current = routeKey;
    lastTrackedRouteNameRef.current = routeName;
    getAnalytics().screen(routeName, {
      path,
      platform: Platform.OS,
    });
    if (Platform.OS === 'web') {
      getAnalytics().capture('$pageview', {
        $pathname: path,
        path,
        screen: routeName,
        platform: Platform.OS,
      });
    }
    getAnalytics().capture('navigation_changed', {
      from: previousRouteName,
      to: routeName,
      path,
      platform: Platform.OS,
    });
  };

  return (
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
                onReady={trackNavigation}
                onStateChange={(state) => {
                  if (useMainNavigationStore.getState().isLayoutTransitionInProgress) return;
                  const route = getActiveMainRouteFromState(state);
                  useMainNavigationStore.getState().setLastMainRoute(route);
                  trackNavigation();
                }}
              >
                <AnalyticsProvider>
                  <StatusBar style="auto" />
                  <AnalyticsIdentity />
                  <RootNavigator />
                  <AnalyticsConsentBanner />
                </AnalyticsProvider>
              </NavigationContainer>
            )}
          </QueryClientProvider>
        </GestureHandlerRootView>
        <Toast config={toastConfig} />
      </ErrorBoundary>
    </SafeAreaProvider>
  );
}

const styles = StyleSheet.create({
  toast: {
    width: '92%',
    maxWidth: 560,
    minHeight: 72,
    height: 'auto',
    borderRadius: 10,
    backgroundColor: '#FFFFFF',
  },
  toastSuccess: {
    borderLeftColor: '#69C779',
  },
  toastError: {
    borderLeftColor: '#FE6301',
  },
  toastInfo: {
    borderLeftColor: '#87CEFA',
  },
  toastContent: {
    paddingHorizontal: 20,
    paddingVertical: 12,
  },
  toastTitle: {
    color: '#1F1720',
    fontSize: 15,
    lineHeight: 21,
    fontWeight: '700',
    width: '100%',
  },
  toastMessage: {
    color: '#6B5D67',
    fontSize: 13,
    lineHeight: 18,
    width: '100%',
  },
});
