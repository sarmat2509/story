console.log('*** METRO CONFIG LOADED ***', __dirname);
const { getDefaultConfig } = require('expo/metro-config');
const path = require('path');

const projectRoot = __dirname;
const workspaceRoot = path.resolve(projectRoot, '../..');

const config = getDefaultConfig(projectRoot);

// Watch all files in the monorepo
config.watchFolders = [workspaceRoot];

// Let Metro resolve packages from local node_modules first, then workspace root
config.resolver.nodeModulesPaths = [
  path.resolve(projectRoot, 'node_modules'),
  path.resolve(workspaceRoot, 'node_modules'),
];

// Resolve shared package alias
config.resolver.extraNodeModules = {
  '@kazka/shared': path.resolve(workspaceRoot, 'packages/shared/src'),
};

console.log('📦 Metro config for monorepo with hoisted node_modules');

console.log('projectRoot', projectRoot);
console.log('watchFolders', config.watchFolders);
console.log('nodeModulesPaths', config.resolver?.nodeModulesPaths);
console.log('disableHierarchicalLookup', config.resolver?.disableHierarchicalLookup);

module.exports = config;
