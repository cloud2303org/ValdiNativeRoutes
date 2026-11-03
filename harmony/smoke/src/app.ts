import { navigationHost } from 'app_pages/src/NavigationHost';
import type { RouteDeclaration } from 'app_pages/src/navigation/models';
import { getModuleLoader } from 'valdi_core/src/ModuleLoaderGlobal';

let startedDeclaration: RouteDeclaration | undefined;
let disposeRouteReload: (() => void) | undefined;

function currentRoutes(): typeof import('app_pages/src/routes')['routes'] {
  return getModuleLoader().load('app_pages/src/routes', true).routes;
}

/** Called after native installs NavigationHost. Returns the same declaration sent to updateRoutes. */
export function start(): RouteDeclaration {
  if (startedDeclaration) return startedDeclaration;
  const declaration = currentRoutes().toHost();
  navigationHost().updateRoutes(declaration);
  startedDeclaration = declaration;
  if (!disposeRouteReload) {
    // Global loader.load adds no bootstrap -> routes dependency, so this app
    // observer remains installed when only the declaration is reloaded.
    disposeRouteReload = getModuleLoader().onHotReload(module, 'app_pages/src/routes', () => {
      currentRoutes().publish();
    });
  }
  console.log('HARMONY_ROUTES_READY');
  return declaration;
}
