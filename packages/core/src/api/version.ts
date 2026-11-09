/**
 * The API version handshake (docs/mobile-app-plan.md, "Versions and compatibility"). The
 * app sends its client level and its runtime in the X-Wingbeat-App header of every request,
 * which the Worker records in sessions.app_version; GET /api/bootstrap answers with the
 * server's level and the oldest client level it still serves.
 */

/**
 * The level of the API this JS bundle's client code uses. It goes up when the app's use of
 * the API changes in a way the server needs to know about; each level the server still
 * serves has a snapshot of its response schemas in api/compat/<level>.ts.
 */
export const CLIENT_API_LEVEL = 1;

/** The server's API level, which GET /api/bootstrap returns as api_version. */
export const API_VERSION = 1;

/**
 * The oldest client level the server serves (min_client_level in GET /api/bootstrap). A
 * client below it updates (over the air when it can) before going on.
 */
export const MIN_CLIENT_LEVEL = 1;

/** The request header the app identifies itself in. */
export const APP_VERSION_HEADER = 'X-Wingbeat-App';

/** The longest X-Wingbeat-App value sessions.app_version keeps; the rest is cut off. */
export const MAX_APP_VERSION_LENGTH = 100;

/**
 * The X-Wingbeat-App value for this bundle on a given runtime (the binary's fingerprint
 * runtimeVersion), e.g. 'level=1; runtime=abc123'. The level comes first, ended by ';', so a
 * query can pick sessions by level with a prefix match that includes the ';'
 * (`app_version LIKE 'level=1;%'`, which `level=10; …` doesn't match).
 */
export function appVersionHeaderValue(runtime: string): string {
  return `level=${CLIENT_API_LEVEL}; runtime=${runtime}`;
}
