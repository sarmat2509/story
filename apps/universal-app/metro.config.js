const path = require('path');
const { getDefaultConfig } = require('expo/metro-config');

// Expo SDK 52+ automatically configures Metro for monorepos.
// With pnpm + node-linker=hoisted, @tanstack/react-query lives in workspace root
// node_modules; Metro may not find it without explicit nodeModulesPaths.
const workspaceRoot = path.resolve(__dirname, '../..');
const config = getDefaultConfig(__dirname);
config.resolver.nodeModulesPaths = [
  path.resolve(__dirname, 'node_modules'),
  path.resolve(workspaceRoot, 'node_modules'),
];

// Workaround: Zustand ESM uses import.meta.env which fails in web bundle.
// Only for zustand: disable package exports so Metro uses main field (CJS).
// Other packages (e.g. @wondertales/shared) keep exports for subpath resolution.
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
