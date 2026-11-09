/**
 * The API client every Wingbeat client uses: a small fetch wrapper that parses each
 * response with its schema (api/flights.ts, …). The web passes same-origin cookie auth and
 * a warn-only mismatch mode; the app passes a bearer token and stays strict.
 *
 *   const client = createApiClient({ baseUrl: '', mismatch: 'warn' });
 *   const data = await client.get('/api/flight-corrections?since=5', FlightCorrectionsResponse);
 *   await client.write('PUT', '/api/duty-methods', body, DutyMethodsWriteResponse);
 */
import * as z from 'zod/mini';

export type Auth = { kind: 'cookie' } | { kind: 'bearer'; token: string };

export interface ApiClientOptions {
  /** '' for the page's own origin. */
  baseUrl?: string;
  auth?: Auth;
  /** Sent with every request (the app's X-Wingbeat-App, api/version.ts). */
  headers?: Record<string, string>;
  /**
   * What a response that doesn't match its schema does: 'strict' throws an ApiShapeError,
   * 'warn' logs it and returns the data as it came (the web, until a release shows no
   * mismatches).
   */
  mismatch?: 'strict' | 'warn';
  /** Read on every request (default: the global fetch at that time). */
  fetch?: () => typeof fetch;
  /**
   * How long a request may take, response body included, before it fails with
   * ApiTimeoutError (default DEFAULT_TIMEOUT_MS). It's long because a full flight sync over
   * a slow connection really can take a while; its job is to end a request that never will.
   */
  timeoutMs?: number;
  /** Where 'warn' reports a mismatch (default console.warn). */
  warn?: (message: string, detail: unknown) => void;
}

/**
 * A non-2xx response. Its message is the server's error ({ error }) when it sent one, which
 * serverError also holds (undefined when it didn't, for a form's own fallback text), and
 * 'HTTP <status>' otherwise. A save refused because the record changed since the form loaded
 * it (409, src/index.ts "Edit conflicts") carries the server's conflict ({ id, at, user_id,
 * user_name }).
 */
export class ApiHttpError extends Error {
  constructor(readonly path: string, readonly status: number, readonly serverError?: string, readonly conflict?: EditConflict) {
    super(serverError || 'HTTP ' + status);
    this.name = 'ApiHttpError';
  }
}

/** The response of a write that returns only { ok: true }. */
export const OkResponse = z.looseObject({ ok: z.literal(true) });
export type OkResponse = z.infer<typeof OkResponse>;

/** The newest change to a record since a form's base_history_id. */
export interface EditConflict {
  id: number;
  at: number;
  user_id: number | null;
  user_name: string | null;
}

/** A response whose shape isn't what this client expects of the instance's API. */
export class ApiShapeError extends Error {
  constructor(readonly path: string, readonly issues: unknown) {
    super("This instance's API doesn't match: unexpected response from " + path);
    this.name = 'ApiShapeError';
  }
}

/**
 * A request with no answer within the client's timeoutMs. A write may still have reached
 * the server.
 */
export class ApiTimeoutError extends Error {
  constructor(readonly path: string, readonly timeoutMs: number) {
    super('No response from ' + path + ' after ' + Math.round(timeoutMs / 1000) + ' seconds');
    this.name = 'ApiTimeoutError';
  }
}

/** A request that got no response at all: offline, or the connection failed. */
export class ApiNetworkError extends Error {
  constructor(readonly path: string, readonly cause: unknown) {
    super("Couldn't reach the server for " + path);
    this.name = 'ApiNetworkError';
  }
}

export const DEFAULT_TIMEOUT_MS = 120_000;

/**
 * What a form tells the user about a failed request: the server's reason when it gave one
 * (an expired session's says to sign in again), otherwise what went wrong, or fallback for
 * anything that isn't a request's failure.
 */
export function apiErrorMessage(err: unknown, fallback: string): string {
  if (err instanceof ApiHttpError) return err.serverError ?? fallback;
  if (err instanceof ApiNetworkError) return "Couldn't reach the server. Check your connection and try again.";
  if (err instanceof ApiTimeoutError) return 'The server didn’t respond. Reload the page and check whether this went through.';
  if (err instanceof ApiShapeError) return 'The server sent an unexpected response. Reload the page and check whether this went through.';
  return fallback;
}

export type WriteMethod = 'POST' | 'PUT' | 'PATCH' | 'DELETE';

export interface ApiClient {
  get<S extends z.ZodMiniType>(path: string, schema: S): Promise<z.infer<S>>;
  /** Sends a write (body, if any, as JSON) and returns its response, parsed with schema. */
  write<S extends z.ZodMiniType>(method: WriteMethod, path: string, body: unknown, schema: S): Promise<z.infer<S>>;
}

export function createApiClient({
  baseUrl = '',
  auth = { kind: 'cookie' },
  headers = {},
  mismatch = 'strict',
  fetch: getFetch = () => globalThis.fetch,
  timeoutMs = DEFAULT_TIMEOUT_MS,
  warn = (message, detail) => console.warn(message, detail),
}: ApiClientOptions = {}): ApiClient {
  // The caller's headers (the app's X-Wingbeat-App) and, for a bearer, Authorization.
  const requestHeaders = (): Record<string, string> =>
    auth.kind === 'bearer' ? { ...headers, Authorization: 'Bearer ' + auth.token } : headers;

  function parse<S extends z.ZodMiniType>(path: string, schema: S, body: unknown): z.infer<S> {
    const parsed = z.safeParse(schema, body);
    if (parsed.success) return parsed.data;
    if (mismatch === 'warn') {
      warn('[wingbeat api] unexpected response from ' + path, parsed.error.issues);
      return body as z.infer<S>;
    }
    throw new ApiShapeError(path, parsed.error.issues);
  }

  async function httpError(path: string, resp: Response): Promise<ApiHttpError> {
    const err = (await resp.json().catch(() => ({}))) as { error?: unknown; conflict?: EditConflict };
    return new ApiHttpError(path, resp.status, typeof err.error === 'string' ? err.error : undefined,
      resp.status === 409 && err.conflict ? err.conflict : undefined);
  }

  // Races the timeout rather than relying on the abort, so a fetch that ignores its signal
  // (or a platform's that doesn't reach the body) can't hang the caller.
  async function request<S extends z.ZodMiniType>(path: string, init: RequestInit, schema: S): Promise<z.infer<S>> {
    const controller = new AbortController();
    let timer!: ReturnType<typeof setTimeout>;
    const timedOut = new Promise<never>((_, reject) => {
      timer = setTimeout(() => {
        reject(new ApiTimeoutError(path, timeoutMs));
        controller.abort();
      }, timeoutMs);
    });
    const answered = (async () => {
      let resp: Response;
      try {
        resp = await getFetch()(baseUrl + path, { ...init, signal: controller.signal });
      } catch (cause) {
        throw new ApiNetworkError(path, cause);
      }
      if (!resp.ok) throw await httpError(path, resp);
      let body: unknown;
      try {
        body = await resp.json();
      } catch (cause) {
        // A 200 that isn't JSON (a proxy's page, say) is no use to either mismatch mode.
        throw cause instanceof SyntaxError ? new ApiShapeError(path, 'not JSON') : new ApiNetworkError(path, cause);
      }
      return parse(path, schema, body);
    })();
    try {
      return await Promise.race([answered, timedOut]);
    } finally {
      clearTimeout(timer);
    }
  }

  return {
    get(path, schema) {
      return request(path, { headers: requestHeaders() }, schema);
    },

    write(method, path, body, schema) {
      return request(path, {
        method,
        headers: body === undefined ? requestHeaders() : { ...requestHeaders(), 'Content-Type': 'application/json' },
        body: body === undefined ? undefined : JSON.stringify(body),
      }, schema);
    },
  };
}
