import { statusChip, statusDot } from '../../shared/status';

/**
 * Aircraft status cards for the header status bar: builds one card per tracker and runs
 * the adaptive layout pass over them. Takes its data and elements as arguments rather
 * than reading dashboard state, so the docs-site showcase (src/showcase/) renders the
 * same cards from sample data. Needs relTime/toFeet/toKnots from helpers.ts.
 */
export function dashboardScriptsAircraftCards(): string {
  const inFlightChipHtml = statusChip('In Flight', 'live');
  const onGroundChipHtml = statusChip('On Ground', 'neutral');
  const gpsFreshDotHtml = statusDot('ok');
  const gpsStaleDotHtml = statusDot('neutral');
  return `
    const AC_STATUS_IN_FLIGHT_HTML = ${JSON.stringify(inFlightChipHtml)};
    const AC_STATUS_ON_GROUND_HTML = ${JSON.stringify(onGroundChipHtml)};
    const AC_GPS_FRESH_DOT_HTML = ${JSON.stringify(gpsFreshDotHtml)};
    const AC_GPS_STALE_DOT_HTML = ${JSON.stringify(gpsStaleDotHtml)};

    // Stable per-tracker color assignment — ColorBrewer Dark2.
    const TRACKER_COLORS = ['#1b9e77', '#d95f02', '#7570b3', '#e7298a', '#66a61e', '#e6ab02', '#a6761d', '#666666'];

    // A tracker's color: its position among activeTrackers, so colors stay put as long as
    // the tracker list does.
    function trackerColorFor(activeTrackers, trackerId) {
      const idx = activeTrackers.findIndex(t => t.id === trackerId);
      return idx >= 0 ? TRACKER_COLORS[idx % TRACKER_COLORS.length] : getCssVar('--text-faint', '#7C8A98');
    }

    // One status card. live is the tracker's latest point ({ garmin_time, location_label,
    // elevation_m, velocity_kmh }) or null; showMetrics adds altitude/speed while in flight
    // (the dashboard only has room for it with a single card).
    function buildAircraftCard({ trackerId, label, live, inFlight, color, showMetrics }) {
      const d = live;
      const card = document.createElement('div');
      card.className = 'aircraft-card ' + (inFlight ? 'in-flight' : 'on-ground');
      card.dataset.trackerId = String(trackerId);
      card.style.borderColor = inFlight ? color : '';

      // Row 1: tail + status (always), kept together on one line.
      const row1 = document.createElement('div');
      row1.className = 'ac-row1';

      const tailEl = document.createElement('div');
      tailEl.className = 'ac-card-tail';
      tailEl.textContent = label;
      row1.appendChild(tailEl);

      const statusEl = document.createElement('div');
      statusEl.className = 'ac-card-status';
      statusEl.innerHTML = inFlight ? AC_STATUS_IN_FLIGHT_HTML : AC_STATUS_ON_GROUND_HTML;
      row1.appendChild(statusEl);
      card.appendChild(row1);

      // Then gps, metrics and location (each only when present), which the card wraps
      // onto new lines as room runs out. Location goes last: it's the longest, and the
      // one that ellipsizes when even its own line is too narrow.
      const row2 = document.createElement('div');
      row2.className = 'ac-row2';

      if (d && d.garmin_time) {
        const now = Math.floor(Date.now() / 1000);
        const gpsRecent = (now - d.garmin_time) < 240;
        const gpsEl = document.createElement('div');
        gpsEl.className = 'ac-card-gps';
        gpsEl.innerHTML = (gpsRecent ? AC_GPS_FRESH_DOT_HTML : AC_GPS_STALE_DOT_HTML);
        gpsEl.appendChild(document.createTextNode('GPS ' + relTime(d.garmin_time)));
        row2.appendChild(gpsEl);
      }

      if (showMetrics && inFlight && d && (d.elevation_m != null || d.velocity_kmh != null)) {
        const parts = [];
        if (d.elevation_m != null) parts.push(toFeet(d.elevation_m));
        if (d.velocity_kmh != null) parts.push(toKnots(d.velocity_kmh));
        const metricsEl = document.createElement('div');
        metricsEl.className = 'ac-card-metrics';
        metricsEl.textContent = parts.join(' · ');
        row2.appendChild(metricsEl);
      }

      if (d && d.location_label) {
        const locEl = document.createElement('div');
        locEl.className = 'ac-card-location';
        locEl.textContent = d.location_label;
        row2.appendChild(locEl);
      }

      if (row2.hasChildNodes()) card.appendChild(row2);
      return card;
    }

    // Cards are wrapping flex rows (styles.ts), so a card's width decides how its items
    // (tail+status, gps, metrics, location) break into lines. This pass picks those widths:
    // as few lines as the bar has room for, or when even one item per line doesn't fit, a
    // scrolling ticker (a cycling carousel on phone widths).
    function layoutAircraftCards(bar, container) {
      if (!bar || !container) return;

      // Clean up the previous pass.
      container.querySelectorAll('.ticker-clone').forEach(el => el.remove());
      container.classList.remove('ticker-animate', 'vcarousel-animate');
      container.style.animationDuration = '';
      container.style.removeProperty('--ac-ticker-offset');
      container.style.removeProperty('--ac-vcarousel-offset');
      bar.classList.remove('ticker-active', 'vcarousel-active');
      const cards = Array.from(container.querySelectorAll('.aircraft-card'));
      cards.forEach(c => {
        c.style.width = '';
        c.style.marginRight = '';
        c.classList.remove('mobile-card');
      });
      if (!cards.length) return;

      // ── Mobile: horizontal cycling carousel, one full-width card at a time ────
      if (window.innerWidth <= 640 && cards.length > 1) {
        const CARD_GAP = 12;
        bar.classList.add('vcarousel-active');
        cards.forEach(c => {
          c.style.width = bar.clientWidth + 'px';
          c.style.marginRight = CARD_GAP + 'px';
          c.classList.add('mobile-card');
        });
        const totalW = (cards[0].offsetWidth + CARD_GAP) * cards.length;
        cards.forEach(c => {
          const clone = c.cloneNode(true);
          clone.classList.add('ticker-clone');
          container.appendChild(clone);
        });
        container.style.setProperty('--ac-vcarousel-offset', '-' + totalW + 'px');
        container.style.animationDuration = (cards.length * 6) + 's';
        container.classList.add('vcarousel-animate');
        return;
      }

      // ── Desktop: size every card to wrap into as few lines as fit ─────────────
      // Items wrap in order, so a card's width for a given line count is its widest line
      // under the best split of its items into that many consecutive runs.
      const cs = getComputedStyle(container);
      const room = container.clientWidth - parseFloat(cs.paddingLeft) - parseFloat(cs.paddingRight)
        - (cards.length - 1) * parseFloat(cs.columnGap);
      const widthsByLines = cards.map(c => {
        const ccs = getComputedStyle(c);
        const chrome = parseFloat(ccs.paddingLeft) + parseFloat(ccs.paddingRight)
          + parseFloat(ccs.borderLeftWidth) + parseFloat(ccs.borderRightWidth);
        const gap = parseFloat(ccs.columnGap);
        const items = Array.from(c.querySelectorAll('.ac-row1, .ac-row2 > *'))
          .map(el => el.getBoundingClientRect().width);
        // widths[k - 1]: narrowest card that fits its items on k lines.
        const widths = items.map(() => Infinity);
        for (let mask = 0; mask < (1 << (items.length - 1)); mask++) {
          // Bit i set → break the line after item i.
          let lines = 1, line = items[0], widest = 0;
          for (let i = 1; i < items.length; i++) {
            if (mask & (1 << (i - 1))) { widest = Math.max(widest, line); line = items[i]; lines++; }
            else line += gap + items[i];
          }
          widest = Math.max(widest, line);
          widths[lines - 1] = Math.min(widths[lines - 1], widest);
        }
        // Never worse with more lines allowed (a split may leave a line to spare).
        for (let k = 1; k < widths.length; k++) widths[k] = Math.min(widths[k], widths[k - 1]);
        return widths.map(w => Math.ceil(w + chrome) + 1);
      });
      const widthAt = (i, lines) => widthsByLines[i][Math.min(lines, widthsByLines[i].length) - 1];
      const total = lines => cards.reduce((s, _, i) => s + widthAt(i, lines[i]), 0);

      // Fewest lines every card can share, which sets the bar's height...
      const maxLines = Math.max(...widthsByLines.map(w => w.length));
      let target = 1;
      while (target < maxLines && total(cards.map(() => target)) > room) target++;
      const lines = cards.map(() => target);

      if (total(lines) <= room) {
        // ...then spend what's left un-wrapping cards, cheapest first.
        for (;;) {
          let best = -1, bestCost = Infinity;
          lines.forEach((k, i) => {
            if (k <= 1) return;
            const cost = widthAt(i, k - 1) - widthAt(i, k);
            if (cost < bestCost && total(lines) + cost <= room) { best = i; bestCost = cost; }
          });
          if (best < 0) break;
          lines[best]--;
        }
        cards.forEach((c, i) => { c.style.width = widthAt(i, lines[i]) + 'px'; });
        return;
      }

      // A lone card doesn't need a ticker: it fills the bar and its location ellipsizes.
      if (cards.length === 1) {
        cards[0].style.width = Math.floor(room) + 'px';
        return;
      }

      // ── Ticker tape: fully wrapped cards scroll horizontally in a seamless loop ─
      cards.forEach((c, i) => { c.style.width = widthAt(i, maxLines) + 'px'; });
      bar.classList.add('ticker-active');
      cards.forEach(c => {
        const clone = c.cloneNode(true);
        clone.classList.add('ticker-clone');
        container.appendChild(clone);
      });
      const offset = container.querySelector('.ticker-clone').offsetLeft - cards[0].offsetLeft;
      container.style.setProperty('--ac-ticker-offset', '-' + offset + 'px');
      container.style.animationDuration = (offset / 60) + 's';
      container.classList.add('ticker-animate');
    }
  `;
}
