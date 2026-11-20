import { defineRoutes, valdiPage } from 'app_foundation/src/navigation/config';
import { HomePage } from './pages/HomePage';
import { SharedPage } from './pages/SharedPage';

export const routes = defineRoutes({
  navigation: {
    animation: 'default',
    android: { animation: 'slideRight', durationMs: 300 },
  },
  pages: {
    home: valdiPage({ component: HomePage, title: 'Solid 2.0 Demo' }),
    shared: valdiPage({ component: SharedPage, title: 'Shared Root #2' }),
  },
  initial: 'home',
});
