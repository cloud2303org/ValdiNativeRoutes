import type { DatePickMode } from 'native_common/src/pickerSchemas';
import { createMemo, createSignal, For, onCleanup, Show } from 'solid-js';
import type { SolidPageProps } from 'solid_native/src/bridge';
import { getHost as getThemeHost } from 'theme_bridge/src/ThemeBridge';
import type { ThemeColorTokens, ThemeTokens } from 'theme_bridge/src/host';
import { Device } from 'valdi_core/src/Device';
import { Style } from 'valdi_core/src/Style';
import { systemBoldFont, systemFont } from 'valdi_core/src/SystemFont';
import type { Label, ScrollView, View } from 'valdi_tsx/src/NativeTemplateElements';

import type { PickerOption } from '../AppUIHost';
import { BottomSheetProvider } from '../bottom_sheet/BottomSheetProvider';
import { ModalBottomSheet } from '../bottom_sheet/ModalBottomSheet';
import { ColumnPicker, columnPickerValue, TimePicker, timePickerValue } from '../wheels/WheelPickers';

/**
 * View model passed by native AppUI hosts to present action sheets, column pickers,
 * and date/time pickers through the single Valdi bottom-sheet rendering pipeline.
 *
 * @ViewModel
 * @ExportModel({ios: 'VRAppSheetOverlayViewModel', android: 'io.valdiroutes.app_ui.AppSheetOverlayViewModel'})
 */
export interface AppSheetOverlayViewModel {
  open: boolean;
  /** 'actionSheet' | 'picker' | 'datePicker' */
  kind: string;
  title: string;
  confirmText: string;
  cancelText: string;
  items: string[];
  options: PickerOption[];
  value: string;
  dateMode: string;
  minYear: number;
  maxYear: number;
  bottomInset: number;
}

/**
 * Callback context wired to AppUI presentation completion on Android and iOS.
 *
 * @Context
 * @ExportModel({ios: 'VRAppSheetOverlayContext', android: 'io.valdiroutes.app_ui.AppSheetOverlayContext'})
 */
export interface AppSheetOverlayContext {
  onSelect: (index: number) => void;
  onConfirm: (value: string, index: number) => void;
  onCancel: () => void;
  onDismissed: () => void;
}

type SheetPalette = Pick<
  ThemeColorTokens,
  | 'surface'
  | 'text'
  | 'muted'
  | 'hairline'
  | 'handle'
  | 'scrim'
  | 'buttonPrimary'
  | 'buttonOnPrimary'
  | 'buttonSecondary'
  | 'buttonOnSecondary'
>;

let cachedTheme: ThemeTokens | undefined;
function sheetTheme(): ThemeTokens {
  return (cachedTheme ??= getThemeHost().getTokens());
}

function resolveInitialDraftValue(vm: AppSheetOverlayViewModel): string {
  if (vm.kind === 'picker') {
    return columnPickerValue(vm.options, vm.value);
  }
  if (vm.kind === 'datePicker') {
    return timePickerValue(vm.dateMode as DatePickMode, vm.value, vm.minYear, vm.maxYear);
  }
  return '';
}

const MAX_INLINE_ACTION_ITEMS = 6;

/**
 * Root Solid overlay component that renders imperative `showActionSheet`, `showPicker`,
 * and `showDatePicker` requests on top of `ModalBottomSheet` and Valdi wheel pickers.
 */
export function AppSheetOverlay(props: SolidPageProps<AppSheetOverlayViewModel, AppSheetOverlayContext>) {
  const vm = props.viewModel;
  const ctx = props.context;

  const [darkMode, setDarkMode] = createSignal(Device.isDarkMode());
  const themeObserver = Device.observeDarkMode(nextDark => {
    setDarkMode(nextDark);
  });
  onCleanup(() => {
    themeObserver?.cancel();
  });

  const [draftValue, setDraftValue] = createSignal(resolveInitialDraftValue(props.initialViewModel));
  const [closing, setClosing] = createSignal(false);
  let dismissed = false;

  if (!props.initialViewModel.open) {
    dismissed = true;
    ctx.onDismissed();
  }

  const isSheetOpen = createMemo(() => vm().open && !closing());
  const palette = createMemo<SheetPalette>(() => {
    const theme = sheetTheme();
    return darkMode() ? theme.dark : theme.light;
  });
  const bottomPad = createMemo(() => Math.max(0, vm().bottomInset) + 16);

  const handleCancel = (): void => {
    if (!isSheetOpen()) {
      return;
    }
    setClosing(true);
    ctx.onCancel();
  };

  const handleConfirmTap = (): void => {
    if (!isSheetOpen()) {
      return;
    }
    const current = vm();
    const selectedValue = draftValue();
    const selectedIndex =
      current.kind === 'picker' ? current.options.findIndex(opt => opt.value === selectedValue) : -1;
    setClosing(true);
    ctx.onConfirm(selectedValue, selectedIndex);
  };

  const selectActionAt = (index: number): void => {
    if (!isSheetOpen()) {
      return;
    }
    setClosing(true);
    ctx.onSelect(index);
  };

  const handleWheelChange = (nextValue: string): void => {
    setDraftValue(nextValue);
  };

  const handleSettle = (index: number): void => {
    if (index < 0 && !isSheetOpen() && !dismissed) {
      dismissed = true;
      ctx.onDismissed();
    }
  };

  const renderActionRows = () => (
    <For each={vm().items}>
      {(item, index) => (
        <>
          <Show when={index() > 0}>
            <view style={styles.hairline} backgroundColor={palette().hairline} />
          </Show>
          <view
            style={styles.actionRow}
            accessibilityId={`action-sheet-item-${index()}`}
            accessibilityCategory="button"
            accessibilityLabel={item}
            onTap={() => selectActionAt(index())}
          >
            <label style={styles.actionRowText} color={palette().text} value={item} />
          </view>
        </>
      )}
    </For>
  );

  const renderActionSheetBody = () => (
    <view style={styles.sheetBody} paddingBottom={bottomPad()}>
      <view style={styles.handleRow}>
        <view style={styles.handle} backgroundColor={palette().handle} />
      </view>
      <Show when={vm().title.length > 0}>
        <view style={styles.actionTitleWrap}>
          <label style={styles.actionTitle} color={palette().text} value={vm().title} />
        </view>
      </Show>
      <Show
        when={vm().items.length > MAX_INLINE_ACTION_ITEMS}
        fallback={<view style={styles.actionListInline}>{renderActionRows()}</view>}
      >
        <scroll style={styles.actionListScroll}>{renderActionRows()}</scroll>
      </Show>
      <view style={styles.cancelButtonWrap}>
        <view
          style={styles.secondaryButton}
          backgroundColor={palette().buttonSecondary}
          accessibilityId="sheet-cancel-button"
          accessibilityCategory="button"
          accessibilityLabel={vm().cancelText}
          onTap={handleCancel}
        >
          <label style={styles.buttonLabel} color={palette().buttonOnSecondary} value={vm().cancelText} />
        </view>
      </view>
    </view>
  );

  const renderPickerBody = () => (
    <view style={styles.sheetBody} paddingBottom={bottomPad()}>
      <view style={styles.handleRow}>
        <view style={styles.handle} backgroundColor={palette().handle} />
      </view>
      <Show when={vm().title.length > 0}>
        <view style={styles.pickerTitleWrap}>
          <label style={styles.pickerTitle} color={palette().text} value={vm().title} />
        </view>
      </Show>
      <view style={styles.wheelWrap}>
        <Show
          when={vm().kind === 'picker'}
          fallback={
            <TimePicker
              mode={vm().dateMode as DatePickMode}
              value={draftValue()}
              minYear={vm().minYear}
              maxYear={vm().maxYear}
              onChange={handleWheelChange}
            />
          }
        >
          <ColumnPicker options={vm().options} value={draftValue()} onChange={handleWheelChange} />
        </Show>
      </view>
      <view style={styles.footerRow}>
        <view
          style={styles.footerButton}
          backgroundColor={palette().buttonSecondary}
          accessibilityId="sheet-cancel-button"
          accessibilityCategory="button"
          accessibilityLabel={vm().cancelText}
          onTap={handleCancel}
        >
          <label style={styles.buttonLabel} color={palette().buttonOnSecondary} value={vm().cancelText} />
        </view>
        <view style={styles.footerGap} />
        <view
          style={styles.footerButton}
          backgroundColor={palette().buttonPrimary}
          accessibilityId="sheet-confirm-button"
          accessibilityCategory="button"
          accessibilityLabel={vm().confirmText}
          onTap={handleConfirmTap}
        >
          <label style={styles.buttonLabel} color={palette().buttonOnPrimary} value={vm().confirmText} />
        </view>
      </view>
    </view>
  );

  return (
    <view style={styles.viewport}>
      <BottomSheetProvider>
        <ModalBottomSheet
          index={isSheetOpen() ? 0 : -1}
          detents={['content']}
          scrimColor={palette().scrim}
          scrimAccessibilityLabel={vm().cancelText}
          surfaceStyle={{
            backgroundColor: palette().surface,
            borderTopLeftRadius: sheetTheme().shared.radius.sheet,
            borderTopRightRadius: sheetTheme().shared.radius.sheet,
          }}
          onCloseRequest={handleCancel}
          onSettle={handleSettle}
        >
          <Show when={vm().kind === 'actionSheet'} fallback={renderPickerBody()}>
            {renderActionSheetBody()}
          </Show>
        </ModalBottomSheet>
      </BottomSheetProvider>
    </view>
  );
}

const styles = {
  viewport: new Style<View>({
    width: '100%',
    height: '100%',
  }),
  sheetBody: new Style<View>({
    width: '100%',
    paddingLeft: 24,
    paddingRight: 24,
  }),
  handleRow: new Style<View>({
    width: '100%',
    alignItems: 'center',
    paddingTop: 10,
    paddingBottom: 14,
  }),
  handle: new Style<View>({
    width: 36,
    height: 4,
    borderRadius: 2,
  }),
  actionTitleWrap: new Style<View>({
    width: '100%',
    paddingTop: 2,
    paddingBottom: 8,
  }),
  actionTitle: new Style<Label>({
    font: systemBoldFont(18),
    numberOfLines: 2,
  }),
  pickerTitleWrap: new Style<View>({
    width: '100%',
    alignItems: 'center',
    paddingBottom: 12,
  }),
  pickerTitle: new Style<Label>({
    font: systemBoldFont(18),
    textAlign: 'center',
    numberOfLines: 2,
  }),
  actionListInline: new Style<View>({
    width: '100%',
  }),
  actionListScroll: new Style<ScrollView>({
    width: '100%',
    height: 330,
  }),
  actionRow: new Style<View>({
    width: '100%',
    minHeight: 54,
    paddingLeft: 12,
    paddingRight: 12,
    paddingTop: 14,
    paddingBottom: 14,
    justifyContent: 'center',
  }),
  actionRowText: new Style<Label>({
    font: systemFont(16),
    numberOfLines: 2,
  }),
  hairline: new Style<View>({
    width: '100%',
    height: 1,
  }),
  cancelButtonWrap: new Style<View>({
    width: '100%',
    paddingTop: 12,
  }),
  secondaryButton: new Style<View>({
    width: '100%',
    height: 48,
    borderRadius: 14,
    alignItems: 'center',
    justifyContent: 'center',
  }),
  wheelWrap: new Style<View>({
    width: '100%',
    paddingTop: 4,
    paddingBottom: 16,
  }),
  footerRow: new Style<View>({
    width: '100%',
    flexDirection: 'row',
    alignItems: 'center',
  }),
  footerGap: new Style<View>({
    width: 12,
  }),
  footerButton: new Style<View>({
    flexGrow: 1,
    flexBasis: 0,
    height: 48,
    borderRadius: 14,
    alignItems: 'center',
    justifyContent: 'center',
  }),
  buttonLabel: new Style<Label>({
    font: systemBoldFont(16),
  }),
};
