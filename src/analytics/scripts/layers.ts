/**
 * Analytics map layers: endpoint heatmap, route heatmap, flight lines and region
 * boundaries, each built from flights (or regions) passed in, plus the legend wiring that
 * toggles them. Leaves adding/removing layers to the caller, so the docs-site showcase
 * (src/showcase/) draws the same layers from sample data. Needs leaflet.heat and REGIONS
 * (region.ts); the points come from @wingbeat/core/analytics (endpointHeatPointsIn,
 * interpolateRoutePoints).
 */
export function analyticsScriptsLayers(): string {
  return `
    // ── Layer builders ────────────────────────────────────────────────────────

    // Heat at flight endpoints, weighted by attributed flight hours (mode 'time') or by
    // stop count (mode 'stops'). The intensity ceiling scales with zoom so the heat reads
    // the same at every level. Returns null when there is nothing to draw.
    function buildEndpointHeatLayer(flights, mode, zoom) {
      const placed = endpointHeatPointsIn(REGIONS, flights, mode);
      if (placed.length === 0) return null;
      const max = Math.max(0.01, Math.pow(0.5, 14 - zoom) * 0.05);
      return L.heatLayer(placed, {
        radius: 30, blur: 35, max,
        gradient: { 0.4: '#6b21a8', 0.65: '#9333ea', 1.0: '#e9d5ff' },
      });
    }

    function buildRouteHeatLayer(flights) {
      return L.heatLayer(interpolateRoutePoints(flights), {
        radius: 8, blur: 10, maxZoom: 16,
        gradient: { 0.4: '#164e63', 0.65: '#0891b2', 1.0: '#a5f3fc' },
      });
    }

    function buildFlightLinesLayer(flights) {
      const group = L.layerGroup();
      for (const f of flights) {
        if (!(f.points ?? []).length) continue;   // manual flights: no track
        L.polyline((f.points ?? []).map(p => [p.lat, p.lon]), {
          color: getAccentColor(), opacity: 0.35, weight: 1.5,
        }).addTo(group);
      }
      return group;
    }

    function buildRegionBoundsLayer(regions) {
      return L.geoJSON(regions, {
        style: { color: getAccentColor(), weight: 1.5, fillOpacity: 0.06 },
        onEachFeature(feature, layer) {
          layer.bindTooltip(escHtml(regionDisplayName(feature.properties.Name)), { permanent: false, direction: 'center' });
        },
      });
    }

    // ── Legend (layer controls) ───────────────────────────────────────────────

    // Which layer toggles are on in the legend inside root.
    function getLayerToggles(root) {
      function isOn(layerId) {
        const el = root.querySelector('.layer-item[data-layer="' + layerId + '"]');
        return el ? el.classList.contains('active') : false;
      }
      return {
        endpointHeat:  isOn('endpoint-heat'),
        pathDensity:   isOn('path-density'),
        flightLines:   isOn('flight-lines'),
        regionBounds:  isOn('region-bounds'),
      };
    }

    // Wires the legend in root (#layer-controls): layer toggles call onLayerToggle(layerId),
    // the heatmap Time/Stops buttons call onWeightMode(mode), and the header collapses it.
    function wireLayerControls(root, { onLayerToggle, onWeightMode }) {
      root.querySelectorAll('.layer-item').forEach(item => {
        item.addEventListener('click', () => {
          item.classList.toggle('active');
          const layerId = item.dataset.layer;
          if (layerId === 'endpoint-heat') {
            const weightToggle = root.querySelector('#heat-weight-toggle');
            weightToggle.style.display = item.classList.contains('active') ? '' : 'none';
          }
          onLayerToggle(layerId);
        });
      });

      const legendToggle = root.querySelector('#legend-toggle');
      legendToggle.addEventListener('click', e => {
        e.stopPropagation();
        const collapsed = root.classList.toggle('collapsed');
        legendToggle.setAttribute('aria-expanded', collapsed ? 'false' : 'true');
        const chev = legendToggle.querySelector('.chevron');
        if (chev) chev.setAttribute('data-open', collapsed ? 'false' : 'true');
      });

      root.querySelectorAll('.heat-weight-btn').forEach(btn => {
        btn.addEventListener('click', () => {
          root.querySelectorAll('.heat-weight-btn').forEach(b => b.classList.remove('active'));
          btn.classList.add('active');
          onWeightMode(btn.dataset.mode);
        });
      });
    }
  `;
}
