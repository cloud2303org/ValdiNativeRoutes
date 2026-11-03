import res from 'app_pages/res';
import { defineRoutes, valdiPage } from './navigation/config';
import { HomePage } from './HomePage';
import { SecondTabPage } from './SecondTabPage';
import { DetailPage } from './DetailPage';
import { StackPage } from './StackPage';
import { ResetPage } from './ResetPage';
import { AnimationPage } from './AnimationPage';
import { GesturePage } from './GesturePage';
import { ScrollPage } from './ScrollPage';
import { ImagePage } from './ImagePage';
import { InputPage } from './InputPage';
import { TabBarPage } from './TabBarPage';
import { FoundationPage } from './FoundationPage';
import { SnapshotPage } from './SnapshotPage';
import { RefreshPage } from './RefreshPage';

export const routes = defineRoutes({
  navigation: { animation: 'default', durationMs: 300 },
  pages: {
    home: valdiPage({ component: HomePage, title: 'Home' }),
    second: valdiPage({ component: SecondTabPage, title: 'Retained' }),
    detail: valdiPage<{
      id: number;
      from: string;
      metadata?: { labels: string[]; flags: { enabled: boolean; missing: null }; scores: number[] };
    }, {
      visited: number;
      details?: { labels: string[]; flags: { accepted: boolean; missing: null } };
    }>({ component: DetailPage, title: 'Typed detail' }),
    stack: valdiPage({ component: StackPage, title: 'Stack actions' }),
    reset: valdiPage<{ from: string }>({ component: ResetPage, title: 'Reset root' }),
    animation: valdiPage({
      component: AnimationPage, title: 'Native animations',
      options: { harmony: { animation: 'fade', durationMs: 350 } },
    }),
    gesture: valdiPage({ component: GesturePage, title: 'Native gestures' }),
    scroll: valdiPage({ component: ScrollPage, title: 'Native scrolling' }),
    image: valdiPage({ component: ImagePage, title: 'Native images and fonts' }),
    input: valdiPage({ component: InputPage, title: 'Native text editing' }),
    tabBar: valdiPage({ component: TabBarPage, title: 'Tab presentation' }),
    foundation: valdiPage({ component: FoundationPage, title: 'Native text and HTTP' }),
    snapshot: valdiPage({ component: SnapshotPage, title: 'Native snapshots and refs' }),
    refresh: valdiPage({ component: RefreshPage, title: 'Native pull to refresh' }),
  },
  tabs: {
    initial: 'home',
    items: [
      { route: 'home', text: 'Home', icon: res.tabHome, selectedIcon: res.tabHomeOn },
      { route: 'second', text: 'Retained', icon: res.tabComponents, selectedIcon: res.tabComponentsOn },
    ],
  },
});
