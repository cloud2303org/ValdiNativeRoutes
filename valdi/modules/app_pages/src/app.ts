import { setCatchAllUncaughtErrorHandler, UncaughtErrorHandlerResult } from 'valdi_core/src/UncaughtErrorHandler';
import { getModuleLoader } from 'valdi_core/src/ModuleLoaderGlobal';
import type { RouteDeclaration } from 'app_foundation/src/navigation/models';

let disposeRouteReload: (() => void) | undefined;

function loadRoutes(): typeof import('./routes')['routes'] {
  return getModuleLoader().load('app_pages/src/routes', true).routes;
}

function installErrorHandler(debug: boolean): void {
  setCatchAllUncaughtErrorHandler((rejectedPromise, error) => {
    console.error(rejectedPromise ? '[unhandled rejection]' : '[uncaught error]', error);
    return debug ? UncaughtErrorHandlerResult.CRASH_APPLICATION : UncaughtErrorHandlerResult.IGNORE;
  });
}

/**
 * The app's start, called once by the host from the JS scope it keeps for the app's lifetime.
 *
 * @ExportFunction({ios: 'VRStartApp', android: 'io.valdiroutes.pages.StartApp'})
 */
export function startApp(debug: boolean): RouteDeclaration {
  installErrorHandler(debug);
  if (debug && !disposeRouteReload) {
    disposeRouteReload = getModuleLoader().onHotReload(module, 'app_pages/src/routes', () => {
      loadRoutes().publish();
    });
  }
  return loadRoutes().toHost();
}
