import { Component } from 'valdi_core/src/Component';
import res from 'app_pages/res';
import { TabBarContext, TabBarViewModel } from './TabBar';
import { CUSTOM_TAB_HEIGHT, TALL_TAB_HEIGHT } from './TabBarLayout';

/**
 * The business owns the hit region as well as its visual height. Layout only
 * supplies the viewport height; native never measures the custom bar.
 *
 * @Component({viewModel: 'TabBarViewModel', context: 'TabBarContext'})
 */
export class SmokeTabBar extends Component<TabBarViewModel, TabBarContext> {
  private viewportHeight = 0;
  protected get barHeight(): number { return CUSTOM_TAB_HEIGHT; }

  onRender(): void {
    const { items, selectedRoute, safeAreaBottom } = this.viewModel;
    <view width="100%" height="100%"
      onLayout={frame => { this.viewportHeight = frame.height; }}
      hitTest={event => this.viewportHeight > 0 &&
        event.y >= this.viewportHeight - this.barHeight - safeAreaBottom}>
      <view position="absolute" bottom={0} width="100%"
        height={this.barHeight + safeAreaBottom} paddingBottom={safeAreaBottom}
        backgroundColor="#183b35" accessibilityId="custom-tab-bar">
        <label height={18} width="100%" font="system 11" color="#d9ede4" textAlign="center"
          value={`Business bar ${this.barHeight} · system ${safeAreaBottom.toFixed(0)}`} />
        <view width="100%" height={this.barHeight - 18} flexDirection="row">
          {items.forEach(tab => {
            const selected = selectedRoute === tab.route;
            const image = tab.route === 'home'
              ? (selected ? res.tabHomeOn : res.tabHome)
              : (selected ? res.tabComponentsOn : res.tabComponents);
            <view key={tab.route} flexGrow={1} height="100%" alignItems="center" justifyContent="center"
              accessibilityId={`custom-tab-${tab.route}`}
              onTap={() => this.context.selectTab(tab.route)}>
              <image width={18} height={18} src={image} objectFit="contain" />
              <label height={18} font="system-semibold 12" color={selected ? '#ffffff' : '#b9cec7'}
                value={`${tab.text}${selected ? ' · selected' : ''}`} />
            </view>;
          })}
        </view>
      </view>
    </view>;
  }
}

/** @Component({viewModel: 'TabBarViewModel', context: 'TabBarContext'}) */
export class SmokeTallTabBar extends SmokeTabBar {
  protected get barHeight(): number { return TALL_TAB_HEIGHT; }
}
