# Wingbeat app (`apps/mobile`)

The Expo app for Wingbeat. The plan, its decisions and the phase 5 step list are in
`docs/mobile-app-plan.md` ("The app itself", "Phase 5 progress", and "Feature parity with
the web" for each feature's native element on iOS and Android); read the repo's `CLAUDE.md`
too. Read `docs/mobile-design-principles.md` before any UI change: native controls rather
than imitations, an Android counterpart for every choice, one shared component per concept,
and the layout lessons from device runs.

## Expo has changed — do not trust your training data

Expo ships breaking changes every SDK release. Before writing code that touches an Expo,
EAS or React Native API, read the SDK version in `package.json` and check the docs
(https://docs.expo.dev/llms.txt indexes them; the reference pages are under
`/versions/latest/` while the app is on the latest SDK).

## Commands

Run these from `apps/mobile` with the system Node (24), not the repo's `nix` shell, whose
Node 20 is too old for this SDK:

```bash
npx expo install <package>   # never plain npm install for Expo packages: picks SDK-compatible versions
npm run type-check
npm test                     # Jest (jest-expo): __tests__/*-test.ts, for app logic in src/lib
npx expo-doctor
npx expo export --platform ios --platform android --output-dir <scratch dir>   # does it bundle?
```

The repo is a non-colocated jj repo, so EAS CLI commands need `EAS_NO_VCS=1`:
`EAS_NO_VCS=1 npx eas-cli@latest <command>`. A build also needs
`EAS_PROJECT_ROOT=<repo root>`: otherwise EAS uploads only `apps/mobile`, without
`packages/core` (the app's `file:` dependency). The repo root's `.easignore` keeps the upload
to the app and core; `build:inspect --stage archive --output <dir>` shows what's sent.

```bash
EAS_PROJECT_ROOT=$(realpath ../..) EAS_NO_VCS=1 npx eas-cli@latest build --profile development --platform android
```

## Sentry

Reporting is on only in a bundle built with `EXPO_PUBLIC_SENTRY_DSN` set (`src/lib/sentry.ts`).
It and `SENTRY_ORG` / `SENTRY_PROJECT` (plain) and `SENTRY_AUTH_TOKEN` (secret) are EAS
environment variables of the `preview` and `production` environments, so EAS Build reads them
and its builds upload their source maps (the `testflight` profile sets `SENTRY_ALLOW_FAILURE`, so a
failed upload doesn't fail the build: check its log for the upload). The `development` profile sets
`SENTRY_DISABLE_AUTO_UPLOAD` (a dev client loads its JS from Metro). An EAS Update bundles on
this machine, so EAS never uploads its maps and can't lend its secret token: upload them after
publishing. The script reads the token from `.env.sentry-build-plugin` here (`SENTRY_AUTH_TOKEN=…`,
gitignored, the user's own; never print it), and needs `SENTRY_URL` set as well, since the app
config doesn't name the server:

```bash
EAS_NO_VCS=1 npx eas-cli@latest update --channel preview --environment preview --platform ios --message "..."
SENTRY_URL=https://sentry.io/ SENTRY_ORG=dumm-software-llc SENTRY_PROJECT=wingbeat-mobile npx sentry-expo-upload-sourcemaps dist
```

`--platform ios` while the app is iOS only: without it the export also bundles web, which fails
(no `react-native-web`). The runtime version is the native fingerprint, so an update reaches only
builds with the same one: `npx expo-updates fingerprint:generate --platform ios` gives the local
hash, and `eas build:list --json` shows each build's `fingerprint.hash`. The app icon is in it, so
until a build includes the current `assets/icon.png`, publish with the icon of the build you
target swapped in (`jj file show -r <commit> assets/icon.png > assets/icon.png` from here; build 4 is `1c29db10`) and put it back after.

Never send flight or location data: anything new that could reach an event (a breadcrumb, a
tag, an `extra`) goes through `src/lib/sentry-scrub.ts`'s rules.

## Rules

- `@wingbeat/core` is a `file:` dependency, not a workspace: the app keeps its own
  `package-lock.json`. Logic the web also needs goes in `packages/core`; app-only logic goes
  in `src/lib`.
- `ios/` and `android/` are generated (`expo prebuild`) and gitignored. Configure native
  behavior in `app.config.ts` and config plugins, never by hand.
- Every native module the plan uses is already installed, so most changes ship as an EAS
  Update. Adding a native module or changing a config plugin changes the `fingerprint`
  runtime and needs a new store build: batch it into a planned native release.
- Routes live in `src/app/` (Expo Router); everything else in `src/lib/`.
- Colors come from the design tokens (`useTokens()` in `src/lib/theme.ts`, from
  `@wingbeat/core/tokens`), never literals.
