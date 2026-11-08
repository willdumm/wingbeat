import { statusChip } from './status';

/**
 * The marks every flight view shares: † on a corrected value (the tracker's value in its
 * title), the "Manual"/"Removed"/"Not found" chips and the remarks line under a flight.
 */
export function flightEditsStyles(): string {
  return `
    .flight-edited {
      color: var(--accent-text); font-weight: var(--weight-bold);
      margin-left: 1px; cursor: help;
    }
    .flight-chip { margin-left: 0.35rem; vertical-align: 1px; }
    .flight-remarks {
      font-size: var(--size-2xs); color: var(--text-muted); font-style: italic;
      margin-top: 0.1rem;
    }
  `;
}

/**
 * The HTML half of flight corrections: the chips, the † mark on a corrected value and the
 * remarks line. The logic (applyFlightEdits(), flightRemarks(), the flight form's times, …)
 * is @wingbeat/core/flight-edits, which the core bundle (shared/core-bundle.ts) puts on the
 * page under the same global names. Needs htmlEscapeScript() (shared/html.ts) in the same
 * script.
 */
export function flightEditsScript(): string {
  return `
    // ── Flight corrections ────────────────────────────────────────────────────

    const FLIGHT_CHIP_MANUAL    = ${JSON.stringify(statusChip('Manual', 'neutral', 'wb-chip--sm flight-chip'))};
    const FLIGHT_CHIP_REMOVED   = ${JSON.stringify(statusChip('Removed', 'danger', 'wb-chip--sm flight-chip'))};
    const FLIGHT_CHIP_UNMATCHED = ${JSON.stringify(statusChip('Not found', 'warn', 'wb-chip--sm flight-chip'))};

    // "†" after a value when any of fields was corrected, with the tracker's values in its
    // title ("Tracker: Dep 09:00, Arr 09:44"); '' otherwise.
    function flightEditedMark(f, fields) {
      const edited = fields.filter(k => flightFieldEdited(f, k));
      if (!edited.length) return '';
      return '<span class="flight-edited" title="Tracker: ' + escHtml(edited.map(k =>
        FLIGHT_EDIT_FIELD_NAMES[k] + ' ' + flightOriginalText(k, f.edit.original[k])).join(', ')) + '">†</span>';
    }

    // The remarks line under a flight ("Part 91 · Training"), or '' when it has none.
    function flightRemarksHtml(f) {
      const r = flightRemarks(f);
      return r.length ? '<div class="flight-remarks">' + escHtml(r.join(' · ')) + '</div>' : '';
    }
  `;
}
