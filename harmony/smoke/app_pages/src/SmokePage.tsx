import { PageContext, PageViewModel } from './Page';
import { Page, HideReason, ShowReason } from './PageComponent';
import { Router, router } from './navigation';

export interface SmokeState {
  count: number;
  result: string;
  pages: string;
}

/** Shares only presentation/logging; navigation and lifecycle are the real app_pages contracts. */
export abstract class SmokePage<State extends SmokeState = SmokeState> extends Page<PageViewModel, State, PageContext> {
  state: State = { count: 0, result: 'Result: pending', pages: 'Stack: loading' } as State;

  protected get pageRouter(): Router {
    return new Router(this.context);
  }

  onCreate(): void {
    const vm = this.viewModel;
    if (!vm || typeof vm.pageId !== 'string' || typeof vm.route !== 'string' ||
        !vm.params || typeof vm.params !== 'object' || Array.isArray(vm.params) ||
        typeof vm.presentation !== 'string' ||
        typeof vm.visible !== 'boolean' || typeof vm.visibilityReason !== 'string' ||
        !vm.insets || !['top', 'bottom', 'left', 'right'].every(key =>
          typeof vm.insets[key as keyof typeof vm.insets] === 'number') ||
        typeof this.context?.finish !== 'function' || typeof this.context?.back !== 'function') {
      throw new Error('Harmony route must receive dynamic PageViewModel and PageContext from native createContext');
    }
    this.log('create');
    this.whileVisible(() => {
      this.log('visible-effect');
      return () => this.log('visible-cleanup');
    });
  }

  onShow(reason: ShowReason): void {
    this.log(`show:${reason}`);
    void this.inspectPages();
  }

  onHide(reason: HideReason): void {
    this.log(`hide:${reason}`);
  }

  onDestroy(): void {
    this.log('destroy');
  }

  protected log(event: string, extra: object = {}): void {
    console.log(`HARMONY_ROUTE=${JSON.stringify({
      event, pageId: this.viewModel.pageId, route: this.viewModel.route, count: this.state.count, ...extra,
    })}`);
  }

  protected increment = (): void => {
    this.setState({ count: this.state.count + 1 } as Partial<State>);
    this.log('count');
  };

  protected openDetail = async (): Promise<void> => {
    const result = await this.pageRouter.pushForResult('detail', {
      id: this.state.count + 1, from: this.viewModel.route,
    });
    this.log('result', { result: result ?? null, canceled: result === undefined });
    if (!this.isDestroyed()) {
      this.setState({ result: result ? `Result: visited ${result.visited}` : 'Result: canceled' } as Partial<State>);
    }
  };

  protected async inspectPages(): Promise<void> {
    const pages = await router.getCurrentPages();
    this.log('currentPages', { pages, canGoBack: pages.length > 1 });
    if (!this.isDestroyed()) {
      this.setState({ pages: `Stack: ${pages.map(page => page.route).join(' > ')}; back=${pages.length > 1}` } as Partial<State>);
    }
  }

  protected header(title: string, subtitle = ''): void {
    <label width="100%" height={36} font="system-bold 23" color="#182825" value={title} />;
    <label width="100%" height={28} font="system 14" color="#374151"
      value={`${subtitle || `${this.viewModel.route} / ${this.viewModel.pageId}`} · inset ${this.viewModel.insets.top.toFixed(1)} / ${this.viewModel.insets.bottom.toFixed(1)}`} />;
    <label width="100%" height={38} font="system 13" color="#374151" numberOfLines={2} value={this.state.pages} />;
  }

  protected button(title: string, onTap: () => void): void {
    <view width="100%" height={44} marginBottom={8} backgroundColor="#176b55" borderRadius={8}
      alignItems="center" justifyContent="center" onTap={onTap}
      accessibilityId={`smoke-${this.viewModel.route}-${title.toLowerCase().replace(/[^a-z0-9]+/g, '-')}`}
      accessibilityLabel={title}>
      <label width="94%" height={30} font="system-semibold 16" textAlign="center" color="#ffffff" value={title} />;
    </view>;
  }
}
