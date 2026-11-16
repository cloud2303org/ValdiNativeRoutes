import type { DatePickMode } from 'native_common/src/pickerSchemas';
import { getHost as getThemeHost } from 'theme_bridge/src/ThemeBridge';
import type { ThemeColorTokens, ThemeTokens } from 'theme_bridge/src/host';
import { StatefulComponent } from 'valdi_core/src/Component';
import { Device } from 'valdi_core/src/Device';
import { Style } from 'valdi_core/src/Style';
import { systemBoldFont, systemFont } from 'valdi_core/src/SystemFont';
import { Label, ScrollView, View } from 'valdi_tsx/src/NativeTemplateElements';

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

interface AppSheetOverlayState {
  darkMode: boolean;
  draftValue: string;
  closing: boolean;
}

const MAX_INLINE_ACTION_ITEMS = 6;

/**
 * Root Valdi overlay component that renders imperative `showActionSheet`, `showPicker`,
 * and `showDatePicker` requests on top of `ModalBottomSheet` and Valdi wheel pickers.
 *
 * @Component
 */
export class AppSheetOverlay extends StatefulComponent<
  AppSheetOverlayViewModel,
  AppSheetOverlayState,
  AppSheetOverlayContext
> {
  state: AppSheetOverlayState = {
    darkMode: false,
    draftValue: '',
    closing: false,
  };

  private dismissed = false;
  private themeObserver?: ReturnType<typeof Device.observeDarkMode>;

  override onCreate(): void {
    this.state = {
      darkMode: Device.isDarkMode(),
      draftValue: resolveInitialDraftValue(this.viewModel),
      closing: false,
    };
    this.themeObserver = Device.observeDarkMode(nextDark => {
      if (nextDark !== this.state.darkMode) {
        this.setState({ darkMode: nextDark });
      }
    });
    if (!this.viewModel.open) {
      this.dismissed = true;
      this.context.onDismissed();
    }
  }

  override onDestroy(): void {
    this.themeObserver?.cancel();
    this.themeObserver = undefined;
  }

  private get isSheetOpen(): boolean {
    return this.viewModel.open && !this.state.closing;
  }

  private readonly handleCancel = (): void => {
    if (!this.isSheetOpen) {
      return;
    }
    this.setState({ closing: true });
    this.context.onCancel();
  };

  private readonly handleConfirmTap = (): void => {
    if (!this.isSheetOpen) {
      return;
    }
    const vm = this.viewModel;
    const selectedValue = this.state.draftValue;
    const selectedIndex = vm.kind === 'picker' ? vm.options.findIndex(opt => opt.value === selectedValue) : -1;
    this.setState({ closing: true });
    this.context.onConfirm(selectedValue, selectedIndex);
  };

  private selectActionAt(index: number): void {
    if (!this.isSheetOpen) {
      return;
    }
    this.setState({ closing: true });
    this.context.onSelect(index);
  }

  private readonly handleWheelChange = (nextValue: string): void => {
    if (nextValue !== this.state.draftValue) {
      this.setState({ draftValue: nextValue });
    }
  };

  private readonly handleSettle = (index: number): void => {
    if (index < 0 && !this.isSheetOpen && !this.dismissed) {
      this.dismissed = true;
      this.context.onDismissed();
    }
  };

  private renderActionRows(items: readonly string[], palette: SheetPalette): void {
    items.forEach((item, index) => {
      if (index > 0) {
        <view style={styles.hairline} backgroundColor={palette.hairline} />;
      }
      <view
        style={styles.actionRow}
        accessibilityId={`action-sheet-item-${index}`}
        accessibilityCategory="button"
        accessibilityLabel={item}
        onTap={() => this.selectActionAt(index)}
      >
        <label style={styles.actionRowText} color={palette.text} value={item} />
      </view>;
    });
  }

  private renderActionSheetBody(vm: AppSheetOverlayViewModel, palette: SheetPalette, bottomPad: number): void {
    <view style={styles.sheetBody} paddingBottom={bottomPad}>
      <view style={styles.handleRow}>
        <view style={styles.handle} backgroundColor={palette.handle} />
      </view>
      {vm.title.length > 0 && (
        <view style={styles.actionTitleWrap}>
          <label style={styles.actionTitle} color={palette.text} value={vm.title} />
        </view>
      )}
      {vm.items.length > MAX_INLINE_ACTION_ITEMS ? (
        <scroll style={styles.actionListScroll}>{this.renderActionRows(vm.items, palette)}</scroll>
      ) : (
        <view style={styles.actionListInline}>{this.renderActionRows(vm.items, palette)}</view>
      )}
      <view style={styles.cancelButtonWrap}>
        <view
          style={styles.secondaryButton}
          backgroundColor={palette.buttonSecondary}
          accessibilityId="sheet-cancel-button"
          accessibilityCategory="button"
          accessibilityLabel={vm.cancelText}
          onTap={this.handleCancel}
        >
          <label style={styles.buttonLabel} color={palette.buttonOnSecondary} value={vm.cancelText} />
        </view>
      </view>
    </view>;
  }

  private renderPickerBody(vm: AppSheetOverlayViewModel, palette: SheetPalette, bottomPad: number): void {
    <view style={styles.sheetBody} paddingBottom={bottomPad}>
      <view style={styles.handleRow}>
        <view style={styles.handle} backgroundColor={palette.handle} />
      </view>
      {vm.title.length > 0 && (
        <view style={styles.pickerTitleWrap}>
          <label style={styles.pickerTitle} color={palette.text} value={vm.title} />
        </view>
      )}
      <view style={styles.wheelWrap}>
        {vm.kind === 'picker' ? (
          <ColumnPicker options={vm.options} value={this.state.draftValue} onChange={this.handleWheelChange} />
        ) : (
          <TimePicker
            mode={vm.dateMode as DatePickMode}
            value={this.state.draftValue}
            minYear={vm.minYear}
            maxYear={vm.maxYear}
            onChange={this.handleWheelChange}
          />
        )}
      </view>
      <view style={styles.footerRow}>
        <view
          style={styles.footerButton}
          backgroundColor={palette.buttonSecondary}
          accessibilityId="sheet-cancel-button"
          accessibilityCategory="button"
          accessibilityLabel={vm.cancelText}
          onTap={this.handleCancel}
        >
          <label style={styles.buttonLabel} color={palette.buttonOnSecondary} value={vm.cancelText} />
        </view>
        <view style={styles.footerGap} />
        <view
          style={styles.footerButton}
          backgroundColor={palette.buttonPrimary}
          accessibilityId="sheet-confirm-button"
          accessibilityCategory="button"
          accessibilityLabel={vm.confirmText}
          onTap={this.handleConfirmTap}
        >
          <label style={styles.buttonLabel} color={palette.buttonOnPrimary} value={vm.confirmText} />
        </view>
      </view>
    </view>;
  }

  override onRender(): void {
    const vm = this.viewModel;
    const theme = sheetTheme();
    const palette: SheetPalette = this.state.darkMode ? theme.dark : theme.light;
    const sheetRadius = theme.shared.radius.sheet;
    const bottomPad = Math.max(0, vm.bottomInset) + 16;

    <view style={styles.viewport}>
      <BottomSheetProvider>
        <ModalBottomSheet
          index={this.isSheetOpen ? 0 : -1}
          detents={['content']}
          scrimColor={palette.scrim}
          scrimAccessibilityLabel={vm.cancelText}
          surfaceStyle={{
            backgroundColor: palette.surface,
            borderTopLeftRadius: sheetRadius,
            borderTopRightRadius: sheetRadius,
          }}
          onCloseRequest={this.handleCancel}
          onSettle={this.handleSettle}
        >
          {vm.kind === 'actionSheet'
            ? this.renderActionSheetBody(vm, palette, bottomPad)
            : this.renderPickerBody(vm, palette, bottomPad)}
        </ModalBottomSheet>
      </BottomSheetProvider>
    </view>;
  }
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
