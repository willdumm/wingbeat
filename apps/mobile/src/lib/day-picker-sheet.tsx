/**
 * A native calendar in a sheet, for mapping any day (the Day tool's "Choose a date…"): days
 * from the first with a flight through today. Picking one closes it.
 */
import { BottomSheet, DatePicker, Group, Host } from '@expo/ui/swift-ui';
import { datePickerStyle, padding, presentationDragIndicator } from '@expo/ui/swift-ui/modifiers';
import { dateToDayKey, dayKeyToDate } from './live';

export function DayPickerSheet({ open, dayKey, first, today, onPick, onClose }: {
  open: boolean; dayKey: string; first: string | null; today: string;
  onPick: (dayKey: string) => void; onClose: () => void;
}) {
  return (
    <Host matchContents style={{ position: 'absolute' }}>
      <BottomSheet isPresented={open} onIsPresentedChange={(shown) => { if (!shown) onClose(); }} fitToContents>
        <Group modifiers={[presentationDragIndicator('visible')]}>
          <DatePicker
            selection={dayKeyToDate(dayKey)}
            range={{ start: first ? dayKeyToDate(first) : undefined, end: dayKeyToDate(today) }}
            modifiers={[datePickerStyle('graphical'), padding()]}
            onDateChange={(date) => { onPick(dateToDayKey(date)); onClose(); }}
          />
        </Group>
      </BottomSheet>
    </Host>
  );
}
