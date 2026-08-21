const path = require('path');
const { getDefaultConfig } = require('expo/metro-config');
const withStorybook = require('@storybook/react-native/metro/withStorybook');

// Expo SDK 52+ automatically configures Metro for monorepos.
// With pnpm + node-linker=hoisted, @tanstack/react-query lives in workspace root
// node_modules; Metro may not find it without explicit nodeModulesPaths.
const workspaceRoot = path.resolve(__dirname, '../..');
const config = getDefaultConfig(__dirname);
const appResolvePaths = [__dirname, workspaceRoot];
config.resolver.nodeModulesPaths = [
  path.resolve(__dirname, 'node_modules'),
  path.resolve(workspaceRoot, 'node_modules'),
];
config.watchFolders = [workspaceRoot];

// Workaround: Zustand ESM uses import.meta.env which fails in web bundle.
// Only for zustand: disable package exports so Metro uses main field (CJS).
// Workaround: Metro may not resolve @wondertales/shared/i18n/*.json via package exports;
// map explicitly to shared package src.
const defaultResolveRequest = config.resolver.resolveRequest;
config.resolver.resolveRequest = (context, moduleName, platform) => {
  const sharedI18nMatch = moduleName && moduleName.match(/^@wondertales\/shared\/i18n\/(\w+)\.json$/);
  if (sharedI18nMatch) {
    const filePath = path.resolve(workspaceRoot, 'packages', 'shared', 'src', 'i18n', `${sharedI18nMatch[1]}.json`);
    return { type: 'sourceFile', filePath };
  }
  if (moduleName === 'react-native-view-shot') {
    const filePath = require.resolve('react-native-view-shot/src/index.js', { paths: appResolvePaths });
    return { type: 'sourceFile', filePath };
  }
  if (moduleName === 'html2canvas') {
    const filePath = require.resolve('html2canvas/dist/html2canvas.esm.js', { paths: appResolvePaths });
    return { type: 'sourceFile', filePath };
  }
  if (
    platform === 'web' &&
    (moduleName === 'zustand' || moduleName.startsWith('zustand/'))
  ) {
    return context.resolveRequest(
      {
        ...context,
        unstable_enablePackageExports: false,
      },
      moduleName,
      platform
    );
  }
  return defaultResolveRequest
    ? defaultResolveRequest(context, moduleName, platform)
    : context.resolveRequest(context, moduleName, platform);
};

module.exports = withStorybook(config, {
  enabled: process.env.EXPO_PUBLIC_STORYBOOK_ENABLED === 'true',
  configPath: path.resolve(__dirname, '.rnstorybook'),
  // Keep Storybook and its story catalog out of normal app bundles.
  onDisabledRemoveStorybook: true,
});
