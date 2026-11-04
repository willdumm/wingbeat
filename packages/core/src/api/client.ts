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

export type WriteMethod = 'POST' | 'PUT' | 'PATCH' | 'DELETE';

export interface ApiClient {
  get<S extends z.ZodMiniType>(path: string, schema: S): Promise<z.infer<S>>;
  /** Sends a write (body, if any, as JSON) and returns its response, parsed with schema. */
  write<S extends z.ZodMiniType>(method: WriteMethod, path: string, body: unknown, schema: S): Promise<z.infer<S>>;
}

export function createApiClient({
  baseUrl = '',
  auth = { kind: 'cookie' },
  mismatch = 'strict',
  fetch: getFetch = () => globalThis.fetch,
  warn = (message, detail) => console.warn(message, detail),
}: ApiClientOptions = {}): ApiClient {
  const authHeaders = (): Record<string, string> =>
    auth.kind === 'bearer' ? { Authorization: 'Bearer ' + auth.token } : {};

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

  return {
    async get(path, schema) {
      const init: RequestInit | undefined = auth.kind === 'bearer' ? { headers: authHeaders() } : undefined;
      // Called with one argument for cookie auth, as the pages' bare fetch calls were.
      const resp = await (init ? getFetch()(baseUrl + path, init) : getFetch()(baseUrl + path));
      if (!resp.ok) throw await httpError(path, resp);
      return parse(path, schema, await resp.json());
    },

    async write(method, path, body, schema) {
      const resp = await getFetch()(baseUrl + path, {
        method,
        headers: body === undefined ? authHeaders() : { ...authHeaders(), 'Content-Type': 'application/json' },
        body: body === undefined ? undefined : JSON.stringify(body),
      });
      if (!resp.ok) throw await httpError(path, resp);
      return parse(path, schema, await resp.json());
    },
  };
}
