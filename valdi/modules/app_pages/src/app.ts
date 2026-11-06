import { setCatchAllUncaughtErrorHandler, UncaughtErrorHandlerResult } from 'valdi_core/src/UncaughtErrorHandler';
import { getModuleLoader } from 'valdi_core/src/ModuleLoaderGlobal';
import { api } from './services/api';
import { initializeAppDb } from './services/database';
import type { RouteDeclaration } from 'app_foundation/src/navigation/models';
import { installTheme } from './components/theme';

/**
 * The app's start, called once by the host from the JS scope it keeps for the app's lifetime: whatever is installed
 * here belongs to the app, not to a page. Returns the route table, the tab bar and the first page; the host opens that
 * page as the root. Everything slow (refreshing a token, loading data) is started from pages, not awaited here.
 *
 * `debug` is the host's own build type (debuggable flag, #if DEBUG): Valdi's isDevBuild() follows the runtime's build
 * flavor, not the app's.
 *
 * @ExportFunction({ios: 'VRStartApp', android: 'io.valdiroutes.pages.StartApp'})
 */
export function startApp(debug: boolean): RouteDeclaration {
  installErrorHandler(debug);
  installTheme();
  installDatabase();
  installApi();
  if (debug && !disposeRouteReload) {
    // The observer belongs to this app module; ModuleLoader disposes it when the
    // observing module unloads. Load fresh exports after doUnload has completed.
    disposeRouteReload = getModuleLoader().onHotReload(module, 'app_pages/src/routes', () => {
      const routes = currentRoutes();
      routes.publish(rootRoute(routes.home));
    });
  }
  const routes = currentRoutes();
  return routes.toHost(rootRoute(routes.home));
}

let disposeRouteReload: (() => void) | undefined;

function currentRoutes(): typeof import('./routes')['routes'] {
  // Global loader.load deliberately adds no app -> routes dependency. A route
  // reload must leave this app-scope observer installed until it publishes.
  return getModuleLoader().load('app_pages/src/routes', true).routes;
}

/** Consult the current auth module and its lazy native token store after reload. */
function rootRoute(home: string): string {
  const { auth } = getModuleLoader().load('app_pages/src/services/auth', true) as typeof import('./services/auth');
  return auth.isSignedIn() ? home : 'login';
}

function installDatabase(): void {
  initializeAppDb();
}

/**
 * `api` keeps the app's Bluetooth, Wi-Fi and NFC state. Created here, it belongs to the app; and on a memory warning
 * Valdi unloads every module that neither a live page nor native holds, so it hangs off this module, which native holds.
 */
function installApi(): void {
  void api;
}

/**
 * Arguments are checked once, where they enter (schemas.ts). An error nobody catches, such as an `api` call's rejection
 * for a bad argument, crashes a debug build so it gets fixed, and is only logged in release.
 */
function installErrorHandler(debug: boolean): void {
  setCatchAllUncaughtErrorHandler((rejectedPromise, error) => {
    console.error(rejectedPromise ? '[unhandled rejection]' : '[uncaught error]', error);
    return debug ? UncaughtErrorHandlerResult.CRASH_APPLICATION : UncaughtErrorHandlerResult.IGNORE;
  });
}
