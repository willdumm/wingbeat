// @wingbeat/core is a `file:` dependency, not a workspace (the app keeps its own lockfile;
// docs/mobile-app-plan.md, "Phase 5 progress"). Metro watches packages/core so it compiles
// core's TypeScript like the app's own, and resolves core's own imports (zod) from the app's
// node_modules when the repo root has no install, as on EAS Build.
const { getDefaultConfig } = require('expo/metro-config');
const path = require('node:path');

const projectRoot = __dirname;
const coreRoot = path.resolve(projectRoot, '../../packages/core');

const config = getDefaultConfig(projectRoot);

config.watchFolders = [coreRoot, ...(config.watchFolders ?? [])];
config.resolver.nodeModulesPaths = [path.resolve(projectRoot, 'node_modules')];

module.exports = config;
