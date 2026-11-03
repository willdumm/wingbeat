/**
 * The API client every Wingbeat client uses: a small fetch wrapper that parses each
 * response with its schema (api/flights.ts, …). The web passes same-origin cookie auth and
 * a warn-only mismatch mode; the app passes a bearer token and stays strict.
 *
 *   const client = createApiClient({ baseUrl: '', mismatch: 'warn' });
 *   const data = await client.get('/api/flight-corrections?since=5', FlightCorrectionsResponse);
 */
import * as z from 'zod/mini';

export type Auth = { kind: 'cookie' } | { kind: 'bearer'; token: string };

export interface ApiClientOptions {
  /** '' for the page's own origin. */
  baseUrl?: string;
  auth?: Auth;
  /**
   * What a response that doesn't match its schema does: 'strict' throws an ApiShapeError,
   * 'warn' logs it and returns the data as it came (the web, until a release shows no
   * mismatches).
   */
  mismatch?: 'strict' | 'warn';
  /** Read on every request (default: the global fetch at that time). */
  fetch?: () => typeof fetch;
  /** Where 'warn' reports a mismatch (default console.warn). */
  warn?: (message: string, detail: unknown) => void;
}

/** A non-2xx response. */
export class ApiHttpError extends Error {
  constructor(readonly path: string, readonly status: number) {
    super('HTTP ' + status);
    this.name = 'ApiHttpError';
  }
}

/** A response whose shape isn't what this client expects of the instance's API. */
export class ApiShapeError extends Error {
  constructor(readonly path: string, readonly issues: unknown) {
    super("This instance's API doesn't match: unexpected response from " + path);
    this.name = 'ApiShapeError';
  }
}

export interface ApiClient {
  get<S extends z.ZodMiniType>(path: string, schema: S): Promise<z.infer<S>>;
}

export function createApiClient({
  baseUrl = '',
  auth = { kind: 'cookie' },
  mismatch = 'strict',
  fetch: getFetch = () => globalThis.fetch,
  warn = (message, detail) => console.warn(message, detail),
}: ApiClientOptions = {}): ApiClient {
  return {
    async get(path, schema) {
      const init: RequestInit | undefined = auth.kind === 'bearer'
        ? { headers: { Authorization: 'Bearer ' + auth.token } }
        : undefined;
      // Called with one argument for cookie auth, as the pages' bare fetch calls were.
      const resp = await (init ? getFetch()(baseUrl + path, init) : getFetch()(baseUrl + path));
      if (!resp.ok) throw new ApiHttpError(path, resp.status);
      const body: unknown = await resp.json();
      const parsed = z.safeParse(schema, body);
      if (parsed.success) return parsed.data;
      if (mismatch === 'warn') {
        warn('[wingbeat api] unexpected response from ' + path, parsed.error.issues);
        return body as z.infer<typeof schema>;
      }
      throw new ApiShapeError(path, parsed.error.issues);
    },
  };
}
