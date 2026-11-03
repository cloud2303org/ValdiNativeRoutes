import { publishRoutes } from './NavigationHost';
import { PageContext, PageViewModel } from './Page';
import { router } from './navigation';
import { routes } from './routes';
import { SmokePage } from './SmokePage';
import { customTabContentPadding } from './TabBarLayout';

/** @Component({viewModel: 'PageViewModel', context: 'PageContext'}) */
export class SecondTabPage extends SmokePage {
  private updateRoutes = (): void => {
    const declaration = routes.toHost();
    // Declaration updates rebuild pages while preserving the root and selected tab.
    declaration.tabBar!.tabs[1].text = this.state.count % 2 === 0 ? 'Retained updated' : 'Retained';
    publishRoutes(declaration);
    this.log('updateRoutes', { text: declaration.tabBar!.tabs[1].text });
  };

  onRender(): void {
    const { insets } = this.viewModel;
    <view width="100%" height="100%" backgroundColor="#eaf2fa"
      paddingTop={insets.top + 12} paddingBottom={insets.bottom + customTabContentPadding() + 8}
      paddingLeft={insets.left + 16} paddingRight={insets.right + 16}>
      {this.header('Retained second tab')}
      <label width="100%" height={30} value={`Second count: ${this.state.count}`} font="system-bold 20" color="#182825" />
      <label width="100%" height={30} value={this.state.result} font="system 16" color="#374151" />
      {this.button('Increment second', this.increment)}
      {this.button('Push typed detail for result', this.openDetail)}
      {this.button('Switch to home tab', () => router.switchTab('home'))}
      {this.button('Publish updated tab declaration', this.updateRoutes)}
    </view>;
  }
}
