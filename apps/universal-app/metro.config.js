const { getDefaultConfig } = require('expo/metro-config');
const path = require('path');
const fs = require('fs');

const projectRoot = __dirname;
const workspaceRoot = path.resolve(projectRoot, '../..');

const config = getDefaultConfig(projectRoot);

// Watch all files in the monorepo
config.watchFolders = [workspaceRoot];

// Let Metro know where to resolve packages
config.resolver.nodeModulesPaths = [
  path.resolve(projectRoot, 'node_modules'),
  path.resolve(workspaceRoot, 'node_modules'),
];

// Resolve the real path of React (follow symlinks)
const reactPath = fs.realpathSync(path.resolve(projectRoot, 'node_modules/react'));
const reactDomPath = fs.realpathSync(path.resolve(projectRoot, 'node_modules/react-dom'));
const reactNativePath = fs.realpathSync(path.resolve(projectRoot, 'node_modules/react-native'));

// Force React to use single copy - use real paths to avoid symlink issues
config.resolver.extraNodeModules = {
  '@kazka/shared': path.resolve(workspaceRoot, 'packages/shared/src'),
  'react': reactPath,
  'react-dom': reactDomPath,
  'react-native': reactNativePath,
};

console.log('📦 Metro using React from:', reactPath);

module.exports = config;
