/**
 * What a screen shows when it has nothing to show: SwiftUI's ContentUnavailableView (a
 * symbol, a title, a line under it, and an action). Android: a centered column
 * (docs/mobile-design-principles.md, 2).
 */
import { Button, ContentUnavailableView, Host, type ContentUnavailableViewProps } from '@expo/ui/swift-ui';
import { buttonStyle } from '@expo/ui/swift-ui/modifiers';

export function EmptyState({ title, description, systemImage, action }: {
  title: string;
  description?: string;
  systemImage?: ContentUnavailableViewProps['systemImage'];
  action?: { label: string; onPress: () => void };
}) {
  return (
    <Host style={{ flex: 1 }}>
      <ContentUnavailableView title={title} description={description} systemImage={systemImage}
        actions={action && <Button label={action.label} onPress={action.onPress} modifiers={[buttonStyle('borderedProminent')]} />} />
    </Host>
  );
}
