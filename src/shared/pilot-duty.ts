import { icon } from './icons';
import { statusChip } from './status';

/** Duty log view body: month navigation + export toolbar, then the table and totals. */
export function pilotDutyMarkup(): string {
  return /* html */ `
          <div class="pilot-duty-toolbar">
            <button id="pilot-duty-prev" class="pilot-duty-nav-btn btn-secondary btn-sm" aria-label="Previous month">${icon('chevron-left', { size: 14 })}</button>
            <span id="pilot-duty-period" class="pilot-duty-period-label"></span>
            <button id="pilot-duty-next" class="pilot-duty-nav-btn btn-secondary btn-sm" aria-label="Next month">${icon('chevron-right', { size: 14 })}</button>
            <div class="pilot-duty-actions">
              <button id="pilot-duty-add" class="pilot-duty-add-btn btn-secondary btn-sm" hidden>${icon('plus', { size: 14 })}Add flight</button>
              <button id="pilot-duty-export" class="btn-primary btn-sm">Export PDF</button>
            </div>
          </div>
          <div class="pilot-duty-body">
            <div id="pilot-duty-content" class="pilot-duty-content"></div>
            <div id="pilot-duty-totals" class="pilot-duty-totals"></div>
          </div>`;
}

/** Progress overlay shown while the PDF compiler downloads on first export. */
export function typstLoadOverlayMarkup(): string {
  return /* html */ `
      <div id="typst-load-overlay" class="typst-load-overlay hidden">
        <div class="typst-load-panel">
          <div class="typst-load-label" id="typst-load-label">Downloading PDF compiler&hellip;</div>
          <div class="typst-progress-track"><div class="typst-progress-fill" id="typst-progress-fill"></div></div>
          <div class="typst-progress-pct" id="typst-progress-pct">0%</div>
        </div>
      </div>`;
}

export function pilotDutyStyles(): string {
  return `
    /* The view opens full screen (data-fullscreen in settings.ts); past 64rem the toolbar
       and body keep a readable measure, centered. */
    .pilot-duty-toolbar {
      display: flex;
      flex-wrap: wrap;
      align-items: center;
      gap: 0.5rem;
      padding: 0.6rem max(1rem, calc((100% - 64rem) / 2 + 1rem));
      border-bottom: 1px solid var(--border);
      position: sticky;
      top: 0;
      z-index: 1;
      background: var(--surface-1);
    }
    /* Square .btn-sm (buttons.ts) */
    .pilot-duty-nav-btn { width: var(--control-h-sm); padding: 0; }
    .pilot-duty-period-label {
      font-size: 0.88rem; font-weight: 600; color: var(--text-primary);
      min-width: 7rem; text-align: center;
    }
    /* Pushed right; on a phone they wrap onto their own row. */
    .pilot-duty-actions { display: flex; gap: 0.5rem; margin-left: auto; }
    .pilot-duty-add-btn[hidden] { display: none; }

    .pilot-duty-body {
      padding: 1rem;
      max-width: 64rem;
      margin: 0 auto;
      display: flex;
      flex-direction: column;
      gap: 1.5rem;
    }
    .pilot-duty-loading { font-size: 0.82rem; color: var(--text-muted); }

    .duty-table {
      width: 100%;
      border-collapse: collapse;
      font-size: 0.82rem;
    }
    .duty-table th {
      background: var(--surface-2);
      color: var(--text-secondary); font-weight: 600;
      font-size: 0.72rem; text-transform: uppercase; letter-spacing: 0.05em;
      padding: 0.4rem 0.5rem; text-align: left;
      border-bottom: 1px solid var(--border);
    }
    .duty-table td {
      padding: 0.35rem 0.5rem;
      border-bottom: 1px solid var(--border-subtle);
      color: var(--text-primary); vertical-align: top;
    }
    .duty-table tr:last-child td { border-bottom: none; }
    .duty-row-empty td { color: var(--text-muted); }
    .duty-row-rest td { font-style: italic; }
    .duty-row-day-total td {
      color: var(--text-secondary); font-size: 0.75rem;
      background: var(--surface-hover);
      border-bottom: 1px solid var(--border);
    }
    .duty-total-label { text-align: right; }
    .duty-row-warning td {
      color: var(--danger-fg); background: var(--danger-surface);
      font-size: 0.75rem;
    }
    .duty-row-warning .wb-icon { margin-right: 0.3rem; vertical-align: -2px; }
    .duty-row-unmatched td { color: var(--text-secondary); font-size: 0.78rem; }
    .duty-col-block { text-align: right; font-variant-numeric: tabular-nums; }
    .duty-col-date  { white-space: nowrap; font-weight: 500; }
    .duty-col-duty  { white-space: nowrap; color: var(--text-secondary); }
    .duty-col-91    { text-align: center; color: var(--text-secondary); }
    .duty-col-edit  { width: 1px; padding-left: 0; padding-right: 0; }
    .duty-col-compact { display: none; }
    .duty-compact-times { color: var(--text-muted); font-size: 0.75rem; }
    .duty-date-sub { display: none; }
    .duty-note { font-size: 0.72rem; color: var(--text-muted); font-style: normal; white-space: normal; }
    .duty-chip { margin-left: 0.35rem; vertical-align: 1px; }
    .duty-row-unmatched .duty-chip { margin: 0 0.35rem 0 0; }
    /* A value corrected from the tracker's; the title holds the original. */
    .duty-edited { color: var(--accent-text); font-weight: var(--weight-bold); margin-left: 1px; cursor: help; }

    /* Edit affordances (admins only): the date opens the day form, the pencil the flight form. */
    .duty-day-btn, .duty-edit-btn, .duty-link-btn {
      background: none; border: none; padding: 0; margin: 0;
      font: inherit; color: inherit; cursor: pointer;
      border-radius: var(--radius-xs);
    }
    .duty-day-btn { text-align: left; text-decoration: underline dotted var(--text-faint); text-underline-offset: 3px; }
    .duty-day-btn:hover { color: var(--accent-text); }
    .duty-edit-btn {
      color: var(--text-muted); display: inline-flex; padding: 0.15rem 0.35rem;
    }
    .duty-edit-btn:hover { color: var(--accent-text); }
    .duty-link-btn { color: var(--danger-fg); text-decoration: underline; margin-left: 0.4rem; }
    .duty-day-btn:focus-visible, .duty-edit-btn:focus-visible, .duty-link-btn:focus-visible { outline: none; box-shadow: var(--ring-focus); }

    /* Narrow (phones, the settings modal or a showcase frame on one): the columns don't
       fit, so each flight folds into one "Origin → Dest / Dep–Arr · A/C" cell between
       Date and Time, and the day's duty moves under the date. Rows become grids, which
       sidesteps the colspans. */
    .pilot-duty-content { container-type: inline-size; }
    @container (max-width: 40rem) {
      .duty-table, .duty-table thead, .duty-table tbody { display: block; }
      .duty-table tr { display: grid; grid-template-columns: 6.5rem minmax(0, 1fr) auto auto; }
      .duty-table th, .duty-table td { display: none; }
      .duty-table .duty-col-date, .duty-table .duty-col-compact, .duty-table .duty-col-block,
      .duty-table .duty-col-edit, .duty-table .duty-col-span, .duty-table .duty-col-full,
      .duty-table .duty-total-label { display: block; }
      .duty-table .duty-col-compact { overflow-wrap: anywhere; }
      .duty-table .duty-col-span { grid-column: 2 / -1; white-space: normal; }
      .duty-table .duty-col-full { grid-column: 1 / -1; }
      .duty-table .duty-total-label { grid-column: 1 / 3; }
      .duty-table .duty-col-edit { width: auto; padding: 0.25rem 0 0 0.25rem; }
      .duty-date-sub { display: block; font-weight: normal; font-size: 0.72rem; color: var(--text-muted); white-space: normal; }
    }

    .duty-month-total {
      text-align: right; font-size: 0.85rem;
      color: var(--text-primary); font-weight: 600;
      padding: 0.5rem 0 0;
    }

    .pilot-duty-totals { font-size: 0.82rem; }
    .pilot-duty-totals-label {
      font-size: 0.7rem; font-weight: 700;
      text-transform: uppercase; letter-spacing: 0.08em;
      color: var(--text-muted); margin-bottom: 0.5rem;
    }
    .totals-table { width: 100%; border-collapse: collapse; }
    .totals-table td {
      padding: 0.25rem 0.4rem;
      border-bottom: 1px solid var(--border-subtle);
      color: var(--text-primary);
    }
    .totals-table td:last-child { text-align: right; font-variant-numeric: tabular-nums; }
    .totals-table tr:last-child td { border-bottom: none; }
    .totals-table .duty-over td { color: var(--danger); font-weight: var(--weight-semibold); }
    .totals-limit { color: var(--text-muted); font-weight: normal; }
    .pilot-duty-footnote { font-size: 0.72rem; color: var(--text-muted); margin-top: 0.5rem; line-height: 1.45; }

    .typst-load-overlay {
      position: absolute;
      inset: 0;
      z-index: 10;
      background: var(--overlay);
      display: flex; align-items: center; justify-content: center;
    }
    .typst-load-overlay.hidden { display: none; }
    .typst-load-panel {
      display: flex; flex-direction: column;
      gap: 0.6rem; align-items: center;
      width: 260px;
      background: var(--surface-1);
      border: 1.5px solid var(--border);
      border-radius: var(--radius-lg);
      padding: 1.25rem 1.5rem;
    }
    .typst-load-label { font-size: 0.82rem; color: var(--text-secondary); }
    .typst-progress-track {
      width: 100%; height: 6px;
      background: var(--border); border-radius: var(--radius-pill); overflow: hidden;
    }
    .typst-progress-fill {
      height: 100%; width: 0%;
      background: var(--accent); border-radius: var(--radius-pill);
      transition: width 0.2s ease;
    }
    .typst-progress-pct { font-size: 0.75rem; color: var(--text-muted); }
  `;
}

/**
 * Pilot duty log computation and rendering. computeDutyData() merges one pilot's tracked
 * flights with the duty log's corrections, manual flights and duty/rest days (GET
 * /api/duty-log) into a month of day rows with §135.267 warnings and totals;
 * renderDutyLog() and the PDF export (Typst, loaded on first export) only format that
 * model. Takes flights, log and elements as arguments rather than reading the flight
 * store, so the docs-site showcase (src/showcase/) renders and exports the same log from
 * sample data. Times are shown in APP_SETTINGS.timezone. See
 * docs/duty-log-editing-plan.md.
 */
export function pilotDutyRenderScript(): string {
  return `
    // ── Pilot duty log rendering ──────────────────────────────────────────────

    const _DUTY_TZ = window.APP_SETTINGS.timezone;
    // The PDF isn't themed: warnings print in light mode's --danger-fg.
    const _DUTY_PDF_DANGER = '#9c2f27';
    const _DUTY_DAY_NAMES   = ['Sun','Mon','Tue','Wed','Thu','Fri','Sat'];
    const _DUTY_MONTH_NAMES = ['January','February','March','April','May','June',
                               'July','August','September','October','November','December'];
    const _DUTY_MONTH_ABBR  = ['Jan','Feb','Mar','Apr','May','Jun','Jul','Aug','Sep','Oct','Nov','Dec'];

    // §135.267, one pilot, unscheduled.
    const _DUTY_LIMITS = {
      flight24hSecs:   8 * 3600,      // (b) flight time in any 24 consecutive hours
      dutySecs:        14 * 3600,     // (c) duty period
      restBeforeSecs:  10 * 3600,     // (c)/(d) rest before a duty period
      quarterSecs:     500 * 3600,    // (a) calendar quarter
      twoQuarterSecs:  800 * 3600,    // (a) two consecutive calendar quarters
      yearSecs:        1400 * 3600,   // (a) calendar year
      quarterRestDays: 13,            // (f) 24-hour rest periods per calendar quarter
    };
    // Tracked-flight fields a flight_log_entries row can correct (NULL = tracker's value).
    const _DUTY_EDIT_FIELDS = ['start_time', 'end_time', 'origin_label', 'destination_label'];
    const _DUTY_FIELD_NAMES = { start_time: 'Dep', end_time: 'Arr', origin_label: 'Origin', destination_label: 'Dest' };

    const _DUTY_CHIP_MANUAL    = ${JSON.stringify(statusChip('Manual', 'neutral', 'wb-chip--sm duty-chip'))};
    const _DUTY_CHIP_UNMATCHED = ${JSON.stringify(statusChip('Not found', 'warn', 'wb-chip--sm duty-chip'))};
    const _DUTY_ICON_EDIT      = ${JSON.stringify(icon('pencil', { size: 13 }))};
    const _DUTY_ICON_WARN      = ${JSON.stringify(icon('triangle-alert', { size: 13 }))};

    const _TYPST_SCRIPT_URL = 'https://cdn.jsdelivr.net/npm/@myriaddreamin/typst.ts@0.7.0/dist/esm/contrib/all-in-one-lite.bundle.js';
    const _TYPST_WASM_URL   = 'https://cdn.jsdelivr.net/npm/@myriaddreamin/typst-ts-web-compiler@0.7.0/pkg/typst_ts_web_compiler_bg.wasm';
    const _TYPST_CACHE_NAME = 'ft-typst-v1';

    let _typstInstance  = null;
    let _typstWasmBytes = null;

    function fmtBlock(secs) {
      const h = Math.floor(secs / 3600);
      const m = Math.floor((secs % 3600) / 60);
      return h + ':' + String(m).padStart(2, '0');
    }

    // ── Dates and times in the duty timezone ──

    // Dates and times come from tzCalendarScript() (shared/time.ts): unixToTzDateStr,
    // unixToTzTime, tzLocalToEpoch.
    function dutyAddDays(dateKey, n) {
      const [y, m, d] = dateKey.split('-').map(Number);
      return new Date(Date.UTC(y, m - 1, d + n)).toISOString().slice(0, 10);
    }
    function _dutyKey(y, m, d) {
      return y + '-' + String(m).padStart(2, '0') + '-' + String(d).padStart(2, '0');
    }
    function _dutyAddMonths(y, m, n) {
      const t = y * 12 + (m - 1) + n;
      return [Math.floor(t / 12), t % 12 + 1];
    }
    // "Mon Oct 3"
    function dutyDateLabel(dateKey) {
      const [y, m, d] = dateKey.split('-').map(Number);
      return _DUTY_DAY_NAMES[new Date(Date.UTC(y, m - 1, d)).getUTCDay()] + ' ' + _DUTY_MONTH_ABBR[m - 1] + ' ' + d;
    }
    // "Oct 3" (with the year when it isn't sameYear)
    function _dutyShortDate(dateKey, sameYear) {
      const [y, m, d] = dateKey.split('-').map(Number);
      return _DUTY_MONTH_ABBR[m - 1] + ' ' + d + (y === sameYear ? '' : ', ' + y);
    }

    // [year, month] of the current month in the duty timezone.
    function currentDutyMonth() {
      return unixToTzDateStr(Math.floor(Date.now() / 1000)).split('-').slice(0, 2).map(Number);
    }

    function dutyPeriodLabel(data) {
      return _DUTY_MONTH_NAMES[data.month - 1] + ' ' + data.year;
    }

    // Duty period of a duty_days row as epochs; an end at or before the start is the next day.
    function _dutyInterval(rec) {
      if (!rec || !rec.duty_start || !rec.duty_end) return null;
      const start = tzLocalToEpoch(rec.date, rec.duty_start);
      const end = tzLocalToEpoch(rec.duty_end > rec.duty_start ? rec.date : dutyAddDays(rec.date, 1), rec.duty_end);
      return { start, end, secs: end - start };
    }

    // ── The row model ──

    // One pilot's month as day rows plus §135.267 totals. log is GET /api/duty-log's
    // { entries, days } (omitted: the tracker's flights as they are, no duty days).
    // Returns { pilotName, year, month, isCurrentMonth, days, monthSecs, totals }, where
    // each day is { dateKey, label, record, duty, rest, restDesignatedAt, note, flights,
    // unmatched, daySecs, warnings }. A flight is the tracked or manual flight with the
    // log's corrections applied: { key, manual, entry, flight (tracked only), tracker_id,
    // start_time, end_time, secs, origin_label, destination_label, aircraft_tail, part91,
    // edited: { field: tracker's value } }.
    function computeDutyData(allFlights, pilotId, pilotName, year, month, log) {
      const entries = (log && log.entries) || [];
      const dayRecords = (log && log.days) || [];
      const nowEpoch = Math.floor(Date.now() / 1000);

      // 1. Effective flights.
      const completed = allFlights.filter(f => f.end_time != null);
      const flightKey = (trackerId, start) => trackerId + ':' + start;
      const flightsByKey = new Map(completed.map(f => [flightKey(f.tracker_id, f.start_time), f]));
      const entryByFlight = new Map();
      const unmatchedEntries = [];
      for (const e of entries) {
        if (e.tracker_id == null) continue;
        const k = flightKey(e.tracker_id, e.flight_start_time);
        if (flightsByKey.has(k)) entryByFlight.set(k, e);
        else unmatchedEntries.push(e);
      }

      const flights = [];
      for (const f of completed) {
        if (f.pilot_id !== pilotId) continue;
        const k = flightKey(f.tracker_id, f.start_time);
        const e = entryByFlight.get(k) || null;
        if (e && e.excluded) continue;
        const eff = {
          key: 't' + k, manual: false, entry: e, flight: f, tracker_id: f.tracker_id,
          start_time: f.start_time, end_time: f.end_time,
          origin_label: f.origin_label, destination_label: f.destination_label,
          aircraft_tail: f.aircraft_tail, part91: !!(e && e.part91), edited: {},
        };
        if (e) {
          for (const field of _DUTY_EDIT_FIELDS) {
            if (e[field] != null) { eff.edited[field] = f[field]; eff[field] = e[field]; }
          }
        }
        flights.push(eff);
      }
      for (const e of entries) {
        if (e.tracker_id != null || e.pilot_id !== pilotId || e.excluded) continue;
        flights.push({
          key: 'm' + e.id, manual: true, entry: e, flight: null, tracker_id: null,
          start_time: e.start_time, end_time: e.end_time,
          origin_label: e.origin_label, destination_label: e.destination_label,
          aircraft_tail: e.aircraft_tail, part91: !!e.part91, edited: {},
        });
      }
      for (const f of flights) f.secs = Math.max(0, f.end_time - f.start_time);
      flights.sort((a, b) => a.start_time - b.start_time);
      const flights135 = flights.filter(f => !f.part91);

      // A row whose flight is gone (a history import moved its first point) carries no
      // pilot, so it goes to the pilot of the tracker's flight that now covers its start
      // time, or to every pilot's log when nothing does, rather than vanishing.
      const unmatchedByDate = {};
      for (const e of unmatchedEntries) {
        const cover = completed.find(f => f.tracker_id === e.tracker_id &&
          f.start_time <= e.flight_start_time && e.flight_start_time <= f.end_time);
        if (cover && cover.pilot_id !== pilotId) continue;
        const dk = unixToTzDateStr(e.flight_start_time);
        (unmatchedByDate[dk] = unmatchedByDate[dk] || []).push(e);
      }

      const flightsByDate = {};
      for (const f of flights) {
        const dk = unixToTzDateStr(f.start_time);
        (flightsByDate[dk] = flightsByDate[dk] || []).push(f);
      }
      const recordByDate = {};
      for (const r of dayRecords) recordByDate[r.date] = r;

      // Flight time in the 24 h ending at end, Part 91 flights left out.
      function flightTime24(end) {
        const from = end - 86400;
        let s = 0;
        for (const g of flights135) {
          if (g.end_time <= from || g.start_time >= end) continue;
          s += Math.min(g.end_time, end) - Math.max(g.start_time, from);
        }
        return s;
      }

      // 2. Days.
      function buildDay(dateKey) {
        const rec = recordByDate[dateKey] || null;
        const dayFlights = flightsByDate[dateKey] || [];
        const duty = _dutyInterval(rec);
        const rest = !!(rec && rec.rest);
        const warnings = [];

        if (rest) {
          if (dayFlights.length) warnings.push('Flights on a rest day');
          if (rec.rest_designated_at != null && unixToTzDateStr(rec.rest_designated_at) >= dateKey) {
            warnings.push('Rest day designated ' + _dutyShortDate(unixToTzDateStr(rec.rest_designated_at), year) +
              ', not in advance');
          }
          const prevDuty = _dutyInterval(recordByDate[dutyAddDays(dateKey, -1)]);
          if (prevDuty && prevDuty.end > tzLocalToEpoch(dateKey, '00:00')) {
            warnings.push('Previous duty ended ' + unixToTzTime(prevDuty.end) + ', so this rest is under 24 h');
          }
        }
        let worst24 = 0, worstEnd = null;
        for (const f of dayFlights) {
          if (f.part91) continue;
          const s = flightTime24(f.end_time);
          if (s > worst24) { worst24 = s; worstEnd = f.end_time; }
        }
        if (worst24 > _DUTY_LIMITS.flight24hSecs) {
          warnings.push(fmtBlock(worst24) + ' flight time in the 24 h to ' + unixToTzTime(worstEnd) +
            ' (limit ' + fmtBlock(_DUTY_LIMITS.flight24hSecs) + ')');
        }
        if (duty) {
          if (duty.secs > _DUTY_LIMITS.dutySecs) {
            warnings.push('Duty period ' + fmtBlock(duty.secs) + ' (limit ' + fmtBlock(_DUTY_LIMITS.dutySecs) + ')');
          }
          const prevDuty = _dutyInterval(recordByDate[dutyAddDays(dateKey, -1)]);
          if (prevDuty && duty.start - prevDuty.end < _DUTY_LIMITS.restBeforeSecs) {
            warnings.push('Rest since previous duty ' + fmtBlock(Math.max(0, duty.start - prevDuty.end)) +
              ' (minimum ' + fmtBlock(_DUTY_LIMITS.restBeforeSecs) + ')');
          }
        }

        return {
          dateKey,
          label: dutyDateLabel(dateKey),
          record: rec,
          duty,
          rest,
          restDesignatedAt: rest ? rec.rest_designated_at : null,
          note: rec ? rec.note : null,
          flights: dayFlights,
          unmatched: unmatchedByDate[dateKey] || [],
          daySecs: dayFlights.reduce((s, f) => s + f.secs, 0),
          warnings,
        };
      }

      const daysInMonth = new Date(Date.UTC(year, month, 0)).getUTCDate();
      const days = [];
      for (let d = 1; d <= daysInMonth; d++) days.push(buildDay(_dutyKey(year, month, d)));

      // 3. Totals: as of now for the current month, as of month end for a past one, so a
      // past month's PDF comes out the same whenever it's exported.
      const [curY, curM] = currentDutyMonth();
      const isCurrentMonth = year === curY && month === curM;
      const [nextY, nextM] = _dutyAddMonths(year, month, 1);
      const asOf = isCurrentMonth ? nowEpoch : tzLocalToEpoch(_dutyKey(nextY, nextM, 1), '00:00');
      const asOfDateKey = isCurrentMonth ? unixToTzDateStr(nowEpoch) : _dutyKey(year, month, daysInMonth);

      const qy = year, qm = Math.floor((month - 1) / 3) * 3 + 1;
      const [pqy, pqm] = _dutyAddMonths(qy, qm, -3);
      const [nqy, nqm] = _dutyAddMonths(qy, qm, 3);
      const qStartKey = _dutyKey(qy, qm, 1);
      const qEndKey = dutyAddDays(_dutyKey(nqy, nqm, 1), -1);
      const quarterName = (y, m) => 'Q' + ((m - 1) / 3 + 1) + ' ' + y;
      function flownSince(dateKey) {
        const from = tzLocalToEpoch(dateKey, '00:00');
        return flights.reduce((s, f) => s + (f.start_time >= from && f.start_time < asOf ? f.secs : 0), 0);
      }

      // Rest periods: days marked rest with no flights on them.
      let restTaken = 0, restScheduled = 0;
      for (const r of dayRecords) {
        if (!r.rest || r.date < qStartKey || r.date > qEndKey || flightsByDate[r.date]) continue;
        if (r.date <= asOfDateKey) restTaken++; else restScheduled++;
      }
      let daysLeft = 0;
      for (let k = dutyAddDays(asOfDateKey, 1); k <= qEndKey; k = dutyAddDays(k, 1)) daysLeft++;

      const limitRow = (label, secs, limit) => ({ label, secs, limit, over: secs > limit });
      const totals = {
        asOfLabel: isCurrentMonth ? 'now' : _dutyShortDate(asOfDateKey, null),
        hours: [
          limitRow(quarterName(qy, qm), flownSince(qStartKey), _DUTY_LIMITS.quarterSecs),
          limitRow(quarterName(pqy, pqm) + ' + ' + quarterName(qy, qm), flownSince(_dutyKey(pqy, pqm, 1)), _DUTY_LIMITS.twoQuarterSecs),
          limitRow('Calendar year ' + qy, flownSince(_dutyKey(qy, 1, 1)), _DUTY_LIMITS.yearSecs),
        ],
        rest: {
          label: '24 h rest periods, ' + quarterName(qy, qm),
          taken: restTaken,
          scheduled: restScheduled,
          required: _DUTY_LIMITS.quarterRestDays,
          // Can no longer reach 13 even if every remaining day were rest.
          short: restTaken + daysLeft < _DUTY_LIMITS.quarterRestDays,
        },
      };

      return {
        pilotName,
        year,
        month,
        isCurrentMonth,
        days,
        monthSecs: days.reduce((s, d) => s + d.daySecs, 0),
        totals,
      };
    }

    // What an unmatched row would have changed, e.g. "Dep 08:05, Part 91".
    function dutyEntrySummary(e) {
      const parts = [];
      if (e.start_time != null) parts.push('Dep ' + unixToTzTime(e.start_time));
      if (e.end_time != null) parts.push('Arr ' + unixToTzTime(e.end_time));
      if (e.origin_label != null) parts.push('Origin ' + e.origin_label);
      if (e.destination_label != null) parts.push('Dest ' + e.destination_label);
      if (e.part91) parts.push('Part 91');
      if (e.excluded) parts.push('removed from log');
      return parts.join(', ') || 'no corrections';
    }

    // The tracker's value of an edited field, as shown next to the correction.
    function dutyOriginalText(field, value) {
      if (value == null || value === '') return '(none)';
      return field === 'start_time' || field === 'end_time' ? unixToTzTime(value) : String(value);
    }

    // "Rest · designated Oct 3", "08:00–17:00" or "—".
    function dutyDayText(day, year) {
      if (day.rest) {
        return 'Rest' + (day.restDesignatedAt != null
          ? ' · designated ' + _dutyShortDate(unixToTzDateStr(day.restDesignatedAt), year) : '');
      }
      if (day.duty) return day.record.duty_start + '–' + day.record.duty_end;
      return '—';
    }

    function _dutyEsc(s) {
      return String(s).replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;').replace(/"/g, '&quot;');
    }

    // Renders data (from computeDutyData) as the month table into content and the totals
    // into totalsEl, which is placed first in bodyEl for the current month and last
    // otherwise. With edit ({ onFlight(flight), onDay(day), onDeleteEntry(entry) }), dates
    // and flights get edit controls.
    function renderDutyLog(data, { content, totalsEl, bodyEl, edit }) {
      const { year, days, totals, isCurrentMonth } = data;
      const cols = 9 + (edit ? 1 : 0);   // Date … 91, plus the pencil column
      const targets = [];                // data-duty-target index → callback

      function action(fn) { targets.push(fn); return targets.length - 1; }
      function cellVal(f, field, text) {
        const v = _dutyEsc(text);
        if (!(field in f.edited)) return v;
        return v + '<span class="duty-edited" title="Tracker: ' +
          _dutyEsc(dutyOriginalText(field, f.edited[field])) + '">†</span>';
      }
      function label(f, field) { return cellVal(f, field, f[field] || '—'); }
      function time(f, field) { return cellVal(f, field, unixToTzTime(f[field])); }

      let html =
        '<table class="duty-table"><thead><tr>' +
        '<th class="duty-col-date">Date</th>' +
        '<th class="duty-col-compact">Flight</th>' +
        '<th class="duty-col-duty">Duty</th>' +
        '<th>A/C</th><th>Origin</th><th>Dep</th>' +
        '<th>Dest</th><th>Arr</th><th class="duty-col-block">Time</th>' +
        '<th class="duty-col-91" title="Part 91">91</th>' +
        (edit ? '<th class="duty-col-edit"></th>' : '') +
        '</tr></thead><tbody>';

      for (const day of days) {
        const dayText = dutyDayText(day, year);
        const noteHtml = day.note ? '<div class="duty-note">' + _dutyEsc(day.note) + '</div>' : '';
        const dateHtml = edit
          ? '<button class="duty-day-btn" data-duty-target="' + action(() => edit.onDay(day)) + '" title="Edit duty or rest">' + day.label + '</button>'
          : day.label;
        const restCls = day.rest ? ' duty-row-rest' : '';

        if (day.flights.length === 0) {
          html += '<tr class="duty-row-empty' + restCls + '">' +
            '<td class="duty-col-date">' + dateHtml + '</td>' +
            '<td class="duty-col-duty duty-col-span" colspan="' + (cols - 1) + '">' + _dutyEsc(dayText) + noteHtml + '</td></tr>';
        }

        day.flights.forEach((f, i) => {
          const chip = f.manual ? _DUTY_CHIP_MANUAL : '';
          const tail = _dutyEsc(f.aircraft_tail || '—');
          html += '<tr class="duty-row-flight' + restCls + '">' +
            '<td class="duty-col-date">' + (i === 0
              ? dateHtml + '<div class="duty-date-sub">' + _dutyEsc(dayText) + noteHtml + '</div>' : '') + '</td>' +
            '<td class="duty-col-compact">' + label(f, 'origin_label') + ' → ' + label(f, 'destination_label') + chip +
              '<div class="duty-compact-times">' + time(f, 'start_time') + '–' + time(f, 'end_time') +
              ' · ' + tail + (f.part91 ? ' · Part 91' : '') + '</div></td>' +
            '<td class="duty-col-duty">' + (i === 0 ? _dutyEsc(dayText) + noteHtml : '') + '</td>' +
            '<td>' + tail + '</td>' +
            '<td>' + label(f, 'origin_label') + chip + '</td>' +
            '<td>' + time(f, 'start_time') + '</td>' +
            '<td>' + label(f, 'destination_label') + '</td>' +
            '<td>' + time(f, 'end_time') + '</td>' +
            '<td class="duty-col-block">' + fmtBlock(f.secs) + '</td>' +
            '<td class="duty-col-91">' + (f.part91 ? '91' : '') + '</td>' +
            (edit ? '<td class="duty-col-edit"><button class="duty-edit-btn" data-duty-target="' +
              action(() => edit.onFlight(f)) + '" aria-label="Edit flight" title="Edit flight">' + _DUTY_ICON_EDIT + '</button></td>' : '') +
            '</tr>';
        });

        for (const e of day.unmatched) {
          html += '<tr class="duty-row-unmatched">' +
            '<td class="duty-col-date"></td>' +
            '<td class="duty-col-span" colspan="' + (cols - 1) + '">' + _DUTY_CHIP_UNMATCHED +
              'Tracked flight from ' + unixToTzTime(e.flight_start_time) + ' no longer found; its corrections (' +
              _dutyEsc(dutyEntrySummary(e)) + ') aren’t counted.' +
              (edit ? '<button class="duty-link-btn" data-duty-target="' + action(() => edit.onDeleteEntry(e)) + '">Delete</button>' : '') +
            '</td></tr>';
        }

        if (day.flights.length > 0) {
          html += '<tr class="duty-row-day-total">' +
            '<td class="duty-total-label" colspan="7">Day total</td>' +
            '<td class="duty-col-block">' + fmtBlock(day.daySecs) + '</td>' +
            '<td colspan="' + (cols - 8) + '"></td></tr>';
        }
        for (const w of day.warnings) {
          html += '<tr class="duty-row-warning"><td class="duty-col-full" colspan="' + cols + '">' +
            _DUTY_ICON_WARN + _dutyEsc(w) + '</td></tr>';
        }
      }
      html += '</tbody></table>' +
        '<div class="duty-month-total">Month total: ' + fmtBlock(data.monthSecs) + '</div>';

      content.innerHTML = html;
      content.onclick = e => {
        const btn = e.target.closest('[data-duty-target]');
        if (btn && content.contains(btn)) targets[+btn.dataset.dutyTarget]();
      };

      const r = totals.rest;
      totalsEl.innerHTML =
        '<div class="pilot-duty-totals-label">§135.267 totals (as of ' + totals.asOfLabel + ')</div>' +
        '<table class="totals-table"><tbody>' +
        totals.hours.map(t =>
          '<tr' + (t.over ? ' class="duty-over"' : '') + '><td>' + t.label + '</td><td>' + fmtBlock(t.secs) +
          ' <span class="totals-limit">/ ' + fmtBlock(t.limit) + '</span></td></tr>').join('') +
        '<tr' + (r.short ? ' class="duty-over"' : '') + '><td>' + r.label + '</td><td>' + r.taken +
          (r.scheduled ? ' + ' + r.scheduled + ' planned' : '') +
          ' <span class="totals-limit">/ ' + r.required + '</span></td></tr>' +
        '</tbody></table>' +
        '<div class="pilot-duty-footnote">' + _dutyEsc(DUTY_TOTALS_FOOTNOTE) + '</div>';
      if (isCurrentMonth) {
        if (bodyEl.firstElementChild !== totalsEl) bodyEl.insertBefore(totalsEl, content);
      } else if (bodyEl.lastElementChild !== totalsEl) {
        bodyEl.appendChild(totalsEl);
      }
    }

    const DUTY_TOTALS_FOOTNOTE =
      'Hour totals include Part 91 flights. Rest periods are days marked rest with no flights. ' +
      'The 8-hour limit in any 24 hours leaves out every Part 91 flight; strictly, only Part 91 ' +
      'flights flown after the Part 135 flights are exempt.';

    async function _ensureTypst(onProgress, onStatus) {
      if (!_typstInstance) {
        onStatus('Loading PDF compiler…');
        const mod = await import(_TYPST_SCRIPT_URL);
        _typstInstance = mod.$typst;
      }

      if (!_typstWasmBytes) {
        onStatus('Downloading PDF engine…');
        let data;
        // The Cache API only exists in secure contexts (https, localhost). Over plain
        // http, e.g. a LAN address, skip it and download every time.
        let cache = null;
        try { cache = await caches.open(_TYPST_CACHE_NAME); } catch (_) {}
        try {
          const cached = cache && await cache.match(_TYPST_WASM_URL);
          if (cached) {
            onProgress(1.0);
            data = await cached.arrayBuffer();
          } else {
            const res   = await fetch(_TYPST_WASM_URL);
            if (!res.ok) throw new Error('HTTP ' + res.status);
            const total = parseInt(res.headers.get('Content-Length') || '0', 10);
            const reader = res.body.getReader();
            const chunks = [];
            let loaded = 0;
            for (;;) {
              const { done, value } = await reader.read();
              if (done) break;
              chunks.push(value);
              loaded += value.length;
              if (total) onProgress(Math.min(loaded / total, 1.0));
            }
            const bytes = new Uint8Array(loaded);
            let offset = 0;
            for (const c of chunks) { bytes.set(c, offset); offset += c.length; }
            data = bytes.buffer;
            if (cache) {
              try {
                await cache.put(_TYPST_WASM_URL, new Response(bytes, {
                  headers: { 'Content-Type': 'application/wasm' },
                }));
              } catch (_) {}
            }
            onProgress(1.0);
          }
        } catch (e) {
          if (!data) throw new Error('Failed to load wasm' + (e && e.message ? ' (' + e.message + ')' : ''));
        }
        _typstWasmBytes = data;
        _typstInstance.setCompilerInitOptions({ getModule: () => _typstWasmBytes });
      }
    }

    // Compiles data to a PDF and downloads it. onProgress(0..1)/onStatus(message) report
    // the one-time compiler download.
    async function exportDutyPdf(data, { onProgress, onStatus }) {
      await _ensureTypst(onProgress, onStatus);
      onStatus('Compiling PDF…');
      const pdfBytes = await _typstInstance.pdf({ mainContent: _buildTypstSource(data) });

      const blob = new Blob([pdfBytes], { type: 'application/pdf' });
      const url  = URL.createObjectURL(blob);
      const a    = document.createElement('a');
      a.href = url;
      a.download = 'duty-log-' +
        data.pilotName.toLowerCase().replace(/\\s+/g, '-') + '-' +
        data.year + '-' + String(data.month).padStart(2, '0') + '.pdf';
      a.click();
      URL.revokeObjectURL(url);
    }

    // Export PDF button behavior: disables the button and, on the first export, shows the
    // compiler download progress in the typst-load overlay (typstLoadOverlayMarkup()).
    async function runDutyExport(data, { exportBtn, overlay, progressFill, progressPct, statusLabel }) {
      exportBtn.disabled = true;
      const needsDownload = !_typstWasmBytes;
      if (needsDownload) overlay.classList.remove('hidden');

      try {
        await exportDutyPdf(data, {
          onProgress: pct => {
            progressFill.style.width = Math.round(pct * 100) + '%';
            progressPct.textContent  = Math.round(pct * 100) + '%';
          },
          onStatus: msg => { statusLabel.textContent = msg; },
        });
      } catch (e) {
        alert('PDF export failed: ' + (e && e.message ? e.message : String(e)));
      } finally {
        overlay.classList.add('hidden');
        exportBtn.disabled = false;
      }
    }

    // A Typst string literal in markup (#"…"), so labels and notes print verbatim
    // whatever markup characters they contain.
    function _typStr(s) {
      return '#"' + String(s).replace(/[\\\\"]/g, m => '\\\\' + m).replace(/[\\u0000-\\u001f]/g, ' ') + '"';
    }

    // The same rows, warnings and totals as renderDutyLog(), with each edited flight's
    // tracker values in numbered † footnotes.
    function _buildTypstSource(data) {
      const { pilotName, year, month, days, totals } = data;
      const appName = window.APP_SETTINGS.appName;
      const COLS = 9;
      const warnCell = text => 'table.cell(colspan: ' + COLS + ')[#text(fill: rgb("' + _DUTY_PDF_DANGER + '"))[' + _typStr('Warning: ' + text) + ']],\\n';
      const footnotes = [];
      let anyManual = false;
      let rows = '';

      for (const day of days) {
        const dayText = dutyDayText(day, year) + (day.note ? ' (' + day.note + ')' : '');
        if (day.flights.length === 0) {
          rows += '  [' + day.label + '], table.cell(colspan: ' + (COLS - 1) + ')[' +
            (day.rest ? '_' + _typStr(dayText) + '_' : _typStr(dayText)) + '],\\n';
        }
        day.flights.forEach((f, i) => {
          let mark = '';
          const fields = Object.keys(f.edited);
          if (fields.length) {
            footnotes.push(day.label + ', flight at ' + unixToTzTime(f.start_time) + ': the tracker recorded ' +
              fields.map(k => _DUTY_FIELD_NAMES[k] + ' ' + dutyOriginalText(k, f.edited[k])).join(', ') + '.');
            mark = '#super[†' + footnotes.length + ']';
          }
          const cell = (field, text) => '[' + _typStr(text) + (field in f.edited ? mark : '') + ']';
          if (f.manual) anyManual = true;
          rows += '  ' +
            (i === 0 ? '[' + day.label + '], [' + _typStr(dayText) + ']' : '[], []') + ', ' +
            '[' + _typStr(f.aircraft_tail || '—') + '], ' +
            '[' + _typStr(f.origin_label || '—') + ('origin_label' in f.edited ? mark : '') + (f.manual ? '#super[‡]' : '') + '], ' +
            cell('start_time', unixToTzTime(f.start_time)) + ', ' +
            cell('destination_label', f.destination_label || '—') + ', ' +
            cell('end_time', unixToTzTime(f.end_time)) + ', ' +
            '[' + fmtBlock(f.secs) + '], [' + (f.part91 ? '91' : '') + '],\\n';
        });
        for (const e of day.unmatched) {
          rows += '  [], table.cell(colspan: ' + (COLS - 1) + ')[' +
            _typStr('Tracked flight from ' + unixToTzTime(e.flight_start_time) + ' no longer found; its corrections (' +
              dutyEntrySummary(e) + ') are not counted.') + '],\\n';
        }
        if (day.flights.length > 0) {
          rows += '  table.cell(colspan: 7, align: right)[*Day total*], [*' + fmtBlock(day.daySecs) + '*], [],\\n';
        }
        for (const w of day.warnings) rows += '  ' + warnCell(w);
      }

      const r = totals.rest;
      const overFill = '#text(fill: rgb("' + _DUTY_PDF_DANGER + '"))';
      const totalsRows = totals.hours.map(t =>
        '  [' + _typStr(t.label) + '], [' + (t.over ? overFill + '[*' + fmtBlock(t.secs) + '*]' : fmtBlock(t.secs)) + '], [' + fmtBlock(t.limit) + '],\\n'
      ).join('') +
        '  [' + _typStr(r.label) + '], [' + (r.short ? overFill + '[*' + r.taken + '*]' : String(r.taken)) +
        (r.scheduled ? ' + ' + r.scheduled + ' planned' : '') + '], [' + r.required + '],\\n';

      const generated = new Date().toLocaleString('en-US', {
        timeZone: _DUTY_TZ, year: 'numeric', month: 'short', day: 'numeric',
        hour: '2-digit', minute: '2-digit', hour12: false, timeZoneName: 'short',
      });
      const notes = [];
      if (footnotes.length) {
        notes.push('*Corrections.* Values marked † were corrected from the tracker’s:');
        footnotes.forEach((n, i) => notes.push('#super[†' + (i + 1) + '] ' + _typStr(n)));
      }
      if (anyManual) notes.push('#super[‡] ' + _typStr('Entered manually (not tracked).'));
      notes.push(_typStr(DUTY_TOTALS_FOOTNOTE));

      return (
        '#set document(title: ' + _typStr('Pilot Duty Log -- ' + pilotName).slice(1) + ', author: ' + _typStr(appName).slice(1) + ')\\n' +
        '#set page(\\n' +
        '  paper: "us-letter",\\n' +
        '  margin: (x: 0.6in, y: 0.6in),\\n' +
        '  footer: context [\\n' +
        '    #set text(size: 7.5pt, fill: luma(120))\\n' +
        '    ' + _typStr(appName + ' · ' + pilotName + ' · ' + dutyPeriodLabel(data)) +
              ' #h(1fr) ' + _typStr('Generated ' + generated) + ' #h(1fr) Page #counter(page).display("1 of 1", both: true)\\n' +
        '  ]\\n' +
        ')\\n' +
        '#set text(font: "Libertinus Serif", size: 8.5pt)\\n' +
        '#set table(stroke: 0.4pt + luma(180), inset: (x: 4pt, y: 3.5pt))\\n\\n' +
        '#align(center)[\\n' +
        '  #text(size: 15pt, weight: "bold")[' + _typStr(appName) + ']\\n' +
        '  #v(0.3em)\\n' +
        '  #text(size: 12pt)[Pilot Duty Log]\\n' +
        '  #v(0.2em)\\n' +
        '  #text(size: 10pt)[' + _typStr(pilotName + ' | ' + dutyPeriodLabel(data)) + ']\\n' +
        ']\\n\\n' +
        '#v(0.8em)\\n\\n' +
        '#table(\\n' +
        '  columns: (auto, auto, auto, 1fr, auto, 1fr, auto, auto, auto),\\n' +
        '  fill: (col, row) => if row == 0 { luma(220) } else if calc.rem(row, 2) == 1 { luma(248) } else { white },\\n' +
        '  align: (left, left, center, left, center, left, center, right, center),\\n' +
        '  table.header([*Date*], [*Duty*], [*A/C*], [*Origin*], [*Dep*], [*Dest*], [*Arr*], [*Time*], [*91*]),\\n' +
        rows +
        ')\\n\\n' +
        '#align(right)[*Month total: ' + fmtBlock(data.monthSecs) + '*]\\n\\n' +
        '#v(1em)\\n' +
        '#block(breakable: false)[\\n' +
        '#text(size: 9.5pt, weight: "bold")[' + _typStr('§135.267 totals (as of ' + totals.asOfLabel + ')') + ']\\n' +
        '#v(0.3em)\\n' +
        '#table(\\n' +
        '  columns: (1fr, auto, auto),\\n' +
        '  align: (left, right, right),\\n' +
        '  table.header([*Period*], [*Total*], [*Limit*]),\\n' +
        totalsRows +
        ')\\n' +
        ']\\n\\n' +
        '#v(0.8em)\\n' +
        '#set text(size: 7.5pt)\\n' +
        notes.join('\\n\\n') + '\\n'
      );
    }
  `;
}

/**
 * The duty log view in the settings modal: loads the log for a pilot, month navigation,
 * PDF export, and (for admins) the flight, day and Add flight forms, which save through
 * /api/flight-log-entries, /api/duty-days and, for a tracked flight's aircraft or pilot,
 * /api/flights/assignment.
 */
export function pilotDutyScript(): string {
  return `
    // ── Pilot duty log ────────────────────────────────────────────────────────

    ${pilotDutyRenderScript()}

    let _dutyPilotId   = null;
    let _dutyPilotName = '';
    let _dutyYear      = 0;
    let _dutyMonth     = 0;
    let _dutyData      = null;
    let _dutyLog       = null;
    let _dutyCanEdit   = false;

    async function openPilotDuty(pilotId, pilotName) {
      _dutyPilotId   = pilotId;
      _dutyPilotName = pilotName;
      _dutyData      = null;
      _dutyLog       = null;

      [_dutyYear, _dutyMonth] = currentDutyMonth();

      document.getElementById('pilot-duty-next').disabled = false;
      if (document.getElementById('settings-modal').classList.contains('hidden')) { openSettings(); }
      _settingsNavigateTo('settings-view-pilot-duty', pilotName + ' — Duty Log');
      document.getElementById('pilot-duty-period').textContent = dutyPeriodLabel({ year: _dutyYear, month: _dutyMonth });
      document.getElementById('pilot-duty-content').innerHTML = '<div class="pilot-duty-loading">Loading…</div>';
      document.getElementById('pilot-duty-totals').innerHTML = '';

      const [user] = await Promise.all([_loadSettingsUser(), _dutyFetchLog()]);
      if (_dutyPilotId !== pilotId) return;
      _dutyCanEdit = user?.role === 'admin';
      document.getElementById('pilot-duty-add').hidden = !_dutyCanEdit;
      _dutyLoad();
    }

    function closePilotDuty() { _settingsNavigateBack(); }

    async function _dutyFetchLog() {
      const pilotId = _dutyPilotId;
      try {
        const resp = await fetch('/api/duty-log?pilot=' + encodeURIComponent(pilotId));
        if (!resp.ok) throw new Error('HTTP ' + resp.status);
        const log = await resp.json();
        if (pilotId === _dutyPilotId) _dutyLog = log;
      } catch (e) {
        // Without the log the corrections would silently be missing, so say so.
        if (pilotId === _dutyPilotId) {
          _dutyLog = null;
          document.getElementById('pilot-duty-content').innerHTML =
            '<div class="pilot-duty-loading">Couldn’t load the duty log. Close and reopen it to try again.</div>';
        }
      }
    }

    document.getElementById('pilot-duty-prev').addEventListener('click', () => {
      if (_dutyMonth === 1) { _dutyYear--; _dutyMonth = 12; }
      else { _dutyMonth--; }
      _dutyLoad();
    });

    document.getElementById('pilot-duty-next').addEventListener('click', () => {
      if (_dutyMonth === 12) { _dutyYear++; _dutyMonth = 1; }
      else { _dutyMonth++; }
      _dutyLoad();
    });

    function _dutyLoad() {
      document.getElementById('pilot-duty-period').textContent = dutyPeriodLabel({ year: _dutyYear, month: _dutyMonth });
      if (!_dutyLog) return;
      _dutyData = computeDutyData(flightStore.getAll(), _dutyPilotId, _dutyPilotName, _dutyYear, _dutyMonth, _dutyLog);
      document.getElementById('pilot-duty-next').disabled = _dutyData.isCurrentMonth;
      _dutyRender();
    }

    function _dutyRender() {
      if (!_dutyData) return;
      renderDutyLog(_dutyData, {
        content:  document.getElementById('pilot-duty-content'),
        totalsEl: document.getElementById('pilot-duty-totals'),
        bodyEl:   document.querySelector('.pilot-duty-body'),
        edit: _dutyCanEdit ? {
          onFlight: f => _dutyOpenFlightForm(f, null),
          onDay: _dutyOpenDayForm,
          onDeleteEntry: _dutyDeleteUnmatched,
        } : null,
      });
    }

    document.getElementById('pilot-duty-export').addEventListener('click', () => {
      if (!_dutyData) return;
      runDutyExport(_dutyData, {
        exportBtn:    document.getElementById('pilot-duty-export'),
        overlay:      document.getElementById('typst-load-overlay'),
        progressFill: document.getElementById('typst-progress-fill'),
        progressPct:  document.getElementById('typst-progress-pct'),
        statusLabel:  document.getElementById('typst-load-label'),
      });
    });

    document.getElementById('pilot-duty-add').addEventListener('click', () => {
      const [y, m] = currentDutyMonth();
      const dateKey = (y === _dutyYear && m === _dutyMonth)
        ? unixToTzDateStr(Math.floor(Date.now() / 1000))
        : _dutyYear + '-' + String(_dutyMonth).padStart(2, '0') + '-01';
      _dutyOpenFlightForm(null, dateKey);
    });

    // Sends a duty-log write; throws with the server's message when it fails.
    async function _dutyApi(method, url, body) {
      const resp = await fetch(url, {
        method,
        headers: body ? { 'Content-Type': 'application/json' } : undefined,
        body: body ? JSON.stringify(body) : undefined,
      });
      if (!resp.ok) {
        const err = await resp.json().catch(() => ({}));
        throw new Error(err.error || ('HTTP ' + resp.status));
      }
      return resp.json();
    }

    // Runs a save, then reloads the log and re-renders; shows a failure in errorEl.
    async function _dutySave(buttons, errorEl, fn) {
      buttons.forEach(b => { b.disabled = true; });
      errorEl.textContent = '';
      try {
        await fn();
        await _dutyFetchLog();
        _dutyLoad();
        return true;
      } catch (e) {
        errorEl.textContent = e && e.message ? e.message : String(e);
        return false;
      } finally {
        buttons.forEach(b => { b.disabled = false; });
      }
    }

    // Flight form: edits a tracked or manual flight (f), or adds a manual flight on
    // dateKey when f is null.
    function _dutyOpenFlightForm(f, dateKey) {
      const isNew = !f;
      const tracked = !!(f && !f.manual);
      const orig = tracked ? f.flight : null;
      const entry = f ? f.entry : null;
      const start = f ? f.start_time : null;
      const pilotId = tracked ? orig.pilot_id : (entry ? entry.pilot_id : _dutyPilotId);
      const aircraftTail = f ? f.aircraft_tail : null;

      const aircraftOptions = aircraftList
        .filter(a => a.active || a.tail_number === aircraftTail)
        .map(a => settingsAircraftOptionHtml(a, aircraftTail)).join('');
      const pilotOptions = pilotList
        .filter(p => p.active || p.id === pilotId)
        .map(p => settingsPilotOptionHtml(p, pilotId)).join('');
      const originalHint = (field, text) => tracked && (field in f.edited)
        ? '<div class="form-field-original">Tracker: ' + _dutyEsc(text) + '</div>' : '';

      const { modal, close } = openFormModal({
        id: 'duty-flight-modal',
        className: 'form-modal-wide',
        title: isNew ? 'Add flight' : (tracked ? 'Edit flight' : 'Edit manual flight'),
        bodyHtml:
          (tracked
            ? '<p class="form-modal-hint">Corrections apply to the duty log only; the tracked flight is unchanged. ' +
              'Tracker: ' + _dutyEsc(dutyDateLabel(unixToTzDateStr(orig.start_time)) + ', ' + unixToTzTime(orig.start_time) + '–' +
              unixToTzTime(orig.end_time) + ', ' + (orig.origin_label || '—') + ' → ' + (orig.destination_label || '—')) + '.</p>'
            : '') +
          '<div class="form-field"><label for="duty-f-date">Date</label>' +
            '<input type="date" id="duty-f-date" value="' + _dutyEsc(start != null ? unixToTzDateStr(start) : dateKey) + '"></div>' +
          '<div class="form-field-row">' +
            '<div class="form-field"><label for="duty-f-dep">Dep</label>' +
              '<input type="time" id="duty-f-dep" value="' + (start != null ? unixToTzTime(start) : '') + '">' +
              originalHint('start_time', tracked ? unixToTzTime(orig.start_time) : '') + '</div>' +
            '<div class="form-field"><label for="duty-f-arr">Arr</label>' +
              '<input type="time" id="duty-f-arr" value="' + (f ? unixToTzTime(f.end_time) : '') + '">' +
              originalHint('end_time', tracked ? unixToTzTime(orig.end_time) : '') + '</div>' +
          '</div>' +
          '<div class="form-field-row">' +
            '<div class="form-field"><label for="duty-f-origin">Origin</label>' +
              '<input type="text" id="duty-f-origin" value="' + _dutyEsc((f && f.origin_label) || '') + '">' +
              originalHint('origin_label', tracked ? (orig.origin_label || '(none)') : '') + '</div>' +
            '<div class="form-field"><label for="duty-f-dest">Dest</label>' +
              '<input type="text" id="duty-f-dest" value="' + _dutyEsc((f && f.destination_label) || '') + '">' +
              originalHint('destination_label', tracked ? (orig.destination_label || '(none)') : '') + '</div>' +
          '</div>' +
          '<div class="form-field-row">' +
            '<div class="form-field"><label for="duty-f-aircraft">Aircraft</label>' +
              '<select id="duty-f-aircraft"><option value="">Unknown</option>' + aircraftOptions + '</select></div>' +
            '<div class="form-field"><label for="duty-f-pilot">Pilot</label>' +
              '<select id="duty-f-pilot">' + (tracked ? '<option value="">Unknown</option>' : '') + pilotOptions + '</select></div>' +
          '</div>' +
          (tracked ? '<p class="form-modal-hint">Aircraft and pilot change the tracked flight itself, everywhere it’s shown.</p>' : '') +
          '<div class="form-field"><span class="form-field-label" id="duty-f-part-label">Operated under</span>' +
            segmentedHtml('part', [['135', 'Part 135'], ['91', 'Part 91']], f && f.part91 ? '91' : '135', { labelledBy: 'duty-f-part-label' }) + '</div>' +
          '<div class="form-modal-error" role="alert"></div>',
        footerHtml:
          (!isNew ? '<button class="btn-danger btn-md" data-act="remove">Remove from log</button>' : '') +
          (tracked && entry ? '<button class="btn-secondary btn-md" data-act="revert">Revert to tracker</button>' : '') +
          '<span class="form-modal-footer-spacer"></span>' +
          '<button class="btn-secondary btn-md" data-act="cancel">Cancel</button>' +
          '<button class="btn-primary btn-md" data-act="save">Save</button>',
      });

      const $ = sel => modal.querySelector(sel);
      const getPart = wireSegmented(modal, 'part');
      const errorEl = $('.form-modal-error');
      const buttons = [...modal.querySelectorAll('.form-modal-footer button')];
      const btn = act => modal.querySelector('[data-act="' + act + '"]');
      btn('cancel').addEventListener('click', close);

      // The form's state as epochs/labels, or an error message.
      function readForm() {
        const date = $('#duty-f-date').value, dep = $('#duty-f-dep').value, arr = $('#duty-f-arr').value;
        if (!date || !dep || !arr) return 'Enter the date, departure and arrival times.';
        const startE = tzLocalToEpoch(date, dep);
        // An arrival at or before the departure is the next day.
        const endE = tzLocalToEpoch(arr > dep ? date : dutyAddDays(date, 1), arr);
        return {
          start_time: startE, end_time: endE,
          origin_label: $('#duty-f-origin').value.trim() || null,
          destination_label: $('#duty-f-dest').value.trim() || null,
          aircraft_tail: $('#duty-f-aircraft').value || null,
          pilot_id: $('#duty-f-pilot').value ? parseInt($('#duty-f-pilot').value, 10) : null,
          part91: getPart() === '91',
        };
      }

      btn('save').addEventListener('click', async () => {
        const v = readForm();
        if (typeof v === 'string') { errorEl.textContent = v; return; }
        const ok = await _dutySave(buttons, errorEl, async () => {
          if (!tracked) {
            const body = { ...v, excluded: false };
            if (body.pilot_id == null) throw new Error('Choose a pilot.');
            if (entry) await _dutyApi('PUT', '/api/flight-log-entries/' + entry.id, body);
            else await _dutyApi('POST', '/api/flight-log-entries', body);
            return;
          }
          // Only what differs from the tracker is stored; times compare to the minute,
          // since the form has no seconds.
          const sameMinute = (a, b) => Math.floor(a / 60) === Math.floor(b / 60);
          const body = {
            start_time: sameMinute(v.start_time, orig.start_time) ? null : v.start_time,
            end_time: sameMinute(v.end_time, orig.end_time) ? null : v.end_time,
            origin_label: v.origin_label === (orig.origin_label || null) ? null : v.origin_label,
            destination_label: v.destination_label === (orig.destination_label || null) ? null : v.destination_label,
            part91: v.part91,
            excluded: false,
          };
          const changed = body.start_time != null || body.end_time != null ||
            body.origin_label != null || body.destination_label != null || body.part91;
          if (changed) {
            if (entry) await _dutyApi('PUT', '/api/flight-log-entries/' + entry.id, body);
            else await _dutyApi('POST', '/api/flight-log-entries', { ...body, tracker_id: orig.tracker_id, flight_start_time: orig.start_time });
          } else if (entry) {
            await _dutyApi('DELETE', '/api/flight-log-entries/' + entry.id);
          }
          const assign = {};
          if (v.aircraft_tail !== (orig.aircraft_tail || null)) assign.aircraft_tail = v.aircraft_tail;
          if (v.pilot_id !== (orig.pilot_id ?? null)) assign.pilot_id = v.pilot_id;
          if (Object.keys(assign).length) {
            const data = await _dutyApi('PUT', '/api/flights/assignment?tracker=' + encodeURIComponent(orig.tracker_id),
              { flight_ids: [orig.id], ...assign });
            const patch = {};
            if ('aircraft_tail' in data) patch.aircraft_tail = data.aircraft_tail;
            if ('pilot_id' in data) { patch.pilot_id = data.pilot_id; patch.pilot_name = data.pilot_name; }
            flightStore.patchFlight(orig.id, patch, orig.start_time);
          }
        });
        if (ok) close();
      });

      btn('remove')?.addEventListener('click', async () => {
        if (!confirm(tracked
          ? 'Remove this flight from the duty log? The tracked flight itself stays in the flight history.'
          : 'Delete this manual flight?')) return;
        const ok = await _dutySave(buttons, errorEl, async () => {
          if (!tracked) { await _dutyApi('DELETE', '/api/flight-log-entries/' + entry.id); return; }
          const body = {
            start_time: entry ? entry.start_time : null, end_time: entry ? entry.end_time : null,
            origin_label: entry ? entry.origin_label : null, destination_label: entry ? entry.destination_label : null,
            part91: !!(entry && entry.part91), excluded: true,
          };
          if (entry) await _dutyApi('PUT', '/api/flight-log-entries/' + entry.id, body);
          else await _dutyApi('POST', '/api/flight-log-entries', { ...body, tracker_id: orig.tracker_id, flight_start_time: orig.start_time });
        });
        if (ok) close();
      });

      btn('revert')?.addEventListener('click', async () => {
        if (!confirm('Drop this flight’s corrections and Part 91 mark, and show it as the tracker recorded it?')) return;
        const ok = await _dutySave(buttons, errorEl, () => _dutyApi('DELETE', '/api/flight-log-entries/' + entry.id));
        if (ok) close();
      });
    }

    // Day form: duty start/end, or a rest day, plus a note.
    function _dutyOpenDayForm(day) {
      const rec = day.record;
      const { modal, close } = openFormModal({
        id: 'duty-day-modal',
        title: day.label,
        bodyHtml:
          '<div class="form-field">' + segmentedHtml('kind', [['duty', 'Duty'], ['rest', 'Rest day']], day.rest ? 'rest' : 'duty', { label: 'Day type' }) + '</div>' +
          '<div class="form-field-row" data-duty-times>' +
            '<div class="form-field"><label for="duty-d-start">Duty start</label>' +
              '<input type="time" id="duty-d-start" value="' + _dutyEsc((rec && rec.duty_start) || '') + '"></div>' +
            '<div class="form-field"><label for="duty-d-end">Duty end</label>' +
              '<input type="time" id="duty-d-end" value="' + _dutyEsc((rec && rec.duty_end) || '') + '"></div>' +
          '</div>' +
          '<p class="form-modal-hint" data-duty-rest-hint>' +
            (day.rest && day.restDesignatedAt != null
              ? 'Designated ' + dutyDateLabel(unixToTzDateStr(day.restDesignatedAt)) + ', ' + unixToTzTime(day.restDesignatedAt) + '.'
              : 'The date you mark it is recorded as when the rest day was designated.') + '</p>' +
          '<div class="form-field"><label for="duty-d-note">Note</label>' +
            '<textarea id="duty-d-note" rows="2">' + _dutyEsc((rec && rec.note) || '') + '</textarea></div>' +
          '<div class="form-modal-error" role="alert"></div>',
        footerHtml:
          (rec ? '<button class="btn-danger btn-md" data-act="clear">Clear</button>' : '') +
          '<span class="form-modal-footer-spacer"></span>' +
          '<button class="btn-secondary btn-md" data-act="cancel">Cancel</button>' +
          '<button class="btn-primary btn-md" data-act="save">Save</button>',
      });

      const $ = sel => modal.querySelector(sel);
      const errorEl = $('.form-modal-error');
      const buttons = [...modal.querySelectorAll('.form-modal-footer button')];
      function showKind(kind) {
        $('[data-duty-times]').hidden = kind === 'rest';
        $('[data-duty-rest-hint]').hidden = kind !== 'rest';
      }
      const getKind = wireSegmented(modal, 'kind', showKind);
      showKind(getKind());
      const url = '/api/duty-days/' + encodeURIComponent(_dutyPilotId) + '/' + day.dateKey;
      modal.querySelector('[data-act="cancel"]').addEventListener('click', close);

      modal.querySelector('[data-act="save"]').addEventListener('click', async () => {
        const rest = getKind() === 'rest';
        const dutyStart = rest ? null : ($('#duty-d-start').value || null);
        const dutyEnd = rest ? null : ($('#duty-d-end').value || null);
        if ((dutyStart == null) !== (dutyEnd == null)) { errorEl.textContent = 'Enter both duty start and end, or neither.'; return; }
        const ok = await _dutySave(buttons, errorEl, () => _dutyApi('PUT', url, {
          duty_start: dutyStart, duty_end: dutyEnd, rest, note: $('#duty-d-note').value,
        }));
        if (ok) close();
      });
      modal.querySelector('[data-act="clear"]')?.addEventListener('click', async () => {
        const ok = await _dutySave(buttons, errorEl, () => _dutyApi('DELETE', url));
        if (ok) close();
      });
    }

    async function _dutyDeleteUnmatched(entry) {
      if (!confirm('Delete these corrections? The flight they belonged to is no longer in the tracker’s history.')) return;
      try {
        await _dutyApi('DELETE', '/api/flight-log-entries/' + entry.id);
      } catch (e) {
        alert('Delete failed: ' + (e && e.message ? e.message : String(e)));
      }
      await _dutyFetchLog();
      _dutyLoad();
    }
  `;
}
