import React, { useEffect, useState } from 'react';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { GestureHandlerRootView } from 'react-native-gesture-handler';
import { StatusBar } from 'expo-status-bar';
import { LogBox } from 'react-native';
import { initI18n } from '@/config/i18n';
import { NavigationContainer } from '@react-navigation/native';
import { ErrorBoundary } from '@/components/ErrorBoundary';
import { useAuthStore } from '@/store/authStore';
import RootNavigator from '@/navigation/RootNavigator';

// Suppress React Navigation deprecation warnings (from library, not our code)
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
        // Don't show error for 401/403 (user not authenticated)
        if (error?.response?.status === 401 || error?.response?.status === 403) {
          console.log('Authentication required - redirecting to login');
        }
      },
    },
  },
});

// Linking configuration for deep links and OAuth callbacks
const linking: any = {
  prefixes: ['kazka://', 'http://localhost:8081'],
  config: {
    screens: {
      Public: {
        screens: {
          Landing: '',
          Prices: 'prices',
          Login: 'login',
          OAuthCallback: 'auth/:provider/callback',
        },
      },
      Main: {
        screens: {
          Dashboard: 'dashboard',
          Wizard: 'wizard',
          Library: 'library',
          Children: 'children',
          Profile: 'profile',
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

  if (!isReady) {
    // TODO: Replace with proper splash screen
    return null;
  }

  return (
    <ErrorBoundary>
      <GestureHandlerRootView style={{ flex: 1 }}>
        <QueryClientProvider client={queryClient}>
          <NavigationContainer linking={linking}>
            <StatusBar style="auto" />
            <RootNavigator />
          </NavigationContainer>
        </QueryClientProvider>
      </GestureHandlerRootView>
    </ErrorBoundary>
  );
}
