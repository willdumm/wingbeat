/**
 * Draws flight tracks onto a Leaflet map: a single selected flight, or every flight in a
 * day with numbered end markers that merge into pills when they overlap at the current
 * zoom. Each function takes the map and flights as arguments and returns the layers it
 * added, leaving the caller to own them (day-view.ts / flight-list.ts keep them in
 * dashboard state; the docs-site showcase in src/showcase/ draws sample data with them).
 * Needs makePlaneIcon (icons.ts) and getAccentColor/getSuccessColor/getDangerColor
 * (shared/theme.ts themeRuntimeScript).
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

    // Single-flight endpoint: plain numbered circle at the actual position.
    function makeNumberIcon(n, color) {
      const sz = n >= 10 ? '9' : '11';
      return L.divIcon({
        className: '',
        html: '<div style="width:20px;height:20px;border-radius:50%;background:' + color + ';border:2px solid #fff;box-shadow:0 1px 3px rgba(0,0,0,0.4);display:flex;align-items:center;justify-content:center;font-size:' + sz + 'px;font-weight:700;color:#fff;font-family:var(--font-mono);">' + n + '</div>',
        iconSize: [20, 20],
        iconAnchor: [10, 10],
      });
    }

    // Multiple flights that land at the same place: horizontal pill of numbered
    // circles on a white background, centered at the group centroid.
    function makeGroupIcon(group) {
      const D = 20, gap = 2, padX = 4, padY = 4; // pad enough to contain the 2px circle stroke inside the pill border
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
      return L.divIcon({
        className: '',
        html: '<svg xmlns="http://www.w3.org/2000/svg" width="' + w + '" height="' + h + '" ' +
          'style="display:block;filter:drop-shadow(0 1px 3px rgba(0,0,0,0.3))">' +
          '<rect x="1" y="1" width="' + (w - 2) + '" height="' + (h - 2) + '" rx="' + (h / 2 - 1) + '" ' +
          'fill="white" stroke="#cbd5e1" stroke-width="1"/>' +
          circles + '</svg>',
        iconSize: [w, h],
        iconAnchor: [w / 2, h / 2],
      });
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
    // current zoom and adds one marker per group. Returns the markers it added.
    function placeEndMarkers(mapObj, endInfos) {
      // Pill geometry — must match makeGroupIcon.
      const D = 20, gap = 2, padX = 4, padY = 4;
      const circleR = D / 2;
      const pillHalfH = (D + 2 * padY) / 2; // = 12px

      // Half-width of a pill containing n circles.
      function pillHalfW(n) { return (n * D + (n - 1) * gap + 2 * padX) / 2; }

      // Each group tracks its infos and its running centroid in container pixels.
      const groups = []; // { infos: [...], cx: number, cy: number }

      for (const info of endInfos) {
        const pt = mapObj.latLngToContainerPoint(info.latlng);
        let placed = false;
        for (const group of groups) {
          const n = group.infos.length;
          // Interference: new circle (D×D) overlaps the existing pill (W×H).
          // Horizontal threshold = pill half-width + circle radius.
          // Vertical threshold   = pill half-height + circle radius.
          if (Math.abs(pt.x - group.cx) < pillHalfW(n) + circleR &&
              Math.abs(pt.y - group.cy) < pillHalfH + circleR) {
            group.infos.push(info);
            // Keep centroid current so the next check uses an accurate position.
            group.cx = (group.cx * n + pt.x) / (n + 1);
            group.cy = (group.cy * n + pt.y) / (n + 1);
            placed = true;
            break;
          }
        }
        if (!placed) groups.push({ infos: [info], cx: pt.x, cy: pt.y });
      }

      const markers = [];
      for (const group of groups) {
        let markerLatLng, icon;
        if (group.infos.length === 1) {
          markerLatLng = group.infos[0].latlng;
          icon = makeNumberIcon(group.infos[0].flightNum, group.infos[0].color);
        } else {
          const avgLat = group.infos.reduce((s, m) => s + m.latlng[0], 0) / group.infos.length;
          const avgLon = group.infos.reduce((s, m) => s + m.latlng[1], 0) / group.infos.length;
          markerLatLng = [avgLat, avgLon];
          icon = makeGroupIcon(group.infos);
        }
        markers.push(L.marker(markerLatLng, { icon, zIndexOffset: 1000 }).addTo(mapObj));
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
    // planes maps trackerId → plane marker (kept out of layers so the caller can track them
    // separately), and the last three are the hover-handler arrays for every point drawn.
    function drawDayTracks(mapObj, flights, { colorFor, isInProgress, livePosition }) {
      // Trackers represented in this day's flights (with points).
      const trackerIds = [...new Set(
        flights.filter(f => (f.points ?? []).length > 0).map(f => f.tracker_id)
      )];
      const multiTracker = trackerIds.length > 1;

      // Per-tracker flight counter for stop numbering.
      const perTrackerFlightNum = {};

      const layers = [];
      const planes = {};
      const allPoints = [];
      const endInfos = [];
      const latlngsOut = [], pointDataOut = [], labelsOut = [];

      for (let i = 0; i < flights.length; i++) {
        const flight = flights[i];
        const pts = flight.points ?? [];
        if (pts.length === 0) continue;

        const color = colorFor(flight.tracker_id);
        let flightNum;
        if (multiTracker) {
          perTrackerFlightNum[flight.tracker_id] = (perTrackerFlightNum[flight.tracker_id] || 0) + 1;
          flightNum = perTrackerFlightNum[flight.tracker_id];
        } else {
          flightNum = i + 1;
        }

        const latlngs = pts.map(p => [p.lat, p.lon]);
        const pointData = _trackPointData(flight);
        const inProgress = isInProgress(flight);

        const polyline = L.polyline(latlngs, {
          color, weight: 4, opacity: 0.9, lineCap: 'round', lineJoin: 'round',
        }).addTo(mapObj);
        layers.push(polyline);
        allPoints.push(...latlngs);

        latlngs.forEach((ll, j) => {
          latlngsOut.push(ll);
          pointDataOut.push(pointData[j]);
          let ptLabel = null;
          if (j === 0) ptLabel = 'Flight ' + flightNum + ' start';
          else if (j === latlngs.length - 1) ptLabel = inProgress ? 'Current position' : 'Flight ' + flightNum + ' end';
          labelsOut.push(ptLabel);
        });

        const startMarker = L.circleMarker(latlngs[0], {
          radius: 6, color: '#fff', weight: 2, fillColor: color, fillOpacity: 1,
        }).addTo(mapObj);
        layers.push(startMarker);

        if (!inProgress) {
          endInfos.push({ latlng: latlngs[latlngs.length - 1], flightNum, color });
        } else {
          const pos = livePosition(flight.tracker_id);
          if (pos?.lat != null) {
            planes[flight.tracker_id] = L.marker([pos.lat, pos.lon], {
              icon: makePlaneIcon(pos.course_deg ?? 0, color),
              zIndexOffset: 1000,
              interactive: false,
            }).addTo(mapObj);
          }
        }
      }

      return { layers, planes, endInfos, allPoints, trackerIds, latlngs: latlngsOut, pointData: pointDataOut, labels: labelsOut };
    }

    // Draws one flight in the accent color with a green start dot, and optionally a red
    // end dot and a plane marker ({ lat, lon, course_deg, color }) at its live position.
    // Returns { track, startMarker, endMarker, planeMarker, latlngs, pointData, labels }
    // (unused markers are null), or null when the flight has no points.
    function drawFlightTrack(mapObj, flight, { inProgress, showEndMarker, plane }) {
      const pts = flight.points ?? [];
      if (pts.length === 0) return null;

      const latlngs = pts.map(p => [p.lat, p.lon]);
      const track = L.polyline(latlngs, {
        color: getAccentColor(),
        weight: 4,
        opacity: 0.9,
        lineCap: 'round',
        lineJoin: 'round',
      }).addTo(mapObj);

      const labels = latlngs.map((_, j) => {
        if (j === 0) return 'Flight start';
        if (j === latlngs.length - 1) return inProgress ? 'Current position' : 'Flight end';
        return null;
      });

      const startMarker = L.circleMarker(latlngs[0], {
        radius: 7, color: '#fff', weight: 2, fillColor: getSuccessColor(), fillOpacity: 1,
      }).addTo(mapObj);

      const endMarker = showEndMarker
        ? L.circleMarker(latlngs[latlngs.length - 1], {
            radius: 7, color: '#fff', weight: 2, fillColor: getDangerColor(), fillOpacity: 1,
          }).addTo(mapObj)
        : null;

      const planeMarker = plane
        ? L.marker([plane.lat, plane.lon], {
            icon: makePlaneIcon(plane.course_deg ?? 0, plane.color),
            zIndexOffset: 1000,
            interactive: false,
          }).addTo(mapObj)
        : null;

      return { track, startMarker, endMarker, planeMarker, latlngs, pointData: _trackPointData(flight), labels };
    }
  `;
}
