# Wingbeat app (`apps/mobile`)

The Expo app for Wingbeat. The plan, its decisions and the phase 5 step list are in
`docs/mobile-app-plan.md` ("The app itself", "Phase 5 progress"); read the repo's
`CLAUDE.md` too.

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
`EAS_NO_VCS=1 npx eas-cli@latest <command>`.

## Sentry

Reporting is on only in a bundle built with `EXPO_PUBLIC_SENTRY_DSN` set (`src/lib/sentry.ts`).
It and `SENTRY_ORG` / `SENTRY_PROJECT` (plain) and `SENTRY_AUTH_TOKEN` (secret) are EAS
environment variables of the `preview` and `production` environments, so EAS Build reads them
and its builds upload their source maps. The `development` profile sets
`SENTRY_DISABLE_AUTO_UPLOAD` (a dev client loads its JS from Metro). An EAS Update uploads its
own maps after publishing, with the same variables in the shell:

```bash
EAS_NO_VCS=1 npx eas-cli@latest update --channel preview --environment preview --message "..."
npx sentry-expo-upload-sourcemaps dist
```

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
