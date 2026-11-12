/**
 * Crash and error reporting with Sentry (docs/mobile-app-plan.md, "Stack"). It's off unless
 * the build or update was made with EXPO_PUBLIC_SENTRY_DSN set (EAS environment variables;
 * see apps/mobile/AGENTS.md), so local and development runs report nothing.
 *
 * Every event is tagged with the active instance's host, its API version and this bundle's
 * client level; the SDK adds the update ID, channel and runtime version itself (its Expo
 * context). Nothing about flights or locations is sent (sentry-scrub.ts).
 */
import type { ComponentType } from 'react';
import * as Sentry from '@sentry/react-native';
import * as Updates from 'expo-updates';
import { ApiShapeError } from '@wingbeat/core/api/client';
import { CLIENT_API_LEVEL } from '@wingbeat/core/api/version';
import { scrubBreadcrumb } from './sentry-scrub';

const dsn = process.env.EXPO_PUBLIC_SENTRY_DSN;

export function initSentry() {
  if (!dsn) return;
  Sentry.init({
    dsn,
    environment: Updates.channel || 'development',
    sendDefaultPii: false,
    beforeBreadcrumb: scrubBreadcrumb,
  });
  Sentry.setTag('client_api_level', CLIENT_API_LEVEL);
}

/** The root component, wrapped for Sentry's touch breadcrumbs and error handling when it's on. */
export const withSentry = <P extends Record<string, unknown>>(Root: ComponentType<P>) => (dsn ? Sentry.wrap(Root) : Root);

/** Tags what follows with the active account's host and its server's API version. */
export function setInstanceTags(host: string | null, apiVersion: number | null) {
  if (!dsn) return;
  Sentry.setTag('host', host ?? undefined);
  Sentry.setTag('server_api_version', apiVersion ?? undefined);
}

/**
 * Reports a response this bundle can't read (the strict client's ApiShapeError): an
 * incompatibility with the instance that an update should fix. The error carries the path
 * and the schema's issues, not the response.
 */
export function reportShapeError(err: unknown) {
  if (dsn && err instanceof ApiShapeError) Sentry.captureException(err, { extra: { path: err.path, issues: err.issues } });
}
