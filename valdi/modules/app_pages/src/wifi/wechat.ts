import { isAndroid, openDevicePermissionSettings, serializePermissionRequest } from '../permissions/index';
import { toWechatWifiError, wifiFailure, wifiNativeErrorCode } from './errors';
import { nativeWifi } from './native';
import {
  askWifiPermission,
  readWifiPermission,
  type WifiPermissionOptions,
  type WifiPermissionResult,
} from './permission';
import * as schema from './schemas';
import type { WifiCredentialModel, WifiInfoModel } from './WifiHost';

/** Fields a platform's public API doesn't give stay absent, never made up. */
export type WifiInfo = WifiInfoModel;
export type WifiCredential = WifiCredentialModel;
export type WifiResult<T extends object = object> = { errMsg: string } & T;
export interface ConnectWifiOptions {
  SSID: string;
  BSSID?: string;
  /** Empty or omitted means an open device AP. WPA2 personal is supported on Android. */
  password?: string;
  /** Official WeChat spelling: explicitly open the system Wi-Fi panel on Android. */
  maunal?: boolean;
  partialInfo?: boolean;
}
export interface GetConnectedWifiOptions {
  partialInfo?: boolean;
}
export interface SetWifiListOptions {
  wifiList: WifiCredential[];
}
export type WifiConnectedCallback = (result: { wifi: WifiInfo }) => void;
export type WifiConnectedWithPartialInfoCallback = (result: { wifi: Pick<WifiInfo, 'SSID'> }) => void;
export type GetWifiListCallback = (result: { wifiList: WifiInfo[] }) => void;

export interface WechatWifiApi {
  startWifi(): Promise<WifiResult>;
  stopWifi(): Promise<WifiResult>;
  connectWifi(options: ConnectWifiOptions): Promise<WifiResult<{ wifi?: WifiInfo }>>;
  getWifiList(): Promise<WifiResult>;
  getConnectedWifi(options?: GetConnectedWifiOptions): Promise<WifiResult<{ wifi: WifiInfo }>>;
  setWifiList(options: SetWifiListOptions): Promise<WifiResult>;
  onWifiConnected(callback: WifiConnectedCallback): void;
  offWifiConnected(callback?: WifiConnectedCallback): void;
  onWifiConnectedWithPartialInfo(callback: WifiConnectedWithPartialInfoCallback): void;
  offWifiConnectedWithPartialInfo(callback?: WifiConnectedWithPartialInfoCallback): void;
  onGetWifiList(callback: GetWifiListCallback): void;
  offGetWifiList(callback?: GetWifiListCallback): void;
  getWifiPermissionState(options: WifiPermissionOptions): Promise<WifiPermissionResult>;
  requestWifiPermission(options: WifiPermissionOptions): Promise<WifiPermissionResult>;
  openWifiPermissionSettings(): Promise<void>;
}

function invoke<T>(callback: ((value: T) => void) | undefined, value: T): void {
  try {
    callback?.(value);
  } catch (error) {
    console.error('[wifi] listener failed', error);
  }
}

function credentialsInOptions(options: unknown): string[] {
  if (typeof options !== 'object' || options === null) return [];
  const value = options as Record<string, unknown>;
  const values = typeof value.password === 'string' ? [value.password] : [];
  if (Array.isArray(value.wifiList))
    for (const entry of value.wifiList) {
      if (typeof entry === 'object' && entry !== null && typeof entry.password === 'string')
        values.push(entry.password);
    }
  return values;
}

export class WifiRuntime implements WechatWifiApi {
  private readonly native = nativeWifi;
  private started = false;
  private generation = 0;
  private readonly connected = new Map<WifiConnectedCallback, number>();
  private readonly partialConnected = new Map<WifiConnectedWithPartialInfoCallback, number>();
  private readonly lists = new Map<GetWifiListCallback, number>();

  private check(generation = this.generation): void {
    // stopWifi ends what was still in flight.
    if (generation !== this.generation) throw wifiFailure('E_WIFI_SESSION_RELEASED', 'Wi-Fi stopped');
  }
  private requireStarted(): void {
    if (!this.started) throw wifiFailure('E_WIFI_NOT_INITIALIZED', 'Call startWifi first');
  }
  /** `options` only tells which passwords to keep out of the error message. */
  private async run<T extends object>(
    operation: string,
    options: unknown,
    action: (generation: number) => Promise<T>,
  ): Promise<WifiResult<T>> {
    const generation = this.generation;
    try {
      this.check(generation);
      const value = await action(generation);
      this.check(generation);
      return { ...value, errMsg: `${operation}:ok` } as WifiResult<T>;
    } catch (failure) {
      throw toWechatWifiError(operation, failure, credentialsInOptions(options));
    }
  }
  private async ensurePermission(
    operation: 'connect' | 'scan' | 'info',
    generation: number,
    partialInfo = false,
  ): Promise<void> {
    const result = await askWifiPermission({ operation, partialInfo }, () => this.check(generation));
    this.check(generation);
    if (result.status !== 'granted')
      throw wifiFailure('E_WIFI_PERMISSION_DENIED', 'Required Wi-Fi permission was not granted');
  }
  startWifi(): Promise<WifiResult> {
    return this.run('startWifi', undefined, async generation => {
      await this.native.startWifi();
      this.check(generation);
      this.started = true;
      return {};
    });
  }
  stopWifi(): Promise<WifiResult> {
    this.generation += 1;
    this.started = false;
    return this.run('stopWifi', undefined, async () => {
      await this.native.stopWifi();
      return {};
    });
  }
  connectWifi(options: ConnectWifiOptions): Promise<WifiResult<{ wifi?: WifiInfo }>> {
    return this.run('connectWifi', options, async generation => {
      this.requireStarted();
      const params = schema.parseOptions(schema.connectWifiOptions, options);
      if (isAndroid() && !params.maunal) await this.ensurePermission('connect', generation, params.partialInfo);
      this.check(generation);
      const wifi = await serializePermissionRequest(
        () => this.native.connectWifi(params),
        () => this.check(generation),
      );
      // Opening the panel succeeds without claiming that the requested network connected.
      if (params.maunal && isAndroid()) return {};
      return { wifi: isAndroid() && params.partialInfo ? { SSID: wifi.SSID } : wifi };
    });
  }
  getWifiList(): Promise<WifiResult> {
    return this.run('getWifiList', undefined, async generation => {
      this.requireStarted();
      if (isAndroid()) await this.ensurePermission('scan', generation);
      this.check(generation);
      await this.native.getWifiList();
      return {};
    });
  }
  getConnectedWifi(options?: GetConnectedWifiOptions): Promise<WifiResult<{ wifi: WifiInfo }>> {
    return this.run('getConnectedWifi', options, async generation => {
      this.requireStarted();
      const { partialInfo } = schema.parseOptions(schema.getConnectedWifiOptions, options);
      if (isAndroid() && !partialInfo) await this.ensurePermission('info', generation);
      this.check(generation);
      let wifi: WifiInfo;
      try {
        wifi = await this.native.getConnectedWifi(partialInfo);
      } catch (error) {
        if (wifiNativeErrorCode(error) !== 'E_WIFI_LOCATION_PERMISSION_REQUIRED') throw error;
        await this.ensurePermission('info', generation);
        wifi = await this.native.getConnectedWifi(partialInfo);
      }
      return { wifi: isAndroid() && partialInfo ? { SSID: wifi.SSID } : wifi };
    });
  }
  setWifiList(options: SetWifiListOptions): Promise<WifiResult> {
    return this.run('setWifiList', options, async () => {
      this.requireStarted();
      const { wifiList } = schema.parseOptions(schema.setWifiListOptions, options);
      await this.native.setWifiList(wifiList);
      return {};
    });
  }
  onWifiConnected(callback: WifiConnectedCallback): void {
    this.check();
    schema.parseOptions(schema.callback, callback, TypeError);
    if (this.connected.has(callback)) return;
    const id = this.native.onWifiConnected(wifi => {
      if (this.started && this.connected.has(callback)) invoke(callback, { wifi });
    });
    this.connected.set(callback, id);
  }
  offWifiConnected(callback?: WifiConnectedCallback): void {
    this.removeListeners(this.connected, id => this.native.removeWifiConnectedListener(id), callback);
  }
  onWifiConnectedWithPartialInfo(callback: WifiConnectedWithPartialInfoCallback): void {
    this.check();
    schema.parseOptions(schema.callback, callback, TypeError);
    if (this.partialConnected.has(callback)) return;
    const id = this.native.onWifiConnected(wifi => {
      if (this.started && this.partialConnected.has(callback)) invoke(callback, { wifi: { SSID: wifi.SSID } });
    });
    this.partialConnected.set(callback, id);
  }
  offWifiConnectedWithPartialInfo(callback?: WifiConnectedWithPartialInfoCallback): void {
    this.removeListeners(this.partialConnected, id => this.native.removeWifiConnectedListener(id), callback);
  }
  onGetWifiList(callback: GetWifiListCallback): void {
    this.check();
    schema.parseOptions(schema.callback, callback, TypeError);
    if (this.lists.has(callback)) return;
    const id = this.native.onGetWifiList(wifiList => {
      if (this.started && this.lists.has(callback)) invoke(callback, { wifiList });
    });
    this.lists.set(callback, id);
  }
  offGetWifiList(callback?: GetWifiListCallback): void {
    this.removeListeners(this.lists, id => this.native.removeGetWifiListListener(id), callback);
  }
  private removeListeners<T>(listeners: Map<T, number>, remove: (id: number) => void, callback?: T): void {
    for (const [listener, id] of listeners) {
      if (callback !== undefined && listener !== callback) continue;
      listeners.delete(listener);
      remove(id);
    }
  }
  async getWifiPermissionState(options: WifiPermissionOptions): Promise<WifiPermissionResult> {
    const generation = this.generation;
    this.check(generation);
    const result = await readWifiPermission(schema.parseOptions(schema.wifiPermissionOptions, options));
    this.check(generation);
    return result;
  }
  async requestWifiPermission(options: WifiPermissionOptions): Promise<WifiPermissionResult> {
    const generation = this.generation;
    this.check(generation);
    const result = await askWifiPermission(schema.parseOptions(schema.wifiPermissionOptions, options), () =>
      this.check(generation),
    );
    this.check(generation);
    return result;
  }
  openWifiPermissionSettings(): Promise<void> {
    this.check();
    return openDevicePermissionSettings();
  }
}

export const createWifiRuntime = (): WifiRuntime => new WifiRuntime();
