/**
 * The map of the Live tab and the flight detail: the basemap and overlays the user picked
 * (map-style.ts), points in their colors (each tracker's position as a plane turned to its
 * course when `plane` is set, a ground trail's pilot as a hollow dot when `pilot` is, or a
 * flight's start and end, numbered when `label` is: end-markers.tsx) and tracks (each flight
 * in progress, a day's flights, or the one flight; dotted when `trail` is set: a ground trail). The map runs under the status bar, the header and the tab
 * bar; along its top go a full-width bar (the status cards) or a floating overlay (the day
 * banner), and the tools (map-tools.tsx) at its bottom left, clear of them and of a sheet
 * over its bottom (a flight's details: map-sheet.tsx). The tools start with Layers, which picks
 * the basemap and toggles the overlays; picking a basemap resets the overlays to that
 * basemap's defaults, as on the web. Then Elevation (elevation-tool.tsx), which takes the
 * map's taps while it's on. Each account keeps its choice, between
 * launches too (prefs.ts), and the Live tab and the flight detail share it.
 */
import { useEffect, useImperativeHandle, useMemo, useRef, useState, type ReactNode, type Ref } from 'react';
import { PixelRatio, StyleSheet, View } from 'react-native';
import { Camera, GeoJSONSource, Images, Layer, Map, type CameraRef, type InitialViewState, type MapRef, type ViewState } from '@maplibre/maplibre-react-native';
import type { TileOverlay } from '@wingbeat/core/api/bootstrap';
import { Picker, Section, Text as SwiftText, Toggle } from '@expo/ui/swift-ui';
import { pickerStyle, tag } from '@expo/ui/swift-ui/modifiers';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { SafeAreaView } from 'react-native-screens/experimental';
import { useAccounts } from './accounts-context';
import { ElevationChrome, ElevationLayers, useElevationTool } from './elevation-tool';
import { EndMarkers, endMarkerGroups, groupsKey, type EndMarker } from './end-markers';
import type { TrackPick } from './live';
import { MapTools, shadow, type MapTool } from './map-tools';
import { defaultBasemapId, defaultOverlayIds, liveMapStyle, type MapBasemap } from './map-style';
import { accountPrefKey, parseMapChoice } from './prefs';
import { useStoredState } from './stored-state';
import { px, useTokens } from './theme';

/** bottom: how much of the map's bottom a sheet covers (map-sheet.tsx's sheetDetentHeight), to keep the view above it. */
export interface LiveMapRef {
  flyTo(center: [number, number], options?: { bottom?: number }): void;
  /** [west, south, east, north] */
  fitBounds(bounds: [number, number, number, number], options?: { bottom?: number }): void;
  /** Pans a point hidden under the bars or a sheet to the middle of the view above it, at the same zoom. */
  reveal(lngLat: [number, number], options?: { bottom?: number }): void;
}

/** The plane markers' image: a signed distance field, tinted per tracker (scripts/gen-plane-icon.mjs). */
const IMAGES = { plane: { source: require('../../assets/plane.png'), sdf: true } };

/** Room around fitted bounds, inside the overlay and the bars: clear of the tool column on the left. */
const FIT_PADDING = { top: 24, right: 40, bottom: 24, left: 72 };

interface LiveMapProps {
  basemaps: MapBasemap[];
  overlays: TileOverlay[];
  origin: string;
  initialView: InitialViewState;
  positions: GeoJSON.FeatureCollection;
  tracks: GeoJSON.FeatureCollection;
  /** Tools after Layers. */
  tools?: MapTool[];
  /** Shown along the top, below the status bar or the header. */
  overlay?: ReactNode;
  /** A full-width bar along the top, on the floating surface (as the overlay's), running up under the status bar. */
  topBar?: ReactNode;
  /** The height of a sheet over the map's bottom (map-sheet.tsx), as it moves: the tools ride on top of it. */
  sheetHeight?: number;
  /** A tap on the map, where and at what zoom (the point picker). */
  onPress?: (lngLat: [number, number], zoom: number) => void;
  /** A long press on the map, where. */
  onLongPress?: (lngLat: [number, number]) => void;
  /** The track points drawn, which the elevation tool's reference snaps to. */
  picks?: TrackPick[];
  /** Bounds to fit once the bars and the panel are measured (a flight's track). */
  fit?: [number, number, number, number];
  ref?: Ref<LiveMapRef>;
}

export function LiveMap({ basemaps, overlays, origin, initialView, positions, tracks, tools = [], overlay, topBar, sheetHeight, fit, onPress, onLongPress, picks = [], ref }: LiveMapProps) {
  const t = useTokens();
  const camera = useRef<CameraRef>(null);
  const mapRef = useRef<MapRef>(null);
  // The insets iOS gives the screen (the bars drawn over it: status bar, header, tab bar),
  // measured by where a full-screen safe-area view lays out its content (a smaller view's
  // insets are clipped to its bounds), and where the top bar or overlay ends.
  const [{ width, height }, setSize] = useState({ width: 0, height: 0 });
  const [safe, setSafe] = useState({ y: 0, height: 0 });
  // The top floors at safe-area-context's: without a header, the native view reports none.
  const { top: statusBar } = useSafeAreaInsets();
  const insets = { top: Math.max(safe.y, statusBar), bottom: safe.height ? Math.max(0, height - safe.y - safe.height) : 0 };
  const [topEdge, setTopEdge] = useState(0);
  const gutter = px(t['space-3']);
  const top = insets.top + px(t['space-2']);
  const bottom = insets.bottom + gutter;
  // On top of the sheet, when there is one, and gone when it's pulled up past half the map.
  const toolsBottom = sheetHeight ? sheetHeight + gutter : bottom;
  const toolsShown = !sheetHeight || sheetHeight < height * 0.6;
  const { active } = useAccounts();
  const [choice, setChoice] = useStoredState(active ? accountPrefKey(active.host, active.user.id, 'map') : null, parseMapChoice);
  const basemap = basemaps.find((b) => b.id === choice.basemap) ?? basemaps.find((b) => b.id === defaultBasemapId(basemaps)) ?? null;
  const onIds = choice.overlays ?? defaultOverlayIds(overlays, basemap?.id ?? null);

  // A sheet opens at half the screen (map-sheet.tsx), so fits go in the half above it.
  const fitBottom = sheetHeight ? height / 2 : toolsBottom - gutter;
  const fitBounds = (bounds: [number, number, number, number], duration: number, bottomClear = fitBottom) => camera.current?.fitBounds(bounds, {
    padding: { ...FIT_PADDING, top: FIT_PADDING.top + Math.max(top, topEdge), bottom: FIT_PADDING.bottom + bottomClear },
    duration,
  });
  useImperativeHandle(ref, () => ({
    flyTo: (center, { bottom: bottomClear = 0 } = {}) => camera.current?.flyTo({
      center, zoom: 10, duration: 800,
      padding: { top: Math.max(top, topEdge), bottom: bottomClear, left: 0, right: 0 },
    }),
    fitBounds: (bounds, { bottom: bottomClear } = {}) => fitBounds(bounds, 800, bottomClear),
    reveal: async (lngLat, { bottom: bottomClear = 0 } = {}) => {
      const topClear = Math.max(top, topEdge);
      const [x, y] = await mapRef.current?.project(lngLat) ?? [0, 0];
      const margin = FIT_PADDING.bottom;
      if (x >= margin && x <= width - margin && y >= topClear + margin && y <= height - bottomClear - margin) return;
      camera.current?.easeTo({ center: lngLat, duration: 400, padding: { top: topClear, bottom: bottomClear, left: 0, right: 0 } });
    },
  }), [top, topEdge, fitBottom, width, height]);
  const fitted = useRef(false);
  const measured = safe.height > 0;
  useEffect(() => {
    if (!fit || !measured || fitted.current) return;
    fitted.current = true;
    fitBounds(fit, 0);
  }, [fit, measured]);

  const layersTool: MapTool = {
    id: 'layers',
    icon: 'square.3.layers.3d',
    label: 'Layers',
    menu: (
      <>
        {basemaps.length > 1 && (
          <Picker label="Basemap" selection={basemap?.id ?? null} modifiers={[pickerStyle('inline')]}
            onSelectionChange={(id: string | null) => setChoice({ basemap: id, overlays: null })}>
            {basemaps.map((b) => <SwiftText key={b.id} modifiers={[tag(b.id)]}>{b.label}</SwiftText>)}
          </Picker>
        )}
        {overlays.length > 0 && (
          <Section title="Overlays">
            {overlays.map((o) => (
              <Toggle key={o.id} label={o.label} isOn={onIds.includes(o.id)}
                onIsOnChange={(on) => setChoice({ basemap: basemap?.id ?? null, overlays: on ? [...onIds, o.id] : onIds.filter((id) => id !== o.id) })} />
            ))}
          </Section>
        )}
      </>
    ),
  };

  // Numbered points, regrouped into pills whenever the view changes which ones overlap.
  const ends = useMemo(() => positions.features.flatMap((f): EndMarker[] =>
    f.geometry.type === 'Point' && f.properties?.label != null
      ? [{ id: String(f.id), lngLat: f.geometry.coordinates as [number, number], label: String(f.properties.label), color: f.properties.color }]
      : []), [positions]);
  const [view, setView] = useState<Pick<ViewState, 'zoom' | 'bearing'> | null>(null);
  const groups = view ? endMarkerGroups(ends, view) : ends.map((_, i) => [i]);
  const lastKey = useRef('');
  const zoom = useRef(initialView && 'zoom' in initialView ? initialView.zoom ?? 0 : 0);
  useEffect(() => { lastKey.current = ''; }, [ends]);
  // The elevation crosshair: the middle of the view between the bars and a sheet.
  const crosshair = { x: width / 2, y: (Math.max(top, topEdge) + height - (sheetHeight ?? insets.bottom)) / 2 };
  const elevation = useElevationTool({
    picks,
    center: async () => {
      const lngLat = await mapRef.current?.unproject([crosshair.x, crosshair.y]);
      return lngLat ? { lngLat: [lngLat[0], lngLat[1]], zoom: zoom.current } : null;
    },
  });
  const onView = ({ nativeEvent: v }: { nativeEvent: ViewState }) => {
    zoom.current = v.zoom;
    elevation.readCenter();
    const key = groupsKey(endMarkerGroups(ends, v));
    if (key === lastKey.current && view) return;
    lastKey.current = key;
    setView({ zoom: v.zoom, bearing: v.bearing });
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
    <View style={{ flex: 1 }} onLayout={(e) => setSize(e.nativeEvent.layout)}>
      <SafeAreaView edges={{ top: true, bottom: true }} pointerEvents="none" style={StyleSheet.absoluteFill}>
        <View style={{ flex: 1 }} onLayout={(e) => setSafe({ y: e.nativeEvent.layout.y, height: e.nativeEvent.layout.height })} />
      </SafeAreaView>
      {/* MapLibre places its ornaments within the map's own safe area (inside the bars), so
          their offsets don't add our insets again. With a sheet, the attribution goes top left:
          the sheet isn't part of the map's safe area. */}
      <Map ref={mapRef} style={StyleSheet.absoluteFill} mapStyle={mapStyle} logo={false}
        compass compassPosition={{ top: Math.max(top, topEdge) - insets.top + px(t['space-2']), right: gutter }}
        attributionPosition={sheetHeight ? { top: Math.max(top, topEdge) - insets.top + px(t['space-2']), left: gutter } : { bottom: px(t['space-2']), right: gutter }} onRegionIsChanging={onView} onRegionDidChange={onView}
        onPress={(e) => (elevation.on ? elevation.press(e.nativeEvent.lngLat, zoom.current) : onPress?.(e.nativeEvent.lngLat, zoom.current))}
        onLongPress={onLongPress && ((e) => onLongPress(e.nativeEvent.lngLat))}>
        <Camera ref={camera} initialViewState={initialView} />
        <Images images={IMAGES} />
        <ElevationLayers tool={elevation} />
        <GeoJSONSource id="tracks" data={tracks}>
          <Layer id="tracks" type="line" filter={['!', ['has', 'trail']]} layout={{ 'line-cap': 'round', 'line-join': 'round' }}
            paint={{ 'line-color': ['get', 'color'], 'line-width': 3 }} />
          {/* The web's dotted ground trail (dashes are in line widths). */}
          <Layer id="trails" type="line" filter={['has', 'trail']} layout={{ 'line-cap': 'round', 'line-join': 'round' }}
            paint={{ 'line-color': ['get', 'color'], 'line-width': 3, 'line-opacity': 0.9, 'line-dasharray': [0.3, 2.3] }} />
        </GeoJSONSource>
        <GeoJSONSource id="positions" data={positions}>
          <Layer id="positions" type="circle" filter={['all', ['!', ['has', 'label']], ['!', ['has', 'plane']]]} paint={{
            'circle-color': ['case', ['has', 'pilot'], t['surface-1'], ['get', 'color']],
            'circle-radius': ['case', ['has', 'pilot'], 6, 7],
            'circle-stroke-color': ['case', ['has', 'pilot'], ['get', 'color'], t['surface-1']],
            'circle-stroke-width': ['case', ['has', 'pilot'], 3, 2.5],
          }} />
          <Layer id="planes" type="symbol" filter={['has', 'plane']} layout={{
            'icon-image': 'plane',
            'icon-size': 1 / 3,
            'icon-rotate': ['get', 'course'],
            'icon-rotation-alignment': 'map',
            'icon-allow-overlap': true,
            'icon-ignore-placement': true,
          }} paint={{
            'icon-color': ['get', 'color'],
            'icon-halo-color': t['surface-1'],
            'icon-halo-width': 1.5,
          }} />
        </GeoJSONSource>
        <EndMarkers ends={ends} groups={groups} />
      </Map>
      {topBar ? (
        <View style={{ position: 'absolute', top: 0, left: 0, right: 0, paddingTop: insets.top }}
          onLayout={(ev) => setTopEdge(ev.nativeEvent.layout.height)}>
          <View style={[StyleSheet.absoluteFill, {
            backgroundColor: t['surface-float'], borderBottomWidth: 1, borderBottomColor: t['glass-border'], boxShadow: shadow(t['shadow-md']),
          }]} />
          {topBar}
        </View>
      ) : overlay ? (
        <View style={{ position: 'absolute', top, left: gutter, right: gutter, alignItems: 'center' }}
          onLayout={(ev) => setTopEdge(top + ev.nativeEvent.layout.height)}>
          {overlay}
        </View>
      ) : null}
      <ElevationChrome tool={elevation} center={crosshair} top={Math.max(top, topEdge) + px(t['space-2'])} />
      {toolsShown && <MapTools tools={[...(basemaps.length + overlays.length > 1 ? [layersTool] : []), elevation.tool, ...tools]} left={gutter} bottom={toolsBottom} />}
    </View>
  );
}
