import { icon } from '../../shared/icons';

export function analyticsScriptsAccounting(): string {
  const chevronIconHtml = icon('chevron-right', { size: 14 });
  return `
    const ACCOUNTING_CHEVRON_HTML = ${JSON.stringify(chevronIconHtml)};
    // Region hours and stops over the page's REGIONS (@wingbeat/core/accounting).
    function computeRegionHours(flights) { return computeRegionHoursIn(REGIONS, flights); }
    function computeRegionStops(flights) { return computeRegionStopsIn(REGIONS, flights); }
    function computeMonthlyAccounting(flights) { return computeMonthlyAccountingIn(REGIONS, flights); }

    function fmtHours(h) {
      return h < 10 ? h.toFixed(1) + ' h' : Math.round(h) + ' h';
    }

    function monthLabel(key) {
      const [y, m] = key.split('-').map(Number);
      return tzLongMonthLabel(y, m);
    }

    function renderRegionRows(regionHours, regionStops) {
      let html = '';
      const totalHours = Object.values(regionHours).reduce((a, b) => a + b, 0);
      const totalStops = Object.values(regionStops).reduce((a, b) => a + b, 0);
      // Home bases never take hours (see @wingbeat/core/accounting): list their stops first,
      // and leave them out of the other regions' stop percentages.
      let homeStops = 0;
      for (const base of homeBaseNames()) {
        const stops = regionStops[base] || 0;
        if (stops === 0) continue;
        homeStops += stops;
        html += '<div class="region-row">';
        html += '<span class="region-name">' + escHtml(base) + '</span>';
        html += '<span class="region-hours">–<span class="region-pct"></span></span>';
        html += '<span class="region-stops">' + stops + '<span class="region-pct"></span></span>';
        html += '</div>';
      }
      const awayStops = totalStops - homeStops;

      const sorted = Object.entries(regionHours)
        .filter(([, h]) => h > 0)
        .sort((a, b) => b[1] - a[1]);

      for (const [region, hours] of sorted) {
        const pct = totalHours > 0 ? Math.round((hours / totalHours) * 100) : 0;
        const stops = regionStops[region] || 0;
        const stopsPct = awayStops > 0 && stops > 0 ? Math.round((stops / awayStops) * 100) : 0;
        html += '<div class="region-row">';
        html += '<span class="region-name">' + escHtml(region) + '</span>';
        html += '<span class="region-hours">' + fmtHours(hours) + '<span class="region-pct">' + pct + '%</span></span>';
        html += '<span class="region-stops">' + stops + '<span class="region-pct">' + (stops > 0 ? stopsPct + '%' : '') + '</span></span>';
        html += '</div>';
      }

      return html;
    }

    // Renders overall totals (across all filtered flights) into container.
    function renderOverallTotals(container, flights) {
      if (!container) return;
      const completed = flights.filter(f => f.end_time != null);
      if (completed.length === 0) {
        container.innerHTML = '<div class="empty-msg">No completed flights</div>';
        return;
      }
      const regionHours = computeRegionHours(completed);
      const regionStops = computeRegionStops(completed);
      const totalHours = Object.values(regionHours).reduce((a, b) => a + b, 0);
      const totalStops = Object.values(regionStops).reduce((a, b) => a + b, 0);
      if (totalHours === 0 && totalStops === 0) {
        container.innerHTML = '<div class="empty-msg">No data</div>';
        return;
      }
      let html = '<div class="totals-total">';
      html += '<span>Total</span>';
      html += '<span>' + fmtHours(totalHours) + '</span>';
      html += '<span class="totals-stops">' + totalStops + ' stops</span>';
      html += '</div>';
      html += renderRegionRows(regionHours, regionStops);
      container.innerHTML = html;
    }

    // Month rows, newest first; selectedKey's month is expanded into its region rows.
    function renderAccountingTable(flights, selectedKey) {
      const accounting = computeMonthlyAccounting(flights);
      if (!accounting || accounting.size === 0) {
        return '<div class="empty-msg">No flights found</div>';
      }
      const months = [...accounting.keys()].sort().reverse();
      let html = '';
      for (const key of months) {
        const { hours: regionHours, stops: regionStops } = accounting.get(key);
        const totalHours = Object.values(regionHours).reduce((a, b) => a + b, 0);
        const totalStops = Object.values(regionStops).reduce((a, b) => a + b, 0);
        if (totalHours === 0 && totalStops === 0) continue;
        const isSel = key === selectedKey;
        html += '<div class="month-row' + (isSel ? ' selected' : '') + '" data-month="' + key + '">';
        html += '<span class="chevron" data-open="' + (isSel ? 'true' : 'false') + '">' + ACCOUNTING_CHEVRON_HTML + '</span>';
        html += '<span class="month-label">' + monthLabel(key) + '</span>';
        html += '<span class="month-hours">' + fmtHours(totalHours) + '</span>';
        html += '<span class="month-stops">' + totalStops + ' stops</span>';
        html += '</div>';
        if (isSel) {
          html += renderRegionRows(regionHours, regionStops);
        }
      }
      return html || '<div class="empty-msg">No flights found</div>';
    }

    // Renders the month table into container; clicking a month row calls onToggleMonth(key).
    function renderAccountingInto(container, flights, selectedKey, onToggleMonth) {
      container.innerHTML = renderAccountingTable(flights, selectedKey);
      container.querySelectorAll('.month-row').forEach(row => {
        row.addEventListener('click', () => onToggleMonth(row.dataset.month));
      });
    }
  `;
}
