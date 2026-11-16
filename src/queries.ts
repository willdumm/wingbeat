import { Tracker, Aircraft, Pilot, DefaultDuty } from './types';
import { mapshareUrl } from './notifications';

// The tracker, aircraft and pilot lists, as the bootstrap and the list routes return them,
// and as the alert check (alert-push.ts) builds the page's alert lists from.

// The feed URL (source_url) can embed a share id/key that lets whoever holds it poll the
// live feed directly, so only admins (who edit it in Settings) get it. Everyone gets the
// derived MapShare page URL, which is what the UI links to.
export async function queryTrackers(db: D1Database, isAdmin: boolean): Promise<Tracker[]> {
  const { results } = await db.prepare(
    'SELECT id, name, type, source_url, active, deleted, assigned_aircraft, assigned_pilot FROM trackers ORDER BY id ASC'
  ).all<Omit<Tracker, 'mapshare_url'> & { source_url: string }>();
  return results.map(({ source_url, ...t }) => ({
    ...t,
    ...(isAdmin ? { source_url } : {}),
    mapshare_url: t.type === 'inreach' ? mapshareUrl(source_url) : null,
  }));
}

export async function queryAircraft(db: D1Database, activeOnly = false) {
  const { results } = await db.prepare(
    'SELECT tail_number, name, active, hobbs_time, hobbs_recorded_at, hobbs_correction, tach_time, tach_recorded_at, tach_correction, maintenance_schedule FROM aircraft'
    + (activeOnly ? ' WHERE active = 1' : '') + ' ORDER BY tail_number ASC').all<Aircraft & { maintenance_schedule: string | null }>();
  return results.map(r => ({ ...r, maintenance_schedule: r.maintenance_schedule ? JSON.parse(r.maintenance_schedule) : null }));
}

// Pilots with their dated default duties (default_duties, oldest first; migration 0002),
// for the pilot list's "Default duty" line.
export async function queryPilots(db: D1Database, activeOnly = false): Promise<Pilot[]> {
  const query = activeOnly
    ? 'SELECT id, name, active FROM pilots WHERE active = 1 ORDER BY name ASC'
    : 'SELECT id, name, active FROM pilots ORDER BY name ASC';
  const [pilots, defaults] = await db.batch([
    db.prepare(query),
    db.prepare('SELECT pilot_id, effective_date, duty_start, duty_end FROM pilot_default_duty ORDER BY pilot_id, effective_date'),
  ]);
  const byPilot = new Map<number, DefaultDuty[]>();
  for (const { pilot_id, ...entry } of defaults.results as (DefaultDuty & { pilot_id: number })[]) {
    byPilot.set(pilot_id, [...byPilot.get(pilot_id) ?? [], entry]);
  }
  return (pilots.results as Omit<Pilot, 'default_duties'>[]).map(p => ({ ...p, default_duties: byPilot.get(p.id) ?? [] }));
}
