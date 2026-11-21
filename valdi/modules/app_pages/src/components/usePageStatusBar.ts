import { navigationHost } from 'app_foundation/src/navigation/NavigationHost';
import type { PageContext, PageViewModel } from 'app_foundation/src/page/Page';
import type { StatusBarStyle } from 'app_foundation/src/page/PageComponent';
import { onPageShow, type SolidPageProps } from 'solid_native/src/bridge';

/** Restores the page's status bar style whenever it comes on screen. */
export function usePageStatusBar(
  props: SolidPageProps<PageViewModel, PageContext>,
  initial: StatusBarStyle = 'auto',
): (style: StatusBarStyle) => void {
  let current: StatusBarStyle = initial;
  onPageShow(() => {
    navigationHost().setStatusBarStyle(current);
  });
  return (style: StatusBarStyle) => {
    current = style;
    if (props.viewModel().visible) {
      navigationHost().setStatusBarStyle(style);
    }
  };
}
