import type { NavigationHost } from 'app_pages/src/NavigationHost';
import type { TokenStore } from 'app_pages/src/auth';
import type { AppUIHost } from 'app_pages/src/AppUIHost';
import type { PermissionHost } from 'app_pages/src/permissions/PermissionHost';
import type { WifiHost } from 'app_pages/src/wifi/WifiHost';
import type { NfcHost } from 'app_pages/src/nfc/NfcHost';
import type { RouteDeclaration } from 'app_pages/src/navigation/models';

// Keep this a runtime require inside start(), rather than an import. Valdi's
// lazy require can evaluate routes.ts even later, inside startApp itself.
declare function require(name: 'app_pages/src/app'): typeof import('app_pages/src/app');
declare function require(name: 'app_pages/src/wifi/WifiHost'): typeof import('app_pages/src/wifi/WifiHost');
declare function require(name: 'app_pages/src/nfc/NfcHost'): typeof import('app_pages/src/nfc/NfcHost');

interface NativeGlobals {
  __harmonyBusinessBootstrap?: {
    debug: boolean;
    navigation: NavigationHost;
    tokens: TokenStore;
    appUI: AppUIHost;
    permissions: PermissionHost;
    wifi: WifiHost;
    nfc: NfcHost;
  };
  __valdiRoutesNavigationHost?: NavigationHost;
  __valdiRoutesTokenStore?: TokenStore;
  __valdiRoutesAppUIHost?: AppUIHost;
  __valdiRoutesPermissionHost?: { host: PermissionHost; androidSdk: number };
  __valdiRoutesDeclaration?: RouteDeclaration;
}

let startupState: 'idle' | 'starting' | 'started' | 'failed' = 'idle';
let startedDeclaration: RouteDeclaration;

/**
 * Native registers real module factories and installs the private
 * __harmonyBusinessBootstrap payload, then calls start() without arguments.
 * Do not pre-install the navigation global.
 * The returned declaration is also forwarded to updateRoutes because the native
 * JavaScriptRuntime::callModuleFunction API does not return the JS result.
 */
export function start(): RouteDeclaration {
  if (startupState === 'started') return startedDeclaration;
  if (startupState !== 'idle') {
    throw new Error(`Harmony business startup is ${startupState}; create a fresh runtime before retrying`);
  }
  const state = globalThis as NativeGlobals;
  const boot = state.__harmonyBusinessBootstrap;
  if (!boot) throw new Error('Harmony business requires native __harmonyBusinessBootstrap before start');
  const { debug, navigation, tokens, appUI, permissions: permissionHost, wifi, nfc } = boot;
  if (typeof debug !== 'boolean') throw new Error('Harmony business debug must be a boolean');
  requireFunctions(navigation, 'NavigationHost', [
    'push', 'pushForResult', 'replace', 'back', 'popToRoot', 'reset',
    'switchTab', 'setStatusBarStyle', 'currentPages', 'updateRoutes',
  ]);
  requireFunctions(tokens, 'TokenStore', ['has', 'read', 'write', 'clear']);
  requireFunctions(appUI, 'AppUIHost', [
    'showModal', 'showActionSheet', 'showPicker', 'showDatePicker', 'showBottomSheet', 'previewImage',
    'scanCode', 'pickAttachments', 'clearAttachmentCache', 'showToast', 'hideToast', 'showLoading', 'hideLoading',
  ]);
  requireFunctions(permissionHost, 'PermissionHost', ['check', 'requestMultiple', 'openSettings']);
  requireFunctions(wifi, 'WifiHost', [
    'setEvents', 'startWifi', 'stopWifi', 'connectWifi', 'getWifiList',
    'getConnectedWifi', 'setWifiList', 'getLocationPermissionState', 'requestLocationPermission',
  ]);
  requireFunctions(nfc, 'NfcHost', [
    'setEvents', 'getAvailability', 'startDiscovery', 'stopDiscovery', 'connect', 'close',
    'isConnected', 'transceive', 'getMaxTransceiveLength', 'setTimeout', 'getAtqa', 'getSak',
    'getHistoricalBytes', 'writeNdefMessage',
  ]);
  state.__valdiRoutesTokenStore = tokens;
  state.__valdiRoutesAppUIHost = appUI;
  state.__valdiRoutesPermissionHost = { host: permissionHost, androidSdk: 0 };

  // Services initialize before the host opens the auth-selected root.
  // defineRoutes is pure, including when Valdi evaluates routes lazily.
  const previousNavigation = state.__valdiRoutesNavigationHost;
  delete state.__valdiRoutesNavigationHost;
  startupState = 'starting';
  try {
    require('app_pages/src/wifi/WifiHost').installWifiHost(wifi);
    require('app_pages/src/nfc/NfcHost').installNfcHost(nfc);
    const app = require('app_pages/src/app');
    const declaration = app.startApp(debug, navigation, tokens);
    state.__valdiRoutesNavigationHost = navigation;
    navigation.updateRoutes(declaration);
    state.__valdiRoutesDeclaration = declaration;
    startedDeclaration = declaration;
    startupState = 'started';
    return declaration;
  } catch (error) {
    startupState = 'failed';
    if (previousNavigation === undefined) delete state.__valdiRoutesNavigationHost;
    else state.__valdiRoutesNavigationHost = previousNavigation;
    throw error;
  }
}

function requireFunctions(value: unknown, name: string, methods: readonly string[]): void {
  if (!value || methods.some(method => typeof (value as Record<string, unknown>)[method] !== 'function')) {
    throw new Error(`Harmony business requires native ${name} (${methods.join(', ')}) before start`);
  }
}
