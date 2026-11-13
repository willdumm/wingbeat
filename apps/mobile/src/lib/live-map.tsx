/**
 * The map of the Live tab and the flight detail: the basemap and overlays the user picked
 * (map-style.ts), points in their colors (each tracker's position, or a flight's start and
 * end, numbered when `label` is set) and tracks (each flight in progress, a day's
 * flights, or the one flight). The tools along the left edge (map-tools.tsx) start with
 * Layers, which picks the basemap and toggles the overlays; picking a basemap resets the
 * overlays to that basemap's defaults, as on the web. Each account keeps its choice, between
 * launches too (prefs.ts), and the Live tab and the flight detail share it.
 */
import { useImperativeHandle, useMemo, useRef, useState, type ReactNode, type Ref } from 'react';
import { PixelRatio, Platform, Text, View } from 'react-native';
import { Camera, GeoJSONSource, Layer, Map, Marker, type CameraRef, type InitialViewState } from '@maplibre/maplibre-react-native';
import type { TileOverlay } from '@wingbeat/core/api/bootstrap';
import { useHeaderHeight } from 'expo-router/react-navigation';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { useAccounts } from './accounts-context';
import { MapTools, mapToolsWidth, PanelRow, PanelSection, type MapTool } from './map-tools';
import { defaultBasemapId, defaultOverlayIds, liveMapStyle, type MapBasemap } from './map-style';
import { accountPrefKey, parseMapChoice } from './prefs';
import { useStoredState } from './stored-state';
import { px, useTokens } from './theme';

export interface LiveMapRef {
  flyTo(center: [number, number]): void;
  /** [west, south, east, north] */
  fitBounds(bounds: [number, number, number, number]): void;
}

/** Room around fitted bounds: clear of the tool column on the left. */
const FIT_PADDING = { top: 48, right: 40, bottom: 40, left: 72 };

interface LiveMapProps {
  basemaps: MapBasemap[];
  overlays: TileOverlay[];
  origin: string;
  initialView: InitialViewState;
  positions: GeoJSON.FeatureCollection;
  tracks: GeoJSON.FeatureCollection;
  /** Tools after Layers. */
  tools?: MapTool[];
  /** Shown along the top, right of the tools (under an open panel). */
  banner?: ReactNode;
  ref?: Ref<LiveMapRef>;
}

export function LiveMap({ basemaps, overlays, origin, initialView, positions, tracks, tools = [], banner, ref }: LiveMapProps) {
  const t = useTokens();
  const camera = useRef<CameraRef>(null);
  const [height, setHeight] = useState(0);
  // iOS draws the stack header over the screen (the map shows through it); Android lays the
  // screen out below it. Without a header (the Live tab), the map runs under the status bar.
  const headerHeight = useHeaderHeight();
  const insets = useSafeAreaInsets();
  const toolsTop = (Platform.OS === 'ios' ? Math.max(headerHeight, insets.top) : headerHeight ? 0 : insets.top) + px(t['space-2']);
  const panelMaxHeight = Math.max(160, height - toolsTop - px(t['space-3']));
  const { active } = useAccounts();
  const [choice, setChoice] = useStoredState(active ? accountPrefKey(active.host, active.user.id, 'map') : null, parseMapChoice);
  const basemap = basemaps.find((b) => b.id === choice.basemap) ?? basemaps.find((b) => b.id === defaultBasemapId(basemaps)) ?? null;
  const onIds = choice.overlays ?? defaultOverlayIds(overlays, basemap?.id ?? null);

  useImperativeHandle(ref, () => ({
    flyTo: (center) => camera.current?.flyTo({ center, zoom: 10, duration: 800 }),
    fitBounds: (bounds) => camera.current?.fitBounds(bounds, { padding: FIT_PADDING, duration: 800 }),
  }), []);

  const layersTool: MapTool = {
    id: 'layers',
    icon: 'square.3.layers.3d',
    label: 'Layers',
    panel: () => (
      <>
        {basemaps.length > 1 && (
          <PanelSection title="Basemap">
            {basemaps.map((b) => (
              <PanelRow key={b.id} label={b.label} on={b.id === basemap?.id} onPress={() => setChoice({ basemap: b.id, overlays: null })} />
            ))}
          </PanelSection>
        )}
        {overlays.length > 0 && (
          <PanelSection title="Overlays">
            {overlays.map((o) => (
              <PanelRow key={o.id} label={o.label} on={onIds.includes(o.id)}
                onPress={() => setChoice({ basemap: basemap?.id ?? null, overlays: onIds.includes(o.id) ? onIds.filter((id) => id !== o.id) : [...onIds, o.id] })} />
            ))}
          </PanelSection>
        )}
      </>
    ),
  };

  const pixelRatio = PixelRatio.get();
  const mapStyle = useMemo(() => liveMapStyle({
    basemap,
    overlays: overlays.filter((o) => onIds.includes(o.id)),
    origin,
    pixelRatio,
    background: t['surface-2'],
  }), [basemap, overlays, onIds.join(','), origin, pixelRatio, t]);

  return (
    <View style={{ flex: 1 }} onLayout={(e) => setHeight(e.nativeEvent.layout.height)}>
      <Map style={{ flex: 1 }} mapStyle={mapStyle} logo={false} compass>
        <Camera ref={camera} initialViewState={initialView} />
        <GeoJSONSource id="tracks" data={tracks}>
          <Layer id="tracks" type="line" layout={{ 'line-cap': 'round', 'line-join': 'round' }}
            paint={{ 'line-color': ['get', 'color'], 'line-width': 3 }} />
        </GeoJSONSource>
        <GeoJSONSource id="positions" data={positions}>
          <Layer id="positions" type="circle" filter={['!', ['has', 'label']]} paint={{
            'circle-color': ['get', 'color'],
            'circle-radius': ['case', ['get', 'inFlight'], 9, 7],
            'circle-stroke-color': t['surface-1'],
            'circle-stroke-width': 2.5,
          }} />
        </GeoJSONSource>
        {/* Numbered points as views: text on the map itself would need a glyph server. */}
        {positions.features.flatMap((f) => f.geometry.type === 'Point' && f.properties?.label != null ? [
          <Marker key={String(f.id)} id={'label-' + f.id} lngLat={f.geometry.coordinates as [number, number]}>
            <View style={{
              minWidth: 22, height: 22, borderRadius: 11, paddingHorizontal: 5, alignItems: 'center', justifyContent: 'center',
              backgroundColor: f.properties.color, borderWidth: 2, borderColor: t['surface-1'],
            }}>
              <Text style={{ fontSize: 12, fontWeight: '700', color: t['accent-fg'] }}>{f.properties.label}</Text>
            </View>
          </Marker>,
        ] : [])}
      </Map>
      {banner && (
        <View style={{ position: 'absolute', top: toolsTop, left: mapToolsWidth(t), right: px(t['space-3']), alignItems: 'flex-start' }}>
          {banner}
        </View>
      )}
      <MapTools tools={[...(basemaps.length + overlays.length > 1 ? [layersTool] : []), ...tools]} top={toolsTop} maxHeight={panelMaxHeight} />
    </View>
  );
}
