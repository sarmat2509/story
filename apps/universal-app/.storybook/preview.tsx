import React from 'react';
import { View } from 'react-native';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { NavigationContainer } from '@react-navigation/native';
import { I18nextProvider } from 'react-i18next';
import type { Preview } from '@storybook/react';
import i18n, { initI18n } from '@/config/i18n';
import { theme } from '@/theme';

void initI18n();

const queryClient = new QueryClient({ defaultOptions: { queries: { retry: false } } });

const preview: Preview = {
  decorators: [
    (Story) => (
      <QueryClientProvider client={queryClient}>
        <I18nextProvider i18n={i18n}>
          <NavigationContainer>
            <View
              style={{
                flex: 1,
                minHeight: '100vh' as unknown as number,
                padding: theme.spacing[4],
                backgroundColor: theme.colors.background.primary,
              }}
            >
              <Story />
            </View>
          </NavigationContainer>
        </I18nextProvider>
      </QueryClientProvider>
    ),
  ],
};

export default preview;
