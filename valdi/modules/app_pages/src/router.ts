import type { PageContext } from 'app_foundation/src/page/Page';
import {
  createRouter,
  Router as FoundationRouter,
  type RouteName as FoundationRouteName,
  type TabName as FoundationTabName,
  type RouteParams as FoundationRouteParams,
  type RouteResults as FoundationRouteResults,
  type RouteViewModel as FoundationRouteViewModel,
  type StackPage as FoundationStackPage,
} from 'app_foundation/src/navigation/router';
import { routes } from './routes';

export type { NavigationOptions } from 'app_foundation/src/navigation/router';

export type RouteName = FoundationRouteName<typeof routes>;
export type TabName = FoundationTabName<typeof routes>;
export type RouteParams = FoundationRouteParams<typeof routes>;
export type RouteResults = FoundationRouteResults<typeof routes>;
export type RouteViewModel<R extends RouteName> = FoundationRouteViewModel<typeof routes, R>;
export type StackPage = FoundationStackPage<typeof routes>;

export const router = createRouter(routes);

/** Only the app's route binding lives here; navigation behavior belongs to foundation. */
export class Router extends FoundationRouter<typeof routes> {
  constructor(context: PageContext) {
    super(context, router);
  }
}
