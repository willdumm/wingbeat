/**
 * GET /api/edit-history: a record's history, newest first (the edit_history triggers of
 * migration 0002). Response objects allow unknown keys, so an instance may add fields
 * without breaking older clients.
 */
import * as z from 'zod/mini';
import type { ApiClient } from './client';

const nullableStr = z.nullable(z.string());

/** An edit_history row: before/after are the row as JSON (null for an insert / a delete). */
export const EditHistoryRow = z.looseObject({
  id: z.number(),
  at: z.number(),
  user_id: z.nullable(z.number()),
  user_name: nullableStr,
  entity: z.string(),
  entity_key: z.string(),
  action: z.enum(['insert', 'update', 'delete']),
  before: nullableStr,
  after: nullableStr,
});

/** GET /api/edit-history?entity=&key=&limit= */
export const EditHistoryResponse = z.looseObject({ history: z.array(EditHistoryRow) });

export type EditHistoryRow = z.infer<typeof EditHistoryRow>;
export type EditHistoryResponse = z.infer<typeof EditHistoryResponse>;

/** The newest limit history rows of one record: entities share the key (a tracked flight's corrections and its aircraft/pilot). */
export function getEditHistory(client: ApiClient, entities: string | string[], key: string, limit = 100): Promise<EditHistoryResponse> {
  return client.get('/api/edit-history?entity=' + encodeURIComponent(([] as string[]).concat(entities).join(',')) +
    '&key=' + encodeURIComponent(key) + '&limit=' + limit, EditHistoryResponse);
}
