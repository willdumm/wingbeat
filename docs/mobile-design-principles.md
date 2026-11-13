# Wingbeat app: design principles

How the app (`apps/mobile`) looks and is built, and why. The plan is `docs/mobile-app-plan.md`;
its parity list ("Feature parity with the web") names the native element each feature uses.
This doc holds the rules those choices follow. Add a rule here when a decision settles one,
with the date and, where the user made it, their words.

## 1. Native first: use the platform's control, don't imitate it

> "I'd prefer to use the native elements generally, instead of mimicking them." (the user,
> 2026-11-13)

- Use the system's control wherever one exists: tabs, stack headers, sheets, menus, pickers,
  switches, date pickers, forms, alerts, share and context menus. On iOS that's SwiftUI
  through `@expo/ui/swift-ui`, on Android Jetpack Compose through `@expo/ui/jetpack-compose`.
  A control built from React Native views to look like a system one is a bug to fix, not a
  style (see "Known debt" below).
- When a native control behaves differently from what we'd design, take the native behavior.
  The flight detail's sheet covers the tab bar, because sheets do ("it would be fine if it
  covered the tab bar"), and a hand-built RN bottom panel was rejected for the native sheet.
- React Native views are for what has no system equivalent: the map, its markers and the
  floating chrome over it (the status top bar, the day banner), and dense custom rows (the
  flight list, see 4).
- Before writing a control, check `@expo/ui` for it in the installed version
  (`apps/mobile/node_modules/@expo/ui/build/{universal,swift-ui,jetpack-compose}/`) and the
  docs (docs.expo.dev, SDK 58), not memory: it grows every SDK.

## 2. Android is a target from the start, even before we build for it

The app ships on iOS first ("iOS only for now"), but every choice must have an Android answer
written down, so Android is a port of the UI layer, not a redesign.

- **One component, two native implementations.** Each native piece lives in one place in
  `src/lib/` with one props interface. When the platforms need different code, split it into
  `name.ios.tsx` and `name.android.tsx` (Metro picks the file), never `Platform.OS` branches
  scattered through screens. Screens don't import `@expo/ui/swift-ui` or
  `@expo/ui/jetpack-compose` directly; they use the shared component. (Today several do:
  "Known debt".)
- **The universal layer first** (`import … from '@expo/ui'`: `BottomSheet`, `Picker`,
  `Switch`, `List`, `ListItem`, `TextInput`, `Icon`, …), which renders SwiftUI on iOS and
  Compose on Android from one tree. Drop to a platform layer only for what the universal one
  lacks (detents and background interaction on a sheet, glass buttons, `LabeledContent`).
- **Icons:** SF Symbols on iOS, Material Symbols on Android, named in pairs (as `NativeTabs`
  does with `sf=` / `md=`, and the universal `Icon`). `SFIcon`'s letter fallback is a
  placeholder until Android is built.
- **Every row of the parity list** names its Android counterpart. When one has no good
  counterpart in `@expo/ui` (a persistent bottom sheet, charts), say so there, so the gap is
  planned rather than found.

The usual pairs:

| Concept | iOS (SwiftUI) | Android (Compose / platform) |
|---|---|---|
| Tabs | `NativeTabs` (system tab bar, glass) | `NativeTabs` (Material `NavigationBar`) |
| Screen header and its buttons | native stack header, bar buttons | native stack (Material top app bar), action items |
| Menu from a button | `Menu` | `DropdownMenu` anchored to an `IconButton` |
| One of a few (inline) | `Picker` (`segmented`) | `SingleChoiceSegmentedButtonRow` |
| One of many | `Picker` (`inline` / `menu` / `navigationLink`) | `ExposedDropdownMenuBox`, or `RadioButton` rows |
| Many of many | `Toggle` rows in a `Form`, or `Picker` in a `Menu` | `Checkbox` rows, `MultiChoiceSegmentedButtonRow`, `Chip`s |
| On/off | `Toggle` | `Switch` |
| Date / time | `DatePicker` (`graphical`, `compact`) | `DatePicker` (Material date and time picker dialogs) |
| Form of fields | `Form` + `Section` + `LabeledContent` | `LazyColumn` of `ListItem` (headline, supporting, trailing) |
| Modal sheet | `BottomSheet` + `presentationDetents` | `ModalBottomSheet` (universal `BottomSheet`: half / full) |
| Sheet over a map (persistent) | `BottomSheet`, undismissable, background interactive | no `@expo/ui` component yet (Compose's `BottomSheetScaffold`): open, see 3 |
| Floating map buttons | glass buttons (`buttonStyle('glass')`, iOS 26) | small `FloatingActionButton`s / filled tonal `IconButton`s |
| Confirm / destructive choice | `Alert.alert`, `ConfirmationDialog` | `Alert.alert` (Material `AlertDialog`) |
| Row actions | `SwipeActions`, `ContextMenu` | long-press `DropdownMenu` (no swipe actions in Material) |
| Pull to refresh | `RefreshControl` | `RefreshControl` (`PullToRefreshBox`) |
| Share / copy | `ShareLink`, `expo-clipboard` | `Share.share`, `expo-clipboard` |
| Empty state | `ContentUnavailableView` | a centered `Column` (no Material equivalent) |
| Charts | Swift Charts (`Chart`) | none in `@expo/ui`: open, see the parity list |

## 3. A sheet over a map, as Maps shows a place

The pattern for any page whose subject has a place (`map-sheet.tsx`; the flight detail now,
later a tracker, a named point, a region):

- The map fills the screen; a native sheet sits over it with detents **peek** (100 pt, the
  title), **medium** and **large**. It can't be dismissed, and the map stays interactive
  through medium.
- The sheet's head is the title, a one-line summary and the actions (Edit); a `Form` follows.
- The map keeps its subject above the sheet: `onDetent` refits at peek and medium (not at
  large), and `LiveMap`'s ref takes `flyTo` / `fitBounds(…, { bottom })` with
  `sheetDetentHeight()`.
- The map tools ride on top of the sheet (`onHeight`, from `onGeometryChange`). It's a little
  jerky; "fine for now".
- The page hides the tab bar (`NativeTabs hidden`, `(tabs)/_layout.tsx`).
- UIKit can't present a modal over a presented sheet, so an action that opens a modal closes
  the sheet first and opens the modal on its dismissal.
- A transient detail (the location sheet from a status card) is an ordinary dismissable sheet
  at medium and large.

Android: a Compose `ModalBottomSheet` is modal, so it can't be the persistent sheet. Until
`@expo/ui` has a persistent one, the candidates are a small native module wrapping
`BottomSheetScaffold`, or the universal `BottomSheet` (half / full) with the map behind it not
interactive. Decide when Android is built, and keep `MapSheet`'s props the same either way.

## 4. Share code and UI so a feature looks and works the same everywhere

> "Always, keep in mind the ideal of sharing code and UI elements between different parts of
> the app for a consistent experience, where it makes sense." (the user, 2026-11-13)

- **Logic in core.** What the web and the app both decide (what a status card says, how end
  markers group, a location's rows and links, a day's flight numbering, filters, duty, flight
  edits) is in `@wingbeat/core`, and both call it. The app's `src/lib` holds only app logic.
  Only the UI is written twice.
- **One component per concept in the app.** One map (`LiveMap`, used by Live and the flight
  detail, with `topBar` / `overlay`, `tools`, `sheetHeight`, `fit` and the ref), one map-tool
  column (`MapTools`), one sheet over a map (`MapSheet`), one way to show a location
  (`LocationSheet`), one day picker. A new screen that needs one of these takes it, with a
  prop if needed, rather than a copy.
- **The same thing looks the same.** A tracker is the same color everywhere (core's
  `trackerColor()`: its marker, its card's tail pill, its track, the day legend). A status dot
  means the same as on the web (`src/shared/status.ts`): only IN FLIGHT and fresh GPS get one,
  and a tracker's color is never a dot (the user read the dot as freshness).
- **Tokens, never literals.** Colors, radii, spacing and shadows come from `useTokens()` /
  `px()` (`src/lib/theme.ts`, from `@wingbeat/core/tokens`), as the web's do.

## 5. Surfaces over the map

- Floating chrome (the status top bar, the day banner) uses `surface-float` with a
  `glass-border` border and `shadow-md`. A SwiftUI material blur was tried and dropped.
- Map tools are a column of round glass buttons at the map's bottom left, each a native menu;
  an active tool's button is prominent in the accent.
- The status card: the tail on a pill in the tracker's color; IN FLIGHT / ON GROUND and the GPS
  age; altitude, speed and place on the first line when they fit. That's measured off-screen
  (an unseen copy), so where the text goes can't change what's measured and the layout can't
  oscillate.

## 6. Native-layout lessons

Things that cost a device run each to learn:

- iOS native tabs draw the tab bar, and the native stack its header, **over** the screen.
- With no header, the native top inset is 0: floor it with `react-native-safe-area-context`.
  Measure insets with a full-screen `SafeAreaView`.
- The first `ScrollView` in a tab screen gets automatic insets; opt out with
  `contentInsetAdjustmentBehavior="never"` where the screen places it itself.
- MapLibre's ornaments (compass, attribution) are already inside the map's own safe area: don't
  add our insets to them. The attribution can't follow a sheet, so on a page with one it goes
  top left.
- A SwiftUI `Host` under the status bar needs `ignoreSafeArea`; inside a `Pressable` it needs
  `pointerEvents="none"` so the Pressable gets the touch.
- MapLibre symbol text needs a glyphs URL, so numbered markers are `Marker` views.
- Glass button styles need iOS 26.

## 7. Known debt (things that break these rules today)

Fix these as their screens are next touched; the parity list carries them too.

- **Hand-built lists:** `choice-list.tsx` (`ListSection`, `ListRow`, `ChoiceSection`) draws
  iOS grouped lists in RN views. Settings, the filter sheet and the assignment edit use it.
  They become `Form`s: `Picker`s for single choices, `Toggle` rows for multi-choice,
  `Button(role: destructive)` rows, and a context menu instead of touch-and-hold on accounts.
- **Header buttons:** `HeaderButton` is RN text in the header; use the native stack's own bar
  button items.
- **Screens importing SwiftUI directly** (`live/index.tsx`'s Day menu, `flights/[id].tsx`'s
  form, `live-map.tsx`'s Layers menu): move each behind a shared component with an
  `.android.tsx` twin when Android starts.
- **No pull to refresh** on the flight list (`RefreshControl` is native on both platforms).
- **Empty states** are RN text; `ContentUnavailableView` on iOS.
