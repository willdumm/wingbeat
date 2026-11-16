/**
 * The flight form's app-side logic (the web's flight editor, src/shared/flight-editor.ts):
 * a new manual flight's fields, the pickers' choices, and the named points the origin and
 * destination are picked from (or Other…, any text, as the web's field takes). Reading and validating the fields, and the save's request,
 * are core's (corrections.ts: readFlightForm, flightSaveRequest).
 */
import type { Aircraft } from '@wingbeat/core/api/aircraft';
import type { NamedPointsResponse } from '@wingbeat/core/api/named-points';
import type { Pilot } from '@wingbeat/core/api/pilots';
import type { FlightFormFields } from '@wingbeat/core/corrections';
import type { FilterChoice } from './flights';

/** A named point, as the form picks it. */
export interface Place {
  name: string;
  lat: number;
  lon: number;
}

export function placesOf(points: NamedPointsResponse): Place[] {
  return points.features
    .map((f) => ({ name: f.properties.name, lat: f.geometry.coordinates[1], lon: f.geometry.coordinates[0] }))
    .sort((a, b) => a.name.localeCompare(b.name));
}

/** A label's named-point coordinates, or nulls (flightSaveRequest's coords). */
export function placeCoords(places: Place[], label: string | null): [number | null, number | null] {
  const p = label ? places.find((x) => x.name === label) : undefined;
  return p ? [p.lat, p.lon] : [null, null];
}

/**
 * A new manual flight on date for pilotId (the duty log's pilot). The native time pickers
 * need a value, so Dep and Arr start equal: the save refuses that until the times are set.
 */
export function newFlightFields(date: string, pilotId: number | null): FlightFormFields {
  return {
    date, dep: '08:00', arr: '08:00', origin: '', dest: '', aircraft: '',
    pilot: pilotId == null ? '' : String(pilotId), part: '135', pay: 'paid', remark: '',
  };
}

/** The origin and destination pickers' Other… (a label typed in). */
export const OTHER_PLACE = '\u0000other';

/** A label's choice among the place choices (FlightFormChoices.places): None (''), a named point, or OTHER_PLACE. */
export function placeChoiceOf(choices: FilterChoice<string>[], label: string): string {
  return !label || choices.some((c) => c.value === label && c.value !== OTHER_PLACE) ? label : OTHER_PLACE;
}

export interface FlightFormChoices {
  aircraft: FilterChoice<string>[];
  pilots: FilterChoice<string>[];
  /** The origin and destination pickers': None, the named points, Other…. */
  places: FilterChoice<string>[];
}

/**
 * The pickers' choices: the active aircraft and pilots (and the form's own, if inactive), and
 * the named points with None and Other…. A manual flight's pilot can't be unknown, so it has
 * Choose… only until one is picked; a tracked flight's can (tracked).
 */
export function flightFormChoices(
  fields: FlightFormFields,
  aircraft: Pick<Aircraft, 'tail_number' | 'name' | 'active'>[],
  pilots: Pick<Pilot, 'id' | 'name' | 'active'>[],
  places: Place[],
  tracked: boolean,
): FlightFormChoices {
  return {
    aircraft: [
      { value: '', label: 'Unknown Aircraft' },
      ...aircraft.filter((a) => a.active || a.tail_number === fields.aircraft)
        .map((a) => ({ value: a.tail_number, label: a.tail_number + (a.name ? ' – ' + a.name : '') })),
    ],
    pilots: [
      ...(tracked ? [{ value: '', label: 'Unknown Pilot' }] : fields.pilot === '' ? [{ value: '', label: 'Choose…' }] : []),
      ...pilots.filter((p) => p.active || String(p.id) === fields.pilot).map((p) => ({ value: String(p.id), label: p.name })),
    ],
    places: [
      { value: '', label: 'None' },
      ...places.map((p) => ({ value: p.name, label: p.name })),
      { value: OTHER_PLACE, label: 'Other…' },
    ],
  };
}
