import { setCatchAllUncaughtErrorHandler, UncaughtErrorHandlerResult } from 'valdi_core/src/UncaughtErrorHandler';
import { initializeBluetooth } from 'bluetooth/src/index';
import * as permissions from './permissions/index';
import { api } from './api';
import { auth, installAuth, TokenStore } from './auth';
import { initializeAppDb } from './db';
import { installNavigation, NavigationHost } from './NavigationHost';
import { routes } from './routes';
import { installTheme } from './theme';

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
export function startApp(debug: boolean, navigation: NavigationHost, tokens: TokenStore): string {
  initializeBluetooth(permissions);
  installTheme();
  installAuth(tokens);
  installDatabase();
  installApi();
  installNavigation(navigation);
  installErrorHandler(debug);
  return JSON.stringify(routes.toHost(rootRoute()));
}

/** The first page: signed out, the login page; signing in resets the stack to `main` (auth.ts). */
function rootRoute(): string {
  return auth.isSignedIn() ? routes.home : 'login';
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
