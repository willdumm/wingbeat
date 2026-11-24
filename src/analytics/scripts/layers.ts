/**
 * Analytics map layers: endpoint heatmap, route heatmap, flight lines and region
 * boundaries, each drawn on a MapLibre map passed in (addMapShape() in shared/maplibre.ts,
 * core's layer specs from @wingbeat/core/map-layers), plus the legend wiring that toggles
 * them. The docs-site showcase (src/showcase/) draws the same layers from sample data. Needs
 * REGIONS (region.ts); the points come from @wingbeat/core/analytics (endpointHeatPointsIn,
 * interpolateRoutePoints).
 */
export function analyticsScriptsLayers(): string {
  return `
    // ── Layers ────────────────────────────────────────────────────────────────
    // Each returns a handle with remove() (addMapShape()'s), or null when there is nothing
    // to draw. Stacked region fills, path density, flight lines, then endpoint heat on top.

    // Heat at flight endpoints, weighted by attributed flight hours (mode 'time') or by
    // stop count (mode 'stops').
    function addEndpointHeat(mapObj, flights, mode) {
      const placed = endpointHeatPointsIn(REGIONS, flights, mode);
      if (placed.length === 0) return null;
      return addMapShape(mapObj, placed.map(p => _ftPointFeature(p, { weight: p[2] })), [endpointHeatLayer()],
        { z: 3, source: endpointHeatSource() });
    }

    // One MultiPoint, not a Feature per point: a few hundred flights interpolate to
    // hundreds of thousands of points, and MapLibre copies each Feature to its worker.
    function addRouteHeat(mapObj, flights) {
      const points = interpolateRoutePoints(flights);
      if (points.length === 0) return null;
      const feature = { type: 'Feature', properties: { weight: 1 },
        geometry: { type: 'MultiPoint', coordinates: points.map(p => [p[1], p[0]]) } };
      return addMapShape(mapObj, [feature], [routeHeatLayer()], { z: 1 });
    }

    function addFlightLines(mapObj, flights) {
      const color = getAccentColor();
      const features = flights
        .filter(f => (f.points ?? []).length > 1)   // manual flights: no track
        .map(f => _ftLineFeature(f.points.map(p => [p.lat, p.lon]), { color }));
      return features.length ? addMapShape(mapObj, features, [flightLinesLayer()], { z: 2 }) : null;
    }

    // A polygon's center, as Leaflet put a region's tooltip: its outer ring's centroid (the
    // first polygon's, for a MultiPolygon), [lon, lat].
    function _regionCenter(geometry) {
      const ring = geometry.type === 'MultiPolygon' ? geometry.coordinates[0][0] : geometry.coordinates[0];
      let a = 0, x = 0, y = 0;
      for (let i = 0, j = ring.length - 1; i < ring.length; j = i++) {
        const f = ring[j][0] * ring[i][1] - ring[i][0] * ring[j][1];
        a += f;
        x += (ring[j][0] + ring[i][0]) * f;
        y += (ring[j][1] + ring[i][1]) * f;
      }
      return a ? [x / (3 * a), y / (3 * a)] : ring[0];
    }

    // The regions' outlines, with a region's name at its center while the pointer is over it
    // (or after a tap on it).
    function addRegionBounds(mapObj, regions) {
      const polygons = ((regions && regions.features) || [])
        .filter(f => f.geometry && (f.geometry.type === 'Polygon' || f.geometry.type === 'MultiPolygon'));
      if (!polygons.length) return null;
      const color = getAccentColor();
      const shape = addMapShape(mapObj,
        polygons.map((f, i) => ({ type: 'Feature', properties: { color, idx: i }, geometry: f.geometry })),
        [regionFillLayer(), regionOutlineLayer()]);
      const fillId = shape.id + '-region-fill';
      let tip = null, tipIdx = null;
      function hideTip() {
        if (tip) tip.remove();
        tip = null; tipIdx = null;
      }
      function onPointer(e) {
        const hit = mapObj.getLayer(fillId) ? mapObj.queryRenderedFeatures(e.point, { layers: [fillId] })[0] : null;
        if (!hit) { hideTip(); return; }
        const idx = hit.properties.idx;
        if (idx === tipIdx) return;
        hideTip();
        const f = polygons[idx];
        tipIdx = idx;
        tip = new maplibregl.Popup({ closeButton: false, closeOnClick: false, anchor: 'center', className: 'map-hover-tip' })
          .setLngLat(_regionCenter(f.geometry))
          .setHTML(escHtml(regionDisplayName(f.properties.Name)))
          .addTo(mapObj);
      }
      mapObj.on('mousemove', onPointer);
      mapObj.on('click', onPointer);
      mapObj.getCanvas().addEventListener('mouseleave', hideTip);
      return {
        remove() {
          mapObj.off('mousemove', onPointer);
          mapObj.off('click', onPointer);
          mapObj.getCanvas().removeEventListener('mouseleave', hideTip);
          hideTip();
          shape.remove();
        },
      };
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
