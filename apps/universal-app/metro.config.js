const { getDefaultConfig } = require('expo/metro-config');

// Expo SDK 52+ automatically configures Metro for monorepos.
// Manual nodeModulesPaths/watchFolders can break resolution with pnpm.
const config = getDefaultConfig(__dirname);

// Workaround: Zustand ESM uses import.meta.env which fails in web bundle.
// Only for zustand: disable package exports so Metro uses main field (CJS).
// Other packages (e.g. @kazka/shared) keep exports for subpath resolution.
const defaultResolveRequest = config.resolver.resolveRequest;
config.resolver.resolveRequest = (context, moduleName, platform) => {
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

module.exports = config;
