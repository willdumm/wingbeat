/**
 * The duty log's PDF: the Typst source for one month's computeDutyData result (./duty), or
 * several in order, and where the compiler comes from. The web compiles it in the page
 * (typst.ts in WASM, src/shared/pilot-duty.ts) and the app in a hidden WebView, so both
 * print the same log.
 *
 * Moved from the duty log's script string as it was. Times are in the operator's timezone
 * (`tz`, first); the "Generated" line reads `now` (Unix seconds) after it.
 */
import type { DutyData, DutyTotals } from './duty';
import { dutyDayText, dutyPeriodLabel, dutyRangeLabel, dutyRemarksText } from './duty';
import { FLIGHT_EDIT_FIELD_NAMES, flightEntrySummary, flightOriginalText } from './flight-edits';
import type { FlightEditField } from './flight-edits';
import { fmtDuration, fmtTzTime, tzShortDate, unixToTzDateStr, unixToTzTime } from './time';
import { lightTokens } from './tokens';

/** typst.ts's all-in-one module (it exports $typst and loadFonts), and its compiler's WASM. */
export const TYPST_SCRIPT_URL = 'https://cdn.jsdelivr.net/npm/@myriaddreamin/typst.ts@0.7.0/dist/esm/contrib/all-in-one-lite.bundle.js';
export const TYPST_WASM_URL = 'https://cdn.jsdelivr.net/npm/@myriaddreamin/typst-ts-web-compiler@0.7.0/pkg/typst_ts_web_compiler_bg.wasm';
/**
 * The PDF's font, IBM Plex Sans (the design system's --font-body): typst.ts's bundled
 * fonts have no sans-serif. Static OTFs (Typst can't use woff or pick a variable font's
 * weights); Bold for *strong*, Italic for rest days.
 */
export const TYPST_FONT_URLS = ['Regular', 'Bold', 'Italic'].map(style =>
  'https://cdn.jsdelivr.net/gh/IBM/plex@v6.4.0/IBM-Plex-Sans/fonts/complete/otf/IBMPlexSans-' + style + '.otf');

// The PDF isn't themed: it prints in light mode's colors.
const THEME = {
  trackingHeading: lightTokens['tracking-heading'],
  trackingCaps: lightTokens['tracking-caps'],
  ink: lightTokens['text-primary'],
  muted: lightTokens['text-muted'],
  faint: lightTokens['text-faint'],
  rule: lightTokens['border'],
  ruleSubtle: lightTokens['border-subtle'],
  danger: lightTokens['danger-fg'],
  dangerBg: lightTokens['danger-surface'],
};

// A Typst string literal in markup (#"…"), so labels and notes print verbatim
// whatever markup characters they contain.
function typStr(s: unknown): string {
  return '#"' + String(s).replace(/[\\"]/g, m => '\\' + m).replace(/[\u0000-\u001f]/g, ' ') + '"';
}

/**
 * "duty-log-jane-doe-2026-10.pdf", or "…-2026-07-to-2026-09.pdf" for a range. The name keeps
 * only ASCII letters and digits (accents dropped), so it's a safe file name on any system.
 */
export function dutyLogPdfName(input: DutyData | DutyData[]): string {
  const months = Array.isArray(input) ? input : [input];
  const monthKey = (m: DutyData) => m.year + '-' + String(m.month).padStart(2, '0');
  const first = months[0], last = months[months.length - 1];
  return 'duty-log-' +
    (first.pilotName.normalize('NFD').replace(/[\u0300-\u036f]/g, '').toLowerCase()
      .replace(/[^a-z0-9]+/g, '-').replace(/^-|-$/g, '') || 'pilot') + '-' +
    monthKey(first) + (first === last ? '' : '-to-' + monthKey(last)) + '.pdf';
}

/**
 * The same rows, warnings and totals as the log on screen, with each edited flight's
 * tracker values in numbered † footnotes. input is one month's computeDutyData result,
 * or several in order (an export of a range): each month then starts on a new page
 * under its own heading, and each calendar quarter in the range ends with a summary
 * page (flight time and rest by month, totals, and the quarter's warnings). appName is
 * the document's author.
 */
export function dutyLogTypstSource(tz: string, now: number, input: DutyData | DutyData[], appName: string): string {
  const months = Array.isArray(input) ? input : [input];
  const range = months.length > 1;
  const { pilotName } = months[0];
  const periodLabel = dutyRangeLabel(months);
  const time = (unix: number) => unixToTzTime(tz, unix);
  const COLS = 8;
  // A warning is indented past the DATE column, so that column holds the day's whole block.
  const warnCell = (text: string) => '  [], warning(' + typStr(text).slice(1) + '),\n';
  const footnotes: string[] = [];
  let anyManual = false;

  // The day before the month, so its rolling checks (24-hour flight time, rest before
  // the first duty) can be followed from the page.
  function prevDayRow(data: DutyData): string {
    const p = data.prevDay;
    if (!p) return '';
    const parts = [p.rest || p.duty ? dutyDayText(tz, p, data.year) : 'No duty recorded'];
    if (p.daySecs) parts.push(fmtDuration(p.daySecs) + ' flight time');
    if (p.flights.length) {
      parts.push('flights ' + p.flights.map(f => time(f.start_time) + '–' + time(f.end_time)).join(', '));
    }
    return '  [' + typStr(tzShortDate(p.dateKey, data.year)) + '], table.cell(colspan: ' + (COLS - 1) + ')[#text(fill: muted)[_' +
      typStr('Previous day: ' + parts.join(' · ')) + '_]],\n';
  }

  function monthTable(data: DutyData): string {
    const { year, days } = data;
    let rows = prevDayRow(data);
    for (const day of days) {
      // Each day starts below a rule, and those are the only rules between rows.
      if (rows) rows += '  table.hline(stroke: 0.6pt + rule),\n';
      const dayText = dutyDayText(tz, day, year) + (day.note ? ' (' + day.note + ')' : '');
      if (day.flights.length === 0) {
        rows += '  [' + day.label + '], table.cell(colspan: ' + (COLS - 1) + ')[' +
          (day.rest ? '#text(fill: muted)[_' + typStr(dayText) + '_]' : typStr(dayText)) + '],\n';
      }
      day.flights.forEach((f, i) => {
        let mark = '';
        const fields = Object.keys(f.edited) as FlightEditField[];
        if (fields.length) {
          footnotes.push(day.label + ', flight at ' + time(f.start_time) + ': the tracker recorded ' +
            fields.map(k => FLIGHT_EDIT_FIELD_NAMES[k] + ' ' + flightOriginalText(tz, k, f.edited[k])).join(', ') + '.');
          mark = '#super[†' + footnotes.length + ']';
        }
        const cell = (field: FlightEditField, text: string) => '[' + typStr(text) + (field in f.edited ? mark : '') + ']';
        if (f.manual) anyManual = true;
        rows += '  ' +
          (i === 0 ? '[' + day.label + '], [' + typStr(dayText) + ']' : '[], []') + ', ' +
          '[' + typStr(f.aircraft_tail || '—') + '], ' +
          '[' + typStr(f.origin_label || '—') + ('origin_label' in f.edited ? mark : '') + (f.manual ? '#super[‡]' : '') + '], ' +
          cell('start_time', time(f.start_time)) + ', ' +
          cell('destination_label', f.destination_label || '—') + ', ' +
          cell('end_time', time(f.end_time)) + ', ' +
          '[' + fmtDuration(f.secs) + '],\n';
        // Remarks (Part 91, a remark) span the row under the flight, from A/C on.
        const remarks = dutyRemarksText(f);
        if (remarks) {
          rows += '  [], [], table.cell(colspan: ' + (COLS - 2) + ', align: left)[#text(size: 7pt, fill: muted)[' + typStr(remarks) + ']],\n';
        }
      });
      // An unmatched entry corrects a tracked flight, so it has the flight's start.
      for (const e of day.unmatched) {
        rows += '  [], table.cell(colspan: ' + (COLS - 1) + ')[' +
          typStr('Tracked flight from ' + time(e.flight_start_time) + ' no longer found; its corrections (' +
            flightEntrySummary(tz, e) + ') are not counted.') + '],\n';
      }
      if (day.flights.length > 0) {
        rows += '  table.cell(colspan: ' + (COLS - 1) + ', align: right)[#text(fill: muted)[Day total]], [*' + fmtDuration(day.daySecs) + '*],\n';
      }
      for (const w of day.warnings) rows += warnCell(w);
    }
    return (
      '#table(\n' +
      '  stroke: none,\n' +
      '  columns: (auto, auto, auto, 1fr, auto, 1fr, auto, auto),\n' +
      '  align: (left, left, center, left, center, left, center, right),\n' +
      '  table.header([DATE], [DUTY], [A/C], [ORIGIN], [DEP], [DEST], [ARR], [TIME], table.hline(stroke: 0.8pt + ink)),\n' +
      rows +
      '  table.hline(stroke: 0.8pt + ink),\n' +
      '  table.cell(colspan: ' + (COLS - 1) + ', align: right)[*Month total*], [*' + fmtDuration(data.monthSecs) + '*],\n' +
      ')\n\n'
    );
  }

  const overFill = '#text(fill: danger)';
  function totalsBlock(totals: DutyTotals): string {
    const r = totals.rest;
    const totalsRows = totals.hours.map(t =>
      '  [' + typStr(t.label) + '], [' + (t.over ? overFill + '[*' + fmtDuration(t.secs, true) + '*]' : fmtDuration(t.secs)) + '], [' + fmtDuration(t.limit) + '],\n'
    ).join('') +
      (r ? '  [' + typStr(r.label) + '], [' + (r.short ? overFill + '[*' + r.taken + '*]' : String(r.taken)) +
        (r.scheduled ? ' + ' + r.scheduled + ' planned' : '') + '], [' + r.required + '],\n' : '');
    return (
      '#block(breakable: false)[\n' +
      '#text(size: 10pt, weight: "bold")[' + typStr('§135.267 totals (as of ' + totals.asOfLabel + ')') + ']\n' +
      '#v(0.2em)\n' +
      '#table(\n' +
      '  columns: (1fr, auto, auto),\n' +
      '  align: (left, right, right),\n' +
      '  table.header([PERIOD], [TOTAL], [LIMIT], table.hline(stroke: 0.8pt + ink)),\n' +
      totalsRows +
      ')\n' +
      ']\n\n'
    );
  }

  // One calendar quarter's months from the export: flight time and rest by month, the
  // totals as of the last of them, and every warning in them.
  function quarterSummary(qMonths: DutyData[]): string {
    const lastM = qMonths[qMonths.length - 1];
    const qName = 'Q' + ((lastM.month - 1 - (lastM.month - 1) % 3) / 3 + 1) + ' ' + lastM.year;
    const byMonth = qMonths.map(m => {
      const restDays = m.days.filter(d => d.rest && !d.warnings.length).length;
      const warnDays = m.days.filter(d => d.warnings.length).length;
      return '  [' + typStr(dutyPeriodLabel(m)) + '], [' + fmtDuration(m.monthSecs) + '], [' + restDays + '], [' +
        (warnDays ? overFill + '[*' + warnDays + '*]' : '0') + '],\n';
    }).join('');
    const warnRows = qMonths.flatMap(m => m.days.flatMap(d => d.warnings.map(w =>
      '  [' + typStr(tzShortDate(d.dateKey, m.year)) + '], [' + overFill + '[' + typStr(w) + ']],\n'))).join('');
    return (
      '#pagebreak()\n' +
      '#text(size: 13pt, weight: "bold")[' + typStr(qName + ' summary') + ']\n' +
      '#v(0.2em)\n' +
      '#text(fill: muted)[' + typStr(dutyRangeLabel(qMonths) + (qMonths.length < 3 ? ' (the months of the quarter in this log)' : '')) + ']\n' +
      '#v(0.8em)\n' +
      '#table(\n' +
      '  columns: (1fr, auto, auto, auto),\n' +
      '  align: (left, right, right, right),\n' +
      '  table.header([MONTH], [FLIGHT TIME], [REST PERIODS], [DAYS WITH WARNINGS], table.hline(stroke: 0.8pt + ink)),\n' +
      byMonth +
      ')\n\n' +
      '#v(1.2em)\n' +
      totalsBlock(lastM.totals) +
      '#v(1.2em)\n' +
      '#text(size: 10pt, weight: "bold")[Warnings]\n' +
      '#v(0.2em)\n' +
      (warnRows
        ? '#table(\n  columns: (auto, 1fr),\n  align: (left, left),\n' +
          '  table.header([DATE], [WARNING], table.hline(stroke: 0.8pt + ink)),\n' + warnRows + ')\n\n'
        : '#text(fill: muted)[None.]\n\n')
    );
  }

  let body = '';
  months.forEach((data, i) => {
    if (range) {
      if (i > 0) body += '#pagebreak()\n';
      body += '#text(size: 13pt, weight: "bold")[' + typStr(dutyPeriodLabel(data)) + ']\n#v(0.6em)\n';
    }
    body += monthTable(data) + '#v(1.6em)\n' + totalsBlock(data.totals);
    // A quarter's summary follows its last month, or the export's last month.
    const next = months[i + 1];
    const quarterOf = (m: DutyData) => m.year * 4 + Math.floor((m.month - 1) / 3);
    if (range && (!next || quarterOf(next) !== quarterOf(data))) {
      body += quarterSummary(months.filter(m => quarterOf(m) === quarterOf(data)));
    }
  });

  const generated = tzShortDate(unixToTzDateStr(tz, now)) + ', ' + fmtTzTime(tz, now);   // Oct 15, 2026, 14:05 AKDT
  const notes: string[] = [];
  if (footnotes.length) {
    notes.push('*Corrections.* Values marked † were corrected from the tracker’s:');
    footnotes.forEach((n, i) => notes.push('#super[†' + (i + 1) + '] ' + typStr(n)));
  }
  if (anyManual) notes.push('#super[‡] ' + typStr('Entered manually (not tracked).'));

  const color = (name: keyof typeof THEME) => 'rgb("' + THEME[name] + '")';
  return (
    '#set document(title: ' + typStr(pilotName + ' Duty Log').slice(1) + ', author: ' + typStr(appName).slice(1) + ')\n' +
    '#let ink = ' + color('ink') + '\n' +
    '#let muted = ' + color('muted') + '\n' +
    '#let rule = ' + color('rule') + '\n' +
    '#let danger = ' + color('danger') + '\n' +
    // A day's warning: a row from after the DATE column, tinted and barred as well as
    // colored, so it still stands out in black and white.
    '#let warning(body) = table.cell(colspan: ' + (COLS - 1) + ', fill: ' + color('dangerBg') + ', stroke: (left: 2pt + danger))[#text(fill: danger)[*Warning:* #body]]\n' +
    '#set text(font: ("IBM Plex Sans", "Libertinus Serif"), size: 8pt, fill: ink, number-width: "tabular")\n' +
    '#set page(\n' +
    '  paper: "us-letter",\n' +
    '  margin: (x: 0.6in, y: 0.6in),\n' +
    '  footer: context [\n' +
    '    #set text(size: 7pt, fill: ' + color('faint') + ')\n' +
    '    ' + typStr(pilotName + ' · ' + periodLabel) +
          ' #h(1fr) ' + typStr('Generated ' + generated) + ' #h(1fr) Page #counter(page).display("1 of 1", both: true)\n' +
    '  ]\n' +
    ')\n' +
    // Hairlines between rows, for the summary tables; the month table turns them off and
    // draws only a heavy rule under the header and a rule between days.
    '#set table(inset: (x: 5pt, y: 4pt), stroke: (_, y) => if y > 0 { (top: 0.4pt + ' + color('ruleSubtle') + ') })\n' +
    '#show table.cell.where(y: 0): set text(size: 6.5pt, weight: "bold", fill: muted, tracking: ' + THEME.trackingCaps + ')\n\n' +
    '#stack(spacing: 7pt,\n' +
    '  text(size: 17pt, weight: "bold", tracking: ' + THEME.trackingHeading + ', ' + typStr(pilotName + ' Duty Log').slice(1) + '),\n' +
    '  text(size: 10pt, fill: muted, ' + typStr(periodLabel).slice(1) + '),\n' +
    ')\n\n' +
    '#v(1.2em)\n\n' +
    body +
    (notes.length
      ? '#v(1em)\n#set text(size: 7pt, fill: muted)\n' + notes.join('\n\n') + '\n'
      : '')
  );
}
