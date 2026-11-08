/**
 * The webhooks route group (admins only): the notification targets (a webhook URL or a
 * Pushover user) that Settings lists, adds, pauses and removes, and the setup guide counts.
 * The request schemas are in webhooks-requests.ts. Response objects allow unknown keys, so
 * an instance may add fields without breaking older clients.
 */
import * as z from 'zod/mini';
import { OkResponse, type ApiClient } from './client';
import type { WebhookCreateRequest, WebhookUpdateRequest } from './webhooks-requests';

export type { WebhookCreateRequest, WebhookUpdateRequest } from './webhooks-requests';

const nullableNum = z.nullable(z.number());

/**
 * A notification target, without its Pushover user key (write-only once saved). url is ''
 * for Pushover; events is JSON text (an array of takeoff/landing/gap); active is SQLite's 0/1.
 */
export const Webhook = z.looseObject({
  id: z.number(),
  type: z.enum(['webhook', 'pushover']),
  url: z.string(),
  label: z.nullable(z.string()),
  events: z.string(),
  active: z.number(),
  created_at: z.number(),
  last_triggered_at: nullableNum,
  last_status: nullableNum,
  last_error: z.nullable(z.string()),
});

/** GET /api/webhooks (oldest first) */
export const WebhooksResponse = z.looseObject({ webhooks: z.array(Webhook) });

/** POST /api/webhooks */
export const WebhookCreateResponse = z.looseObject({ ok: z.literal(true), id: z.number() });

export type Webhook = z.infer<typeof Webhook>;
export type WebhooksResponse = z.infer<typeof WebhooksResponse>;
export type WebhookCreateResponse = z.infer<typeof WebhookCreateResponse>;

/** Every notification target. */
export function getWebhooks(client: ApiClient): Promise<WebhooksResponse> {
  return client.get('/api/webhooks', WebhooksResponse);
}

/** Adds a notification target. */
export function createWebhook(client: ApiClient, body: WebhookCreateRequest): Promise<WebhookCreateResponse> {
  return client.write('POST', '/api/webhooks', body, WebhookCreateResponse);
}

/** Changes a notification target's fields (those in body). */
export function updateWebhook(client: ApiClient, id: number, body: WebhookUpdateRequest): Promise<OkResponse> {
  return client.write('PUT', '/api/webhooks/' + id, body, OkResponse);
}

/** Removes a notification target. */
export function deleteWebhook(client: ApiClient, id: number): Promise<OkResponse> {
  return client.write('DELETE', '/api/webhooks/' + id, undefined, OkResponse);
}
