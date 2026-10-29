import { StatefulComponent } from 'valdi_core/src/Component';
import { Device } from 'valdi_core/src/Device';
import { Style } from 'valdi_core/src/Style';
import { systemBoldFont } from 'valdi_core/src/SystemFont';
import { GeometricPathBuilder, GeometricPathScaleType } from 'valdi_core/src/utils/GeometricPathBuilder';
import { ElementFrame } from 'valdi_tsx/src/Geometry';
import { Label, View } from 'valdi_tsx/src/NativeTemplateElements';
import { color, tokens } from './theme';

export interface NavigationBarViewModel {
  title?: string;
  /** Shows the back button; the root page and tab pages have none. */
  onBack?: () => void;
  /** The page's top inset: the bar's background extends under the status bar, its content stays below it. */
  topInset?: number;
}

interface State {
  leftWidth: number;
  rightWidth: number;
  backPressed: boolean;
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
 * bar whatever the sides hold, a hairline below. Extra content goes in the named slots `left` (after the back button)
 * and `right`:
 *
 * ```tsx
 * <NavigationBar title="详情" topInset={insets.top} onBack={this.handleBack}>
 *   <slotted slot="right"><TextButton title="保存" onTap={this.handleSave} /></slotted>
 * </NavigationBar>
 * ```
 */
export class NavigationBar extends StatefulComponent<NavigationBarViewModel, State> {
  state: State = { leftWidth: 0, rightWidth: 0, backPressed: false };

  onRender(): void {
    const { title, onBack, topInset = 0 } = this.viewModel;
    const { leftWidth, rightWidth, backPressed } = this.state;
    // The title keeps clear of the wider side, so it stays centred on the bar.
    const titleInset = Math.max(leftWidth, rightWidth) + tokens.space.md;

    <view
      style={styles.bar}
      paddingTop={topInset}
      backgroundColor={color.surface}
    >
      <view style={styles.content} paddingLeft={onBack ? tokens.space.sm : tokens.space.lg}>
        <view style={styles.side} onLayout={this.handleLeftLayout}>
          {onBack && (
            <view
              key="back"
              style={styles.back}
              backgroundColor={backPressed ? color.backPressed : undefined}
              touchAreaExtension={4}
              accessibilityLabel="返回"
              accessibilityCategory="image-button"
              onTap={onBack}
              onTouchStart={this.handleBackDown}
              onTouchEnd={this.handleBackUp}
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
          <slot name="left" />
        </view>
        <view style={styles.spacer} />
        <view style={styles.side} onLayout={this.handleRightLayout}>
          <slot name="right" />
        </view>
        {/* Above the sides but not touchable, so taps reach their buttons. */}
        <view style={styles.titleLayer} padding={`0 ${titleInset}`} touchEnabled={false}>
          {title && <label style={styles.title} color={color.ink} value={title} numberOfLines={1} />}
        </view>
      </view>
      {/* Valdi borders have no single side: the hairline is its own view. */}
      <view style={styles.hairline} backgroundColor={color.hairline} />
    </view>;
  }

  private handleLeftLayout = (frame: ElementFrame) => {
    if (Math.ceil(frame.width) !== this.state.leftWidth) this.setState({ leftWidth: Math.ceil(frame.width) });
  };

  private handleRightLayout = (frame: ElementFrame) => {
    if (Math.ceil(frame.width) !== this.state.rightWidth) this.setState({ rightWidth: Math.ceil(frame.width) });
  };

  private handleBackDown = () => this.setState({ backPressed: true });

  private handleBackUp = () => this.setState({ backPressed: false });
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
