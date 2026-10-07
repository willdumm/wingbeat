import { icon } from './icons';

/** Duty log view body: month navigation + export toolbar, then the table and totals. */
export function pilotDutyMarkup(): string {
  return /* html */ `
          <div class="pilot-duty-toolbar">
            <button id="pilot-duty-prev" class="pilot-duty-nav-btn btn-secondary" aria-label="Previous month">${icon('chevron-left', { size: 14 })}</button>
            <span id="pilot-duty-period" class="pilot-duty-period-label"></span>
            <button id="pilot-duty-next" class="pilot-duty-nav-btn btn-secondary" aria-label="Next month">${icon('chevron-right', { size: 14 })}</button>
            <div class="pilot-duty-toolbar-spacer"></div>
            <button id="pilot-duty-export" class="pilot-duty-export-btn btn-primary">Export PDF</button>
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
    .pilot-duty-toolbar {
      display: flex;
      align-items: center;
      gap: 0.5rem;
      padding: 0.6rem 1rem;
      border-bottom: 1px solid var(--border);
      position: sticky;
      top: 0;
      z-index: 1;
      background: var(--surface-1);
    }
    /* Visual props from .btn-secondary on nav buttons */
    .pilot-duty-nav-btn { font-size: 0.78rem; padding: 0.25rem 0.55rem; }
    .pilot-duty-period-label {
      font-size: 0.88rem; font-weight: 600; color: var(--text-primary);
      min-width: 7rem; text-align: center;
    }
    .pilot-duty-toolbar-spacer { flex: 1; }
    /* Visual props from .btn-primary on export button */
    .pilot-duty-export-btn { padding: 0.45rem 1rem; font-size: 0.82rem; min-height: 2.1rem; }

    .pilot-duty-body {
      padding: 1rem;
      display: flex;
      flex-direction: column;
      gap: 1.5rem;
    }

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
    .duty-row-rest td { color: var(--text-muted); font-style: italic; }
    .duty-row-day-total td {
      color: var(--text-secondary); font-size: 0.75rem;
      background: var(--surface-hover);
      border-bottom: 1px solid var(--border);
    }
    .duty-col-block { text-align: right; font-variant-numeric: tabular-nums; }
    .duty-col-date  { white-space: nowrap; font-weight: 500; }
    .duty-col-compact { display: none; }
    .duty-compact-times { color: var(--text-muted); font-size: 0.75rem; }

    /* Narrow (phones, the settings modal or a showcase frame on one): seven columns
       don't fit, so each flight folds into one "Origin → Dest / Dep–Arr · A/C" cell
       between Date and Block. Rows become grids, which sidesteps the colspans. */
    .pilot-duty-content { container-type: inline-size; }
    @container (max-width: 34rem) {
      .duty-table, .duty-table thead, .duty-table tbody { display: block; }
      .duty-table tr { display: grid; grid-template-columns: 5.5rem minmax(0, 1fr) auto; }
      .duty-table th, .duty-table td { display: none; }
      .duty-table .duty-col-date, .duty-table .duty-col-compact, .duty-table .duty-col-block,
      .duty-row-rest td, .duty-row-day-total td { display: block; }
      .duty-table .duty-col-compact { overflow-wrap: anywhere; }
      .duty-row-rest td:last-child { grid-column: 2 / -1; }
      .duty-row-day-total td:first-child { grid-column: 1 / 3; }
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
 * Pilot duty log computation and rendering: builds one pilot's month of flights plus
 * rolling totals, renders them as the duty table, and compiles the same data to a PDF
 * with Typst (loaded on first export). Takes flights and elements as arguments rather
 * than reading the flight store, so the docs-site showcase (src/showcase/) renders and
 * exports the same log from sample data. Times are shown in APP_SETTINGS.timezone.
 */
export function pilotDutyRenderScript(): string {
  return `
    // ── Pilot duty log rendering ──────────────────────────────────────────────

    const _DUTY_TZ = window.APP_SETTINGS.timezone;

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

    function buildDayMap(flights, tz) {
      const byDate = {};
      for (const f of flights) {
        const key = new Date(f.start_time * 1000).toLocaleDateString('en-CA', { timeZone: tz });
        if (!byDate[key]) byDate[key] = [];
        byDate[key].push(f);
      }
      return byDate;
    }

    // One pilot's completed flights for year/month, plus rolling totals as of now.
    function computeDutyData(allFlights, pilotId, pilotName, year, month) {
      const pilotFlights = allFlights.filter(f =>
        f.pilot_id === pilotId && f.end_time != null
      );

      const monthPrefix = year + '-' + String(month).padStart(2, '0');
      const monthFlights = pilotFlights.filter(f => {
        const dateStr = new Date(f.start_time * 1000)
          .toLocaleDateString('en-CA', { timeZone: _DUTY_TZ });
        return dateStr.startsWith(monthPrefix);
      });

      const nowEpoch = Math.floor(Date.now() / 1000);
      function sumSecs(since) {
        return pilotFlights
          .filter(f => f.start_time >= since)
          .reduce((acc, f) => acc + (f.end_time - f.start_time), 0);
      }

      const ninetyDaysAgo = nowEpoch - 90 * 86400;
      const flightsLast90 = pilotFlights.filter(f => f.start_time >= ninetyDaysAgo);
      const uniqueDatesLast90 = new Set(flightsLast90.map(f =>
        new Date(f.start_time * 1000).toLocaleDateString('en-CA', { timeZone: _DUTY_TZ })
      ));
      const restDaysLast90 = 90 - uniqueDatesLast90.size;

      const [curY, curM] = currentDutyMonth();
      const isCurrentMonth = (year === curY && month === curM);

      return {
        pilotName,
        year,
        month,
        flights: monthFlights,
        isCurrentMonth,
        totals: {
          h24: sumSecs(nowEpoch - 86400),
          d7:  sumSecs(nowEpoch - 7  * 86400),
          d30: sumSecs(nowEpoch - 30 * 86400),
          d90: sumSecs(nowEpoch - 90 * 86400),
          y12: sumSecs(nowEpoch - 365 * 86400),
          restDaysLast90,
        },
      };
    }

    // [year, month] of the current month in the duty timezone.
    function currentDutyMonth() {
      const akstNow = new Intl.DateTimeFormat('en-CA', {
        timeZone: _DUTY_TZ, year: 'numeric', month: '2-digit',
      }).format(new Date());
      return akstNow.split('-').map(Number);
    }

    function dutyPeriodLabel(data) {
      const monthNames = ['January','February','March','April','May','June',
                          'July','August','September','October','November','December'];
      return monthNames[data.month - 1] + ' ' + data.year;
    }

    // Renders data (from computeDutyData) as the month table into content and the rolling
    // totals into totalsEl, which is placed first in bodyEl for the current month and last
    // otherwise.
    function renderDutyLog(data, { content, totalsEl, bodyEl }) {
      const { year, month, flights, totals, isCurrentMonth } = data;

      const DAY_NAMES  = ['Sun','Mon','Tue','Wed','Thu','Fri','Sat'];
      const MONTH_ABBR = ['Jan','Feb','Mar','Apr','May','Jun','Jul','Aug','Sep','Oct','Nov','Dec'];

      function fmtLocalTime(epoch) {
        return new Date(epoch * 1000).toLocaleTimeString('en-US', {
          timeZone: _DUTY_TZ, hour: '2-digit', minute: '2-digit', hour12: false,
        });
      }

      const byDate = buildDayMap(flights, _DUTY_TZ);

      const daysInMonth = new Date(year, month, 0).getDate();
      let totalMonthSecs = 0;

      const table = document.createElement('table');
      table.className = 'duty-table';
      table.innerHTML =
        '<thead><tr>' +
        '<th class="duty-col-date">Date</th>' +
        '<th class="duty-col-compact">Flight</th>' +
        '<th>A/C</th><th>Origin</th><th>Dep</th>' +
        '<th>Dest</th><th>Arr</th><th class="duty-col-block">Block</th>' +
        '</tr></thead><tbody></tbody>';

      const tbody = table.querySelector('tbody');

      for (let day = 1; day <= daysInMonth; day++) {
        const dateKey  = year + '-' +
          String(month).padStart(2,'0') + '-' + String(day).padStart(2,'0');
        const dow      = DAY_NAMES[new Date(year, month - 1, day).getDay()];
        const dateLabel = dow + ' ' + MONTH_ABBR[month - 1] + ' ' + day;
        const dayFlights = byDate[dateKey] || [];

        if (dayFlights.length === 0) {
          const tr = document.createElement('tr');
          tr.className = 'duty-row-rest';
          tr.innerHTML = '<td class="duty-col-date">' + dateLabel + '</td>' +
                         '<td colspan="6">Rest</td>';
          tbody.appendChild(tr);
        } else {
          let daySecs = 0;
          dayFlights.forEach((f, i) => {
            const block = f.end_time - f.start_time;
            daySecs += block;
            const tr = document.createElement('tr');
            tr.innerHTML =
              '<td class="duty-col-date">' + (i === 0 ? dateLabel : '') + '</td>' +
              '<td class="duty-col-compact">' + (f.origin_label || '—') + ' → ' + (f.destination_label || '—') +
                '<div class="duty-compact-times">' + fmtLocalTime(f.start_time) + '–' + fmtLocalTime(f.end_time) +
                ' · ' + (f.aircraft_tail || '—') + '</div></td>' +
              '<td>' + (f.aircraft_tail || '—') + '</td>' +
              '<td>' + (f.origin_label || '—') + '</td>' +
              '<td>' + fmtLocalTime(f.start_time) + '</td>' +
              '<td>' + (f.destination_label || '—') + '</td>' +
              '<td>' + fmtLocalTime(f.end_time) + '</td>' +
              '<td class="duty-col-block">' + fmtBlock(block) + '</td>';
            tbody.appendChild(tr);
          });
          totalMonthSecs += daySecs;
          const totalRow = document.createElement('tr');
          totalRow.className = 'duty-row-day-total';
          totalRow.innerHTML =
            '<td colspan="6" style="text-align:right;padding-right:0.5rem">Day total</td>' +
            '<td class="duty-col-block">' + fmtBlock(daySecs) + '</td>';
          tbody.appendChild(totalRow);
        }
      }

      content.innerHTML = '';
      content.appendChild(table);

      const monthTotalEl = document.createElement('div');
      monthTotalEl.className = 'duty-month-total';
      monthTotalEl.textContent = 'Month total: ' + fmtBlock(totalMonthSecs);
      content.appendChild(monthTotalEl);

      if (isCurrentMonth) {
        totalsEl.innerHTML =
          '<div class="pilot-duty-totals-label">Rolling Totals (as of now)</div>' +
          '<table class="totals-table"><tbody>' +
          '<tr><td>Last 24 h</td><td>'           + fmtBlock(totals.h24) + '</td></tr>' +
          '<tr><td>Last 7 d</td><td>'            + fmtBlock(totals.d7)  + '</td></tr>' +
          '<tr><td>Last 30 d</td><td>'           + fmtBlock(totals.d30) + '</td></tr>' +
          '<tr><td>Last 90 d</td><td>'           + fmtBlock(totals.d90) + '</td></tr>' +
          '<tr><td>Last 12 mo</td><td>'          + fmtBlock(totals.y12) + '</td></tr>' +
          '<tr><td>Rest days (last 90 d)</td><td>' + totals.restDaysLast90 + '</td></tr>' +
          '</tbody></table>';
        if (bodyEl.firstElementChild !== totalsEl) {
          bodyEl.insertBefore(totalsEl, content);
        }
      } else {
        totalsEl.innerHTML = '';
        if (bodyEl.lastElementChild !== totalsEl) {
          bodyEl.appendChild(totalsEl);
        }
      }
    }

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

    function _buildTypstSource(data) {
      const { pilotName, year, month, flights, totals, isCurrentMonth } = data;
      const MONTH_NAMES = ['January','February','March','April','May','June',
                           'July','August','September','October','November','December'];
      const MONTH_ABBR  = ['Jan','Feb','Mar','Apr','May','Jun',
                           'Jul','Aug','Sep','Oct','Nov','Dec'];
      const DAY_NAMES   = ['Sun','Mon','Tue','Wed','Thu','Fri','Sat'];
      const monthLabel  = MONTH_NAMES[month - 1] + ' ' + year;

      function fmtTime(epoch) {
        return new Date(epoch * 1000).toLocaleTimeString('en-US', {
          timeZone: _DUTY_TZ, hour: '2-digit', minute: '2-digit', hour12: false,
        });
      }
      function esc(s) {
        if (!s) return '—';
        return String(s)
          .replace(/\\\\/g, '\\\\\\\\')
          .replace(/#/g, '\\\\#')
          .replace(/\\[/g, '\\\\[')
          .replace(/\\]/g, '\\\\]')
          .replace(/@/g, '\\\\@');
      }

      const byDate = buildDayMap(flights, _DUTY_TZ);

      const daysInMonth = new Date(year, month, 0).getDate();
      let totalMonthSecs = 0;
      let tableRows = '';

      for (let day = 1; day <= daysInMonth; day++) {
        const dateKey   = year + '-' + String(month).padStart(2,'0') + '-' + String(day).padStart(2,'0');
        const dow       = DAY_NAMES[new Date(year, month - 1, day).getDay()];
        const dateLabel = dow + ' ' + MONTH_ABBR[month - 1] + ' ' + day;
        const dayFlights = byDate[dateKey] || [];

        if (dayFlights.length === 0) {
          tableRows += '  [' + dateLabel + '], table.cell(colspan: 6)[_Rest_],\\n';
        } else {
          let daySecs = 0;
          dayFlights.forEach((f, i) => {
            const block = f.end_time - f.start_time;
            daySecs += block;
            const dateCell = i === 0 ? '[' + dateLabel + ']' : '[]';
            tableRows +=
              '  ' + dateCell + ', ' +
              '[' + esc(f.aircraft_tail) + '], ' +
              '[' + esc(f.origin_label) + '], [' + fmtTime(f.start_time) + '], ' +
              '[' + esc(f.destination_label) + '], [' + fmtTime(f.end_time) + '], ' +
              '[' + fmtBlock(block) + '],\\n';
          });
          totalMonthSecs += daySecs;
          tableRows +=
            '  table.cell(colspan: 6, align: right)[*Day total*], [*' + fmtBlock(daySecs) + '*],\\n';
        }
      }

      const today = new Date().toLocaleDateString('en-US', { month: 'long', day: 'numeric', year: 'numeric' });

      const rollingTotalsTypst = isCurrentMonth
        ? '#v(1.5em)\\n' +
          '#text(size: 10pt, weight: "bold")[Rolling Totals (as of ' + today + ')]\\n' +
          '#v(0.3em)\\n\\n' +
          '#table(\\n' +
          '  columns: (1fr, auto),\\n' +
          '  align: (left, right),\\n' +
          '  fill: (col, row) => if row == 0 { luma(220) } else if calc.rem(row, 2) == 1 { luma(248) } else { white },\\n' +
          '  table.header([*Period*], [*Value*]),\\n' +
          '  [Last 24 h], [' + fmtBlock(totals.h24) + '],\\n' +
          '  [Last 7 days], [' + fmtBlock(totals.d7) + '],\\n' +
          '  [Last 30 days], [' + fmtBlock(totals.d30) + '],\\n' +
          '  [Last 90 days (block)], [' + fmtBlock(totals.d90) + '],\\n' +
          '  [Last 12 mo], [' + fmtBlock(totals.y12) + '],\\n' +
          '  [Rest days (last 90 d)], [' + totals.restDaysLast90 + '],\\n' +
          ')\\n'
        : '';

      return (
        '#set document(title: "Pilot Duty Log -- ' + pilotName + '", author: "' + window.APP_SETTINGS.appName + '")\\n' +
        '#set page(\\n' +
        '  paper: "us-letter",\\n' +
        '  margin: (x: 1in, y: 0.75in),\\n' +
        '  footer: context [\\n' +
        '    #set text(size: 8pt, fill: luma(120))\\n' +
        '    ' + window.APP_SETTINGS.appName + ' #h(1fr) ' + pilotName + '\\n' +
        '  ]\\n' +
        ')\\n' +
        '#set text(font: "Libertinus Serif", size: 9.5pt)\\n' +
        '#set table(stroke: 0.4pt + luma(180), inset: (x: 5pt, y: 4pt))\\n\\n' +
        '#align(center)[\\n' +
        '  #text(size: 16pt, weight: "bold")[' + window.APP_SETTINGS.appName + ']\\n' +
        '  #v(0.3em)\\n' +
        '  #text(size: 12pt)[Pilot Duty Log]\\n' +
        '  #v(0.2em)\\n' +
        '  #text(size: 10pt)[' + esc(pilotName) + ' | ' + monthLabel + ']\\n' +
        ']\\n\\n' +
        '#v(1em)\\n\\n' +
        (isCurrentMonth
          ? '#text(size: 10pt, weight: "bold")[Rolling Totals (as of ' + today + ')]\\n' +
            '#v(0.3em)\\n\\n' +
            '#table(\\n' +
            '  columns: (1fr, auto),\\n' +
            '  align: (left, right),\\n' +
            '  fill: (col, row) => if row == 0 { luma(220) } else if calc.rem(row, 2) == 1 { luma(248) } else { white },\\n' +
            '  table.header([*Period*], [*Value*]),\\n' +
            '  [Last 24 h], [' + fmtBlock(totals.h24) + '],\\n' +
            '  [Last 7 days], [' + fmtBlock(totals.d7) + '],\\n' +
            '  [Last 30 days], [' + fmtBlock(totals.d30) + '],\\n' +
            '  [Last 90 days (block)], [' + fmtBlock(totals.d90) + '],\\n' +
            '  [Last 12 mo], [' + fmtBlock(totals.y12) + '],\\n' +
            '  [Rest days (last 90 d)], [' + totals.restDaysLast90 + '],\\n' +
            ')\\n\\n' +
            '#v(1.5em)\\n\\n'
          : '') +
        '#table(\\n' +
        '  columns: (auto, auto, 1fr, auto, 1fr, auto, auto),\\n' +
        '  fill: (col, row) => if row == 0 { luma(220) } else if calc.rem(row, 2) == 1 { luma(248) } else { white },\\n' +
        '  align: (left, center, left, center, left, center, right),\\n' +
        '  table.header([*Date*], [*A/C*], [*Origin*], [*Dep*], [*Dest*], [*Arr*], [*Block*]),\\n' +
        tableRows +
        ')\\n\\n' +
        '#align(right)[*Month total: ' + fmtBlock(totalMonthSecs) + '*]\\n'
      );
    }
  `;
}

export function pilotDutyScript(): string {
  return `
    // ── Pilot duty log ────────────────────────────────────────────────────────

    ${pilotDutyRenderScript()}

    let _dutyPilotId   = null;
    let _dutyPilotName = '';
    let _dutyYear      = 0;
    let _dutyMonth     = 0;
    let _dutyData      = null;

    function openPilotDuty(pilotId, pilotName) {
      _dutyPilotId   = pilotId;
      _dutyPilotName = pilotName;

      [_dutyYear, _dutyMonth] = currentDutyMonth();

      document.getElementById('pilot-duty-next').disabled = false;
      if (document.getElementById('settings-modal').classList.contains('hidden')) { openSettings(); }
      _settingsNavigateTo('settings-view-pilot-duty', pilotName + ' — Duty Log');
      _dutyLoad();
    }

    function closePilotDuty() { _settingsNavigateBack(); }

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
      _dutyData = computeDutyData(flightStore.getAll(), _dutyPilotId, _dutyPilotName, _dutyYear, _dutyMonth);
      document.getElementById('pilot-duty-period').textContent = dutyPeriodLabel(_dutyData);
      document.getElementById('pilot-duty-next').disabled = _dutyData.isCurrentMonth;
      _dutyRender();
    }

    function _dutyRender() {
      if (!_dutyData) return;
      renderDutyLog(_dutyData, {
        content:  document.getElementById('pilot-duty-content'),
        totalsEl: document.getElementById('pilot-duty-totals'),
        bodyEl:   document.querySelector('.pilot-duty-body'),
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
  `;
}
