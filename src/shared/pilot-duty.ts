import { icon } from './icons';
import { lightThemeToken } from './theme';
import { complianceNoticeMarkup } from './help';
import { MAX_DUTY_DAYS_PER_REQUEST, MAX_DUTY_NOTE_LENGTH } from '@wingbeat/core/record-limits';

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
            ${complianceNoticeMarkup('features/pilot-duty-log/')}
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
    .pilot-duty-default .duty-link-btn, .duty-default-hint .duty-link-btn { color: var(--accent-text); margin-left: 0.3rem; }

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

    /* A dated list's entries, newest first, each with Edit and Remove: the default-duty
       form's (_dutyOpenDefaultForm) and Global Settings' duty method (settings.ts). */
    .duty-dated-list { list-style: none; margin: 0; padding: 0; font-size: var(--size-sm); }
    .duty-dated-list li {
      display: flex; flex-wrap: wrap; align-items: baseline; gap: 0.2rem 0.75rem;
      padding: 0.3rem 0; border-bottom: 1px solid var(--border-subtle);
    }
    .duty-dated-list li:last-child { border-bottom: none; }
    .duty-dated-when { font-weight: var(--weight-medium); min-width: 8.5rem; }
    .duty-dated-what { flex: 1; color: var(--text-secondary); white-space: nowrap; }
    .duty-dated-list .duty-link-btn[data-edit] { color: var(--accent-text); }

    .pilot-duty-body {
      padding: 1rem;
      max-width: 64rem;
      margin: 0 auto;
      display: flex;
      flex-direction: column;
      gap: 1.5rem;
    }
    /* The current month leads with Upcoming and the totals (renderDutyLog). */
    .pilot-duty-body > .compliance-notice { order: -3; }
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
    .pilot-duty-limits { font-size: var(--size-xs); color: var(--text-secondary); margin: -0.25rem 0 0.5rem; }
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
 * Pilot duty log rendering. computeDutyData() (@wingbeat/core/duty, from the core bundle)
 * turns one pilot's effective flights (corrections already applied by applyFlightEdits(),
 * @wingbeat/core/flight-edits) and duty/rest days (GET /api/duty-days) into a month of day
 * rows with §135.267 warnings and totals; renderDutyLog() and the PDF export (Typst,
 * loaded on first export) only format that model. Takes flights, log and elements as
 * arguments rather than reading the flight store, so the docs-site showcase (src/showcase/)
 * renders and exports the same log from sample data. Times are shown in
 * APP_SETTINGS.timezone. Needs the core bundle's time, flight-edits and duty globals
 * (shared/core-bundle.ts) on the page, and flightEditsScript() (flight-edits.ts) and
 * htmlEscapeScript() (shared/html.ts) in the same script. See docs/duty-log-editing-plan.md.
 */
export function pilotDutyRenderScript(): string {
  return `
    // ── Pilot duty log rendering ──────────────────────────────────────────────

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
            '<td class="duty-col-block">' + fmtDuration(f.secs) + '</td>' +
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
            '<td class="duty-col-block">' + fmtDuration(day.daySecs) + '</td>' +
            (edit ? '<td></td>' : '') + '</tr>';
        }
        for (const w of day.warnings) {
          html += '<tr class="duty-row-warning"><td class="duty-col-full" colspan="' + cols + '">' +
            _DUTY_ICON_WARN + escHtml(w) + '</td></tr>';
        }
      }
      html += '</tbody></table>' +
        '<div class="duty-month-total">Month total: ' + fmtDuration(data.monthSecs) + '</div>';

      content.innerHTML = html;
      content.onclick = e => {
        const btn = e.target.closest('[data-duty-target]');
        if (btn && content.contains(btn)) targets[+btn.dataset.dutyTarget]();
      };

      const r = totals.rest;
      totalsEl.innerHTML =
        '<div class="pilot-duty-totals-label">§135.267 totals (as of ' + totals.asOfLabel + ')</div>' +
        '<div class="pilot-duty-limits">' + escHtml(data.limitsLabel) + '</div>' +
        '<table class="totals-table"><tbody>' +
        totals.hours.map(t =>
          '<tr' + (t.over ? ' class="duty-over"' : '') + '><td>' + t.label + '</td><td>' + fmtDuration(t.secs, t.over) +
          ' <span class="totals-limit">/ ' + fmtDuration(t.limit) + '</span></td></tr>').join('') +
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
                '<span class="duty-upcoming-date">' + escHtml(tzShortDate(u.dateKey, year)) +
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

    // Compiles data (one month's computeDutyData result, or several in order) to a PDF
    // and downloads it. onProgress(0..1)/onStatus(message) report the one-time compiler
    // download.
    async function exportDutyPdf(data, { onProgress, onStatus }) {
      const months = Array.isArray(data) ? data : [data];
      await _ensureTypst(onProgress, onStatus);
      onStatus('Compiling PDF…');
      const pdfBytes = await _typstInstance.pdf({ mainContent: _buildTypstSource(months) });
      const monthKey = m => m.year + '-' + String(m.month).padStart(2, '0');
      const first = months[0], last = months[months.length - 1];

      const blob = new Blob([pdfBytes], { type: 'application/pdf' });
      const url  = URL.createObjectURL(blob);
      const a    = document.createElement('a');
      a.href = url;
      a.download = 'duty-log-' +
        first.pilotName.toLowerCase().replace(/\\s+/g, '-') + '-' +
        monthKey(first) + (first === last ? '' : '-to-' + monthKey(last)) + '.pdf';
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
    // tracker values in numbered † footnotes. input is one month's computeDutyData result,
    // or several in order (an export of a range): each month then starts on a new page
    // under its own heading, and each calendar quarter in the range ends with a summary
    // page (flight time and rest by month, totals, and the quarter's warnings).
    function _buildTypstSource(input) {
      const months = Array.isArray(input) ? input : [input];
      const range = months.length > 1;
      const { pilotName } = months[0];
      const periodLabel = dutyRangeLabel(months);
      const appName = window.APP_SETTINGS.appName;
      const COLS = 8;
      // A warning is indented past the DATE column, so that column holds the day's whole block.
      const warnCell = text => '  [], warning(' + _typStr(text).slice(1) + '),\\n';
      const footnotes = [];
      let anyManual = false;

      // The day before the month, so its rolling checks (24-hour flight time, rest before
      // the first duty) can be followed from the page.
      function prevDayRow(data) {
        const p = data.prevDay;
        if (!p) return '';
        const parts = [p.rest || p.duty ? dutyDayText(p, data.year) : 'No duty recorded'];
        if (p.daySecs) parts.push(fmtDuration(p.daySecs) + ' flight time');
        if (p.flights.length) {
          parts.push('flights ' + p.flights.map(f => unixToTzTime(f.start_time) + '–' + unixToTzTime(f.end_time)).join(', '));
        }
        return '  [' + _typStr(tzShortDate(p.dateKey, data.year)) + '], table.cell(colspan: ' + (COLS - 1) + ')[#text(fill: muted)[_' +
          _typStr('Previous day: ' + parts.join(' · ')) + '_]],\\n';
      }

      function monthTable(data) {
        const { year, days } = data;
        let rows = prevDayRow(data);
        for (const day of days) {
          // Each day starts below a rule, and those are the only rules between rows.
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
              '[' + fmtDuration(f.secs) + '],\\n';
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
            rows += '  table.cell(colspan: ' + (COLS - 1) + ', align: right)[#text(fill: muted)[Day total]], [*' + fmtDuration(day.daySecs) + '*],\\n';
          }
          for (const w of day.warnings) rows += warnCell(w);
        }
        return (
          '#table(\\n' +
          '  stroke: none,\\n' +
          '  columns: (auto, auto, auto, 1fr, auto, 1fr, auto, auto),\\n' +
          '  align: (left, left, center, left, center, left, center, right),\\n' +
          '  table.header([DATE], [DUTY], [A/C], [ORIGIN], [DEP], [DEST], [ARR], [TIME], table.hline(stroke: 0.8pt + ink)),\\n' +
          rows +
          '  table.hline(stroke: 0.8pt + ink),\\n' +
          '  table.cell(colspan: ' + (COLS - 1) + ', align: right)[*Month total*], [*' + fmtDuration(data.monthSecs) + '*],\\n' +
          ')\\n\\n'
        );
      }

      const overFill = '#text(fill: danger)';
      function totalsBlock(totals) {
        const r = totals.rest;
        const totalsRows = totals.hours.map(t =>
          '  [' + _typStr(t.label) + '], [' + (t.over ? overFill + '[*' + fmtDuration(t.secs, true) + '*]' : fmtDuration(t.secs)) + '], [' + fmtDuration(t.limit) + '],\\n'
        ).join('') +
          '  [' + _typStr(r.label) + '], [' + (r.short ? overFill + '[*' + r.taken + '*]' : String(r.taken)) +
          (r.scheduled ? ' + ' + r.scheduled + ' planned' : '') + '], [' + r.required + '],\\n';
        return (
          '#block(breakable: false)[\\n' +
          '#text(size: 10pt, weight: "bold")[' + _typStr('§135.267 totals (as of ' + totals.asOfLabel + ')') + ']\\n' +
          '#v(0.2em)\\n' +
          '#table(\\n' +
          '  columns: (1fr, auto, auto),\\n' +
          '  align: (left, right, right),\\n' +
          '  table.header([PERIOD], [TOTAL], [LIMIT], table.hline(stroke: 0.8pt + ink)),\\n' +
          totalsRows +
          ')\\n' +
          ']\\n\\n'
        );
      }

      // One calendar quarter's months from the export: flight time and rest by month, the
      // totals as of the last of them, and every warning in them.
      function quarterSummary(qMonths) {
        const lastM = qMonths[qMonths.length - 1];
        const qName = 'Q' + ((lastM.month - 1 - (lastM.month - 1) % 3) / 3 + 1) + ' ' + lastM.year;
        const byMonth = qMonths.map(m => {
          const restDays = m.days.filter(d => d.rest && !d.warnings.length).length;
          const warnDays = m.days.filter(d => d.warnings.length).length;
          return '  [' + _typStr(dutyPeriodLabel(m)) + '], [' + fmtDuration(m.monthSecs) + '], [' + restDays + '], [' +
            (warnDays ? overFill + '[*' + warnDays + '*]' : '0') + '],\\n';
        }).join('');
        const warnRows = qMonths.flatMap(m => m.days.flatMap(d => d.warnings.map(w =>
          '  [' + _typStr(tzShortDate(d.dateKey, m.year)) + '], [' + overFill + '[' + _typStr(w) + ']],\\n'))).join('');
        return (
          '#pagebreak()\\n' +
          '#text(size: 13pt, weight: "bold")[' + _typStr(qName + ' summary') + ']\\n' +
          '#v(0.2em)\\n' +
          '#text(fill: muted)[' + _typStr(dutyRangeLabel(qMonths) + (qMonths.length < 3 ? ' (the months of the quarter in this log)' : '')) + ']\\n' +
          '#v(0.8em)\\n' +
          '#table(\\n' +
          '  columns: (1fr, auto, auto, auto),\\n' +
          '  align: (left, right, right, right),\\n' +
          '  table.header([MONTH], [FLIGHT TIME], [REST PERIODS], [DAYS WITH WARNINGS], table.hline(stroke: 0.8pt + ink)),\\n' +
          byMonth +
          ')\\n\\n' +
          '#v(1.2em)\\n' +
          totalsBlock(lastM.totals) +
          '#v(1.2em)\\n' +
          '#text(size: 10pt, weight: "bold")[Warnings]\\n' +
          '#v(0.2em)\\n' +
          (warnRows
            ? '#table(\\n  columns: (auto, 1fr),\\n  align: (left, left),\\n' +
              '  table.header([DATE], [WARNING], table.hline(stroke: 0.8pt + ink)),\\n' + warnRows + ')\\n\\n'
            : '#text(fill: muted)[None.]\\n\\n')
        );
      }

      let body = '';
      months.forEach((data, i) => {
        if (range) {
          if (i > 0) body += '#pagebreak()\\n';
          body += '#text(size: 13pt, weight: "bold")[' + _typStr(dutyPeriodLabel(data)) + ']\\n#v(0.6em)\\n';
        }
        body += monthTable(data) + '#v(1.6em)\\n' + totalsBlock(data.totals);
        // A quarter's summary follows its last month, or the export's last month.
        const next = months[i + 1];
        const quarterOf = m => m.year * 4 + Math.floor((m.month - 1) / 3);
        if (range && (!next || quarterOf(next) !== quarterOf(data))) {
          body += quarterSummary(months.filter(m => quarterOf(m) === quarterOf(data)));
        }
      });

      const nowSecs = Math.floor(Date.now() / 1000);
      const generated = tzShortDate(unixToTzDateStr(nowSecs)) + ', ' + fmtTzTime(nowSecs);   // Oct 15, 2026, 14:05 AKDT
      const notes = [];
      if (footnotes.length) {
        notes.push('*Corrections.* Values marked † were corrected from the tracker’s:');
        footnotes.forEach((n, i) => notes.push('#super[†' + (i + 1) + '] ' + _typStr(n)));
      }
      if (anyManual) notes.push('#super[‡] ' + _typStr('Entered manually (not tracked).'));

      const color = name => 'rgb("' + _DUTY_PDF_THEME[name] + '")';
      return (
        '#set document(title: ' + _typStr(pilotName + ' Duty Log').slice(1) + ', author: ' + _typStr(appName).slice(1) + ')\\n' +
        '#let ink = ' + color('ink') + '\\n' +
        '#let muted = ' + color('muted') + '\\n' +
        '#let rule = ' + color('rule') + '\\n' +
        '#let danger = ' + color('danger') + '\\n' +
        // A day's warning: a row from after the DATE column, tinted and barred as well as
        // colored, so it still stands out in black and white.
        '#let warning(body) = table.cell(colspan: ' + (COLS - 1) + ', fill: ' + color('dangerBg') + ', stroke: (left: 2pt + danger))[#text(fill: danger)[*Warning:* #body]]\\n' +
        '#set text(font: ("IBM Plex Sans", "Libertinus Serif"), size: 8pt, fill: ink, number-width: "tabular")\\n' +
        '#set page(\\n' +
        '  paper: "us-letter",\\n' +
        '  margin: (x: 0.6in, y: 0.6in),\\n' +
        '  footer: context [\\n' +
        '    #set text(size: 7pt, fill: ' + color('faint') + ')\\n' +
        '    ' + _typStr(pilotName + ' · ' + periodLabel) +
              ' #h(1fr) ' + _typStr('Generated ' + generated) + ' #h(1fr) Page #counter(page).display("1 of 1", both: true)\\n' +
        '  ]\\n' +
        ')\\n' +
        // Hairlines between rows, for the summary tables; the month table turns them off and
        // draws only a heavy rule under the header and a rule between days.
        '#set table(inset: (x: 5pt, y: 4pt), stroke: (_, y) => if y > 0 { (top: 0.4pt + ' + color('ruleSubtle') + ') })\\n' +
        '#show table.cell.where(y: 0): set text(size: 6.5pt, weight: "bold", fill: muted, tracking: ' + _DUTY_PDF_THEME.trackingCaps + ')\\n\\n' +
        '#stack(spacing: 7pt,\\n' +
        '  text(size: 17pt, weight: "bold", tracking: ' + _DUTY_PDF_THEME.trackingHeading + ', ' + _typStr(pilotName + ' Duty Log').slice(1) + '),\\n' +
        '  text(size: 10pt, fill: muted, ' + _typStr(periodLabel).slice(1) + '),\\n' +
        ')\\n\\n' +
        '#v(1.2em)\\n\\n' +
        body +
        (notes.length
          ? '#v(1em)\\n#set text(size: 7pt, fill: muted)\\n' + notes.join('\\n\\n') + '\\n'
          : '')
      );
    }
  `;
}

/**
 * The duty log view in the settings modal: loads the log for a pilot, month navigation,
 * PDF export, and (for admins) the day form (/api/duty-days) and the shared flight form
 * and editor (flight-editor.ts) for flights. Also needs form-modal.ts (runFormAction) and
 * edit-history.ts (showLastEdit) in the same script, and the core bundle's duty writes
 * (putDutyDays, …: shared/core-bundle.ts).
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

    // Whether the duty log is open: shown, or under a view opened from it (the flight
    // editor), which it stays current for so going back shows the edits. A closed log
    // isn't re-rendered on every poll; openPilotDuty() fetches it afresh.
    function _dutyIsOpen() {
      const view = document.getElementById('settings-view-pilot-duty');
      return view.classList.contains('settings-view-active') || view.classList.contains('settings-view-pushed');
    }

    // Corrections made elsewhere (or a poll's new flights) show up in an open log.
    flightStore.onChange(() => { if (_dutyLog && _dutyIsOpen()) _dutyLoad(); });

    async function _dutyFetchLog() {
      const pilotId = _dutyPilotId;
      try {
        const log = await fetchDutyLog(pilotId);
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
      _dutyData = _dutyCompute(_dutyYear, _dutyMonth);
      // Planning ahead goes through the Upcoming list, so months stop at this one.
      const [curY, curM] = currentDutyMonth();
      document.getElementById('pilot-duty-next').disabled = _dutyYear * 12 + _dutyMonth >= curY * 12 + curM;
      _dutyRender();
    }

    // The shown pilot's log for one month (computeDutyData).
    // Each day uses the default duty and method in force on it, from the log's dated lists.
    function _dutyCompute(year, month) {
      return computeDutyData(flightStore.getCompleted(), _dutyPilotId, _dutyPilotName, year, month,
        { days: _dutyLog.days, defaultDuty: _dutyLog.default_duties, unmatched: flightStore.getUnmatched(),
          method: _dutyLog.duty_methods });
    }

    function _dutyPilot() { return pilotList.find(p => p.id === _dutyPilotId) || null; }

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
          onDeleteEntry: async e => { if (await deleteUnappliedCorrections(e.id, _dutyFetchLog)) _dutyLoad(); },
        } : null,
      });
      _dutyRenderDefault();
    }

    // "Default duty 08:00–17:00 · Change" in the toolbar (admins can change or set it): the
    // default in force on the shown month's last day, "from Jun 15" when it started during
    // the month.
    function _dutyRenderDefault() {
      const el = document.getElementById('pilot-duty-default');
      const entries = (_dutyLog && _dutyLog.default_duties) || [];
      const days = _dutyData ? _dutyData.days : [];
      const e = days.length ? dutyEntryOn(entries, days[days.length - 1].dateKey) : null;
      const from = e && e.effective_date > days[0].dateKey && e.effective_date <= days[days.length - 1].dateKey
        ? ' from ' + tzShortDate(e.effective_date, _dutyYear) : '';
      const text = e && e.duty_start ? 'Default duty ' + e.duty_start + '–' + e.duty_end + from
        : (_dutyCanEdit || from ? 'No default duty' + from : '');
      el.innerHTML = escHtml(text) +
        (_dutyCanEdit ? '<button class="duty-link-btn" data-duty-default>' + (entries.length ? 'Change' : 'Set') + '</button>' : '');
    }
    document.getElementById('pilot-duty-default').addEventListener('click', e => {
      if (e.target.closest('[data-duty-default]')) _dutyOpenDefaultForm();
    });

    // The pilot's default duty, by date (GET /api/duty-days's default_duties): used for
    // flying days with no duty times recorded, and under (c) it's the regularly assigned
    // duty period. A change is a new entry from its Effective from date, so earlier days,
    // and past months' PDFs, keep the default in force then; Edit fixes an entry itself (a
    // typo), Remove drops it. With edit (an entry), the form edits that one, and a new date
    // moves it.
    //
    // A save or remove sends the log's history id as base_history_id: the form shows the
    // whole list as of it, so a change to any entry since (another admin's) is refused and
    // the form offers to reload (src/index.ts, "Dated default duty and duty method").
    function _dutyOpenDefaultForm({ edit = null } = {}) {
      if (!_dutyLog) return;
      const pilotId = _dutyPilotId;
      const entries = [..._dutyLog.default_duties].sort((a, b) => a.effective_date < b.effective_date ? 1 : -1);
      const baseHistoryId = _dutyLog.last_history_id;
      const today = unixToTzDateStr(Math.floor(Date.now() / 1000));
      const timesOf = e => e.duty_start ? e.duty_start + '–' + e.duty_end : 'No default';
      const { modal, close, isDirty } = openFormModal({
        id: 'duty-default-modal',
        title: edit ? 'Edit default duty' : 'Default duty',
        bodyHtml:
          '<p class="form-modal-hint">Used for a day with flights and no duty times or rest recorded, shown as ' +
            '“(default)”; under §135.267(c) it’s the regularly assigned duty period. A change applies from its ' +
            'Effective from date: past months keep the default that was in force then. ' +
            'The earliest entry also covers the days before it. To correct a mistake, edit the entry instead. ' +
            'Leave both times empty for no default from that date.</p>' +
          (entries.length ? _dutyDatedListHtml(entries, timesOf, edit) : '') +
          '<div class="form-field"><label for="duty-def-from">Effective from</label>' +
            '<input type="date" id="duty-def-from" value="' + escHtml(edit ? edit.effective_date : today) + '"></div>' +
          '<div class="form-field-row">' +
            '<div class="form-field"><label for="duty-def-start">Duty start</label>' +
              '<input type="time" id="duty-def-start" value="' + escHtml((edit && edit.duty_start) || '') + '"></div>' +
            '<div class="form-field"><label for="duty-def-end">Duty end</label>' +
              '<input type="time" id="duty-def-end" value="' + escHtml((edit && edit.duty_end) || '') + '"></div>' +
          '</div>' +
          '<p class="form-modal-hint" data-duty-last-edit></p>' +
          '<div class="form-modal-error" role="alert"></div>',
        footerHtml:
          '<span class="form-modal-footer-spacer"></span>' +
          '<button class="btn-secondary btn-md" data-act="cancel">Cancel</button>' +
          '<button class="btn-primary btn-md" data-act="save">Save</button>',
      });
      const $ = sel => modal.querySelector(sel);
      const errorEl = $('.form-modal-error');
      const buttons = [...modal.querySelectorAll('.form-modal-footer button, .duty-dated-list button')];
      async function reload() {
        await _dutyFetchLog();
        _dutyLoad();
        _dutyOpenDefaultForm();
      }
      const onConflict = conflict => showEditConflict(errorEl, conflict, { reload, changed: isDirty });
      // A change newer than the log is shown as a conflict right away.
      showLastEdit($('[data-duty-last-edit]'), 'pilot_default_duty', String(pilotId))
        .then(h => { if (h && h.id > baseHistoryId && !errorEl.textContent) onConflict(h); });
      // The pilot list's "Default duty" line follows.
      function saved(resp) {
        const p = pilotList.find(x => x.id === pilotId);
        if (p) p.default_duties = resp.default_duties;
        renderSettingsPilotList();
      }

      modal.querySelector('.duty-dated-list')?.addEventListener('click', async e => {
        const btn = e.target.closest('[data-edit], [data-remove]');
        if (!btn) return;
        const entry = entries[Number(btn.dataset.edit ?? btn.dataset.remove)];
        if (btn.dataset.edit != null) { _dutyOpenDefaultForm({ edit: entry }); return; }
        if (!confirm('Remove the default duty entry “' + _dutyDatedWhen(entries, entry) + ': ' + timesOf(entry) +
          '”? The days it covered then follow the other entries.')) return;
        const ok = await _dutySave(buttons, errorEl, async () => saved(await deleteDefaultDuty(pilotId,
          entry.effective_date, baseHistoryId)), onConflict);
        if (ok) _dutyOpenDefaultForm();
      });
      $('[data-act="cancel"]').addEventListener('click', close);
      $('[data-act="save"]').addEventListener('click', async () => {
        const from = $('#duty-def-from').value;
        const start = $('#duty-def-start').value || null, end = $('#duty-def-end').value || null;
        if (!from) { errorEl.textContent = 'Enter the date it applies from.'; return; }
        if ((start == null) !== (end == null)) { errorEl.textContent = 'Enter both times, or neither for no default.'; return; }
        if (start != null && start === end) { errorEl.textContent = 'The duty end must differ from its start.'; return; }
        // Another entry on that date is replaced: say so.
        const other = entries.find(x => x.effective_date === from && x !== edit);
        if (other && !confirm('There’s already an entry dated ' + tzShortDate(from, null) + ' (' + timesOf(other) + '). Replace it?')) return;
        const body = { effective_date: from, duty_start: start, duty_end: end, base_history_id: baseHistoryId };
        if (edit) body.replaces = edit.effective_date;
        const ok = await _dutySave(buttons, errorEl, async () => saved(await putDefaultDuty(pilotId, body)), onConflict);
        if (ok) close();
      });
    }

    // "From Jun 15, 2026", or for the earliest entry, which also covers the days before
    // it (dutyEntryOn), "Before Jul 1, 2026" or "Every day" when it's the only one.
    // entries: newest first.
    function _dutyDatedWhen(entries, entry) {
      const i = entries.indexOf(entry);
      if (i < entries.length - 1) return 'From ' + tzShortDate(entry.effective_date, null);
      return i > 0 ? 'Before ' + tzShortDate(entries[i - 1].effective_date, null) : 'Every day';
    }

    // A dated list (newest first) with Edit and Remove on each entry (data-edit /
    // data-remove: its index), what(entry) its value. The entry being edited is left out.
    // Shared with Global Settings' duty method (settings.ts).
    function _dutyDatedListHtml(entries, what, editing = null) {
      return '<ul class="duty-dated-list">' + entries.map((e, i) => e === editing ? '' :
        '<li><span class="duty-dated-when">' + escHtml(_dutyDatedWhen(entries, e)) + '</span>' +
          '<span class="duty-dated-what">' + escHtml(what(e)) + '</span>' +
          '<span><button type="button" class="duty-link-btn" data-edit="' + i + '">Edit</button>' +
          '<button type="button" class="duty-link-btn" data-remove="' + i + '">Remove</button></span></li>'
      ).join('') + '</ul>';
    }

    // An export covers at most this many months.
    const _DUTY_MAX_EXPORT_MONTHS = 24;

    // Export form: the months to export, from a preset (dutyExportPresets) or picked
    // From/To. One PDF, a section per month and a summary page per quarter
    // (_buildTypstSource).
    function _dutyOpenExportForm() {
      if (!_dutyLog) return;
      const [curY, curM] = currentDutyMonth();
      const idx = (y, m) => y * 12 + m - 1;
      const ym = i => [Math.floor(i / 12), i % 12 + 1];
      const cur = idx(curY, curM), shown = idx(_dutyYear, _dutyMonth);
      // From the pilot's first flight (at least the last 12 months) through this month.
      let earliest = Math.min(shown, cur - 11);
      for (const f of flightStore.getCompleted()) {
        if (f.pilot_id !== _dutyPilotId) continue;
        const [y, m] = unixToTzDateStr(f.start_time).split('-').map(Number);
        earliest = Math.min(earliest, idx(y, m));
      }
      const presetList = dutyExportPresets(shown, cur, earliest);
      const presets = {};
      for (const p of presetList) presets[p.key] = [p.from, p.to];
      let opts = '';
      for (let i = cur; i >= earliest; i--) opts += '<option value="' + i + '">' + dutyPeriodLabel({ year: ym(i)[0], month: ym(i)[1] }) + '</option>';
      const { modal, close } = openFormModal({
        id: 'duty-export-modal',
        title: 'Export PDF',
        bodyHtml:
          '<p class="form-modal-hint">One section per month. A longer export adds a summary page for each ' +
            'calendar quarter: flight time and rest by month, the §135.267 totals and every warning.</p>' +
          '<div class="form-field">' + segmentedHtml('period',
            [...presetList.map(p => [p.key, p.label]), ['custom', 'Custom']], 'month',
            { label: 'Period' }) + '</div>' +
          '<div class="form-field-row">' +
            '<div class="form-field"><label for="duty-x-from">From</label><select id="duty-x-from">' + opts + '</select></div>' +
            '<div class="form-field"><label for="duty-x-to">To</label><select id="duty-x-to">' + opts + '</select></div>' +
          '</div>' +
          '<div class="form-modal-error" role="alert"></div>',
        footerHtml:
          '<span class="form-modal-footer-spacer"></span>' +
          '<button class="btn-secondary btn-md" data-act="cancel">Cancel</button>' +
          '<button class="btn-primary btn-md" data-act="export">Export</button>',
      });
      const fromEl = modal.querySelector('#duty-x-from'), toEl = modal.querySelector('#duty-x-to');
      const errorEl = modal.querySelector('.form-modal-error');
      function applyPreset(name) {
        if (!presets[name]) return;
        fromEl.value = String(presets[name][0]);
        toEl.value = String(presets[name][1]);
      }
      const period = wireSegmented(modal, 'period', applyPreset);
      applyPreset('month');
      // Picking a month by hand makes the period Custom (the select's own change already
      // marks the form changed).
      const toCustom = () => period.set('custom');
      fromEl.addEventListener('change', toCustom);
      toEl.addEventListener('change', toCustom);
      modal.querySelector('[data-act="cancel"]').addEventListener('click', close);
      modal.querySelector('[data-act="export"]').addEventListener('click', () => {
        const from = Number(fromEl.value), to = Number(toEl.value);
        if (from > to) { errorEl.textContent = 'From has to be before To.'; return; }
        if (to - from + 1 > _DUTY_MAX_EXPORT_MONTHS) {
          errorEl.textContent = 'Export at most ' + _DUTY_MAX_EXPORT_MONTHS + ' months at a time.';
          return;
        }
        const months = [];
        for (let i = from; i <= to; i++) {
          const [y, m] = ym(i);
          months.push(i === shown && _dutyData ? _dutyData : _dutyCompute(y, m));
        }
        close();
        runDutyExport(months, {
          exportBtn:    document.getElementById('pilot-duty-export'),
          overlay:      document.getElementById('typst-load-overlay'),
          progressFill: document.getElementById('typst-progress-fill'),
          progressPct:  document.getElementById('typst-progress-pct'),
          statusLabel:  document.getElementById('typst-load-label'),
        });
      });
    }
    document.getElementById('pilot-duty-export').addEventListener('click', _dutyOpenExportForm);

    // The flight editor, filtered to this pilot and the shown month.
    document.getElementById('pilot-duty-edit-flights').addEventListener('click', () => {
      const first = tzDateKey(_dutyYear, _dutyMonth, 1);
      const [ny, nm] = tzAddMonths(_dutyYear, _dutyMonth, 1);
      openFlightEditor({ pilotId: _dutyPilotId, from: first, to: tzAddDays(tzDateKey(ny, nm, 1), -1) });
    });
    // Rest is designated ahead, so planning starts at tomorrow; any date can be picked.
    document.getElementById('pilot-duty-day').addEventListener('click', () =>
      _dutyOpenDayForm(tzAddDays(unixToTzDateStr(Math.floor(Date.now() / 1000)), 1)));

    // Runs a duty-day or pilot save, then reloads the log and re-renders; shows a failure
    // in errorEl (an edit conflict through onConflict, as runFormAction() does). Returns
    // whether the save went through (a failed reload doesn't count: _dutyFetchLog says so
    // itself).
    async function _dutySave(buttons, errorEl, fn, onConflict = null) {
      if (!await runFormAction(buttons, errorEl, fn, onConflict)) return false;
      await _dutyFetchLog();
      _dutyLoad();
      return true;
    }

    // The day form's Through range covers at most this many days (the server's limit).
    const _DUTY_MAX_RANGE_DAYS = ${MAX_DUTY_DAYS_PER_REQUEST};

    // Day form: duty start/end, or a rest day, plus a note, for dateKey or, with a
    // "Through" date, for every day from it to that date (e.g. a block of rest days planned
    // ahead). Opened from a date in the table, an Upcoming entry or the toolbar's Plan duty
    // or rest button.
    //
    // A save or clear sends the log's history id as base_history_id: the form and its
    // confirm show the range's days as of it, so a change to any of them since (another
    // admin's) is refused (src/index.ts, "Edit conflicts") and the form offers to reload.
    function _dutyOpenDayForm(dateKey, { through = '' } = {}) {
      const recordOf = k => ((_dutyLog && _dutyLog.days) || []).find(r => r.date === k) || null;
      const { modal, close, isDirty } = openFormModal({
        id: 'duty-day-modal',
        title: 'Duty or rest',
        bodyHtml:
          '<div class="form-field-row">' +
            '<div class="form-field"><label for="duty-d-date">Date</label>' +
              '<input type="date" id="duty-d-date" value="' + escHtml(dateKey) + '"></div>' +
            '<div class="form-field"><label for="duty-d-through">Through (optional)</label>' +
              '<input type="date" id="duty-d-through" value="' + escHtml(through) + '"></div>' +
          '</div>' +
          '<div class="form-field">' + segmentedHtml('kind', [['duty', 'Duty'], ['rest', 'Rest day']], 'duty', { label: 'Day type' }) + '</div>' +
          '<div class="form-field-row" data-duty-times>' +
            '<div class="form-field"><label for="duty-d-start">Duty start</label>' +
              '<input type="time" id="duty-d-start"></div>' +
            '<div class="form-field"><label for="duty-d-end">Duty end</label>' +
              '<input type="time" id="duty-d-end"></div>' +
          '</div>' +
          '<p class="form-modal-hint duty-default-hint" data-duty-default-hint><span></span>' +
            '<button type="button" class="duty-link-btn" data-duty-use-default>Use default</button></p>' +
          '<p class="form-modal-hint" data-duty-rest-hint></p>' +
          '<div class="form-field"><label for="duty-d-note">Note</label>' +
            '<textarea id="duty-d-note" rows="2" maxlength="${MAX_DUTY_NOTE_LENGTH}"></textarea></div>' +
          '<p class="form-modal-hint" data-duty-last-edit></p>' +
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
      const defaultHint = $('[data-duty-default-hint]');
      // def: the pilot's default duty in force on the first date, offered with "Use default"
      // rather than filled in, so a day saved with a note alone keeps using it.
      // baseHistoryId: what the log the form was filled from is as of (0 without one: the
      // form shows no records).
      let rec = null, def = null, baseHistoryId = 0;
      // Reload (an edit conflict): the log fetched again, and the form reopened on the same
      // dates.
      async function reload() {
        const from = $('#duty-d-date').value || dateKey, to = $('#duty-d-through').value;
        await _dutyFetchLog();
        _dutyLoad();
        _dutyOpenDayForm(from, { through: to });
      }
      const onConflict = conflict => showEditConflict(errorEl, conflict, { reload, changed: isDirty });
      function showKind(kind) {
        $('[data-duty-times]').hidden = kind === 'rest';
        restHint.hidden = kind !== 'rest';
        defaultHint.hidden = kind === 'rest' || !def;
      }
      const getKind = wireSegmented(modal, 'kind', showKind);
      // From code, so filling the form (on open and on a date change) isn't a change of the
      // user's that Escape would ask about.
      const setKind = getKind.set;

      // The date range as day keys, or an error message.
      function readDates() {
        const from = $('#duty-d-date').value, through = $('#duty-d-through').value || from;
        if (!from) return 'Enter a date.';
        if (through < from) return 'The Through date is before the date.';
        const keys = [];
        for (let k = from; k <= through; k = tzAddDays(k, 1)) {
          keys.push(k);
          if (keys.length > _DUTY_MAX_RANGE_DAYS) return 'Enter at most ' + _DUTY_MAX_RANGE_DAYS + ' days at a time.';
        }
        return keys;
      }
      // Fills the form from the first date's record, and offers Clear when the range has one.
      function load() {
        baseHistoryId = _dutyLog ? _dutyLog.last_history_id : 0;
        rec = recordOf($('#duty-d-date').value);
        def = dutyDefaultOn((_dutyLog && _dutyLog.default_duties) || [], $('#duty-d-date').value);
        defaultHint.firstChild.textContent = def
          ? 'Default duty ' + def.duty_start + '–' + def.duty_end + ' applies on a flying day with no times recorded.' : '';
        setKind(rec && rec.rest ? 'rest' : 'duty');
        $('#duty-d-start').value = (rec && rec.duty_start) || '';
        $('#duty-d-end').value = (rec && rec.duty_end) || '';
        $('#duty-d-note').value = (rec && rec.note) || '';
        // A change newer than the log is shown as a conflict right away.
        const base = baseHistoryId;
        showLastEdit($('[data-duty-last-edit]'), 'duty_days', _dutyPilotId + '/' + $('#duty-d-date').value)
          .then(h => { if (h && h.id > base && !errorEl.textContent) onConflict(h); });
        restHint.textContent = rec && rec.rest && rec.rest_designated_at != null
          ? 'Designated ' + tzDateLabel(unixToTzDateStr(rec.rest_designated_at)) + ', ' + unixToTzTime(rec.rest_designated_at) + '.'
          : 'Today is recorded as the date the rest was designated. Rest has to be designated before the day it falls on.';
        updateClear();
      }
      function updateClear() {
        const keys = readDates();
        $('[data-act="clear"]').hidden = typeof keys === 'string' || !keys.some(recordOf);
      }
      $('#duty-d-date').addEventListener('change', load);
      $('#duty-d-through').addEventListener('change', updateClear);
      // A change of the user's: the change events mark the form changed for Escape.
      $('[data-duty-use-default]').addEventListener('click', () => {
        for (const [sel, v] of [['#duty-d-start', def.duty_start], ['#duty-d-end', def.duty_end]]) {
          $(sel).value = v;
          $(sel).dispatchEvent(new Event('change', { bubbles: true }));
        }
      });
      load();

      // The whole range in one request, which the server writes in one batch: every day is
      // saved, or none.

      $('[data-act="cancel"]').addEventListener('click', close);
      $('[data-act="save"]').addEventListener('click', async () => {
        const keys = readDates();
        if (typeof keys === 'string') { errorEl.textContent = keys; return; }
        const rest = getKind() === 'rest';
        const dutyStart = rest ? null : ($('#duty-d-start').value || null);
        const dutyEnd = rest ? null : ($('#duty-d-end').value || null);
        if ((dutyStart == null) !== (dutyEnd == null)) { errorEl.textContent = 'Enter both duty start and end, or neither.'; return; }
        if (dutyStart != null && dutyStart === dutyEnd) { errorEl.textContent = 'The duty end must differ from its start.'; return; }
        const body = { dates: keys, duty_start: dutyStart, duty_end: dutyEnd, rest, note: $('#duty-d-note').value };
        const ask = dutySaveConfirmText((_dutyLog && _dutyLog.days) || [], keys, body);
        if (ask && !confirm(ask)) return;
        const ok = await _dutySave(buttons, errorEl,
          () => putDutyDays(_dutyPilotId, { ...body, base_history_id: baseHistoryId }), onConflict);
        if (ok) close();
      });
      $('[data-act="clear"]').addEventListener('click', async () => {
        const keys = readDates();
        if (typeof keys === 'string') { errorEl.textContent = keys; return; }
        if (keys.length > 1 && !confirm('Clear duty, rest and notes for all ' + keys.length + ' days?')) return;
        const ok = await _dutySave(buttons, errorEl,
          () => clearDutyDays(_dutyPilotId, { dates: keys, base_history_id: baseHistoryId }), onConflict);
        if (ok) close();
      });
    }
  `;
}
