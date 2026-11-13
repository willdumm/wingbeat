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
import { Button, Picker, Section, Text as SwiftText, Toggle } from '@expo/ui/swift-ui';
import { pickerStyle, tag } from '@expo/ui/swift-ui/modifiers';
import { DEM_PMTILES_URL, elevationRampStops } from '@wingbeat/core/elevation';
import { toFeet } from '@wingbeat/core/format';
import { useAccounts } from './accounts-context';
import { ElevationReader, type ElevationReaderRef } from './elevation-reader';
import { nearestPick, type TrackPick } from './live';
import { shadow, type MapTool } from './map-tools';
import { accountPrefKey, ELEVATION_OPACITIES, ELEVATION_RANGES_M, parseElevationPref } from './prefs';
import { useStoredState } from './stored-state';
import { px, useTokens } from './theme';

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

  // One read at a time while the map moves; the last move's read runs after the one in flight.
  const reading = useRef<'idle' | 'busy' | 'again'>('idle');
  const readCenter = async () => {
    if (!on) return;
    if (reading.current !== 'idle') { reading.current = 'again'; return; }
    try {
      do {
        reading.current = 'busy';
        const c = await center();
        const m = c && await reader.current?.elevationAt(c.lngLat, c.zoom);
        setReadout(m ?? null);
      } while ((reading.current as string) === 'again');
    } finally {
      reading.current = 'idle';
    }
  };
  useEffect(() => { if (on) readCenter(); else setReadout(undefined); }, [on]);

  /** A tap on the map while the tool is on: sets the reference. */
  const press = async (lngLat: [number, number], zoom: number) => {
    const pick = nearestPick(lngLat, zoom, picks);
    if (pick?.point.e != null) {
      setReference({ lngLat: [pick.point.lon, pick.point.lat], m: pick.point.e });
      return;
    }
    const m = await reader.current?.elevationAt(lngLat, zoom);
    if (m != null) setReference({ lngLat, m });
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
            <Picker label="Range" selection={pref.rangeM} modifiers={[pickerStyle('menu')]}
              onSelectionChange={(rangeM: number) => setPref({ ...pref, rangeM })}>
              {ELEVATION_RANGES_M.map((m) => <SwiftText key={m} modifiers={[tag(m)]}>{'±' + toFeet(m)}</SwiftText>)}
            </Picker>
            <Picker label="Opacity" selection={pref.opacity} modifiers={[pickerStyle('menu')]}
              onSelectionChange={(opacity: number) => setPref({ ...pref, opacity })}>
              {ELEVATION_OPACITIES.map((o) => <SwiftText key={o} modifiers={[tag(o)]}>{o + '%'}</SwiftText>)}
            </Picker>
            {reference && <Button label="Clear Reference" systemImage="xmark.circle" onPress={() => setReference(null)} />}
          </Section>
        )}
      </>
    ),
  };

  return { on, tool, press, readCenter, reference, readout, pref, reader };
}

export type ElevationTool = ReturnType<typeof useElevationTool>;

/** The tint and the reference's dot, inside the Map (under the tracks). */
export function ElevationLayers({ tool }: { tool: ElevationTool }) {
  const t = useTokens();
  if (!tool.on || !tool.reference) return null;
  const color = ['interpolate', ['linear'], ['elevation'], ...elevationRampStops(tool.reference.m, tool.pref.rangeM).flatMap(([m, rgb]) =>
    [m, rgb ? `rgb(${rgb.join(',')})` : 'rgba(0,0,0,0)'])];
  return (
    <>
      <RasterDEMSource id="elevation" url={'pmtiles://' + DEM_PMTILES_URL} tileSize={512} encoding="terrarium">
        <Layer id="elevation" type="color-relief" paint={{
          // The ramp, rebuilt around each reference.
          'color-relief-color': color as never,
          'color-relief-opacity': tool.pref.opacity / 100,
        }} />
      </RasterDEMSource>
      <GeoJSONSource id="elevation-reference" data={{ type: 'Feature', geometry: { type: 'Point', coordinates: tool.reference.lngLat }, properties: {} }}>
        <Layer id="elevation-reference" type="circle" paint={{
          'circle-radius': 5, 'circle-color': t['text-primary'], 'circle-stroke-color': t['surface-1'], 'circle-stroke-width': 2,
        }} />
      </GeoJSONSource>
    </>
  );
}

/** The crosshair at center (map px), the readout at top, and the hidden DEM reader. */
export function ElevationChrome({ tool, center, top }: { tool: ElevationTool; center: { x: number; y: number }; top: number }) {
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
      <View pointerEvents="none" style={{ position: 'absolute', top, left: 0, right: 0, alignItems: 'center' }}>
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
