/**
 * A day's numbered flight ends on the map, merged into pills where they'd overlap at the
 * current zoom and split apart as the map zooms in (core's groupEndMarkers, as on the web).
 * Drawn as Marker views: text on the map itself would need a glyph server.
 */
import { Text, View } from 'react-native';
import { Marker, type ViewState } from '@maplibre/maplibre-react-native';
import { END_MARKER, groupEndMarkers, mercatorPixel } from '@wingbeat/core/live';
import { shadow, useTokens } from './theme';

export interface EndMarker {
  id: string;
  lngLat: [number, number];
  label: string;
  color: string;
}

/** The ends grouped at a view, each group as the indices of its ends. */
export function endMarkerGroups(ends: EndMarker[], view: Pick<ViewState, 'zoom' | 'bearing'>): number[][] {
  // Screen pixels up to a shift: Mercator at the zoom, turned by the map's bearing.
  const a = (-view.bearing * Math.PI) / 180;
  const points = ends.map(({ lngLat: [lon, lat] }) => {
    const { x, y } = mercatorPixel(lat, lon, view.zoom);
    return { x: x * Math.cos(a) - y * Math.sin(a), y: x * Math.sin(a) + y * Math.cos(a) };
  });
  return groupEndMarkers(points).map((g) => g.members);
}

/** The groups' identity: re-render only when it changes. */
export const groupsKey = (groups: number[][]) => groups.map((g) => g.join(',')).join(';');

export function EndMarkers({ ends, groups }: { ends: EndMarker[]; groups: number[][] }) {
  const t = useTokens();
  const { size, gap, pad } = END_MARKER;
  const circle = ({ id, label, color }: EndMarker) => (
    <View key={id} style={{
      width: size, height: size, borderRadius: size / 2, alignItems: 'center', justifyContent: 'center',
      backgroundColor: color, borderWidth: 2, borderColor: t['surface-1'],
    }}>
      <Text style={{ fontSize: label.length > 1 ? 9 : 11, fontWeight: '700', color: t['accent-fg'] }}>{label}</Text>
    </View>
  );
  return groups.map((members) => {
    const group = members.map((i) => ends[i]);
    if (group.length === 1) {
      return <Marker key={group[0].id} id={'end-' + group[0].id} lngLat={group[0].lngLat}>{circle(group[0])}</Marker>;
    }
    const lngLat: [number, number] = [
      group.reduce((s, e) => s + e.lngLat[0], 0) / group.length,
      group.reduce((s, e) => s + e.lngLat[1], 0) / group.length,
    ];
    const key = group.map((e) => e.id).join('+');
    return (
      <Marker key={key} id={'ends-' + key} lngLat={lngLat}>
        <View style={{
          flexDirection: 'row', gap, padding: pad - 1, borderRadius: size, borderWidth: 1,
          backgroundColor: t['surface-1'], borderColor: t['border'], boxShadow: shadow(t['shadow-sm']),
        }}>
          {group.map(circle)}
        </View>
      </Marker>
    );
  });
}
