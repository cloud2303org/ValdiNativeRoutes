import { publishRoutes } from './NavigationHost';
import { routes } from './routes';
import { SmokePage } from './SmokePage';
import { CUSTOM_TAB_HEIGHT, TALL_TAB_HEIGHT, setCustomTabContentPadding } from './TabBarLayout';

/** @Component({viewModel: 'PageViewModel', context: 'PageContext'}) */
export class TabBarPage extends SmokePage {
  private useBar = (height: number): void => {
    setCustomTabContentPadding(height);
    const declaration = routes.toHost();
    declaration.tabBar!.mode = height ? 'custom' : 'default';
    declaration.tabBar!.component = height
      ? `${height === TALL_TAB_HEIGHT ? 'SmokeTallTabBar' : 'SmokeTabBar'}@app_pages/src/SmokeTabBar`
      : undefined;
    publishRoutes(declaration);
  };

  onRender(): void {
    const { insets } = this.viewModel;
    <view width="100%" height="100%" backgroundColor="#f4f1e8"
      paddingTop={insets.top + 12} paddingBottom={insets.bottom + 12}
      paddingLeft={insets.left + 16} paddingRight={insets.right + 16}>
      {this.header('Tab presentation')}
      <label width="100%" height={70} numberOfLines={3} font="system 15" color="#374151"
        value="Default uses the platform Tabs. Custom is a shared Valdi component; page padding comes from business code." />
      {this.button('Use official system Tabs', () => this.useBar(0))}
      {this.button('Use custom bar 56', () => this.useBar(CUSTOM_TAB_HEIGHT))}
      {this.button('Use custom bar 88', () => this.useBar(TALL_TAB_HEIGHT))}
      {this.button('Back', () => this.context.back())}
    </view>;
  }
}
