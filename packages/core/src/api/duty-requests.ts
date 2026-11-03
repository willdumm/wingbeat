/**
 * The duty route group's request schemas (api/duty.ts has the responses and the client
 * calls), which the Worker validates its writes with (src/index.ts). In their own module
 * so the browser bundle, which only needs their types, doesn't ship them.
 */
import * as z from 'zod/mini';
import { BaseHistoryId, flag } from './requests';

const optStr = z.nullish(z.string());

/** PUT /api/duty-days/:pilot: the day form, for one day or a Through range. */
export const DutyDaysRequest = z.object({
  dates: z.array(z.string()),
  duty_start: optStr,
  duty_end: optStr,
  rest: flag,
  note: optStr,
  base_history_id: BaseHistoryId,
});

/** POST /api/duty-days/:pilot/clear */
export const DutyDaysClearRequest = z.object({
  dates: z.array(z.string()),
  base_history_id: BaseHistoryId,
});

/** PUT /api/pilots/:id/default-duty: replaces is the date of the entry the edit moves. */
export const DefaultDutyRequest = z.object({
  effective_date: z.string(),
  duty_start: optStr,
  duty_end: optStr,
  replaces: optStr,
  base_history_id: BaseHistoryId,
});

/** PUT /api/duty-methods */
export const DutyMethodRequest = z.object({
  effective_date: z.string(),
  method: z.enum(['b', 'c']),
  replaces: optStr,
  base_history_id: BaseHistoryId,
});

export type DutyDaysRequest = z.input<typeof DutyDaysRequest>;
export type DutyDaysClearRequest = z.input<typeof DutyDaysClearRequest>;
export type DefaultDutyRequest = z.input<typeof DefaultDutyRequest>;
export type DutyMethodRequest = z.input<typeof DutyMethodRequest>;
