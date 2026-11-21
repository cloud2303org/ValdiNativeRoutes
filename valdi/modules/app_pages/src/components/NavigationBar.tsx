import { createMemo, createSignal, Show } from 'solid-js';
import { Device } from 'valdi_core/src/Device';
import { Style } from 'valdi_core/src/Style';
import { systemBoldFont } from 'valdi_core/src/SystemFont';
import { GeometricPathBuilder, GeometricPathScaleType } from 'valdi_core/src/utils/GeometricPathBuilder';
import type { ElementFrame } from 'valdi_tsx/src/Geometry';
import type { Label, View } from 'valdi_tsx/src/NativeTemplateElements';
import { color, tokens } from './theme';

export interface NavigationBarProps {
  title?: string;
  /** Shows the back button; the root page and tab pages have none. */
  onBack?: () => void;
  /** The page's top inset: the bar's background extends under the status bar, its content stays below it. */
  topInset?: number;
  left?: JSX.Element;
  right?: JSX.Element;
}

/** Material's chevron-left, in its 24×24 box. */
const CHEVRON_LEFT = new GeometricPathBuilder(24, 24, GeometricPathScaleType.Contain)
  .moveTo(15, 6)
  .lineTo(9, 12)
  .lineTo(15, 18)
  .build();

const HAIRLINE = 1 / Device.getDisplayScale();

/**
 * The page's top bar, as ExpoNativeRoutes' NavigationBar: 44pt, the back button on the left, the title centred on the
 * bar whatever the sides hold, a hairline below. Extra content goes in `left` (after the back button) and `right`.
 */
export function NavigationBar(props: NavigationBarProps) {
  const [leftWidth, setLeftWidth] = createSignal(0);
  const [rightWidth, setRightWidth] = createSignal(0);
  const [backPressed, setBackPressed] = createSignal(false);

  // The title keeps clear of the wider side, so it stays centred on the bar.
  const titleInset = createMemo(() => Math.max(leftWidth(), rightWidth()) + tokens.space.md);

  const handleLeftLayout = (frame: ElementFrame) => {
    const width = Math.ceil(frame.width);
    if (width !== leftWidth()) setLeftWidth(width);
  };

  const handleRightLayout = (frame: ElementFrame) => {
    const width = Math.ceil(frame.width);
    if (width !== rightWidth()) setRightWidth(width);
  };

  return (
    <view
      style={styles.bar}
      paddingTop={props.topInset ?? 0}
      backgroundColor={color.surface}
    >
      <view style={styles.content} paddingLeft={props.onBack ? tokens.space.sm : tokens.space.lg}>
        <view style={styles.side} onLayout={handleLeftLayout}>
          <Show when={props.onBack}>
            {onBack => (
              <view
                style={styles.back}
                backgroundColor={backPressed() ? color.backPressed : undefined}
                touchAreaExtension={4}
                accessibilityId="navigation-back"
                accessibilityLabel="返回"
                accessibilityCategory="image-button"
                onTap={onBack()}
                onTouchStart={() => setBackPressed(true)}
                onTouchEnd={() => setBackPressed(false)}
              >
                <shape
                  width={tokens.icon.back}
                  height={tokens.icon.back}
                  marginLeft={-2}
                  path={CHEVRON_LEFT}
                  strokeColor={color.ink}
                  strokeWidth={2.2}
                  strokeCap="round"
                  strokeJoin="round"
                />
              </view>
            )}
          </Show>
          {props.left}
        </view>
        <view style={styles.spacer} />
        <view style={styles.side} onLayout={handleRightLayout}>
          {props.right}
        </view>
        {/* Above the sides but not touchable, so taps reach their buttons. */}
        <view style={styles.titleLayer} padding={`0 ${titleInset()}`} touchEnabled={false}>
          <Show when={props.title}>
            {title => <label style={styles.title} color={color.ink} value={title()} numberOfLines={1} />}
          </Show>
        </view>
      </view>
      {/* Valdi borders have no single side: the hairline is its own view. */}
      <view style={styles.hairline} backgroundColor={color.hairline} />
    </view>
  );
}

const styles = {
  bar: new Style<View>({
    width: '100%',
  }),
  content: new Style<View>({
    height: tokens.size.nav,
    flexDirection: 'row',
    alignItems: 'center',
    paddingRight: tokens.space.lg,
  }),
  side: new Style<View>({
    height: tokens.size.nav,
    flexDirection: 'row',
    alignItems: 'center',
  }),
  spacer: new Style<View>({
    flexGrow: 1,
  }),
  back: new Style<View>({
    width: tokens.size.back,
    height: tokens.size.back,
    borderRadius: tokens.size.back / 2,
    alignItems: 'center',
    justifyContent: 'center',
  }),
  titleLayer: new Style<View>({
    position: 'absolute',
    top: 0,
    right: 0,
    bottom: 0,
    left: 0,
    alignItems: 'center',
    justifyContent: 'center',
  }),
  hairline: new Style<View>({
    width: '100%',
    height: HAIRLINE,
  }),
  title: new Style<Label>({
    font: systemBoldFont(tokens.font.nav),
    textAlign: 'center',
  }),
};
