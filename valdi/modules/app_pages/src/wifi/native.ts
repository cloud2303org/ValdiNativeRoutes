import { nativeCall } from '../nativeCall';
import {
  type WifiConnectParamsModel,
  type WifiCredentialModel,
  type WifiHostEvents,
  type WifiInfoModel as WifiInfo,
  wifiHost,
} from './WifiHost';

// What wechat.ts calls on the host's WifiHost; its Promises go through nativeCall. Native holds one WifiHostEvents for
// the app's lifetime; listeners subscribe here, so they never cross the bridge.

let nextListenerId = 1;
const connectedListeners = new Map<number, (wifi: WifiInfo) => void>();
const listListeners = new Map<number, (wifiList: WifiInfo[]) => void>();

function fanOut<T>(listeners: Map<number, (event: T) => void>) {
  return (event: T) => {
    // A copy: a listener may remove itself or another one while this runs.
    for (const listener of [...listeners.values()]) {
      try {
        listener(event);
      } catch (error) {
        console.error('[wifi] listener failed', error);
      }
    }
  };
}

export const wifiEvents: WifiHostEvents = {
  wifiConnected: fanOut(connectedListeners),
  wifiList: fanOut(listListeners),
};

function add<T>(listeners: Map<number, T>, callback: T): number {
  const id = nextListenerId++;
  listeners.set(id, callback);
  return id;
}

/** Calling it creates no native manager, connection, scan or prompt until a method runs. */
export const nativeWifi = {
  startWifi: () => nativeCall(() => wifiHost().startWifi()),
  stopWifi: () => nativeCall(() => wifiHost().stopWifi()),
  connectWifi: (params: WifiConnectParamsModel) => nativeCall(() => wifiHost().connectWifi(params)),
  getWifiList: () => nativeCall(() => wifiHost().getWifiList()),
  getConnectedWifi: (partialInfo: boolean) => nativeCall(() => wifiHost().getConnectedWifi(partialInfo)),
  setWifiList: (wifiList: WifiCredentialModel[]) => nativeCall(() => wifiHost().setWifiList(wifiList)),
  onWifiConnected: (callback: (wifi: WifiInfo) => void) => add(connectedListeners, callback),
  removeWifiConnectedListener: (id: number) => void connectedListeners.delete(id),
  onGetWifiList: (callback: (wifiList: WifiInfo[]) => void) => add(listListeners, callback),
  removeGetWifiListListener: (id: number) => void listListeners.delete(id),
  getLocationPermissionState: () => nativeCall(() => wifiHost().getLocationPermissionState()),
  requestLocationPermission: () => nativeCall(() => wifiHost().requestLocationPermission()),
};
