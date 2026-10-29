import { StatefulComponent } from 'valdi_core/src/Component';
import * as v from 'valibot';
import { navigationHost } from './NavigationHost';
import { PageContext, PageViewModel } from './Page';

/**
 * Color of the status bar's content (time, battery) over the page, which draws its own background under it:
 * 'auto' follows the theme, dark icons on light and light ones on dark; 'light' for a page that is dark whatever the
 * theme (a camera, a photo), 'dark' for one that is always light.
 */
export type StatusBarStyle = 'auto' | 'light' | 'dark';

const statusBarStyle = v.picklist(['auto', 'light', 'dark'], "status bar style must be 'auto', 'light' or 'dark'");

export type ShowReason = 'navigation' | 'tab' | 'foreground';
export type HideReason = 'covered' | 'tab' | 'background';

/** Runs while the page is visible; the function it returns, if any, undoes it when the page hides or goes away. */
export type VisibleEffect = () => void | (() => void);

/**
 * A routed page with a mini program's onShow/onHide on top of Valdi's onCreate (onLoad) and onDestroy (onUnload).
 * The host decides visibility (PageViewModel.visible) and it arrives with the view model: onShow follows onCreate
 * once the page is on screen, then each time it comes back (closing the page above it, selecting its tab, the app
 * returning to the foreground); onHide when it is covered, another tab is selected or the app goes to the
 * background. A page that is closed gets onDestroy only, as a mini program's onUnload.
 *
 * The status bar is one for the app, as ExpoNativeRoutes' StatusBar.setBarStyle: a page sets it to its
 * `statusBarStyle` each time it shows, so going back to a page restores its style. A sheet leaves the one of the page
 * under it.
 *
 * Its type arguments are StatefulComponent's, so a page swaps only the base class: the @Component annotation names
 * PageViewModel and PageContext, and Valdi's compiler needs them used as types in the page's file.
 *
 * ```tsx
 * export class DevicePage extends Page<PageViewModel, State, PageContext> {
 *   onCreate() {
 *     this.whileVisible(() => {
 *       const timer = setInterval(this.poll, 1000);
 *       return () => clearInterval(timer);
 *     });
 *   }
 *   onShow(reason: ShowReason) { this.refresh(); }
 * }
 * ```
 */
export abstract class Page<
  ViewModel extends PageViewModel,
  State,
  Context extends PageContext,
> extends StatefulComponent<ViewModel, State, Context> {
  /** Applied each time the page shows; change it while shown with setStatusBarStyle. */
  statusBarStyle: StatusBarStyle = 'auto';

  private shown = false;
  private readonly effects: { run: VisibleEffect; stop?: () => void }[] = [];

  /** Called each time the page comes on screen, after onCreate the first time. */
  onShow(_reason: ShowReason): void {}

  /** Called when the page goes off screen but stays; not when it is closed. */
  onHide(_reason: HideReason): void {}

  /** The page's status bar from now on: applied now if the page is on screen, and each time it shows. */
  setStatusBarStyle(style: StatusBarStyle): void {
    this.statusBarStyle = v.parse(statusBarStyle, style);
    if (this.shown) this.applyStatusBar();
  }

  /**
   * Runs `effect` now if the page is visible, and again each time it shows; its cleanup runs when the page hides and
   * when it is destroyed, closed or not. For work only a visible page needs: scanning, polling, live updates.
   */
  whileVisible(effect: VisibleEffect): void {
    if (!this.effects.length) {
      // A disposable, not onDestroy: a page's own onDestroy doesn't have to call super.
      this.registerDisposable(() => this.stopEffects());
    }
    const entry: { run: VisibleEffect; stop?: () => void } = { run: effect };
    this.effects.push(entry);
    if (this.shown) entry.stop = effect() ?? undefined;
  }

  onViewModelUpdate(_previous?: Readonly<ViewModel>): void {
    const { visible, visibilityReason } = this.viewModel;
    if (visible === this.shown) return;
    this.shown = visible;
    if (visible) {
      this.applyStatusBar();
      this.onShow((visibilityReason || 'navigation') as ShowReason);
      for (const entry of this.effects) entry.stop = entry.run() ?? undefined;
    } else {
      this.stopEffects();
      this.onHide((visibilityReason || 'covered') as HideReason);
    }
  }

  private applyStatusBar(): void {
    const { presentation } = this.viewModel;
    if (presentation !== 'sheet' && presentation !== 'compactSheet') {
      navigationHost().setStatusBarStyle(this.statusBarStyle);
    }
  }

  private stopEffects(): void {
    for (const entry of this.effects) {
      const stop = entry.stop;
      entry.stop = undefined;
      stop?.();
    }
  }
}
