/**
 * The elevation tool (the web's): with it on, the map is tinted by each spot's elevation
 * against a reference (green below, white level, red above, within the range picked; water
 * clear), drawn natively by MapLibre's color-relief layer from the same DEM. A tap sets the
 * reference: a track point's recorded altitude when one is near, else the DEM's at the tap.
 * A crosshair at the middle of the view reads the elevation under it, and the readout shows
 * it with the reference's. Range and opacity are kept per account (prefs.ts).
 */
import { useEffect, useRef, useState } from 'react';
import { Text, View } from 'react-native';
import { GeoJSONSource, Layer, RasterDEMSource } from '@maplibre/maplibre-react-native';
import { Button, Section, Toggle } from '@expo/ui/swift-ui';
import { elevationReferenceLayer, elevationReliefLayer, ELEVATION_DEM_SOURCE } from '@wingbeat/core/map-layers';
import { toFeet } from '@wingbeat/core/format';
import { useAccounts } from './accounts-context';
import { ChoicePicker } from './choice-list';
import { ElevationReader, type ElevationReaderRef } from './elevation-reader';
import { nearestPick, type TrackPick } from './live';
import type { MapTool } from './map-tools';
import { accountPrefKey, ELEVATION_OPACITIES, ELEVATION_RANGES_M, parseElevationPref } from './prefs';
import { useStoredState } from './stored-state';
import { px, shadow, useTokens } from './theme';

interface Reference {
  lngLat: [number, number];
  m: number;
}

/**
 * picks: the track points a tap snaps to. center: the crosshair's spot on the map, where
 * the readout reads.
 */
export function useElevationTool({ picks, center }: {
  picks: TrackPick[];
  center: () => Promise<{ lngLat: [number, number]; zoom: number } | null>;
}) {
  const { active: account } = useAccounts();
  const [pref, setPref] = useStoredState(account ? accountPrefKey(account.host, account.user.id, 'elevation') : null, parseElevationPref);
  const [on, setOn] = useState(false);
  const [reference, setReference] = useState<Reference | null>(null);
  const [readout, setReadout] = useState<number | null | undefined>(undefined);
  const reader = useRef<ElevationReaderRef>(null);

  // run: bumped each time the tool turns on or off, so a read or tap from before is dropped.
  const run = useRef(0);
  // One read at a time while the map moves; a move during a read reads again after it.
  const busy = useRef(false);
  const again = useRef(false);
  const readCenter = async () => {
    if (!on) return;
    if (busy.current) { again.current = true; return; }
    const mine = run.current;
    busy.current = true;
    try {
      do {
        again.current = false;
        const c = await center();
        const m = c && await reader.current?.elevationAt(c.lngLat, c.zoom);
        if (run.current !== mine) return;
        setReadout(m ?? null);
      } while (again.current);
    } finally {
      if (run.current === mine) busy.current = false;
    }
  };
  useEffect(() => {
    run.current++;
    busy.current = again.current = false;
    if (on) readCenter(); else setReadout(undefined);
  }, [on]);

  // The latest tap wins, even when an earlier one's DEM read answers after it.
  const taps = useRef(0);
  /** A tap on the map while the tool is on: sets the reference. */
  const press = async (lngLat: [number, number], zoom: number) => {
    const tap = ++taps.current;
    const mine = run.current;
    const pick = nearestPick(lngLat, zoom, picks);
    if (pick?.point.e != null) {
      setReference({ lngLat: [pick.point.lon, pick.point.lat], m: pick.point.e });
      return;
    }
    const m = await reader.current?.elevationAt(lngLat, zoom);
    if (m != null && taps.current === tap && run.current === mine) setReference({ lngLat, m });
  };

  const tool: MapTool = {
    id: 'elevation',
    icon: 'mountain.2',
    label: 'Elevation',
    active: on,
    menu: (
      <>
        <Toggle label="Elevation Tint" isOn={on} onIsOnChange={setOn} />
        {on && (
          <Section>
            <ChoicePicker label="Range" value={pref.rangeM} onChange={(rangeM) => setPref({ ...pref, rangeM })}
              choices={ELEVATION_RANGES_M.map((m) => ({ value: m, label: '±' + toFeet(m) }))} />
            <ChoicePicker label="Opacity" value={pref.opacity} onChange={(opacity) => setPref({ ...pref, opacity })}
              choices={ELEVATION_OPACITIES.map((o) => ({ value: o, label: o + '%' }))} />
            {reference && <Button label="Clear Reference" systemImage="xmark.circle" onPress={() => setReference(null)} />}
          </Section>
        )}
      </>
    ),
  };

  return { on, tool, press, readCenter, reference, readout, pref, reader };
}

export type ElevationTool = ReturnType<typeof useElevationTool>;

/** live-map's lowest layer (its tracks), always mounted. */
const BELOW_LAYER = 'tracks';

const dem = ELEVATION_DEM_SOURCE;

/**
 * The tint and the reference's dot, inside the Map, under the tracks and markers. They mount
 * when the tool turns on, after live-map's layers, so MapLibre would add them on top: beforeId
 * puts them under its lowest layer instead.
 */
export function ElevationLayers({ tool }: { tool: ElevationTool }) {
  const t = useTokens();
  if (!tool.on || !tool.reference) return null;
  return (
    <>
      <RasterDEMSource id="elevation" tiles={[...dem.tiles]} maxzoom={dem.maxzoom} tileSize={dem.tileSize} encoding={dem.encoding}
        attribution={dem.attribution}>
        {/* The ramp, rebuilt around each reference. */}
        <Layer {...elevationReliefLayer(tool.reference.m, tool.pref.rangeM, tool.pref.opacity)} beforeId={BELOW_LAYER} />
      </RasterDEMSource>
      <GeoJSONSource id="elevation-reference" data={{ type: 'Feature', geometry: { type: 'Point', coordinates: tool.reference.lngLat }, properties: {} }}>
        <Layer {...elevationReferenceLayer(t['text-primary'], t['surface-1'])} beforeId={BELOW_LAYER} />
      </GeoJSONSource>
    </>
  );
}

/**
 * The crosshair at center (map px), the readout at the top right (clear of a back button at
 * the top left), and the hidden DEM reader. onReadoutHeight: so the compass can move below it.
 */
export function ElevationChrome({ tool, center, top, side, onReadoutHeight }: {
  tool: ElevationTool;
  center: { x: number; y: number };
  top: number;
  side: number;
  onReadoutHeight: (height: number) => void;
}) {
  const t = useTokens();
  if (!tool.on) return null;
  const here = tool.readout === undefined ? '…' : tool.readout === null ? 'No data' : toFeet(tool.readout);
  const arm = 11;
  const line = { position: 'absolute' as const, backgroundColor: t['text-primary'], boxShadow: `0 0 0 1px ${t['surface-1']}` };
  return (
    <>
      <ElevationReader ref={tool.reader} />
      <View pointerEvents="none" style={{ position: 'absolute', left: center.x - arm, top: center.y - arm, width: arm * 2, height: arm * 2 }}>
        <View style={[line, { left: arm - 1, top: 0, width: 2, height: arm * 2 }]} />
        <View style={[line, { top: arm - 1, left: 0, height: 2, width: arm * 2 }]} />
      </View>
      <View pointerEvents="none" style={{ position: 'absolute', top, left: side, right: side, alignItems: 'flex-end' }}
        onLayout={(ev) => onReadoutHeight(ev.nativeEvent.layout.height)}>
        <View style={{
          paddingVertical: px(t['space-1']), paddingHorizontal: px(t['space-3']),
          borderRadius: px(t['radius-pill']), backgroundColor: t['surface-float'], borderWidth: 1, borderColor: t['glass-border'],
          boxShadow: shadow(t['shadow-md']),
        }}>
          <Text style={{ fontSize: 15, fontWeight: '600', color: t['text-primary'], fontVariant: ['tabular-nums'] }}>
            {here}
            <Text style={{ fontWeight: '400', color: t['text-muted'] }}>
              {tool.reference ? ' · ref ' + toFeet(tool.reference.m) : ' · tap to set reference'}
            </Text>
          </Text>
        </View>
      </View>
    </>
  );
}
