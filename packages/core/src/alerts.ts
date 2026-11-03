/**
 * The dashboard's alerts feed: flights missing an aircraft or pilot, maintenance due or
 * overdue, meter readings or service dates a schedule needs, and pilots near a §135.267
 * limit, sorted by urgency. The rows are HTML on the web side (dashboard/scripts/alerts.ts).
 *
 * Takes the operator's timezone (`tz`), the clock (`now`, Unix seconds) and the page's
 * lists (effective flights, aircraft, pilots, trackers) as parameters.
 */
import { dutyTotals, type DutyInputFlight } from './duty';
import { estimatedMeter, flightHours, maintenanceStatus, type MaintenanceItem, type MaintenanceStatus } from './maintenance';
import { fmtTzTime, tzShortDate, unixToTzDateStr } from './time';

/** Unassigned flights are flagged for this long (seconds); also the window of an aircraft's average daily hours. */
export const ALERT_WINDOW_SECS = 30 * 86400;
/** A pilot is flagged at this share of a duty limit. */
export const DUTY_ALERT_SHARE = 0.90;

export type AlertUrgency = 'immediate' | 'due_soon';

export interface UnassignedFlightAlert {
  kind: 'unassigned_flight';
  flight_id: number;
  /** "Nov 2 · N123 · no pilot" (the flight's operator day). */
  flight_label: string;
  /** "23:30 AKST" */
  flight_time_str: string;
  flight_origin: string | null;
  flight_destination: string | null;
  start_time: number;
  missing: ('aircraft' | 'pilot')[];
  urgency: 'immediate';
}

export interface MaintenanceAlert {
  kind: 'maintenance';
  aircraft_tail: string;
  aircraft_name: string | null;
  item: MaintenanceItem;
  status: MaintenanceStatus;
  urgency: AlertUrgency;
  /** Estimated days until due (from the last 30 days' average hours for a meter item), for sorting. */
  _estDays: number | null;
}

export interface TimerNotRecordedAlert {
  kind: 'timer_not_recorded';
  aircraft_tail: string;
  aircraft_name: string | null;
  timer_type: 'hobbs' | 'tach' | 'calendar';
  /** The items that need it, comma-separated. */
  needed_for: string;
  urgency: 'immediate';
}

export interface PilotDutyAlert {
  kind: 'pilot_duty';
  pilot_id: number;
  pilot_name: string;
  window_label: string;
  hours_flown: number;
  limit_hours: number;
  pct: number;
  urgency: 'due_soon';
}

export type Alert = UnassignedFlightAlert | MaintenanceAlert | TimerNotRecordedAlert | PilotDutyAlert;

export type AlertFlight = DutyInputFlight & {
  aircraft_tail?: string | null;
  pilot_id?: number | null;
  origin_label?: string | null;
  destination_label?: string | null;
  points?: { t: number }[];
};

export interface AlertAircraft {
  tail_number: string;
  name: string | null;
  active: boolean | number;
  hobbs_time: number | null;
  hobbs_recorded_at: number | null;
  hobbs_correction?: number | null;
  tach_time: number | null;
  tach_recorded_at: number | null;
  tach_correction?: number | null;
  maintenance_schedule?: MaintenanceItem[] | null;
}

export interface AlertLists {
  /** The effective flights (flightStore.getAll()). */
  flights: AlertFlight[];
  aircraft: AlertAircraft[];
  pilots: { id: number; name: string; active: boolean | number }[];
  trackers: { id: number; active: boolean | number; deleted: boolean | number }[];
}

/** Every alert for the lists as of now, sorted (sortAlerts). */
export function computeAlerts(tz: string, now: number, { flights, aircraft, pilots, trackers }: AlertLists): Alert[] {
  const flightsByTail = new Map<string, AlertFlight[]>();
  for (const f of flights) {
    if (f.aircraft_tail) {
      if (!flightsByTail.has(f.aircraft_tail)) flightsByTail.set(f.aircraft_tail, []);
      flightsByTail.get(f.aircraft_tail)!.push(f);
    }
  }
  const alerts: Alert[] = [];

  // 1. Unassigned flights (last 30 days), of active trackers, aircraft and pilots.
  const cutoff = now - ALERT_WINDOW_SECS;
  const activeTails = new Set(aircraft.filter(a => a.active).map(a => a.tail_number));
  const activePilotIds = new Set(pilots.filter(p => p.active).map(p => p.id));
  const activeTrackerIds = new Set(trackers.filter(t => t.active && !t.deleted).map(t => t.id));

  for (const f of flights) {
    if (f.start_time < cutoff) continue;
    if (f.tracker_id == null || !activeTrackerIds.has(f.tracker_id)) continue;
    if (f.aircraft_tail && !activeTails.has(f.aircraft_tail)) continue;
    if (f.pilot_id && !activePilotIds.has(f.pilot_id)) continue;
    const missing: ('aircraft' | 'pilot')[] = [];
    if (!f.aircraft_tail) missing.push('aircraft');
    if (!f.pilot_id) missing.push('pilot');
    if (missing.length === 0) continue;

    const dateStr = tzShortDate(unixToTzDateStr(tz, f.start_time), Number(unixToTzDateStr(tz, now).slice(0, 4)));
    const acLabel = f.aircraft_tail || 'no aircraft';
    let label = missing.includes('pilot') ? dateStr + ' · ' + acLabel + ' · no pilot' : dateStr + ' · no aircraft';
    if (missing.length === 2) label = dateStr + ' · no aircraft or pilot';

    alerts.push({
      kind: 'unassigned_flight',
      flight_id: f.id,
      flight_label: label,
      flight_time_str: fmtTzTime(tz, f.start_time),
      flight_origin: f.origin_label || null,
      flight_destination: f.destination_label || null,
      start_time: f.start_time,
      missing,
      urgency: 'immediate',
    });
  }

  // 2. Maintenance and meter alerts for active aircraft.
  for (const ac of aircraft.filter(a => a.active)) {
    const cfH = (ac.hobbs_correction !== null && ac.hobbs_correction !== undefined) ? ac.hobbs_correction : 1.0;
    const cfT = (ac.tach_correction !== null && ac.tach_correction !== undefined) ? ac.tach_correction : 1.0;
    const tailFlights = flightsByTail.get(ac.tail_number) || [];
    const estHobbs = estimatedMeter(ac.hobbs_time, ac.hobbs_recorded_at, cfH, ac.tail_number, tailFlights);
    const estTach = estimatedMeter(ac.tach_time, ac.tach_recorded_at, cfT, ac.tail_number, tailFlights);

    // Average Hobbs hours a day over the last 30 days: orders meter items against calendar ones.
    const recentHobbsHours = tailFlights
      .filter(f => f.start_time >= cutoff)
      .reduce((s, f) => s + flightHours(f) * cfH, 0);
    const avgHobbsPerDay = recentHobbsHours / 30;

    const missingItems: Record<'hobbs' | 'tach' | 'calendar', string[]> = { hobbs: [], tach: [], calendar: [] };
    for (const item of ac.maintenance_schedule || []) {
      const st = maintenanceStatus(tz, now, item, estHobbs, estTach);
      if (st.status === 'timer_not_recorded') {
        missingItems[item.schedule_type === 'hobbs' || item.schedule_type === 'tach' ? item.schedule_type : 'calendar'].push(item.name);
      } else if (st.status === 'overdue' || st.status === 'due_soon') {
        let estDays: number | null = null;
        if (st.remaining_hours !== undefined) {
          estDays = avgHobbsPerDay > 0 ? st.remaining_hours / avgHobbsPerDay : null;
        } else if (st.remaining_days !== undefined) {
          estDays = st.remaining_days;
        }
        alerts.push({
          kind: 'maintenance',
          aircraft_tail: ac.tail_number,
          aircraft_name: ac.name,
          item,
          status: st,
          urgency: st.status === 'overdue' ? 'immediate' : 'due_soon',
          _estDays: estDays,
        });
      }
    }
    for (const timerType of ['hobbs', 'tach', 'calendar'] as const) {
      if (missingItems[timerType].length > 0) {
        alerts.push({ kind: 'timer_not_recorded', aircraft_tail: ac.tail_number, aircraft_name: ac.name, timer_type: timerType,
          needed_for: missingItems[timerType].join(', '), urgency: 'immediate' });
      }
    }
  }

  // 3. Pilot duty: the duty log's §135.267 totals (dutyTotals), flagged at 90% of a
  // limit; the worst one per pilot. Flights are grouped by pilot once (dutyTotals keeps
  // only the pilot's own anyway).
  const flightsByPilot = new Map<number | null | undefined, AlertFlight[]>();
  for (const f of flights) {
    if (!flightsByPilot.has(f.pilot_id)) flightsByPilot.set(f.pilot_id, []);
    flightsByPilot.get(f.pilot_id)!.push(f);
  }
  for (const pilot of pilots.filter(p => p.active)) {
    const totals = dutyTotals(tz, flightsByPilot.get(pilot.id) || [], pilot.id, now, { hoursOnly: true });
    let worst: PilotDutyAlert | null = null;
    for (const row of totals.hours.concat([totals.flight24])) {
      const pct = row.secs / row.limit;
      if (pct >= DUTY_ALERT_SHARE && (!worst || pct > worst.pct)) {
        worst = {
          kind: 'pilot_duty',
          pilot_id: pilot.id,
          pilot_name: pilot.name,
          window_label: row.label,
          hours_flown: row.secs / 3600,
          limit_hours: row.limit / 3600,
          pct,
          urgency: 'due_soon',
        };
      }
    }
    if (worst) alerts.push(worst);
  }

  return sortAlerts(alerts);
}

/**
 * Immediate first (unassigned flights oldest first, then missing readings by tail, then
 * overdue maintenance soonest first), then due soon (maintenance soonest first, then
 * pilots by share of the limit, highest first).
 */
export function sortAlerts(alerts: Alert[]): Alert[] {
  const immediate = alerts.filter(a => a.urgency === 'immediate');
  const dueSoon = alerts.filter(a => a.urgency === 'due_soon');
  const of = <K extends Alert['kind']>(list: Alert[], kind: K) => list.filter(a => a.kind === kind) as Extract<Alert, { kind: K }>[];
  const byEstDays = (none: number) => (a: MaintenanceAlert, b: MaintenanceAlert) =>
    (a._estDays ?? none) - (b._estDays ?? none);

  const immUnassigned = of(immediate, 'unassigned_flight').sort((a, b) => a.start_time - b.start_time);
  const immTimer = of(immediate, 'timer_not_recorded').sort((a, b) => a.aircraft_tail.localeCompare(b.aircraft_tail));
  const immMaint = of(immediate, 'maintenance').sort(byEstDays(999));
  const dsMaint = of(dueSoon, 'maintenance').sort(byEstDays(9999));
  const dsPilot = of(dueSoon, 'pilot_duty').sort((a, b) => b.pct - a.pct);

  return [...immUnassigned, ...immTimer, ...immMaint, ...dsMaint, ...dsPilot];
}
