import type { StorybookConfig } from '@storybook/react-native-web-vite';
import path from 'node:path';

const config: StorybookConfig = {
  stories: ['../src/**/*.stories.@(ts|tsx)'],
  addons: [],
  framework: {
    name: '@storybook/react-native-web-vite',
    options: {
      modulesToTranspile: ['@react-native-community/datetimepicker'],
      pluginReactOptions: {
        babel: { plugins: ['react-native-reanimated/plugin'] },
      },
    },
  },
  viteFinal: async (config) => {
    config.resolve ??= {};
    config.resolve.alias = {
      ...(config.resolve.alias ?? {}),
      '@': path.resolve(__dirname, '../src'),
      '@wondertales/shared': path.resolve(__dirname, '../../../packages/shared/src'),
      '@react-native-community/datetimepicker': path.resolve(__dirname, './datetimepicker.web.tsx'),
      'react-native-view-shot': path.resolve(__dirname, './react-native-view-shot.web.ts'),
    };
    config.server ??= {};
    config.server.fs ??= {};
    config.server.fs.allow = [path.resolve(__dirname, '../../..')];
    return config;
  },
};

export default config;
