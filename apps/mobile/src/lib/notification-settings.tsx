/**
 * Settings → Notifications' form: the alerts feed, then takeoff, landing and signal gap for
 * every tracker, which of them this phone gets as Time Sensitive, and the events per tracker,
 * as SwiftUI `Toggle` rows. A tracker's row is on, and fixed, while its event is on for every
 * tracker (docs/mobile-app-plan.md, "Subscriptions and devices").
 */
import { Form, Host, Section, Text, Toggle } from '@expo/ui/swift-ui';
import { disabled } from '@expo/ui/swift-ui/modifiers';
import type { TrackerPushEvent } from '@wingbeat/core/api/push';
import { isSubscribed, type Subscription } from './push-route';

const TRACKER_EVENTS = [
  { event: 'takeoff', label: 'Takeoff' },
  { event: 'landing', label: 'Landing' },
  { event: 'gap', label: 'Signal Gap' },
] as const;

export function NotificationSettings({ trackers, subscriptions, timeSensitive, busy, onChange, onTimeSensitiveChange }: {
  trackers: { id: number; label: string }[];
  subscriptions: Subscription[];
  timeSensitive: TrackerPushEvent[];
  busy: boolean;
  onChange: (sub: Subscription, on: boolean) => void;
  onTimeSensitiveChange: (event: TrackerPushEvent, on: boolean) => void;
}) {
  const row = (sub: Subscription, label: string) => {
    const covered = sub.tracker_id !== null && isSubscribed(subscriptions, { ...sub, tracker_id: null });
    return (
      <Toggle key={sub.event} label={label} isOn={isSubscribed(subscriptions, sub)}
        modifiers={covered ? [disabled(true)] : undefined} onIsOnChange={(on) => onChange(sub, on)} />
    );
  };
  return (
    <Host style={{ flex: 1 }}>
      <Form modifiers={[disabled(busy)]}>
        <Section footer={<Text>Maintenance coming due and duty limits being approached, as in the Flights tab’s alerts. Other devices signed in to this account have their own notification settings.</Text>}>
          {row({ tracker_id: null, event: 'alerts' }, 'Alerts')}
        </Section>
        <Section title="All Trackers" footer={<Text>Signal gap: a tracker in flight stops reporting, then when it resumes or the alerts stop.</Text>}>
          {TRACKER_EVENTS.map(({ event, label }) => row({ tracker_id: null, event }, label))}
        </Section>
        <Section title="Time Sensitive" footer={<Text>These get through Focus and stay on the Lock Screen longer. For this iPhone, on every account.</Text>}>
          {TRACKER_EVENTS.map(({ event, label }) => (
            <Toggle key={event} label={label} isOn={timeSensitive.includes(event)} onIsOnChange={(on) => onTimeSensitiveChange(event, on)} />
          ))}
        </Section>
        {trackers.map((tr) => (
          <Section key={tr.id} title={tr.label}>
            {TRACKER_EVENTS.map(({ event, label }) => row({ tracker_id: tr.id, event }, label))}
          </Section>
        ))}
      </Form>
    </Host>
  );
}
