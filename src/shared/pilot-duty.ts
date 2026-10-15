import { icon } from './icons';
import { lightThemeToken } from './theme';

/** Duty log view body: month navigation + export toolbar, then the table and totals. */
export function pilotDutyMarkup(): string {
  return /* html */ `
          <div class="pilot-duty-toolbar">
            <button id="pilot-duty-prev" class="pilot-duty-nav-btn btn-secondary btn-sm" aria-label="Previous month">${icon('chevron-left', { size: 14 })}</button>
            <span id="pilot-duty-period" class="pilot-duty-period-label"></span>
            <button id="pilot-duty-next" class="pilot-duty-nav-btn btn-secondary btn-sm" aria-label="Next month">${icon('chevron-right', { size: 14 })}</button>
            <span id="pilot-duty-default" class="pilot-duty-default"></span>
            <div class="pilot-duty-actions">
              <button id="pilot-duty-day" class="pilot-duty-add-btn btn-secondary btn-sm" hidden>${icon('calendar-clock', { size: 14 })}Plan duty or rest</button>
              <button id="pilot-duty-edit-flights" class="pilot-duty-add-btn btn-secondary btn-sm" hidden>${icon('pencil', { size: 14 })}Edit flights</button>
              <button id="pilot-duty-export" class="btn-primary btn-sm">Export PDF</button>
            </div>
          </div>
          <div class="pilot-duty-body">
            <div id="pilot-duty-upcoming" class="pilot-duty-upcoming" hidden></div>
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
    .pilot-duty-actions { display: flex; flex-wrap: wrap; gap: 0.5rem; margin-left: auto; }
    .pilot-duty-add-btn[hidden], .pilot-duty-default [hidden] { display: none; }
    .pilot-duty-default { font-size: var(--size-sm); color: var(--text-muted); }
    .pilot-duty-default .duty-link-btn { color: var(--accent-text); margin-left: 0.3rem; }

    .pilot-duty-upcoming[hidden] { display: none; }
    .duty-upcoming-list { list-style: none; margin: 0; padding: 0; font-size: var(--size-sm); }
    .duty-upcoming-item {
      display: flex; align-items: baseline; gap: 0.75rem;
      padding: 0.3rem 0.4rem; border-bottom: 1px solid var(--border-subtle);
    }
    .duty-upcoming-item:last-child { border-bottom: none; }
    .duty-upcoming-date { font-weight: var(--weight-medium); white-space: nowrap; min-width: 5.5rem; }
    .duty-upcoming-dow { color: var(--text-muted); font-weight: normal; }
    .duty-upcoming-what { flex: 1; color: var(--text-secondary); display: flex; flex-direction: column; }

    .pilot-duty-body {
      padding: 1rem;
      max-width: 64rem;
      margin: 0 auto;
      display: flex;
      flex-direction: column;
      gap: 1.5rem;
    }
    /* The current month leads with Upcoming and the totals (renderDutyLog). */
    .pilot-duty-body[data-lead-totals] .pilot-duty-upcoming { order: -2; }
    .pilot-duty-body[data-lead-totals] .pilot-duty-totals { order: -1; }
    .pilot-duty-loading { font-size: var(--size-sm); color: var(--text-muted); }

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
    /* Under a flight with remarks (Part 91, a remark): muted like the day total, from A/C on. */
    .duty-row-remarks td {
      color: var(--text-secondary); font-size: var(--size-xs);
      padding-top: 0; border-bottom-color: transparent;
    }
    .duty-default { color: var(--text-muted); font-size: var(--size-2xs); }
    .duty-row-warning td {
      color: var(--danger-fg); background: var(--danger-surface);
      font-size: var(--size-xs);
    }
    .duty-row-warning .wb-icon { margin-right: 0.3rem; vertical-align: -2px; }
    .duty-row-unmatched td { color: var(--text-secondary); font-size: var(--size-xs); }
    .duty-col-block { text-align: right; font-variant-numeric: tabular-nums; }
    .duty-col-date  { white-space: nowrap; font-weight: 500; }
    .duty-col-duty  { white-space: nowrap; color: var(--text-secondary); }
    .duty-col-edit  { width: 1px; padding-left: 0; padding-right: 0; }
    .duty-col-compact { display: none; }
    .duty-compact-times { color: var(--text-muted); font-size: 0.75rem; }
    .duty-date-sub { display: none; }
    .duty-note { font-size: var(--size-2xs); color: var(--text-muted); font-style: normal; white-space: normal; }
    /* Chips and the † mark come from flightEditsStyles() (flight-edits.ts). */
    .duty-row-unmatched .flight-chip { margin: 0 0.35rem 0 0; }

    /* Edit affordances (admins only): the date (with its calendar icon) opens the day
       form, the pencil the flight form. */
    .duty-day-btn, .duty-edit-btn, .duty-link-btn {
      background: none; border: none; padding: 0; margin: 0;
      font: inherit; color: inherit; cursor: pointer;
      border-radius: var(--radius-xs);
    }
    .duty-day-btn { display: inline-flex; align-items: center; gap: 0.3rem; text-align: left; }
    .duty-day-btn .wb-icon { color: var(--text-faint); }
    .duty-day-btn:hover, .duty-day-btn:hover .wb-icon { color: var(--accent-text); }
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
      .duty-date-sub { display: block; font-weight: normal; font-size: var(--size-2xs); color: var(--text-muted); white-space: normal; }
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
    .pilot-duty-footnote { font-size: var(--size-2xs); color: var(--text-muted); margin-top: 0.5rem; line-height: 1.45; }

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
 * Pilot duty log computation and rendering. computeDutyData() turns one pilot's effective
 * flights (corrections already applied by applyFlightEdits(), flight-edits.ts) and
 * duty/rest days (GET /api/duty-days) into a month of day rows with §135.267 warnings and
 * totals;
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
    // The PDF isn't themed: it prints in light mode's colors.
    const _DUTY_PDF_THEME = ${JSON.stringify({
      trackingHeading: lightThemeToken('--tracking-heading'),
      trackingCaps:    lightThemeToken('--tracking-caps'),
      ink:        lightThemeToken('--text-primary'),
      muted:      lightThemeToken('--text-muted'),
      faint:      lightThemeToken('--text-faint'),
      rule:       lightThemeToken('--border'),
      ruleSubtle: lightThemeToken('--border-subtle'),
      danger:     lightThemeToken('--danger-fg'),
      dangerBg:   lightThemeToken('--danger-surface'),
    })};
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
      // (e) rest after going over the daily limit, by how far over: the first row whose
      // overSecs isn't exceeded.
      extendedRest: [
        { overSecs: 30 * 60,  restSecs: 11 * 3600 },
        { overSecs: 60 * 60,  restSecs: 12 * 3600 },
        { overSecs: Infinity, restSecs: 16 * 3600 },
      ],
    };

    const _DUTY_ICON_EDIT      = ${JSON.stringify(icon('pencil', { size: 13 }))};
    const _DUTY_ICON_DAY       = ${JSON.stringify(icon('calendar-clock', { size: 13 }))};
    const _DUTY_ICON_WARN      = ${JSON.stringify(icon('triangle-alert', { size: 13 }))};

    const _TYPST_SCRIPT_URL = 'https://cdn.jsdelivr.net/npm/@myriaddreamin/typst.ts@0.7.0/dist/esm/contrib/all-in-one-lite.bundle.js';
    const _TYPST_WASM_URL   = 'https://cdn.jsdelivr.net/npm/@myriaddreamin/typst-ts-web-compiler@0.7.0/pkg/typst_ts_web_compiler_bg.wasm';
    // The PDF's font, IBM Plex Sans (the design system's --font-body): typst.ts's bundled
    // fonts have no sans-serif. Static OTFs (Typst can't use woff or pick a variable
    // font's weights); Bold for *strong*, Italic for rest days.
    const _TYPST_FONT_URLS = ['Regular', 'Bold', 'Italic'].map(style =>
      'https://cdn.jsdelivr.net/gh/IBM/plex@v6.4.0/IBM-Plex-Sans/fonts/complete/otf/IBMPlexSans-' + style + '.otf');
    const _TYPST_CACHE_NAME = 'ft-typst-v1';

    let _typstModule    = null;
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

    // Duty period of a day's duty times (a duty_days row, or the pilot's default) as epochs;
    // an end at or before the start is the next day.
    function _dutyInterval(dateKey, times) {
      if (!times || !times.duty_start || !times.duty_end) return null;
      const start = tzLocalToEpoch(dateKey, times.duty_start);
      const end = tzLocalToEpoch(times.duty_end > times.duty_start ? dateKey : dutyAddDays(dateKey, 1), times.duty_end);
      return { start, end, secs: end - start, duty_start: times.duty_start, duty_end: times.duty_end };
    }

    // One pilot's days: their flights (any kind) by local date, their duty_days rows by
    // date, each day's duty period, and what's wrong with a rest day. Shared by the row
    // model and the totals, so a rest day that gets a warning doesn't count as rest.
    function _dutyCalendar(flights, dayRecords, defaultDuty) {
      const flightsByDate = {};
      for (const f of flights) {
        const dk = unixToTzDateStr(f.start_time);
        (flightsByDate[dk] = flightsByDate[dk] || []).push(f);
      }
      const recordByDate = {};
      for (const r of dayRecords) recordByDate[r.date] = r;

      // A day's duty period: its record's times, or the default on a flying day with no
      // times recorded (no record, or one with only a note); a rest day has none.
      // { ..., isDefault } or null.
      function dutyOf(dateKey) {
        const rec = recordByDate[dateKey];
        if (rec && rec.rest) return null;
        if (rec && rec.duty_start) return _dutyInterval(dateKey, rec);
        if (!defaultDuty || !flightsByDate[dateKey]) return null;
        const d = _dutyInterval(dateKey, defaultDuty);
        return d && { ...d, isDefault: true };
      }

      // The time a day keeps the pilot busy: its duty period stretched to cover its flights
      // (a flight outside duty is still duty), as { start, end }, or null for a day with
      // neither.
      function spanOf(dateKey) {
        const duty = dutyOf(dateKey);
        let start = duty ? duty.start : Infinity, end = duty ? duty.end : -Infinity;
        for (const f of flightsByDate[dateKey] || []) {
          start = Math.min(start, f.start_time);
          end = Math.max(end, f.end_time);
        }
        return start < end ? { start, end } : null;
      }

      // Why a day marked rest isn't a 24-hour rest period (§135.267(f)), as warnings: it
      // has flights, it wasn't designated in advance, or the previous duty ran past
      // midnight. [] for a valid rest day or a day not marked rest. year: the shown year,
      // for dates.
      function restProblems(dateKey, year) {
        const rec = recordByDate[dateKey];
        if (!rec || !rec.rest) return [];
        const out = [];
        if (flightsByDate[dateKey]) out.push('Flights on a rest day');
        if (rec.rest_designated_at != null && unixToTzDateStr(rec.rest_designated_at) >= dateKey) {
          out.push('Rest day designated ' + _dutyShortDate(unixToTzDateStr(rec.rest_designated_at), year) +
            ', not in advance');
        }
        const prev = dutyOf(dutyAddDays(dateKey, -1));
        if (prev && prev.end > tzLocalToEpoch(dateKey, '00:00')) {
          out.push('Previous duty ended ' + unixToTzTime(prev.end) + ', so this rest is under 24 h');
        }
        return out;
      }

      return { flightsByDate, recordByDate, dutyOf, spanOf, restProblems };
    }

    // ── The row model ──

    // One pilot's month as day rows plus §135.267 totals. allFlights are effective flights
    // (flightStore.getCompleted(), or applyFlightEdits() output: corrections applied,
    // manual flights added, removed flights left out) for every pilot; days are the
    // pilot's duty_days rows (GET /api/duty-days), defaultDuty the pilot's usual duty
    // period ({ duty_start, duty_end } HH:MM, or null) and unmatched the corrections whose
    // flight is gone (flightStore.getUnmatched()).
    //
    // Returns { pilotName, year, month, isCurrentMonth, days, upcoming, monthSecs, totals }.
    // days run through today in the current month. Each is { dateKey, label, record,
    // duty, defaultDuty, rest, restDesignatedAt, note, flights, unmatched, daySecs,
    // warnings }: duty is the day's duty period from its record or, on a flying day with
    // no record, from defaultDuty (then defaultDuty is true). A day's flight is the
    // effective flight plus { manual, part91, remarks, entry, secs, edited: { field:
    // tracker's value } }. upcoming (current month only) lists the records dated after
    // today, for planning.
    function computeDutyData(allFlights, pilotId, pilotName, year, month,
                             { days: dayRecords = [], defaultDuty = null, unmatched: unmatchedEntries = [] } = {}) {
      const nowEpoch = Math.floor(Date.now() / 1000);
      const todayKey = unixToTzDateStr(nowEpoch);

      // 1. The pilot's flights.
      const completed = allFlights.filter(f => f.end_time != null && !(f.edit && f.edit.excluded));
      const flights = completed.filter(f => f.pilot_id === pilotId).map(f => ({
        ...f,
        manual: !!(f.edit && f.edit.manual),
        part91: !!(f.edit && f.edit.part91),
        remarks: flightRemarks(f),
        entry: f.edit ? f.edit.entry : null,
        edited: f.edit ? f.edit.original : {},
        secs: Math.max(0, f.end_time - f.start_time),
      }));
      flights.sort((a, b) => a.start_time - b.start_time);

      // A row whose flight is gone (a history import moved its first point) carries no
      // pilot, so it goes to the pilot of the same tracker's flight nearest its start time
      // (within 12 h: the flight that replaced it, or that day's flying). With no flight
      // that close it shows only in the flight editor, rather than in every pilot's log.
      const unmatchedByDate = {};
      for (const e of unmatchedEntries) {
        let near = null, nearGap = 12 * 3600;
        for (const f of completed) {
          if (f.tracker_id !== e.tracker_id) continue;
          const gap = e.flight_start_time < f.start_time ? f.start_time - e.flight_start_time
            : Math.max(0, e.flight_start_time - f.end_time);
          if (gap <= nearGap) { near = f; nearGap = gap; }
        }
        if (!near || near.pilot_id !== pilotId) continue;
        const dk = unixToTzDateStr(e.flight_start_time);
        (unmatchedByDate[dk] = unmatchedByDate[dk] || []).push(e);
      }

      const { flightsByDate, recordByDate, dutyOf, spanOf, restProblems } = _dutyCalendar(flights, dayRecords, defaultDuty);

      // Flight time in the 24 h ending at end, in all commercial flying (§135.267(b)): Part
      // 135 and Part 91 alike. Only evaluated at the end of a Part 135 flight, so Part 91
      // flying before a Part 135 flight counts and Part 91 flying after the last one falls
      // in no window (FAA interpretation to Converse, 2011).
      function flightTime24(end) {
        const from = end - 86400;
        let s = 0;
        for (const g of flights) {
          if (g.end_time <= from || g.start_time >= end) continue;
          s += Math.min(g.end_time, end) - Math.max(g.start_time, from);
        }
        return s;
      }

      // A day's worst 24-hour flight time, at the end of one of its Part 135 flights:
      // { secs, end } (secs 0 on a day without Part 135 flights).
      function worst24Of(dateKey) {
        let secs = 0, end = null;
        for (const f of flightsByDate[dateKey] || []) {
          if (f.part91) continue;
          const s = flightTime24(f.end_time);
          if (s > secs) { secs = s; end = f.end_time; }
        }
        return { secs, end };
      }

      // 2. Days.
      function buildDay(dateKey) {
        const rec = recordByDate[dateKey] || null;
        const dayFlights = flightsByDate[dateKey] || [];
        const duty = dutyOf(dateKey);
        const prevDuty = dutyOf(dutyAddDays(dateKey, -1));
        const rest = !!(rec && rec.rest);
        const warnings = [];

        warnings.push(...restProblems(dateKey, year));
        const worst = worst24Of(dateKey);
        if (worst.secs > _DUTY_LIMITS.flight24hSecs) {
          warnings.push(fmtBlock(worst.secs) + ' flight time in the 24 h to ' + unixToTzTime(worst.end) +
            ' (limit ' + fmtBlock(_DUTY_LIMITS.flight24hSecs) + ')');
        }
        // Without a duty period the duty and rest checks have nothing to go on.
        if (dayFlights.length && !duty && !rest) {
          warnings.push('No duty times recorded: record the duty period, including any on-call or standby time');
        }
        // §135.267(e): after going over the daily limit, a longer rest before the next duty.
        const prevKey = dutyAddDays(dateKey, -1);
        const prevOver = worst24Of(prevKey).secs - _DUTY_LIMITS.flight24hSecs;
        const prevSpan = spanOf(prevKey), span = spanOf(dateKey);
        if (prevOver > 0 && prevSpan && span) {
          const need = _DUTY_LIMITS.extendedRest.find(r => prevOver <= r.overSecs).restSecs;
          const restSecs = span.start - prevSpan.end;
          if (restSecs < need) {
            warnings.push('Rest ' + fmtBlock(Math.max(0, restSecs)) + ' after going ' + fmtBlock(prevOver) +
              ' over the flight time limit on ' + _dutyShortDate(prevKey, year) + ' (minimum ' + fmtBlock(need) + ')');
          }
        }
        if (duty) {
          if (duty.secs > _DUTY_LIMITS.dutySecs) {
            warnings.push('Duty period ' + fmtBlock(duty.secs) + ' (limit ' + fmtBlock(_DUTY_LIMITS.dutySecs) + ')');
          }
          if (prevDuty && duty.start - prevDuty.end < _DUTY_LIMITS.restBeforeSecs) {
            warnings.push('Rest since previous duty ' + fmtBlock(Math.max(0, duty.start - prevDuty.end)) +
              ' (minimum ' + fmtBlock(_DUTY_LIMITS.restBeforeSecs) + ')');
          }
          // A default that doesn't fit the day's flying shows up here; the fix is to
          // record the actual duty times.
          for (const f of dayFlights) {
            if (f.start_time < duty.start || f.end_time > duty.end) {
              warnings.push('Flight ' + unixToTzTime(f.start_time) + '–' + unixToTzTime(f.end_time) +
                ' outside duty ' + duty.duty_start + '–' + duty.duty_end + (duty.isDefault ? ' (default)' : ''));
            }
          }
        }

        return {
          dateKey,
          label: dutyDateLabel(dateKey),
          record: rec,
          duty,
          defaultDuty: !!(duty && duty.isDefault),
          rest,
          restDesignatedAt: rest ? rec.rest_designated_at : null,
          note: rec ? rec.note : null,
          flights: dayFlights,
          unmatched: unmatchedByDate[dateKey] || [],
          daySecs: dayFlights.reduce((s, f) => s + f.secs, 0),
          warnings,
        };
      }

      // Past days only: planning ahead goes through the Upcoming list.
      const [curY, curM] = currentDutyMonth();
      const isCurrentMonth = year === curY && month === curM;
      const daysInMonth = new Date(Date.UTC(year, month, 0)).getUTCDate();
      const lastDay = isCurrentMonth ? Number(todayKey.slice(8, 10)) : daysInMonth;
      const days = [];
      for (let d = 1; d <= lastDay; d++) days.push(buildDay(_dutyKey(year, month, d)));

      const upcoming = isCurrentMonth
        ? dayRecords.filter(r => r.date > todayKey).sort((a, b) => a.date < b.date ? -1 : 1).map(r => ({
            dateKey: r.date, label: dutyDateLabel(r.date), record: r, rest: !!r.rest,
            restDesignatedAt: r.rest ? r.rest_designated_at : null, note: r.note,
            duty: _dutyInterval(r.date, r), defaultDuty: false,
          }))
        : [];

      // 3. Totals: as of now for the current month, as of month end for a past one, so a
      // past month's PDF comes out the same whenever it's exported. Planned rest later in
      // the quarter counts as "planned".
      const [nextY, nextM] = _dutyAddMonths(year, month, 1);
      const asOf = isCurrentMonth ? nowEpoch : tzLocalToEpoch(_dutyKey(nextY, nextM, 1), '00:00');
      const totals = dutyTotals(completed, pilotId, asOf, {
        days: dayRecords,
        defaultDuty,
        asOfLabel: isCurrentMonth ? 'now' : _dutyShortDate(_dutyKey(year, month, daysInMonth), null),
      });

      return {
        pilotName,
        year,
        month,
        isCurrentMonth,
        days,
        upcoming,
        monthSecs: days.reduce((s, d) => s + d.daySecs, 0),
        totals,
      };
    }

    // One pilot's §135.267 totals as of the epoch asOf: flight time in the calendar
    // quarter containing it, that plus the previous quarter, and the calendar year, flight
    // time in the 24 h before it (all including Part 91: the 24 h are the window of the
    // pilot's next flight, so any Part 91 flying in them came before it), and 24-hour
    // rest periods in the quarter (days marked rest that get no rest warning: no flights,
    // designated in advance, previous duty over by midnight). flights are effective
    // flights for every pilot; days the pilot's duty_days rows (omitted: no rest counted,
    // as for the dashboard alert) and defaultDuty their default duty period (for the
    // previous-duty check). Returns { asOfLabel, hours: [{ label, secs,
    // limit, over }], flight24: { secs, limit, over }, rest: { label, taken, scheduled,
    // required, short } }.
    function dutyTotals(flights, pilotId, asOf, { days: dayRecords = [], defaultDuty = null, asOfLabel = 'now' } = {}) {
      const own = flights.filter(f => f.pilot_id === pilotId && f.end_time != null && !(f.edit && f.edit.excluded));
      const secsOf = f => Math.max(0, f.end_time - f.start_time);
      const asOfDateKey = unixToTzDateStr(asOf - 1);
      const [year, month] = asOfDateKey.split('-').map(Number);
      const qy = year, qm = Math.floor((month - 1) / 3) * 3 + 1;
      const [pqy, pqm] = _dutyAddMonths(qy, qm, -3);
      const [nqy, nqm] = _dutyAddMonths(qy, qm, 3);
      const qStartKey = _dutyKey(qy, qm, 1);
      const qEndKey = dutyAddDays(_dutyKey(nqy, nqm, 1), -1);
      const quarterName = (y, m) => 'Q' + ((m - 1) / 3 + 1) + ' ' + y;
      function flownSince(dateKey) {
        const from = tzLocalToEpoch(dateKey, '00:00');
        return own.reduce((s, f) => s + (f.start_time >= from && f.start_time < asOf ? secsOf(f) : 0), 0);
      }
      let flight24 = 0;
      for (const f of own) {
        if (f.end_time <= asOf - 86400 || f.start_time >= asOf) continue;
        flight24 += Math.min(f.end_time, asOf) - Math.max(f.start_time, asOf - 86400);
      }

      // Rest periods: days marked rest that the duty log doesn't warn about.
      const { restProblems } = _dutyCalendar(own, dayRecords, defaultDuty);
      let restTaken = 0, restScheduled = 0;
      for (const r of dayRecords) {
        if (!r.rest || r.date < qStartKey || r.date > qEndKey || restProblems(r.date, year).length) continue;
        if (r.date <= asOfDateKey) restTaken++; else restScheduled++;
      }
      // Days still to come in the quarter.
      let daysLeft = 0;
      const tomorrow = dutyAddDays(asOfDateKey, 1);
      for (let k = tomorrow > qStartKey ? tomorrow : qStartKey; k <= qEndKey; k = dutyAddDays(k, 1)) daysLeft++;

      const limitRow = (label, secs, limit) => ({ label, secs, limit, over: secs > limit });
      return {
        asOfLabel,
        hours: [
          limitRow(quarterName(qy, qm), flownSince(qStartKey), _DUTY_LIMITS.quarterSecs),
          limitRow(quarterName(pqy, pqm) + ' + ' + quarterName(qy, qm), flownSince(_dutyKey(pqy, pqm, 1)), _DUTY_LIMITS.twoQuarterSecs),
          limitRow('Calendar year ' + qy, flownSince(_dutyKey(qy, 1, 1)), _DUTY_LIMITS.yearSecs),
        ],
        flight24: limitRow('Last 24 h', flight24, _DUTY_LIMITS.flight24hSecs),
        rest: {
          label: '24 h rest periods, ' + quarterName(qy, qm),
          taken: restTaken,
          scheduled: restScheduled,
          required: _DUTY_LIMITS.quarterRestDays,
          // Can no longer reach 13 even if every remaining day were rest.
          short: restTaken + daysLeft < _DUTY_LIMITS.quarterRestDays,
        },
      };
    }

    // "Rest · designated Oct 3", "08:00–17:00", "08:00–17:00 (default)" or "—".
    function dutyDayText(day, year) {
      if (day.rest) {
        return 'Rest' + (day.restDesignatedAt != null
          ? ' · designated ' + _dutyShortDate(unixToTzDateStr(day.restDesignatedAt), year) : '');
      }
      if (day.duty) return day.duty.duty_start + '–' + day.duty.duty_end + (day.defaultDuty ? ' (default)' : '');
      return '—';
    }

    // "Remarks: Part 91 · Training" for a flight with remarks, else ''.
    function dutyRemarksText(f) {
      return f.remarks.length ? 'Remarks: ' + f.remarks.join(' · ') : '';
    }

    // Renders data (from computeDutyData) as the month table into content and the totals
    // into totalsEl. In the current month the Upcoming list (planned duty and rest after
    // today) goes into upcomingEl and both show first in bodyEl (pilotDutyMarkup()'s
    // .pilot-duty-body); otherwise upcomingEl is hidden and the totals show last. With
    // edit ({ onFlight(flight), onDay(dateKey), onDeleteEntry(entry) }), dates, flights and
    // upcoming entries get edit controls.
    function renderDutyLog(data, { content, totalsEl, upcomingEl, bodyEl, edit }) {
      const { year, days, totals, isCurrentMonth } = data;
      const cols = 8 + (edit ? 1 : 0);   // Date … Time, plus the pencil column
      const targets = [];                // data-duty-target index → callback

      function action(fn) { targets.push(fn); return targets.length - 1; }
      function cellVal(f, field, text) { return escHtml(text) + flightEditedMark(f, [field]); }
      function label(f, field) { return cellVal(f, field, f[field] || '—'); }
      function time(f, field) { return cellVal(f, field, unixToTzTime(f[field])); }

      let html =
        '<table class="duty-table"><thead><tr>' +
        '<th class="duty-col-date">Date</th>' +
        '<th class="duty-col-compact">Flight</th>' +
        '<th class="duty-col-duty">Duty</th>' +
        '<th>A/C</th><th>Origin</th><th>Dep</th>' +
        '<th>Dest</th><th>Arr</th><th class="duty-col-block">Time</th>' +
        (edit ? '<th class="duty-col-edit"></th>' : '') +
        '</tr></thead><tbody>';

      for (const day of days) {
        const dayText = dutyDayText(day, year);
        const dayHtml = day.defaultDuty
          ? escHtml(day.duty.duty_start + '–' + day.duty.duty_end) + ' <span class="duty-default">(default)</span>'
          : escHtml(dayText);
        const noteHtml = day.note ? '<div class="duty-note">' + escHtml(day.note) + '</div>' : '';
        const dateHtml = edit
          ? '<button class="duty-day-btn" data-duty-target="' + action(() => edit.onDay(day.dateKey)) + '" title="Set duty or rest" aria-label="' +
            day.label + ': set duty or rest">' + day.label + _DUTY_ICON_DAY + '</button>'
          : day.label;
        const restCls = day.rest ? ' duty-row-rest' : '';

        if (day.flights.length === 0) {
          html += '<tr class="duty-row-empty' + restCls + '">' +
            '<td class="duty-col-date">' + dateHtml + '</td>' +
            '<td class="duty-col-duty duty-col-span" colspan="' + (cols - 1) + '">' + dayHtml + noteHtml + '</td></tr>';
        }

        day.flights.forEach((f, i) => {
          const chip = f.manual ? FLIGHT_CHIP_MANUAL : '';
          const tail = escHtml(f.aircraft_tail || '—');
          html += '<tr class="duty-row-flight' + restCls + '">' +
            '<td class="duty-col-date">' + (i === 0
              ? dateHtml + '<div class="duty-date-sub">' + dayHtml + noteHtml + '</div>' : '') + '</td>' +
            '<td class="duty-col-compact">' + label(f, 'origin_label') + ' → ' + label(f, 'destination_label') + chip +
              '<div class="duty-compact-times">' + time(f, 'start_time') + '–' + time(f, 'end_time') +
              ' · ' + tail + '</div></td>' +
            '<td class="duty-col-duty">' + (i === 0 ? dayHtml + noteHtml : '') + '</td>' +
            '<td>' + tail + '</td>' +
            '<td>' + label(f, 'origin_label') + chip + '</td>' +
            '<td>' + time(f, 'start_time') + '</td>' +
            '<td>' + label(f, 'destination_label') + '</td>' +
            '<td>' + time(f, 'end_time') + '</td>' +
            '<td class="duty-col-block">' + fmtBlock(f.secs) + '</td>' +
            (edit ? '<td class="duty-col-edit"><button class="duty-edit-btn" data-duty-target="' +
              action(() => edit.onFlight(f)) + '" aria-label="Edit flight" title="Edit flight">' + _DUTY_ICON_EDIT + '</button></td>' : '') +
            '</tr>';
          // Only for a flight with something to say (Part 91, a remark).
          const remarks = dutyRemarksText(f);
          if (remarks) {
            html += '<tr class="duty-row-remarks"><td></td><td class="duty-col-duty"></td>' +
              '<td class="duty-col-full" colspan="' + (cols - 2) + '">' + escHtml(remarks) + '</td></tr>';
          }
        });

        for (const e of day.unmatched) {
          html += '<tr class="duty-row-unmatched">' +
            '<td class="duty-col-date"></td>' +
            '<td class="duty-col-span" colspan="' + (cols - 1) + '">' + FLIGHT_CHIP_UNMATCHED +
              'Tracked flight from ' + unixToTzTime(e.flight_start_time) + ' no longer found; its corrections (' +
              escHtml(flightEntrySummary(e)) + ') aren’t counted.' +
              (edit ? '<button class="duty-link-btn" data-duty-target="' + action(() => edit.onDeleteEntry(e)) + '">Delete</button>' : '') +
            '</td></tr>';
        }

        if (day.flights.length > 0) {
          html += '<tr class="duty-row-day-total">' +
            '<td class="duty-total-label" colspan="7">Day total</td>' +
            '<td class="duty-col-block">' + fmtBlock(day.daySecs) + '</td>' +
            (edit ? '<td></td>' : '') + '</tr>';
        }
        for (const w of day.warnings) {
          html += '<tr class="duty-row-warning"><td class="duty-col-full" colspan="' + cols + '">' +
            _DUTY_ICON_WARN + escHtml(w) + '</td></tr>';
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
        '<div class="pilot-duty-footnote">' + escHtml(DUTY_TOTALS_FOOTNOTE) + '</div>';

      if (upcomingEl) {
        upcomingEl.hidden = !isCurrentMonth;
        const upTargets = [];
        upcomingEl.innerHTML = '<div class="pilot-duty-totals-label">Upcoming</div>' + (data.upcoming.length
          ? '<ul class="duty-upcoming-list">' + data.upcoming.map(u => {
              upTargets.push(() => edit.onDay(u.dateKey));
              return '<li class="duty-upcoming-item' + (u.rest ? ' duty-row-rest' : '') + '">' +
                '<span class="duty-upcoming-date">' + escHtml(_dutyShortDate(u.dateKey, year)) +
                  ' <span class="duty-upcoming-dow">' + escHtml(u.label.slice(0, 3)) + '</span></span>' +
                '<span class="duty-upcoming-what">' + escHtml(dutyDayText(u, year)) +
                  (u.note ? '<span class="duty-note">' + escHtml(u.note) + '</span>' : '') + '</span>' +
                (edit ? '<button class="duty-edit-btn" data-duty-up="' + (upTargets.length - 1) +
                  '" aria-label="Edit ' + escHtml(u.label) + '" title="Edit">' + _DUTY_ICON_EDIT + '</button>' : '') +
                '</li>';
            }).join('') + '</ul>'
          : '<div class="pilot-duty-footnote">Nothing planned after today.</div>');
        upcomingEl.onclick = e => {
          const btn = e.target.closest('[data-duty-up]');
          if (btn) upTargets[+btn.dataset.dutyUp]();
        };
      }

      // The current month leads with what's ahead (Upcoming, totals as of now); the
      // order comes from CSS (.pilot-duty-body[data-lead-totals]).
      bodyEl.toggleAttribute('data-lead-totals', !!isCurrentMonth);
    }

    const DUTY_TOTALS_FOOTNOTE =
      'Hour totals include Part 91 flights. Rest periods are days marked rest in advance, with no ' +
      'flights and the previous duty over by midnight (a rest day with a warning isn’t counted). ' +
      'The 8-hour limit in any 24 hours counts Part 91 flying before a Part 135 flight and leaves ' +
      'out Part 91 flying after the last one (FAA interpretation to Converse, 2011).';

    // Fetches url, from the Cache API when it has it, and caches the response.
    // onLoaded(bytes so far, total) reports progress (total 0 when unknown).
    async function _typstFetchCached(cache, url, onLoaded) {
      try {
        const cached = cache && await cache.match(url);
        if (cached) {
          const buf = await cached.arrayBuffer();
          onLoaded(buf.byteLength, buf.byteLength);
          return buf;
        }
      } catch (_) {}
      const res = await fetch(url);
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
        onLoaded(loaded, total);
      }
      const bytes = new Uint8Array(loaded);
      let offset = 0;
      for (const c of chunks) { bytes.set(c, offset); offset += c.length; }
      if (cache) {
        try {
          await cache.put(url, new Response(bytes, {
            headers: { 'Content-Type': res.headers.get('Content-Type') || 'application/octet-stream' },
          }));
        } catch (_) {}
      }
      return bytes.buffer;
    }

    async function _ensureTypst(onProgress, onStatus) {
      if (!_typstInstance) {
        onStatus('Loading PDF compiler…');
        _typstModule = await import(_TYPST_SCRIPT_URL);
        _typstInstance = _typstModule.$typst;
      }

      if (!_typstWasmBytes) {
        onStatus('Downloading PDF engine…');
        // The Cache API only exists in secure contexts (https, localhost). Over plain
        // http, e.g. a LAN address, skip it and download every time.
        let cache = null;
        try { cache = await caches.open(_TYPST_CACHE_NAME); } catch (_) {}
        // The compiler and fonts download together, on one progress bar.
        const urls = [_TYPST_WASM_URL, ..._TYPST_FONT_URLS];
        const loaded = urls.map(() => 0);
        const totals = urls.map(() => 0);
        let buffers;
        try {
          buffers = await Promise.all(urls.map((url, i) => _typstFetchCached(cache, url, (n, total) => {
            loaded[i] = n;
            totals[i] = total;
            const sum = totals.reduce((x, y) => x + y, 0);
            if (sum) onProgress(Math.min(loaded.reduce((x, y) => x + y, 0) / sum, 1.0));
          })));
        } catch (e) {
          throw new Error('Failed to load PDF engine' + (e && e.message ? ' (' + e.message + ')' : ''));
        }
        onProgress(1.0);
        const [wasm, ...fonts] = buffers;
        _typstWasmBytes = wasm;
        _typstInstance.setCompilerInitOptions({
          getModule: () => _typstWasmBytes,
          beforeBuild: [_typstModule.loadFonts(fonts.map(buf => new Uint8Array(buf)))],
        });
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
      const COLS = 8;
      const warnCell = text => 'warning(' + _typStr(text).slice(1) + '),\\n';
      const footnotes = [];
      let anyManual = false;
      let rows = '';

      for (const day of days) {
        // Each day starts below a rule; its flights are only hairline-separated.
        if (rows) rows += '  table.hline(stroke: 0.6pt + rule),\\n';
        const dayText = dutyDayText(day, year) + (day.note ? ' (' + day.note + ')' : '');
        if (day.flights.length === 0) {
          rows += '  [' + day.label + '], table.cell(colspan: ' + (COLS - 1) + ')[' +
            (day.rest ? '#text(fill: muted)[_' + _typStr(dayText) + '_]' : _typStr(dayText)) + '],\\n';
        }
        day.flights.forEach((f, i) => {
          let mark = '';
          const fields = Object.keys(f.edited);
          if (fields.length) {
            footnotes.push(day.label + ', flight at ' + unixToTzTime(f.start_time) + ': the tracker recorded ' +
              fields.map(k => FLIGHT_EDIT_FIELD_NAMES[k] + ' ' + flightOriginalText(k, f.edited[k])).join(', ') + '.');
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
            '[' + fmtBlock(f.secs) + '],\\n';
          // Remarks (Part 91, a remark) span the row under the flight, from A/C on.
          const remarks = dutyRemarksText(f);
          if (remarks) {
            rows += '  [], [], table.cell(colspan: ' + (COLS - 2) + ', align: left)[#text(size: 7pt, fill: muted)[' + _typStr(remarks) + ']],\\n';
          }
        });
        for (const e of day.unmatched) {
          rows += '  [], table.cell(colspan: ' + (COLS - 1) + ')[' +
            _typStr('Tracked flight from ' + unixToTzTime(e.flight_start_time) + ' no longer found; its corrections (' +
              flightEntrySummary(e) + ') are not counted.') + '],\\n';
        }
        if (day.flights.length > 0) {
          rows += '  table.cell(colspan: ' + (COLS - 1) + ', align: right)[#text(fill: muted)[Day total]], [*' + fmtBlock(day.daySecs) + '*],\\n';
        }
        for (const w of day.warnings) rows += '  ' + warnCell(w);
      }

      const r = totals.rest;
      const overFill = '#text(fill: danger)';
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

      const color = name => 'rgb("' + _DUTY_PDF_THEME[name] + '")';
      return (
        '#set document(title: ' + _typStr(pilotName + ' Duty Log').slice(1) + ', author: ' + _typStr(appName).slice(1) + ')\\n' +
        '#let ink = ' + color('ink') + '\\n' +
        '#let muted = ' + color('muted') + '\\n' +
        '#let rule = ' + color('rule') + '\\n' +
        '#let danger = ' + color('danger') + '\\n' +
        // A day's warning: a full-width row, tinted and barred as well as colored, so it
        // still stands out in black and white.
        '#let warning(body) = table.cell(colspan: ' + COLS + ', fill: ' + color('dangerBg') + ', stroke: (left: 2pt + danger))[#text(fill: danger)[*Warning:* #body]]\\n' +
        '#set text(font: ("IBM Plex Sans", "Libertinus Serif"), size: 8pt, fill: ink, number-width: "tabular")\\n' +
        '#set page(\\n' +
        '  paper: "us-letter",\\n' +
        '  margin: (x: 0.6in, y: 0.6in),\\n' +
        '  footer: context [\\n' +
        '    #set text(size: 7pt, fill: ' + color('faint') + ')\\n' +
        '    ' + _typStr(appName + ' · ' + pilotName + ' · ' + dutyPeriodLabel(data)) +
              ' #h(1fr) ' + _typStr('Generated ' + generated) + ' #h(1fr) Page #counter(page).display("1 of 1", both: true)\\n' +
        '  ]\\n' +
        ')\\n' +
        // Rules only between rows: a heavy one under the header, hairlines between flights.
        '#set table(inset: (x: 5pt, y: 4pt), stroke: (_, y) => if y > 0 { (top: 0.4pt + ' + color('ruleSubtle') + ') })\\n' +
        '#show table.cell.where(y: 0): set text(size: 6.5pt, weight: "bold", fill: muted, tracking: ' + _DUTY_PDF_THEME.trackingCaps + ')\\n\\n' +
        '#stack(spacing: 7pt,\\n' +
        '  text(size: 17pt, weight: "bold", tracking: ' + _DUTY_PDF_THEME.trackingHeading + ', ' + _typStr(pilotName + ' Duty Log').slice(1) + '),\\n' +
        '  text(size: 10pt, fill: muted, ' + _typStr(dutyPeriodLabel(data)).slice(1) + '),\\n' +
        ')\\n\\n' +
        '#v(1.2em)\\n\\n' +
        '#table(\\n' +
        '  columns: (auto, auto, auto, 1fr, auto, 1fr, auto, auto),\\n' +
        '  align: (left, left, center, left, center, left, center, right),\\n' +
        '  table.header([DATE], [DUTY], [A/C], [ORIGIN], [DEP], [DEST], [ARR], [TIME], table.hline(stroke: 0.8pt + ink)),\\n' +
        rows +
        '  table.hline(stroke: 0.8pt + ink),\\n' +
        '  table.cell(colspan: ' + (COLS - 1) + ', align: right)[*Month total*], [*' + fmtBlock(data.monthSecs) + '*],\\n' +
        ')\\n\\n' +
        '#v(1.6em)\\n' +
        '#block(breakable: false)[\\n' +
        '#text(size: 10pt, weight: "bold")[' + _typStr('§135.267 totals (as of ' + totals.asOfLabel + ')') + ']\\n' +
        '#v(0.2em)\\n' +
        '#table(\\n' +
        '  columns: (1fr, auto, auto),\\n' +
        '  align: (left, right, right),\\n' +
        '  table.header([PERIOD], [TOTAL], [LIMIT], table.hline(stroke: 0.8pt + ink)),\\n' +
        totalsRows +
        ')\\n' +
        ']\\n\\n' +
        '#v(1em)\\n' +
        '#set text(size: 7pt, fill: muted)\\n' +
        notes.join('\\n\\n') + '\\n'
      );
    }
  `;
}

/**
 * The duty log view in the settings modal: loads the log for a pilot, month navigation,
 * PDF export, and (for admins) the day form (/api/duty-days) and the shared flight form
 * and editor (flight-editor.ts) for flights.
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

      if (document.getElementById('settings-modal').classList.contains('hidden')) { openSettings(); }
      _settingsNavigateTo('settings-view-pilot-duty', pilotName + ' — Duty Log');
      document.getElementById('pilot-duty-period').textContent = dutyPeriodLabel({ year: _dutyYear, month: _dutyMonth });
      document.getElementById('pilot-duty-content').innerHTML = '<div class="pilot-duty-loading">Loading…</div>';
      document.getElementById('pilot-duty-totals').innerHTML = '';
      document.getElementById('pilot-duty-upcoming').hidden = true;
      document.getElementById('pilot-duty-default').innerHTML = '';

      const [user] = await Promise.all([_loadSettingsUser(), _dutyFetchLog()]);
      if (_dutyPilotId !== pilotId) return;
      _dutyCanEdit = user?.role === 'admin';
      document.getElementById('pilot-duty-edit-flights').hidden = !_dutyCanEdit;
      document.getElementById('pilot-duty-day').hidden = !_dutyCanEdit;
      _dutyLoad();
    }

    function closePilotDuty() { _settingsNavigateBack(); }

    // Corrections made elsewhere (or a poll's new flights) show up in an open log.
    flightStore.onChange(() => { if (_dutyLog) _dutyLoad(); });

    async function _dutyFetchLog() {
      const pilotId = _dutyPilotId;
      try {
        const resp = await fetch('/api/duty-days?pilot=' + encodeURIComponent(pilotId));
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
      _dutyData = computeDutyData(flightStore.getCompleted(), _dutyPilotId, _dutyPilotName, _dutyYear, _dutyMonth,
        { days: _dutyLog.days, defaultDuty: _dutyDefaultDuty(), unmatched: flightStore.getUnmatched() });
      // Planning ahead goes through the Upcoming list, so months stop at this one.
      const [curY, curM] = currentDutyMonth();
      document.getElementById('pilot-duty-next').disabled = _dutyYear * 12 + _dutyMonth >= curY * 12 + curM;
      _dutyRender();
    }

    function _dutyPilot() { return pilotList.find(p => p.id === _dutyPilotId) || null; }

    // The pilot's usual duty period ({ duty_start, duty_end }), or null.
    function _dutyDefaultDuty() {
      const p = _dutyPilot();
      return p && p.default_duty_start ? { duty_start: p.default_duty_start, duty_end: p.default_duty_end } : null;
    }

    function _dutyRender() {
      if (!_dutyData) return;
      renderDutyLog(_dutyData, {
        content:    document.getElementById('pilot-duty-content'),
        totalsEl:   document.getElementById('pilot-duty-totals'),
        upcomingEl: document.getElementById('pilot-duty-upcoming'),
        bodyEl:     document.querySelector('.pilot-duty-body'),
        edit: _dutyCanEdit ? {
          onFlight: f => openFlightForm(f),
          onDay: _dutyOpenDayForm,
          onDeleteEntry: _dutyDeleteUnmatched,
        } : null,
      });
      _dutyRenderDefault();
    }

    // "Default duty 08:00–17:00 · Change" in the toolbar (admins can change or set it).
    function _dutyRenderDefault() {
      const el = document.getElementById('pilot-duty-default');
      const d = _dutyDefaultDuty();
      el.innerHTML = (d ? 'Default duty ' + d.duty_start + '–' + d.duty_end : (_dutyCanEdit ? 'No default duty' : '')) +
        (_dutyCanEdit ? '<button class="duty-link-btn" data-duty-default>' + (d ? 'Change' : 'Set') + '</button>' : '');
    }
    document.getElementById('pilot-duty-default').addEventListener('click', e => {
      if (e.target.closest('[data-duty-default]')) _dutyOpenDefaultForm();
    });

    // The pilot's default duty period: used for flying days with no duty times recorded.
    function _dutyOpenDefaultForm() {
      const d = _dutyDefaultDuty();
      const { modal, close } = openFormModal({
        id: 'duty-default-modal',
        title: 'Default duty',
        bodyHtml:
          '<p class="form-modal-hint">Used for a day with flights and no duty times or rest recorded. ' +
            'It’s shown as “(default)”; record the actual times on a day it doesn’t fit.</p>' +
          '<div class="form-field-row">' +
            '<div class="form-field"><label for="duty-def-start">Duty start</label>' +
              '<input type="time" id="duty-def-start" value="' + (d ? d.duty_start : '') + '"></div>' +
            '<div class="form-field"><label for="duty-def-end">Duty end</label>' +
              '<input type="time" id="duty-def-end" value="' + (d ? d.duty_end : '') + '"></div>' +
          '</div>' +
          '<div class="form-modal-error" role="alert"></div>',
        footerHtml:
          (d ? '<button class="btn-danger btn-md" data-act="clear">Clear</button>' : '') +
          '<span class="form-modal-footer-spacer"></span>' +
          '<button class="btn-secondary btn-md" data-act="cancel">Cancel</button>' +
          '<button class="btn-primary btn-md" data-act="save">Save</button>',
      });
      const errorEl = modal.querySelector('.form-modal-error');
      const buttons = [...modal.querySelectorAll('.form-modal-footer button')];
      async function save(start, end) {
        const ok = await _dutySave(buttons, errorEl, async () => {
          await flightApi('PUT', '/api/pilots/' + _dutyPilotId, { default_duty_start: start, default_duty_end: end });
          const p = _dutyPilot();
          if (p) Object.assign(p, { default_duty_start: start, default_duty_end: end });
          renderSettingsPilotList();
        });
        if (ok) close();
      }
      modal.querySelector('[data-act="cancel"]').addEventListener('click', close);
      modal.querySelector('[data-act="clear"]')?.addEventListener('click', () => save(null, null));
      modal.querySelector('[data-act="save"]').addEventListener('click', () => {
        const start = modal.querySelector('#duty-def-start').value, end = modal.querySelector('#duty-def-end').value;
        if (!start || !end) { errorEl.textContent = 'Enter both times, or Clear.'; return; }
        save(start, end);
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

    // The flight editor, filtered to this pilot and the shown month.
    document.getElementById('pilot-duty-edit-flights').addEventListener('click', () => {
      const first = _dutyKey(_dutyYear, _dutyMonth, 1);
      const [ny, nm] = _dutyAddMonths(_dutyYear, _dutyMonth, 1);
      openFlightEditor({ pilotId: _dutyPilotId, from: first, to: dutyAddDays(_dutyKey(ny, nm, 1), -1) });
    });
    // Rest is designated ahead, so planning starts at tomorrow; any date can be picked.
    document.getElementById('pilot-duty-day').addEventListener('click', () =>
      _dutyOpenDayForm(dutyAddDays(unixToTzDateStr(Math.floor(Date.now() / 1000)), 1)));

    // Runs a duty-day or pilot save, then reloads the log and re-renders; shows a failure
    // in errorEl. Returns whether the save went through (a failed reload doesn't count:
    // _dutyFetchLog says so itself).
    async function _dutySave(buttons, errorEl, fn) {
      buttons.forEach(b => { b.disabled = true; });
      errorEl.textContent = '';
      try {
        await fn();
      } catch (e) {
        errorEl.textContent = e && e.message ? e.message : String(e);
        return false;
      } finally {
        buttons.forEach(b => { b.disabled = false; });
      }
      await _dutyFetchLog();
      _dutyLoad();
      return true;
    }

    // The day form's Through range covers at most this many days.
    const _DUTY_MAX_RANGE_DAYS = 62;

    // Day form: duty start/end, or a rest day, plus a note, for dateKey or, with a
    // "Through" date, for every day from it to that date (e.g. a block of rest days planned
    // ahead). Opened from a date in the table, an Upcoming entry or the toolbar's Plan duty
    // or rest button.
    function _dutyOpenDayForm(dateKey) {
      const recordOf = k => ((_dutyLog && _dutyLog.days) || []).find(r => r.date === k) || null;
      const { modal, close } = openFormModal({
        id: 'duty-day-modal',
        title: 'Duty or rest',
        bodyHtml:
          '<div class="form-field-row">' +
            '<div class="form-field"><label for="duty-d-date">Date</label>' +
              '<input type="date" id="duty-d-date" value="' + escHtml(dateKey) + '"></div>' +
            '<div class="form-field"><label for="duty-d-through">Through (optional)</label>' +
              '<input type="date" id="duty-d-through"></div>' +
          '</div>' +
          '<div class="form-field">' + segmentedHtml('kind', [['duty', 'Duty'], ['rest', 'Rest day']], 'duty', { label: 'Day type' }) + '</div>' +
          '<div class="form-field-row" data-duty-times>' +
            '<div class="form-field"><label for="duty-d-start">Duty start</label>' +
              '<input type="time" id="duty-d-start"></div>' +
            '<div class="form-field"><label for="duty-d-end">Duty end</label>' +
              '<input type="time" id="duty-d-end"></div>' +
          '</div>' +
          '<p class="form-modal-hint" data-duty-rest-hint></p>' +
          '<div class="form-field"><label for="duty-d-note">Note</label>' +
            '<textarea id="duty-d-note" rows="2"></textarea></div>' +
          '<div class="form-modal-error" role="alert"></div>',
        footerHtml:
          '<button class="btn-danger btn-md" data-act="clear">Clear</button>' +
          '<span class="form-modal-footer-spacer"></span>' +
          '<button class="btn-secondary btn-md" data-act="cancel">Cancel</button>' +
          '<button class="btn-primary btn-md" data-act="save">Save</button>',
      });

      const $ = sel => modal.querySelector(sel);
      const errorEl = $('.form-modal-error');
      const buttons = [...modal.querySelectorAll('.form-modal-footer button')];
      const restHint = $('[data-duty-rest-hint]');
      let rec = null;
      function showKind(kind) {
        $('[data-duty-times]').hidden = kind === 'rest';
        restHint.hidden = kind !== 'rest';
      }
      const getKind = wireSegmented(modal, 'kind', showKind);
      const setKind = kind => $('[data-segmented="kind"] [data-value="' + kind + '"]').click();

      // The date range as day keys, or an error message.
      function readDates() {
        const from = $('#duty-d-date').value, through = $('#duty-d-through').value || from;
        if (!from) return 'Enter a date.';
        if (through < from) return 'The Through date is before the date.';
        const keys = [];
        for (let k = from; k <= through; k = dutyAddDays(k, 1)) {
          keys.push(k);
          if (keys.length > _DUTY_MAX_RANGE_DAYS) return 'Enter at most ' + _DUTY_MAX_RANGE_DAYS + ' days at a time.';
        }
        return keys;
      }
      // Fills the form from the first date's record, and offers Clear when the range has one.
      function load() {
        rec = recordOf($('#duty-d-date').value);
        setKind(rec && rec.rest ? 'rest' : 'duty');
        // A day with no record starts from the pilot's default duty.
        const def = rec ? null : _dutyDefaultDuty();
        $('#duty-d-start').value = (rec ? rec.duty_start : def && def.duty_start) || '';
        $('#duty-d-end').value = (rec ? rec.duty_end : def && def.duty_end) || '';
        $('#duty-d-note').value = (rec && rec.note) || '';
        restHint.textContent = rec && rec.rest && rec.rest_designated_at != null
          ? 'Designated ' + dutyDateLabel(unixToTzDateStr(rec.rest_designated_at)) + ', ' + unixToTzTime(rec.rest_designated_at) + '.'
          : 'Today is recorded as the date the rest was designated. Rest has to be designated before the day it falls on.';
        updateClear();
      }
      function updateClear() {
        const keys = readDates();
        $('[data-act="clear"]').hidden = typeof keys === 'string' || !keys.some(recordOf);
      }
      $('#duty-d-date').addEventListener('change', load);
      $('#duty-d-through').addEventListener('change', updateClear);
      load();

      // The whole range in one request, which the server writes in one batch: every day is
      // saved, or none.
      const pilotUrl = '/api/duty-days/' + encodeURIComponent(_dutyPilotId);

      $('[data-act="cancel"]').addEventListener('click', close);
      $('[data-act="save"]').addEventListener('click', async () => {
        const keys = readDates();
        if (typeof keys === 'string') { errorEl.textContent = keys; return; }
        const rest = getKind() === 'rest';
        const dutyStart = rest ? null : ($('#duty-d-start').value || null);
        const dutyEnd = rest ? null : ($('#duty-d-end').value || null);
        if ((dutyStart == null) !== (dutyEnd == null)) { errorEl.textContent = 'Enter both duty start and end, or neither.'; return; }
        const body = { dates: keys, duty_start: dutyStart, duty_end: dutyEnd, rest, note: $('#duty-d-note').value };
        const ok = await _dutySave(buttons, errorEl, () => flightApi('PUT', pilotUrl, body));
        if (ok) close();
      });
      $('[data-act="clear"]').addEventListener('click', async () => {
        const keys = readDates();
        if (typeof keys === 'string') { errorEl.textContent = keys; return; }
        if (keys.length > 1 && !confirm('Clear duty, rest and notes for all ' + keys.length + ' days?')) return;
        const ok = await _dutySave(buttons, errorEl, () => flightApi('POST', pilotUrl + '/clear', { dates: keys }));
        if (ok) close();
      });
    }

    async function _dutyDeleteUnmatched(entry) {
      if (!confirm('Delete these corrections? The flight they belonged to is no longer in the tracker’s history.')) return;
      try {
        await flightApi('DELETE', '/api/flight-corrections/' + entry.id);
      } catch (e) {
        alert('Delete failed: ' + (e && e.message ? e.message : String(e)));
      }
      await Promise.all([_dutyFetchLog(), flightStore.refresh().catch(() => {})]);
      _dutyLoad();
    }
  `;
}
