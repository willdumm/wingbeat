/**
 * Draws flight tracks onto a MapLibre map: a single selected flight, or every flight in a
 * day with numbered end markers that merge into pills when they overlap at the current
 * zoom. Each function takes the map and flights as arguments and returns what it added (a
 * shape from addMapShape(), DOM markers from addHtmlMarker(), both in shared/maplibre.ts),
 * leaving the caller to own them (day-view.ts / flight-list.ts keep them in dashboard
 * state; the docs-site showcase in src/showcase/ draws sample data with them). Tracks and
 * dots are core's layers (trackLayer(), trailLayer(), positionLayer()), each feature in its
 * `color`. Needs makePlaneHtml (icons.ts) and getSurfaceColor/getAccentColor/getSuccessColor/
 * getDangerColor (shared/theme.ts themeRuntimeScript).
 */
export function dashboardScriptsTrackRender(): string {
  return `
    // ── Track rendering ───────────────────────────────────────────────────────

    // Maps a flight's compact points to the shape the map hover handler expects.
    function _trackPointData(flight) {
      return (flight.points ?? []).map(p => ({
        garmin_time: p.t, velocity_kmh: p.v, elevation_m: p.e, course_deg: p.c,
        tracker_id: flight.tracker_id, flight_id: flight.id,
      }));
    }

    // Stacking of the DOM markers: planes over the end markers over the hover arrow.
    const MARKER_Z = { arrow: 1, end: 2, plane: 3 };

    // Single-flight endpoint: plain numbered circle at the actual position.
    function makeNumberHtml(n, color) {
      const sz = n >= 10 ? '9' : '11';
      return '<div style="width:20px;height:20px;border-radius:50%;background:' + color + ';border:2px solid #fff;box-shadow:0 1px 3px rgba(0,0,0,0.4);display:flex;align-items:center;justify-content:center;font-size:' + sz + 'px;font-weight:700;color:#fff;font-family:var(--font-mono);">' + n + '</div>';
    }

    // Multiple flights that land at the same place: horizontal pill of numbered
    // circles on a white background, centered at the group centroid.
    function makeGroupHtml(group) {
      // Core's END_MARKER geometry (groupEndMarkers sizes the pills from it); the pad is enough
      // to contain the 2px circle stroke inside the pill border.
      const D = 20, gap = 2, padX = 4, padY = 4;
      const w = group.length * D + (group.length - 1) * gap + padX * 2;
      const h = D + padY * 2;
      const r = D / 2;
      const circles = group.map(({ flightNum, color }, i) => {
        const cx = padX + r + i * (D + gap);
        const cy = h / 2;
        const fs = flightNum >= 10 ? 9 : 11;
        return '<circle cx="' + cx + '" cy="' + cy + '" r="' + r + '" fill="' + color + '" stroke="#fff" stroke-width="2"/>' +
          '<text x="' + cx + '" y="' + cy + '" dominant-baseline="central" text-anchor="middle" ' +
          'fill="#fff" font-size="' + fs + '" font-weight="700" font-family="var(--font-mono)">' + flightNum + '</text>';
      }).join('');
      return '<svg xmlns="http://www.w3.org/2000/svg" width="' + w + '" height="' + h + '" ' +
        'style="display:block;filter:drop-shadow(0 1px 3px rgba(0,0,0,0.3))">' +
        '<rect x="1" y="1" width="' + (w - 2) + '" height="' + (h - 2) + '" rx="' + (h / 2 - 1) + '" ' +
        'fill="white" stroke="#cbd5e1" stroke-width="1"/>' +
        circles + '</svg>';
    }

    // Tracker color legend overlaid on the map. entries: [{ label, color }].
    function buildDayViewLegend(entries) {
      const legend = document.createElement('div');
      legend.id = 'day-view-legend';
      legend.className = 'day-view-legend';
      for (const { label: lbl, color } of entries) {
        const row = document.createElement('div');
        row.className = 'dv-legend-row';
        const swatch = document.createElement('span');
        swatch.className = 'dv-legend-swatch';
        swatch.style.background = color;
        const label = document.createElement('span');
        label.className = 'dv-legend-label';
        label.textContent = lbl;
        row.appendChild(swatch);
        row.appendChild(label);
        legend.appendChild(row);
      }
      return legend;
    }

    // Groups endInfos ({ latlng, flightNum, color }) by pixel proximity at mapObj's
    // current zoom (core's groupEndMarkers) and adds one marker per group. Returns the
    // markers it added.
    function placeEndMarkers(mapObj, endInfos) {
      const groups = groupEndMarkers(endInfos.map(info => mapObj.project([info.latlng[1], info.latlng[0]])))
        .map(g => g.members.map(i => endInfos[i]));

      const markers = [];
      for (const infos of groups) {
        let markerLatLng, html;
        if (infos.length === 1) {
          markerLatLng = infos[0].latlng;
          html = makeNumberHtml(infos[0].flightNum, infos[0].color);
        } else {
          const avgLat = infos.reduce((s, m) => s + m.latlng[0], 0) / infos.length;
          const avgLon = infos.reduce((s, m) => s + m.latlng[1], 0) / infos.length;
          markerLatLng = [avgLat, avgLon];
          html = makeGroupHtml(infos);
        }
        markers.push(addHtmlMarker(mapObj, markerLatLng, html, MARKER_Z.end));
      }
      return markers;
    }

    // Draws every flight in a day (chronological order) in its tracker's color, with a
    // start dot per flight. When several trackers are present, stop numbers restart at 1
    // per tracker. End markers aren't placed here — pass the returned endInfos to
    // placeEndMarkers (and again on zoom). In-progress flights get a plane marker at their
    // tracker's live position instead of an end marker.
    // opts: { colorFor(trackerId), isInProgress(flight), livePosition(trackerId) → { lat, lon, course_deg } | null }.
    // Returns { layers, planes, endInfos, allPoints, trackerIds, latlngs, pointData, labels }:
    // layers holds the one shape every track and start dot is drawn on, planes maps
    // trackerId → plane marker (kept out of layers so the caller can track them
    // separately), and the last three are the hover-handler arrays for every point drawn.
    function drawDayTracks(mapObj, flights, { colorFor, isInProgress, livePosition }) {
      const { lines, starts, drawn, trackerIds } = dayTrackFeatures(flights, { colorFor, inProgress: isInProgress });
      const planes = {};
      const allPoints = [];
      const endInfos = [];
      const pointDataOut = [], labelsOut = [];

      for (const { flight, n, color, inProgress } of drawn) {
        const latlngs = flight.points.map(p => [p.lat, p.lon]);
        allPoints.push(...latlngs);
        pointDataOut.push(..._trackPointData(flight));
        latlngs.forEach((_, j) => {
          let ptLabel = null;
          if (j === 0) ptLabel = 'Flight ' + n + ' start';
          else if (j === latlngs.length - 1) ptLabel = inProgress ? 'Current position' : 'Flight ' + n + ' end';
          labelsOut.push(ptLabel);
        });

        if (!inProgress) {
          endInfos.push({ latlng: latlngs[latlngs.length - 1], flightNum: n, color });
        } else {
          const pos = livePosition(flight.tracker_id);
          if (pos?.lat != null) {
            planes[flight.tracker_id] = addHtmlMarker(mapObj, [pos.lat, pos.lon], makePlaneHtml(pos.course_deg ?? 0, color), MARKER_Z.plane);
          }
        }
      }

      const layers = starts.length ? [addMapShape(mapObj, [...lines, ...starts], [trackLayer(), positionLayer(getSurfaceColor())])] : [];
      return { layers, planes, endInfos, allPoints, trackerIds, latlngs: allPoints, pointData: pointDataOut, labels: labelsOut };
    }

    // Draws a tracker's ground trail (core's groundTrail) as a dotted line in its color
    // from the landing spot to a hollow dot at the tracker's current position: the pilot,
    // where the plane marker stays with the aircraft. Returns { layers, latlngs, pointData,
    // labels } (layers: its shape; the last three for the hover handler).
    function drawGroundTrail(mapObj, trail, { color, trackerId }) {
      const latlngs = trail.points.map(p => [p.lat, p.lon]);
      const { line, pilot } = groundTrailFeatures(trail, color, trackerId);
      const shape = addMapShape(mapObj, [line, pilot], [trailLayer(), positionLayer(getSurfaceColor())]);
      return {
        layers: [shape],
        latlngs,
        pointData: _trackPointData({ points: trail.points, tracker_id: trackerId }),
        labels: latlngs.map((_, j) => j === latlngs.length - 1 ? 'Current position' : 'On the ground'),
      };
    }

    // Draws one flight in the accent color with a green start dot, and optionally a red
    // end dot and a plane marker ({ lat, lon, course_deg, color }) at its live position.
    // Returns { shape, planeMarker, latlngs, pointData, labels } (shape: the track and its
    // dots; planeMarker null without a plane), or null when the flight has no points.
    function drawFlightTrack(mapObj, flight, { inProgress, showEndMarker, plane }) {
      const pts = flight.points ?? [];
      if (pts.length === 0) return null;

      const latlngs = pts.map(p => [p.lat, p.lon]);
      const { lines, dots } = flightTrackFeatures(pts, {
        track: getAccentColor(), start: getSuccessColor(), end: showEndMarker ? getDangerColor() : null,
      });
      const shape = addMapShape(mapObj, [...lines, ...dots], [trackLayer(), positionLayer(getSurfaceColor())]);

      const labels = latlngs.map((_, j) => {
        if (j === 0) return 'Flight start';
        if (j === latlngs.length - 1) return inProgress ? 'Current position' : 'Flight end';
        return null;
      });

      const planeMarker = plane
        ? addHtmlMarker(mapObj, [plane.lat, plane.lon], makePlaneHtml(plane.course_deg ?? 0, plane.color), MARKER_Z.plane)
        : null;

      return { shape, planeMarker, latlngs, pointData: _trackPointData(flight), labels };
    }
  `;
}
