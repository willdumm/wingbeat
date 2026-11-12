// @wingbeat/core is a `file:` dependency, not a workspace (the app keeps its own lockfile;
// docs/mobile-app-plan.md, "Phase 5 progress"). Metro watches packages/core so it compiles
// core's TypeScript like the app's own, and resolves core's own imports (zod) from the app's
// node_modules when the repo root has no install, as on EAS Build. Sentry's config adds a
// debug ID to each bundle, which matches it to the source maps uploaded for it.
const { getSentryExpoConfig } = require('@sentry/react-native/metro');
const path = require('node:path');

const projectRoot = __dirname;
const coreRoot = path.resolve(projectRoot, '../../packages/core');

const config = getSentryExpoConfig(projectRoot);

config.watchFolders = [coreRoot, ...(config.watchFolders ?? [])];
config.resolver.nodeModulesPaths = [path.resolve(projectRoot, 'node_modules')];

module.exports = config;
