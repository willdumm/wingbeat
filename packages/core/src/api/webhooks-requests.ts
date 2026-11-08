/**
 * The webhooks route group's request schemas (api/webhooks.ts has the responses and the
 * client calls), which the Worker validates its writes with (src/index.ts). In their own
 * module so the browser bundle, which only needs their types, doesn't ship them.
 */
import * as z from 'zod/mini';

const optStr = z.optional(z.string());

/**
 * POST /api/webhooks. The handler checks that a webhook has a public https url and a
 * Pushover target its user key, and which events are known (default: all three).
 */
export const WebhookCreateRequest = z.object({
  type: optStr,
  url: optStr,
  pushover_user_key: optStr,
  label: z.nullish(z.string()),
  events: z.optional(z.array(z.string())),
});

/** PUT /api/webhooks/:id: only the fields it sends change. */
export const WebhookUpdateRequest = z.object({
  type: optStr,
  url: optStr,
  pushover_user_key: z.nullish(z.string()),
  label: z.nullish(z.string()),
  events: z.optional(z.array(z.string())),
  active: z.optional(z.boolean()),
});

export type WebhookCreateRequest = z.input<typeof WebhookCreateRequest>;
export type WebhookUpdateRequest = z.input<typeof WebhookUpdateRequest>;
