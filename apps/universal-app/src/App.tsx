import React, { useEffect, useState } from 'react';
import { SafeAreaProvider } from 'react-native-safe-area-context';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { GestureHandlerRootView } from 'react-native-gesture-handler';
import { StatusBar } from 'expo-status-bar';
import { initI18n } from '@/config/i18n';
import { NavigationContainer } from '@react-navigation/native';
import RootNavigator from '@/navigation/RootNavigator';

const queryClient = new QueryClient({
  defaultOptions: {
    queries: {
      retry: 1,
      refetchOnWindowFocus: false,
    },
  },
});

// Linking configuration for OAuth callbacks
const linking = {
  prefixes: ['kazka://', 'http://localhost:8081'],
  config: {
    screens: {
      Auth: {
        screens: {
          Login: 'login',
          OAuthCallback: 'auth/:provider/callback',
        },
      },
      Main: {
        screens: {
          HomeTabs: {
            screens: {
              Home: 'home',
              Library: 'library',
              Profile: 'profile',
            },
          },
        },
      },
    },
  },
};

export default function App() {
  const [isReady, setIsReady] = useState(false);

  useEffect(() => {
    async function prepare() {
      try {
        // Initialize i18n
        await initI18n();
        
        // Load other necessary data (auth state, etc.)
        // This will be done in stores
      } catch (error) {
        console.error('Error during app initialization:', error);
      } finally {
        setIsReady(true);
      }
    }

    prepare();
  }, []);

  if (!isReady) {
    // TODO: Replace with proper splash screen
    return null;
  }

  return (
    <GestureHandlerRootView style={{ flex: 1 }}>
      <QueryClientProvider client={queryClient}>
        <SafeAreaProvider>
          <NavigationContainer linking={linking}>
            <StatusBar style="auto" />
            <RootNavigator />
          </NavigationContainer>
        </SafeAreaProvider>
      </QueryClientProvider>
    </GestureHandlerRootView>
  );
}
