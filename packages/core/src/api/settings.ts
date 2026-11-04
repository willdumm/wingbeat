/**
 * The settings route group (admins only): Global Settings' key/value settings (GET and
 * PATCH /api/settings, which the setup guide also reads and writes), and what the duty log
 * holds that a timezone change would move (GET /api/settings/duty-records, for the warning
 * before one: docs/mobile-app-plan.md, "Times and the operator's timezone"). The request
 * schema is in settings-requests.ts.
 */
import * as z from 'zod/mini';
import { OkResponse, type ApiClient } from './client';
import type { SettingsRequest } from './settings-requests';

export type { SettingsRequest } from './settings-requests';

/**
 * GET /api/settings: every stored setting as text (app_name, timezone, map_default_lat, …);
 * a setting never saved isn't there.
 */
export const SettingsResponse = z.record(z.string(), z.string());

/**
 * GET /api/settings/duty-records: how many duty days and default duty entries are stored,
 * as dates and wall-clock times in the operator's timezone.
 */
export const DutyRecordCountsResponse = z.looseObject({
  duty_days: z.number(),
  default_duties: z.number(),
});

export type SettingsResponse = z.infer<typeof SettingsResponse>;
export type DutyRecordCountsResponse = z.infer<typeof DutyRecordCountsResponse>;

/** The stored settings. */
export function getSettings(client: ApiClient): Promise<SettingsResponse> {
  return client.get('/api/settings', SettingsResponse);
}

/** Saves the settings in body (the others are left as they are). */
export function patchSettings(client: ApiClient, body: SettingsRequest): Promise<OkResponse> {
  return client.write('PATCH', '/api/settings', body, OkResponse);
}

/** The duty records a timezone change would move. */
export function getDutyRecordCounts(client: ApiClient): Promise<DutyRecordCountsResponse> {
  return client.get('/api/settings/duty-records', DutyRecordCountsResponse);
}
