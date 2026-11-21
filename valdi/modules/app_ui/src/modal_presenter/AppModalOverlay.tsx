import { createEffect, createMemo, createSignal, onCleanup, Show } from 'solid-js';
import type { SolidPageProps } from 'solid_native/src/bridge';
import { useAnimate } from 'solid_native/src/renderer';
import { getHost as getThemeHost } from 'theme_bridge/src/ThemeBridge';
import type { ThemeColorTokens, ThemeTokens } from 'theme_bridge/src/host';
import { AnimationCurve } from 'valdi_core/src/AnimationOptions';
import { Device } from 'valdi_core/src/Device';
import { Style } from 'valdi_core/src/Style';
import { systemFont, systemSemiboldFont } from 'valdi_core/src/SystemFont';
import type { Label, ScrollView, TextField, View } from 'valdi_tsx/src/NativeTemplateElements';

/**
 * View model passed by native AppUI hosts to present centered modal dialogs and prompt
 * inputs through the single Valdi rendering pipeline.
 *
 * @ViewModel
 * @ExportModel({ios: 'VRAppModalOverlayViewModel', android: 'io.valdiroutes.app_ui.AppModalOverlayViewModel'})
 */
export interface AppModalOverlayViewModel {
  open: boolean;
  title: string;
  content: string;
  showCancel: boolean;
  confirmText: string;
  cancelText: string;
  editable: boolean;
  placeholderText: string;
  defaultText: string;
  topInset: number;
  bottomInset: number;
}

/**
 * Callback context wired to AppUI modal completion on Android and iOS.
 *
 * @Context
 * @ExportModel({ios: 'VRAppModalOverlayContext', android: 'io.valdiroutes.app_ui.AppModalOverlayContext'})
 */
export interface AppModalOverlayContext {
  onConfirm: (content: string) => void;
  onCancel: () => void;
  onDismissed: () => void;
}

type ModalPalette = Pick<
  ThemeColorTokens,
  | 'canvas'
  | 'surface'
  | 'text'
  | 'muted'
  | 'border'
  | 'scrim'
  | 'buttonPrimary'
  | 'buttonOnPrimary'
  | 'buttonSecondary'
  | 'buttonOnSecondary'
>;

let cachedTheme: ThemeTokens | undefined;
function modalTheme(): ThemeTokens {
  return (cachedTheme ??= getThemeHost().getTokens());
}

/**
 * Root Solid overlay component that renders imperative `showModal` alerts and prompts
 * across iOS and Android inside a native keyboard-aware window host.
 */
export function AppModalOverlay(props: SolidPageProps<AppModalOverlayViewModel, AppModalOverlayContext>) {
  const animate = useAnimate();
  const vm = props.viewModel;
  const ctx = props.context;

  const [darkMode, setDarkMode] = createSignal(Device.isDarkMode());
  const themeObserver = Device.observeDarkMode(nextDark => {
    setDarkMode(nextDark);
  });

  const [draftText, setDraftText] = createSignal(props.initialViewModel.defaultText);
  const [closing, setClosing] = createSignal(false);
  const [visible, setVisible] = createSignal(false);

  let dismissed = false;
  let exiting = false;
  let disposed = false;
  let dismissTimer: ReturnType<typeof setTimeout> | undefined;

  const finishDismiss = (): void => {
    if (dismissed) {
      return;
    }
    dismissed = true;
    if (dismissTimer !== undefined) {
      clearTimeout(dismissTimer);
      dismissTimer = undefined;
    }
    ctx.onDismissed();
  };

  onCleanup(() => {
    disposed = true;
    if (dismissTimer !== undefined) {
      clearTimeout(dismissTimer);
      dismissTimer = undefined;
    }
    themeObserver?.cancel();
  });

  if (!props.initialViewModel.open) {
    finishDismiss();
  }

  const isOpen = createMemo(() => vm().open && !closing());
  const palette = createMemo<ModalPalette>(() => {
    const theme = modalTheme();
    return darkMode() ? theme.dark : theme.light;
  });

  if (props.initialViewModel.open) {
    props.tree.onLayoutComplete(() => {
      if (!disposed && isOpen()) {
        animate({ duration: 0.18, curve: AnimationCurve.EaseOut }, () => {
          setVisible(true);
        });
      }
    });
  }

  // Defer NativeTree.animate() outside the reactive flush because animate() invokes solidFlush().
  createEffect(
    () => isOpen(),
    (open, prevOpen) => {
      if (!open && prevOpen === true && !exiting) {
        exiting = true;
        queueMicrotask(() => {
          if (disposed || dismissed) {
            return;
          }
          animate(
            {
              duration: 0.15,
              curve: AnimationCurve.EaseInOut,
              completion: () => finishDismiss(),
            },
            () => {
              setVisible(false);
            },
          );
          dismissTimer = setTimeout(() => {
            dismissTimer = undefined;
            finishDismiss();
          }, 220);
        });
      }
    },
  );

  const handleCancel = (): void => {
    if (!isOpen()) {
      return;
    }
    setClosing(true);
    ctx.onCancel();
  };

  const handleConfirm = (overrideText?: string): void => {
    if (!isOpen()) {
      return;
    }
    const value = vm().editable ? (overrideText ?? draftText()) : '';
    setClosing(true);
    ctx.onConfirm(value);
  };

  const hasTitle = createMemo(() => vm().title.length > 0);
  const hasContent = createMemo(() => vm().content.length > 0);
  const hasBody = createMemo(() => hasContent() || vm().editable);
  const isLongContent = createMemo(() => vm().content.length > 240 || vm().content.split('\n').length > 6);

  return (
    <view
      style={styles.viewport}
      paddingTop={Math.max(0, vm().topInset) + 24}
      paddingBottom={Math.max(0, vm().bottomInset) + 24}
      touchEnabled={isOpen()}
    >
      <view
        style={styles.scrim}
        backgroundColor={palette().scrim}
        opacity={visible() ? 1 : 0}
        accessibilityId="app-modal-scrim"
        accessibilityCategory="button"
        accessibilityLabel={vm().cancelText || '取消'}
        onTap={handleCancel}
      />

      <view
        style={styles.card}
        backgroundColor={palette().surface}
        borderColor={palette().border}
        boxShadow={darkMode() ? undefined : '0 16 24 rgba(16, 43, 82, 0.18)'}
        opacity={visible() ? 1 : 0}
        scaleX={visible() ? 1 : 0.96}
        scaleY={visible() ? 1 : 0.96}
        accessibilityId="app-modal-card"
        onTap={() => {}}
      >
        <Show when={hasTitle()}>
          <view style={styles.titleWrap}>
            <label style={styles.title} color={palette().text} accessibilityCategory="header" value={vm().title} />
          </view>
        </Show>

        <Show when={hasContent()}>
          <view style={styles.bodyWrap} paddingTop={hasTitle() ? 12 : 24}>
            <Show
              when={isLongContent()}
              fallback={
                <view style={styles.contentInline}>
                  <label style={styles.contentText} color={palette().muted} value={vm().content} />
                </view>
              }
            >
              <scroll
                style={styles.contentScroll}
                showsVerticalScrollIndicator={true}
                bouncesVerticalWithSmallContent={false}
              >
                <view style={styles.contentInline}>
                  <label style={styles.contentText} color={palette().muted} value={vm().content} />
                </view>
              </scroll>
            </Show>
          </view>
        </Show>

        <Show when={vm().editable}>
          <view style={styles.inputWrap} paddingTop={hasTitle() || hasContent() ? 16 : 24}>
            <view style={styles.inputBox} backgroundColor={palette().canvas} borderColor={palette().border}>
              <textfield
                style={styles.input}
                accessibilityId="app-modal-input"
                color={palette().text}
                placeholderColor={palette().muted}
                placeholder={vm().placeholderText}
                value={draftText()}
                returnKeyText="done"
                focused={closing() ? false : undefined}
                onChange={event => setDraftText(event.text)}
                onReturn={event => {
                  setDraftText(event.text);
                  handleConfirm(event.text);
                }}
              />
            </view>
          </view>
        </Show>

        <view style={styles.footerRow} paddingTop={hasTitle() || hasBody() ? 24 : 24}>
          <Show when={vm().showCancel}>
            <view
              style={styles.footerButton}
              backgroundColor={palette().buttonSecondary}
              accessibilityId="app-modal-cancel-button"
              accessibilityCategory="button"
              accessibilityLabel={vm().cancelText || '取消'}
              onTap={handleCancel}
            >
              <label
                style={styles.buttonLabel}
                color={palette().buttonOnSecondary}
                value={vm().cancelText || '取消'}
                numberOfLines={1}
              />
            </view>
            <view style={styles.footerGap} />
          </Show>

          <view
            style={styles.footerButton}
            backgroundColor={palette().buttonPrimary}
            accessibilityId="app-modal-confirm-button"
            accessibilityCategory="button"
            accessibilityLabel={vm().confirmText || '确定'}
            onTap={() => handleConfirm()}
          >
            <label
              style={styles.buttonLabel}
              color={palette().buttonOnPrimary}
              value={vm().confirmText || '确定'}
              numberOfLines={1}
            />
          </view>
        </view>
      </view>
    </view>
  );
}

const styles = {
  viewport: new Style<View>({
    width: '100%',
    height: '100%',
    paddingLeft: 24,
    paddingRight: 24,
    justifyContent: 'center',
    alignItems: 'center',
  }),
  scrim: new Style<View>({
    position: 'absolute',
    top: 0,
    right: 0,
    bottom: 0,
    left: 0,
  }),
  card: new Style<View>({
    width: '100%',
    maxWidth: 360,
    maxHeight: 600,
    borderRadius: 20,
    borderWidth: 0.5,
    flexDirection: 'column',
  }),
  titleWrap: new Style<View>({
    width: '100%',
    paddingTop: 24,
    paddingLeft: 24,
    paddingRight: 24,
  }),
  title: new Style<Label>({
    font: systemSemiboldFont(18),
    textAlign: 'center',
    numberOfLines: 0,
  }),
  bodyWrap: new Style<View>({
    width: '100%',
    paddingLeft: 24,
    paddingRight: 24,
  }),
  contentInline: new Style<View>({
    width: '100%',
  }),
  contentScroll: new Style<ScrollView>({
    width: '100%',
    height: 240,
  }),
  contentText: new Style<Label>({
    font: systemFont(15),
    textAlign: 'center',
    numberOfLines: 0,
  }),
  inputWrap: new Style<View>({
    width: '100%',
    paddingLeft: 24,
    paddingRight: 24,
  }),
  inputBox: new Style<View>({
    width: '100%',
    height: 48,
    borderRadius: 12,
    borderWidth: 1,
    paddingLeft: 14,
    paddingRight: 14,
    justifyContent: 'center',
  }),
  input: new Style<TextField>({
    width: '100%',
    height: '100%',
    font: systemFont(16),
  }),
  footerRow: new Style<View>({
    width: '100%',
    paddingLeft: 24,
    paddingRight: 24,
    paddingBottom: 24,
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
    font: systemSemiboldFont(16),
  }),
};
