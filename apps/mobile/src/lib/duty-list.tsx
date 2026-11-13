/**
 * The duty log's month (duty.ts's DutyMonthView): the month with arrows to step it and its
 * total, the §135.267 totals as bars toward their limits, the days planned after today (the
 * current month only), then the days newest first as sticky headings with their duty or
 * rest, note and flight time, each day's flights as the flight list's rows, corrections
 * whose flight is gone and warnings (the web's red rows). Pull to refresh. Like the flight
 * list, dense custom rows in React Native (docs/mobile-design-principles.md, 1).
 */
import { useState, type ReactNode } from 'react';
import { Pressable, RefreshControl, SectionList, Text, View } from 'react-native';
import { DUTY_TOTALS_FOOTNOTE } from '@wingbeat/core/duty';
import type { DutyItem, DutyMeter, DutyMonthView } from './duty';
import { FlightRowView } from './flight-list';
import { SFIcon } from './map-tools';
import { px, useTokens } from './theme';

function MonthBar({ title, total, onPrev, onNext }: { title: string; total: string | null; onPrev: () => void; onNext: (() => void) | null }) {
  const t = useTokens();
  const arrow = (name: 'chevron.left' | 'chevron.right', fallback: string, label: string, onPress: (() => void) | null) => (
    <Pressable onPress={onPress ?? undefined} disabled={!onPress} accessibilityRole="button" accessibilityLabel={label} hitSlop={12}
      style={({ pressed }) => ({ padding: 6, opacity: !onPress ? 0.3 : pressed ? 0.5 : 1 })}>
      <SFIcon name={name} fallback={fallback} size={18} color={t['accent']} />
    </Pressable>
  );
  return (
    <View style={{ flexDirection: 'row', alignItems: 'center', paddingHorizontal: px(t['space-3']), paddingVertical: px(t['space-2']) }}>
      {arrow('chevron.left', '‹', 'Previous month', onPrev)}
      <View style={{ flex: 1, alignItems: 'center' }}>
        <Text style={{ fontSize: 17, fontWeight: '600', color: t['text-primary'] }}>{title}</Text>
        {total && <Text style={{ fontSize: 13, color: t['text-muted'], fontVariant: ['tabular-nums'] }}>{total}</Text>}
      </View>
      {arrow('chevron.right', '›', 'Next month', onNext)}
    </View>
  );
}

function Card({ title, subtitle, children }: { title: string; subtitle?: string; children: ReactNode }) {
  const t = useTokens();
  return (
    <View style={{
      marginHorizontal: px(t['space-4']), marginBottom: px(t['space-3']), padding: px(t['space-3']), gap: px(t['space-2']),
      backgroundColor: t['surface-1'], borderRadius: px(t['radius-lg']), borderWidth: 1, borderColor: t['border-subtle'],
    }}>
      <View>
        <Text style={{ fontSize: 15, fontWeight: '700', color: t['text-primary'] }}>{title}</Text>
        {subtitle && <Text style={{ fontSize: 12, color: t['text-muted'] }}>{subtitle}</Text>}
      </View>
      {children}
    </View>
  );
}

function Meter({ meter }: { meter: DutyMeter }) {
  const t = useTokens();
  const color = meter.over ? t['danger'] : t['accent'];
  return (
    <View style={{ gap: 4 }} accessible accessibilityLabel={`${meter.label}: ${meter.value} of ${meter.limit}${meter.over ? ', over' : ''}`}>
      <View style={{ flexDirection: 'row', alignItems: 'baseline', gap: 8 }}>
        <Text style={{ flex: 1, fontSize: 14, color: t['text-secondary'] }}>{meter.label}</Text>
        <Text style={{ fontSize: 14, fontWeight: meter.over ? '700' : '600', color: meter.over ? t['danger'] : t['text-primary'], fontVariant: ['tabular-nums'] }}>
          {meter.value}
          <Text style={{ fontWeight: '400', color: t['text-muted'] }}> / {meter.limit}</Text>
        </Text>
      </View>
      <View style={{ height: 6, borderRadius: 3, backgroundColor: t['surface-2'], overflow: 'hidden' }}>
        <View style={{ width: `${meter.fraction * 100}%`, height: '100%', borderRadius: 3, backgroundColor: color }} />
      </View>
    </View>
  );
}

function Item({ item, onSelect }: { item: DutyItem; onSelect: (id: number) => void }) {
  const t = useTokens();
  if (item.kind === 'flight') return <FlightRowView row={item.row} onPress={() => onSelect(item.row.id)} />;
  const warning = item.kind === 'warning';
  return (
    <View style={{
      flexDirection: 'row', gap: 6, paddingVertical: px(t['space-2']), paddingHorizontal: px(t['space-4']),
      backgroundColor: warning ? t['danger-surface'] : t['surface-1'], borderBottomWidth: 1, borderBottomColor: t['border-subtle'],
    }}>
      {warning && <SFIcon name="exclamationmark.triangle.fill" fallback="!" size={13} color={t['danger-fg']} />}
      <Text style={{ flex: 1, fontSize: 13, color: warning ? t['danger-fg'] : t['text-secondary'] }}>{item.text}</Text>
    </View>
  );
}

export function DutyList({ view, period, onPrev, onNext, notice, onSelect, onRefresh }: {
  /** null while the pilot's records haven't loaded. */
  view: DutyMonthView | null;
  /** "November 2026" */
  period: string;
  onPrev: () => void;
  /** null in the current month: planning ahead goes through Upcoming, as on the web. */
  onNext: (() => void) | null;
  /** A line over the totals (the records couldn't be fetched). */
  notice: string | null;
  onSelect: (flightId: number) => void;
  onRefresh: () => Promise<void>;
}) {
  const t = useTokens();
  const [refreshing, setRefreshing] = useState(false);
  const refresh = () => {
    setRefreshing(true);
    onRefresh().finally(() => setRefreshing(false));
  };
  const muted = { fontSize: 13, color: t['text-muted'] };

  const header = (
    <View style={{ paddingBottom: px(t['space-1']) }}>
      <MonthBar title={period} total={view?.monthTotal ?? null} onPrev={onPrev} onNext={onNext} />
      {notice && <Text style={{ ...muted, textAlign: 'center', paddingHorizontal: px(t['space-4']), paddingBottom: px(t['space-2']) }}>{notice}</Text>}
      {view && (
        <Card title={view.totalsTitle} subtitle={view.limitsLabel}>
          {view.meters.map((m) => <Meter key={m.label} meter={m} />)}
        </Card>
      )}
      {view?.isCurrentMonth && (
        <Card title="Upcoming">
          {view.upcoming.length ? view.upcoming.map((u) => (
            <View key={u.dayKey} style={{ flexDirection: 'row', gap: 8 }}>
              <Text style={{ width: 92, fontSize: 14, fontWeight: '600', color: t['text-primary'] }}>{u.title}</Text>
              <View style={{ flex: 1 }}>
                <Text style={{ fontSize: 14, color: t['text-secondary'], fontStyle: u.rest ? 'italic' : 'normal' }}>{u.duty}</Text>
                {u.note && <Text style={muted}>{u.note}</Text>}
              </View>
            </View>
          )) : <Text style={muted}>Nothing planned after today.</Text>}
        </Card>
      )}
    </View>
  );

  return (
    <SectionList
      sections={view?.days ?? []}
      keyExtractor={(item) => item.key}
      contentInsetAdjustmentBehavior="automatic"
      style={{ backgroundColor: t['bg-base'] }}
      refreshControl={<RefreshControl refreshing={refreshing} onRefresh={refresh} />}
      stickySectionHeadersEnabled
      ListHeaderComponent={header}
      renderSectionHeader={({ section }) => (
        <View style={{
          backgroundColor: t['surface-2'], paddingVertical: px(t['space-2']), paddingHorizontal: px(t['space-4']),
          borderBottomWidth: section.data.length ? 0 : 1, borderBottomColor: t['border-subtle'],
        }}>
          <View style={{ flexDirection: 'row', alignItems: 'baseline', gap: 8 }}>
            <Text style={{ fontSize: 14, fontWeight: '700', color: t['text-primary'] }}>{section.title}</Text>
            <Text style={{ flex: 1, fontSize: 13, color: t['text-secondary'], fontStyle: section.rest ? 'italic' : 'normal' }}>{section.duty}</Text>
            {section.total && <Text style={{ fontSize: 13, fontWeight: '600', color: t['text-primary'], fontVariant: ['tabular-nums'] }}>{section.total}</Text>}
          </View>
          {section.note && <Text style={{ ...muted, fontStyle: 'italic' }}>{section.note}</Text>}
        </View>
      )}
      renderItem={({ item }) => <Item item={item} onSelect={onSelect} />}
      ListFooterComponent={view ? (
        <Text style={{ fontSize: 11, lineHeight: 16, color: t['text-muted'], padding: px(t['space-4']) }}>{DUTY_TOTALS_FOOTNOTE}</Text>
      ) : undefined}
    />
  );
}
