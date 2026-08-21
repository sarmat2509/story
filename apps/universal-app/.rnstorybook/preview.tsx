import React from 'react';
import { StyleSheet, View } from 'react-native';
import { SafeAreaProvider } from 'react-native-safe-area-context';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { NavigationContainer } from '@react-navigation/native';
import { I18nextProvider } from 'react-i18next';
import type { Preview } from '@storybook/react-native';
import i18n, { initI18n } from '@/config/i18n';
import { theme } from '@/theme';

void initI18n();

const storybookQueryClient = new QueryClient({
  defaultOptions: {
    queries: { retry: false, refetchOnWindowFocus: false },
  },
});

const preview: Preview = {
  decorators: [
    (Story) => (
      <SafeAreaProvider>
        <QueryClientProvider client={storybookQueryClient}>
          <I18nextProvider i18n={i18n}>
            <NavigationContainer>
              <View style={styles.canvas}>
                <Story />
              </View>
            </NavigationContainer>
          </I18nextProvider>
        </QueryClientProvider>
      </SafeAreaProvider>
    ),
  ],
  parameters: {
    backgrounds: {
      default: 'app',
      values: [{ name: 'app', value: theme.colors.background.primary }],
    },
  },
};

export default preview;

const styles = StyleSheet.create({
  canvas: {
    flex: 1,
    padding: theme.spacing[4],
    backgroundColor: theme.colors.background.primary,
  },
});
