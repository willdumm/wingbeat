export function analyticsScriptsStreamgraphRender(): string {
  return `
    // ── Stream graph rendering ────────────────────────────────────────────────
    // Draws flights passed in rather than reading page state, so the docs-site showcase
    // (src/showcase/) renders the same chart from sample data.

    // Color palette cycled across whatever regions exist in the regions table (see
    // /api/regions), so the streamgraph always reflects the live region set instead of a
    // fixed list. Home bases ("… (Base)" regions, see findHomeBase) draw from their own
    // pink palette so they stand apart from the destination regions.
    const SG_PALETTE = [
      '#f43f5e', '#f97316', '#eab308', '#22c55e', '#14b8a6',
      '#0ea5e9', '#6366f1', '#a855f7', '#84cc16', '#06b6d4', '#f59e0b', '#e11d48',
    ];
    const SG_HOME_PALETTE = ['#ec4899', '#be185d', '#f9a8d4', '#9d174d'];

    // Stable per-region colors — keyed by name (alphabetically assigned) so a region's
    // color never changes with the current sort order or date-filtered totals.
    function sgBuildColorMap() {
      const map = {};
      homeBaseNames().forEach((n, i) => { map[n] = SG_HOME_PALETTE[i % SG_HOME_PALETTE.length]; });
      const names = (REGIONS ? REGIONS.features.filter(f => !isHomeBaseRegion(f)).map(f => regionDisplayName(f.properties.Name)) : [])
        .sort();
      names.forEach((n, i) => { map[n] = SG_PALETTE[i % SG_PALETTE.length]; });
      return map;
    }

    function sgResolveInterval(iv, s, e) {
      if (iv !== 'auto') return iv;
      if (s === null || e === null) return 'month';
      const days = (e - s) / 86400;
      return days >= 60 ? 'month' : days >= 14 ? 'week' : 'day';
    }

    function sgGenerateBuckets(s, e, iv) {
      const buckets = [];
      if (iv === 'month') {
        const d0 = new Date(s * 1000);
        let cur = Date.UTC(d0.getUTCFullYear(), d0.getUTCMonth(), 1) / 1000;
        while (cur < e) {
          const d = new Date(cur * 1000);
          const y = d.getUTCFullYear(), m = d.getUTCMonth();
          const next = Date.UTC(m === 11 ? y + 1 : y, m === 11 ? 0 : m + 1, 1) / 1000;
          buckets.push({ start: cur, end: next, label: d.toLocaleString('default', { month: 'short', year: '2-digit', timeZone: 'UTC' }) });
          cur = next;
        }
      } else if (iv === 'week') {
        const d0 = new Date(s * 1000);
        const dow = d0.getUTCDay();
        let cur = Date.UTC(d0.getUTCFullYear(), d0.getUTCMonth(), d0.getUTCDate() - (dow === 0 ? 6 : dow - 1)) / 1000;
        while (cur < e) {
          const d = new Date(cur * 1000);
          buckets.push({ start: cur, end: cur + 7 * 86400, label: d.toLocaleString('default', { month: 'short', day: 'numeric', timeZone: 'UTC' }) });
          cur += 7 * 86400;
        }
      } else {
        const d0 = new Date(s * 1000);
        let cur = Date.UTC(d0.getUTCFullYear(), d0.getUTCMonth(), d0.getUTCDate()) / 1000;
        while (cur < e) {
          const d = new Date(cur * 1000);
          buckets.push({ start: cur, end: cur + 86400, label: d.toLocaleString('default', { month: 'short', day: 'numeric', timeZone: 'UTC' }) });
          cur += 86400;
        }
      }
      return buckets;
    }

    function sgComputeData(buckets, s, e, flights, mode) {
      return buckets.map(b => {
        const bs = Math.max(b.start, s);
        const be = Math.min(b.end, e);
        if (bs >= be) return {};
        const inBucket = flights.filter(f => f.start_time >= bs && f.start_time < be);
        return mode === 'time' ? computeRegionHours(inBucket) : computeRegionStops(inBucket);
      });
    }

    // Catmull-rom → cubic bezier, tension t=1/6 for standard smoothness.
    // Returns an SVG path string starting with M at pts[0].
    function sgCrPath(pts, t) {
      if (pts.length < 2) return pts.length ? ('M' + pts[0].x.toFixed(1) + ' ' + pts[0].y.toFixed(1)) : '';
      let d = 'M' + pts[0].x.toFixed(1) + ' ' + pts[0].y.toFixed(1);
      for (let i = 0; i < pts.length - 1; i++) {
        const p0 = pts[Math.max(0, i - 1)], p1 = pts[i], p2 = pts[i + 1], p3 = pts[Math.min(pts.length - 1, i + 2)];
        d += ' C' + (p1.x + (p2.x - p0.x) * t).toFixed(1) + ' ' + (p1.y + (p2.y - p0.y) * t).toFixed(1)
           + ' ' + (p2.x - (p3.x - p1.x) * t).toFixed(1) + ' ' + (p2.y - (p3.y - p1.y) * t).toFixed(1)
           + ' ' + p2.x.toFixed(1) + ' ' + p2.y.toFixed(1);
      }
      return d;
    }

    // Returns an SVG suffix (starting with L) that draws the exact geometric reverse
    // of sgCrPath(pts, t), ending at pts[0]. Swapping CP1/CP2 for each bezier segment
    // is the standard technique for reversing cubic bezier curves.
    function sgCrReverseSuffix(pts, t) {
      if (!pts.length) return '';
      // Pre-compute forward bezier control points
      const segs = [];
      for (let i = 0; i < pts.length - 1; i++) {
        const p0 = pts[Math.max(0, i - 1)], p1 = pts[i], p2 = pts[i + 1], p3 = pts[Math.min(pts.length - 1, i + 2)];
        segs.push({
          cp1x: p1.x + (p2.x - p0.x) * t, cp1y: p1.y + (p2.y - p0.y) * t,
          cp2x: p2.x - (p3.x - p1.x) * t, cp2y: p2.y - (p3.y - p1.y) * t,
          sx: p1.x, sy: p1.y,
        });
      }
      // Jump to the last point then trace segments backwards with CP1/CP2 swapped
      let d = ' L' + pts[pts.length - 1].x.toFixed(1) + ' ' + pts[pts.length - 1].y.toFixed(1);
      for (let i = segs.length - 1; i >= 0; i--) {
        const sg = segs[i];
        d += ' C' + sg.cp2x.toFixed(1) + ' ' + sg.cp2y.toFixed(1)
           + ' ' + sg.cp1x.toFixed(1) + ' ' + sg.cp1y.toFixed(1)
           + ' ' + sg.sx.toFixed(1) + ' ' + sg.sy.toFixed(1);
      }
      return d;
    }

    // Finds contiguous runs of buckets with non-zero totals.
    function sgFindRuns(stacks) {
      const runs = [];
      let start = -1;
      for (let j = 0; j < stacks.length; j++) {
        if (stacks[j].total > 0) { if (start < 0) start = j; }
        else if (start >= 0) { runs.push({ start, end: j - 1 }); start = -1; }
      }
      if (start >= 0) runs.push({ start, end: stacks.length - 1 });
      return runs;
    }

    // Draws the stream graph of flights into container, sized to it. opts: { mode: 'time' |
    // 'stops', normalized, interval: 'auto' | 'day' | 'week' | 'month', showHomeBase }.
    function renderStreamGraph(container, flights, opts) {
      if (!container) return;

      const activeSgFlights = flights;
      if (!activeSgFlights.length) { container.innerHTML = '<div class="sg-empty">No flight data</div>'; return; }

      const s = activeSgFlights.reduce((a, f) => Math.min(a, f.start_time), Infinity);
      const e = Math.floor(Date.now() / 1000);
      if (s >= e) { container.innerHTML = '<div class="sg-empty">Invalid date range</div>'; return; }

      const iv = sgResolveInterval(opts.interval, s, e);
      const buckets = sgGenerateBuckets(s, e, iv);
      if (!buckets.length) { container.innerHTML = '<div class="sg-empty">No data in range</div>'; return; }

      const rawData = sgComputeData(buckets, s, e, activeSgFlights, opts.mode);

      // Sum each region across all buckets; used for sort and to filter zero-contrib regions
      const regionTotals = {};
      const homeBases = new Set(homeBaseNames());
      for (const d of rawData) {
        for (const [k, v] of Object.entries(d)) {
          if (k === 'Other') continue;
          if (homeBases.has(k) && !opts.showHomeBase) continue;
          if ((v || 0) > 0) regionTotals[k] = (regionTotals[k] || 0) + v;
        }
      }
      // Sort descending — largest contributor stacks at the bottom
      const regions = Object.keys(regionTotals)
        .filter(r => (regionTotals[r] || 0) > 0)
        .sort((a, b) => (regionTotals[b] || 0) - (regionTotals[a] || 0));

      if (!regions.length) { container.innerHTML = '<div class="sg-empty">No data in selected range</div>'; return; }

      const sgColors = sgBuildColorMap();

      // Chart chrome (background/gridlines/text) follows the active theme, read live from
      // the same CSS custom properties the rest of the page uses (shared/theme.ts) — region
      // band colors themselves stay fixed (sgColors) regardless of theme.
      const themeVars = getComputedStyle(document.documentElement);
      const cssVar = name => themeVars.getPropertyValue(name).trim();
      const sgBg = cssVar('--bg-base');
      const sgPlotBg = cssVar('--surface-0');
      const sgGridline = cssVar('--border-subtle');
      const sgAxisLine = cssVar('--border');
      const sgAxisText = cssVar('--text-faint');
      const sgLegendText = cssVar('--text-secondary');

      const stacks = rawData.map(d => {
        let cum = 0;
        const items = regions.map(r => {
          const v = d[r] || 0; const lo = cum; cum += v; return { lo, hi: cum, v };
        });
        return { items, total: cum };
      });

      const maxTotal = stacks.reduce((m, st) => Math.max(m, st.total), 0);
      if (maxTotal === 0) { container.innerHTML = '<div class="sg-empty">No data in selected range</div>'; return; }

      // ── Layout ────────────────────────────────────────────────────────────────
      const W = Math.max(400, container.clientWidth || 800);
      const H = Math.max(240, container.clientHeight || 320);
      const IPR = Math.max(2, Math.min(5, Math.floor((W - 72) / 130)));
      const LEGEND_H = Math.ceil(regions.length / IPR) * 20 + 10;
      const MT = 14, MR = 16, MB = 44 + LEGEND_H, ML = 52;
      const PW = W - ML - MR, PH = H - MT - MB;
      if (PW < 40 || PH < 40) { container.innerHTML = '<div class="sg-empty">Chart area too small</div>'; return; }

      const BW = PW / buckets.length;
      const xc = j => ML + (j + 0.5) * BW;
      const yv = frac => MT + PH * (1 - Math.max(0, Math.min(1, frac)));
      const nv = (v, total) => opts.normalized ? (total > 0 ? v / total : 0) : (maxTotal > 0 ? v / maxTotal : 0);
      const T = 1 / 6;  // catmull-rom tension

      // In normalized mode split on zero-total buckets so we get vertical edges rather
      // than a taper to zero. In absolute mode a single run spanning all buckets.
      const runs = opts.normalized ? sgFindRuns(stacks) : [{ start: 0, end: stacks.length - 1 }];

      // ── SVG ───────────────────────────────────────────────────────────────────
      const sv = [];
      sv.push('<svg xmlns="http://www.w3.org/2000/svg" width="' + W + '" height="' + H + '" style="display:block">');
      sv.push('<rect width="' + W + '" height="' + H + '" fill="' + sgBg + '"/>');
      sv.push('<rect x="' + ML + '" y="' + MT + '" width="' + PW + '" height="' + PH + '" fill="' + sgPlotBg + '" rx="1"/>');

      // Y-axis gridlines
      const ySteps = Math.min(5, Math.floor(PH / 35));
      for (let i = 0; i <= ySteps; i++) {
        const frac = i / ySteps;
        const gy = yv(frac).toFixed(1);
        let lbl;
        if (opts.normalized) {
          lbl = Math.round(frac * 100) + '%';
        } else {
          const rv = frac * maxTotal;
          lbl = opts.mode === 'time' ? (rv < 10 ? rv.toFixed(1) + 'h' : Math.round(rv) + 'h') : Math.round(rv).toString();
        }
        sv.push('<line x1="' + ML + '" y1="' + gy + '" x2="' + (ML + PW) + '" y2="' + gy + '" stroke="' + sgGridline + '" stroke-width="1"/>');
        sv.push('<text x="' + (ML - 5) + '" y="' + (parseFloat(gy) + 4).toFixed(1) + '" text-anchor="end" fill="' + sgAxisText + '" font-size="10" font-family="var(--font-body)">' + lbl + '</text>');
      }

      // Clip path prevents smoothed curves from rendering outside the plot area
      sv.push('<defs><clipPath id="sg-plot"><rect x="' + ML + '" y="' + MT + '" width="' + PW + '" height="' + PH + '"/></clipPath></defs>');

      // Band paths — one <path> per region per run
      sv.push('<g clip-path="url(#sg-plot)">');
      for (let ri = 0; ri < regions.length; ri++) {
        const color = sgColors[regions[ri]] || '#94a3b8';
        for (const run of runs) {
          // Flat edge extensions: hold the first/last bucket value at the run boundary.
          // For absolute mode (single run) these land on ML and ML+PW (full chart edges).
          const lx = ML + run.start * BW;
          const rx = ML + (run.end + 1) * BW;
          const hiPts = [{ x: lx, y: yv(nv(stacks[run.start].items[ri].hi, stacks[run.start].total)) }];
          const loPts = [{ x: lx, y: yv(nv(stacks[run.start].items[ri].lo, stacks[run.start].total)) }];
          for (let j = run.start; j <= run.end; j++) {
            hiPts.push({ x: xc(j), y: yv(nv(stacks[j].items[ri].hi, stacks[j].total)) });
            loPts.push({ x: xc(j), y: yv(nv(stacks[j].items[ri].lo, stacks[j].total)) });
          }
          hiPts.push({ x: rx, y: yv(nv(stacks[run.end].items[ri].hi, stacks[run.end].total)) });
          loPts.push({ x: rx, y: yv(nv(stacks[run.end].items[ri].lo, stacks[run.end].total)) });

          // Upper boundary forward (smooth) + lower boundary reversed (exact same curve,
          // opposite direction — guaranteed no gaps between stacked bands)
          const d = sgCrPath(hiPts, T) + sgCrReverseSuffix(loPts, T) + ' Z';
          sv.push('<path d="' + d + '" fill="' + color + '" fill-opacity="0.82"/>');
        }
      }
      sv.push('</g>');

      // Axes
      sv.push('<line x1="' + ML + '" y1="' + MT + '" x2="' + ML + '" y2="' + (MT + PH) + '" stroke="' + sgAxisLine + '" stroke-width="1"/>');
      sv.push('<line x1="' + ML + '" y1="' + (MT + PH) + '" x2="' + (ML + PW) + '" y2="' + (MT + PH) + '" stroke="' + sgAxisLine + '" stroke-width="1"/>');

      // X-axis labels
      const maxXTicks = Math.max(2, Math.floor(PW / 55));
      const tickStep = Math.max(1, Math.ceil(buckets.length / maxXTicks));
      for (let j = 0; j < buckets.length; j += tickStep) {
        const tx = xc(j).toFixed(1);
        sv.push('<line x1="' + tx + '" y1="' + (MT + PH) + '" x2="' + tx + '" y2="' + (MT + PH + 4) + '" stroke="' + sgAxisLine + '" stroke-width="1"/>');
        sv.push('<text x="' + tx + '" y="' + (MT + PH + 15) + '" text-anchor="middle" fill="' + sgAxisText + '" font-size="10" font-family="var(--font-body)">' + buckets[j].label + '</text>');
      }

      // Legend (in sorted order, colors are stable per region name)
      const itemW = Math.floor(PW / IPR);
      const legendTop = MT + PH + 34;
      for (let ri = 0; ri < regions.length; ri++) {
        const lx2 = ML + (ri % IPR) * itemW;
        const ly = legendTop + Math.floor(ri / IPR) * 20;
        sv.push('<rect x="' + lx2 + '" y="' + (ly - 9) + '" width="11" height="11" rx="2" fill="' + (sgColors[regions[ri]] || '#94a3b8') + '" fill-opacity="0.85"/>');
        sv.push('<text x="' + (lx2 + 14) + '" y="' + ly + '" fill="' + sgLegendText + '" font-size="11" font-family="var(--font-body)">' + regions[ri] + '</text>');
      }

      sv.push('</svg>');
      sv.push('<div id="sg-tooltip" style="display:none;position:absolute;pointer-events:none"></div>');
      container.innerHTML = sv.join('');

      // Hover tooltip
      const svg = container.querySelector('svg');
      const tooltip = container.querySelector('#sg-tooltip');
      svg.addEventListener('mousemove', evt => {
        const svgRect = svg.getBoundingClientRect();
        const mouseX = (evt.clientX - svgRect.left) * W / svgRect.width;
        if (mouseX < ML || mouseX > ML + PW) { tooltip.style.display = 'none'; return; }
        const j = Math.max(0, Math.min(buckets.length - 1, Math.floor((mouseX - ML) / BW)));
        const st = stacks[j];
        if (st.total === 0) { tooltip.style.display = 'none'; return; }
        const vals = regions.map((r, ri) => ({ r, v: st.items[ri].v })).filter(x => x.v > 0).sort((a, b) => b.v - a.v);
        if (!vals.length) { tooltip.style.display = 'none'; return; }
        let html = '<div class="sg-tt-header">' + buckets[j].label + '</div>';
        for (const { r, v } of vals) {
          let valStr;
          if (opts.normalized) {
            valStr = (v / st.total * 100).toFixed(1) + '%';
          } else if (opts.mode === 'time') {
            valStr = v < 10 ? v.toFixed(1) + ' h' : Math.round(v) + ' h';
          } else {
            valStr = Math.round(v).toString();
          }
          html += '<div class="sg-tt-row"><span class="sg-tt-dot" style="background:' + (sgColors[r] || '#94a3b8') + '"></span><span class="sg-tt-name">' + r + '</span><span class="sg-tt-val">' + valStr + '</span></div>';
        }
        tooltip.innerHTML = html;
        tooltip.style.display = 'block';
        const cRect = container.getBoundingClientRect();
        let tx = evt.clientX - cRect.left + 14;
        const ttW = tooltip.offsetWidth || 150;
        if (tx + ttW > container.clientWidth - 8) tx = evt.clientX - cRect.left - ttW - 14;
        tooltip.style.left = tx + 'px';
        tooltip.style.top = Math.max(0, evt.clientY - cRect.top - 12) + 'px';
      });
      svg.addEventListener('mouseleave', () => { tooltip.style.display = 'none'; });
    }

    // Wires the Mode / Scale / Interval / home base buttons in toolbar (#streamgraph-toolbar):
    // each click updates opts (see renderStreamGraph) and calls onChange().
    function wireStreamGraphToolbar(toolbar, opts, onChange) {
      function group(attr, apply) {
        const btns = toolbar.querySelectorAll('.sg-toggle[' + attr + ']');
        btns.forEach(btn => {
          btn.addEventListener('click', () => {
            apply(btn);
            btns.forEach(b => b.classList.remove('active'));
            btn.classList.add('active');
            onChange();
          });
        });
      }
      group('data-sg-mode', btn => { opts.mode = btn.dataset.sgMode; });
      group('data-sg-norm', btn => { opts.normalized = btn.dataset.sgNorm === 'pct'; });
      group('data-sg-iv',   btn => { opts.interval = btn.dataset.sgIv; });
      // The home base toggle is labeled with the base's name when there's one, and hidden
      // when there are none. REGIONS must already be loaded.
      const bases = homeBaseNames();
      toolbar.querySelectorAll('[data-sg-home-base]').forEach(el => { if (!bases.length) el.style.display = 'none'; });
      const homeLabel = toolbar.querySelector('#sg-home-base-label');
      if (homeLabel && bases.length) homeLabel.textContent = bases.length === 1 ? bases[0] : 'Home bases';
      const homeBtn = toolbar.querySelector('#sg-home-base-btn');
      if (homeBtn) {
        homeBtn.addEventListener('click', () => {
          opts.showHomeBase = !opts.showHomeBase;
          homeBtn.classList.toggle('active', opts.showHomeBase);
          homeBtn.textContent = opts.showHomeBase ? 'On' : 'Off';
          onChange();
        });
      }
    }
  `;
}

export function analyticsScriptsStreamgraph(): string {
  return `
    // ── Stream graph state ────────────────────────────────────────────────────
    const sgOpts = { mode: 'time', normalized: false, interval: 'auto', showHomeBase: true };

    function updateStreamGraph() {
      if (document.getElementById('streamgraph-container').style.display === 'none') return;
      renderStreamGraph(document.getElementById('streamgraph-chart'),
        filteredFlights.length ? filteredFlights : allFlights, sgOpts);
    }

    function wireSgControls() {
      wireStreamGraphToolbar(document.getElementById('streamgraph-toolbar'), sgOpts, updateStreamGraph);
      const chart = document.getElementById('streamgraph-chart');
      if (chart && window.ResizeObserver) {
        new ResizeObserver(() => updateStreamGraph()).observe(chart);
      }
      // The chart's background/gridlines/text are drawn as literal SVG colors (not CSS),
      // so a theme toggle needs an explicit redraw to pick up the new custom-property values.
      if (window.MutationObserver) {
        new MutationObserver(() => updateStreamGraph())
          .observe(document.documentElement, { attributes: true, attributeFilter: ['data-theme'] });
      }
    }
  `;
}
