/**
 * The map of the Live tab and the flight detail: the basemap and overlays the user picked
 * (map-style.ts), points in their colors (each tracker's position, or a flight's start and
 * end) and tracks (each flight in progress, or the one flight). The layer pills along
 * the top pick the basemap and toggle the overlays; picking a basemap resets the overlays
 * to that basemap's defaults, as on the web.
 */
import { useImperativeHandle, useMemo, useRef, useState, type Ref } from 'react';
import { PixelRatio, Pressable, ScrollView, Text, View } from 'react-native';
import { Camera, GeoJSONSource, Layer, Map, type CameraRef, type InitialViewState } from '@maplibre/maplibre-react-native';
import type { TileOverlay } from '@wingbeat/core/api/bootstrap';
import { defaultBasemapId, defaultOverlayIds, liveMapStyle, type MapBasemap } from './map-style';
import { px, useTokens } from './theme';

export interface LiveMapRef {
  flyTo(center: [number, number]): void;
}

interface LiveMapProps {
  basemaps: MapBasemap[];
  overlays: TileOverlay[];
  origin: string;
  initialView: InitialViewState;
  positions: GeoJSON.FeatureCollection;
  tracks: GeoJSON.FeatureCollection;
  ref?: Ref<LiveMapRef>;
}

function Pill({ label, on, onPress }: { label: string; on: boolean; onPress: () => void }) {
  const t = useTokens();
  return (
    <Pressable
      onPress={onPress}
      accessibilityState={{ selected: on }}
      style={{
        paddingVertical: 6, paddingHorizontal: 12, borderRadius: px(t['radius-pill']),
        backgroundColor: on ? t['accent-solid'] : t['surface-1'], borderWidth: 1, borderColor: on ? t['accent-solid'] : t['border'],
      }}
    >
      <Text style={{ fontSize: 13, fontWeight: '600', color: on ? t['accent-fg'] : t['text-secondary'] }}>{label}</Text>
    </Pressable>
  );
}

export function LiveMap({ basemaps, overlays, origin, initialView, positions, tracks, ref }: LiveMapProps) {
  const t = useTokens();
  const camera = useRef<CameraRef>(null);
  const [picked, setPicked] = useState<string | null>(null);
  const basemap = basemaps.find((b) => b.id === picked) ?? basemaps.find((b) => b.id === defaultBasemapId(basemaps)) ?? null;
  const [overlayIds, setOverlayIds] = useState<number[] | null>(null);
  const onIds = overlayIds ?? defaultOverlayIds(overlays, basemap?.id ?? null);

  useImperativeHandle(ref, () => ({
    flyTo: (center) => camera.current?.flyTo({ center, zoom: 10, duration: 800 }),
  }), []);

  const pixelRatio = PixelRatio.get();
  const mapStyle = useMemo(() => liveMapStyle({
    basemap,
    overlays: overlays.filter((o) => onIds.includes(o.id)),
    origin,
    pixelRatio,
    background: t['surface-2'],
  }), [basemap, overlays, onIds.join(','), origin, pixelRatio, t]);

  return (
    <View style={{ flex: 1 }}>
      <Map style={{ flex: 1 }} mapStyle={mapStyle} logo={false} compass>
        <Camera ref={camera} initialViewState={initialView} />
        <GeoJSONSource id="tracks" data={tracks}>
          <Layer id="tracks" type="line" layout={{ 'line-cap': 'round', 'line-join': 'round' }}
            paint={{ 'line-color': ['get', 'color'], 'line-width': 3 }} />
        </GeoJSONSource>
        <GeoJSONSource id="positions" data={positions}>
          <Layer id="positions" type="circle" paint={{
            'circle-color': ['get', 'color'],
            'circle-radius': ['case', ['get', 'inFlight'], 9, 7],
            'circle-stroke-color': t['surface-1'],
            'circle-stroke-width': 2.5,
          }} />
        </GeoJSONSource>
      </Map>
      {basemaps.length + overlays.length > 1 && (
        <ScrollView
          horizontal
          showsHorizontalScrollIndicator={false}
          style={{ position: 'absolute', top: px(t['space-2']), left: 0, right: 0 }}
          contentContainerStyle={{ gap: px(t['space-2']), paddingHorizontal: px(t['space-3']) }}
        >
          {basemaps.length > 1 && basemaps.map((b) => (
            <Pill key={b.id} label={b.label} on={b.id === basemap?.id} onPress={() => { setPicked(b.id); setOverlayIds(null); }} />
          ))}
          {overlays.map((o) => (
            <Pill key={o.id} label={o.label} on={onIds.includes(o.id)}
              onPress={() => setOverlayIds(onIds.includes(o.id) ? onIds.filter((id) => id !== o.id) : [...onIds, o.id])} />
          ))}
        </ScrollView>
      )}
    </View>
  );
}
