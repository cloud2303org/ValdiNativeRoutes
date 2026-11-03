import { common } from '@kit.AbilityKit';
import { wifiManager } from '@kit.ConnectivityKit';
import { BusinessError } from '@kit.BasicServicesKit';
import { HarmonyPermissionService } from './HarmonyPermissionService';
import {
  HarmonyWifiCandidateCoordinator, HarmonyWifiCandidateLease, HarmonyWifiEventSubscription,
  HarmonyWifiCandidateReadiness
} from './HarmonyWifiCandidateCoordinator';
import {
  WifiHost, WifiHostEvents, WifiInfoModel, WifiConnectParamsModel,
  WifiCredentialModel, WifiPermissionStateModel
} from './PlatformServiceTypes';

function wifiError(error: Error): Error {
  if (error.message.startsWith('E_WIFI_')) return error;
  const code = (error as BusinessError).code;
  switch (code) {
    case 201: return new Error('E_WIFI_PERMISSION_DENIED:Wi-Fi permission denied');
    case 801: return new Error('E_WIFI_SYSTEM_NOT_SUPPORTED:Wi-Fi capability unavailable');
    case 2501001: return new Error('E_WIFI_DISABLED:Wi-Fi switch is off');
    case 2501005: return new Error('E_WIFI_CONNECTION_TIMEOUT:user approval timed out');
    case 2501006: return new Error('E_WIFI_USER_DENIED:user refused connection');
    case 401:
    case 2501007: return new Error('E_WIFI_SYSTEM_CONFIG:invalid candidate configuration');
    default: return new Error('E_WIFI_SYSTEM_INTERNAL:Wi-Fi operation failed');
  }
}

function scanInfo(info: wifiManager.WifiScanInfo): WifiInfoModel {
  return {
    SSID: info.ssid, BSSID: info.bssid,
    secure: info.securityType !== wifiManager.WifiSecurityType.WIFI_SEC_TYPE_OPEN,
    signalStrength: info.rssi, frequency: info.frequency
  };
}

function linkedInfo(info: wifiManager.WifiLinkedInfo, partial: boolean): WifiInfoModel {
  if (partial) return { SSID: info.ssid };
  // bssid is the SDK-provided virtual address for ordinary apps. Never claim hardware MAC.
  return { SSID: info.ssid, BSSID: info.bssid, signalStrength: info.rssi, frequency: info.frequency };
}

export class HarmonyWifiService implements WifiHost {
  private events?: WifiHostEvents;
  private active: boolean = false;
  private closed: boolean = false;
  private started: boolean = false;
  private generation: number = 0;
  private stopEpoch: number = 0;
  private scanSubscription?: HarmonyWifiEventSubscription;
  private connectionSubscription?: HarmonyWifiEventSubscription;
  private scanReject?: (error: Error) => void;
  private connectReject?: (error: Error) => void;
  private connectVerify?: () => void;
  private scanTimer: number = -1;
  private connectTimer: number = -1;
  private readonly candidates: HarmonyWifiCandidateCoordinator;
  private readonly candidateOwner: number;
  private readonly permissions: HarmonyPermissionService;

  constructor(context: common.UIAbilityContext, permissions: HarmonyPermissionService,
    candidates?: HarmonyWifiCandidateCoordinator) {
    this.permissions = permissions;
    this.candidates = candidates === undefined ? HarmonyWifiCandidateCoordinator.forContext(context) : candidates;
    this.candidateOwner = this.candidates.openOwner(context);
  }

  setEvents(events: WifiHostEvents): void {
    if (!this.closed) this.events = events;
  }

  private guard(requireStarted: boolean = true): void {
    if (this.closed) throw new Error('E_WIFI_NOT_INITIALIZED:host closed');
    if (!this.active) throw new Error('E_WIFI_BACKGROUND:ability not in foreground');
    if (requireStarted && !this.started) throw new Error('E_WIFI_NOT_INITIALIZED:call startWifi first');
  }

  private async authorize(write: boolean): Promise<void> {
    try {
      if (!await this.permissions.check('ohos.permission.GET_WIFI_INFO') ||
        (write && !await this.permissions.check('ohos.permission.SET_WIFI_INFO'))) {
        throw new Error('E_WIFI_PERMISSION_DENIED:declare GET_WIFI_INFO and SET_WIFI_INFO');
      }
    } catch (error) {
      throw new Error('E_WIFI_PERMISSION_DENIED:Wi-Fi permission missing or undeclared');
    }
  }

  async startWifi(): Promise<void> {
    this.guard(false);
    const expected = this.stopEpoch;
    await this.authorize(true);
    this.guard(false);
    if (expected !== this.stopEpoch) {
      throw new Error('E_WIFI_NOT_INITIALIZED:Wi-Fi start cancelled');
    }
    let readiness: HarmonyWifiCandidateReadiness | undefined = undefined;
    try {
      if (!wifiManager.isWifiActive()) throw new Error('E_WIFI_DISABLED:Wi-Fi switch is off');
      this.candidates.recover();
      if (this.started) return;
      readiness = await this.candidates.ready(this.candidateOwner);
      this.guard(false);
      if (expected !== this.stopEpoch) {
        throw new Error('E_WIFI_NOT_INITIALIZED:Wi-Fi start cancelled during SDK cleanup');
      }
      if (this.started) return;
      if (!wifiManager.isWifiActive()) throw new Error('E_WIFI_DISABLED:Wi-Fi switch is off');
      const generation = this.generation + 1;
      const callback = (state: number): void => {
        if (!this.started || generation !== this.generation || !this.active || this.closed) return;
        this.connectVerify?.();
        // Event state alone is not proof of association; read the actual link.
        try {
          wifiManager.getLinkedInfo().then((info: wifiManager.WifiLinkedInfo) => {
            if (generation !== this.generation || !this.active || !this.started) return;
            if (info.connState === wifiManager.ConnState.CONNECTED) this.events?.wifiConnected(linkedInfo(info, false));
          }, () => {});
        } catch (_) {}
      };
      this.connectionSubscription = this.candidates.subscribe(readiness, 'wifiConnectionChange', callback);
      this.generation = generation;
      this.started = true;
    } catch (error) {
      throw wifiError(error as Error);
    } finally {
      if (readiness !== undefined) this.candidates.releaseReadiness(readiness);
    }
  }

  async stopWifi(): Promise<void> {
    this.stopSession();
  }

  private stopSession(): void {
    ++this.stopEpoch;
    ++this.generation;
    this.started = false;
    this.scanReject?.(new Error('E_WIFI_NOT_INITIALIZED:Wi-Fi app session stopped'));
    this.connectReject?.(new Error('E_WIFI_NOT_INITIALIZED:Wi-Fi app session stopped'));
    this.scanReject = undefined;
    this.connectReject = undefined;
    this.connectVerify = undefined;
    if (this.scanTimer >= 0) clearTimeout(this.scanTimer);
    if (this.connectTimer >= 0) clearTimeout(this.connectTimer);
    this.scanTimer = -1;
    this.connectTimer = -1;
    this.detachScan();
    if (this.connectionSubscription !== undefined) {
      this.candidates.retireSubscription(this.connectionSubscription);
      this.connectionSubscription = undefined;
    }
    // Retire only this runtime's SDK lease. The app-scoped coordinator retains
    // allocation/removal ownership across closed and newly constructed graphs.
    this.candidates.stopOwner(this.candidateOwner);
  }

  private detachScan(): void {
    if (this.scanSubscription !== undefined) {
      this.candidates.retireSubscription(this.scanSubscription);
      this.scanSubscription = undefined;
    }
  }

  async getWifiList(): Promise<void> {
    this.guard();
    const generation = this.generation;
    await this.authorize(true);
    this.guard();
    if (generation !== this.generation) throw new Error('E_WIFI_NOT_INITIALIZED:session replaced');
    if (this.scanReject !== undefined) throw new Error('E_WIFI_DUPLICATE_REQUEST:scan already pending');
    let readiness: HarmonyWifiCandidateReadiness | undefined = undefined;
    try {
      readiness = await this.candidates.ready(this.candidateOwner);
      this.guard();
      if (generation !== this.generation) throw new Error('E_WIFI_NOT_INITIALIZED:session replaced during SDK cleanup');
      if (this.scanReject !== undefined) throw new Error('E_WIFI_DUPLICATE_REQUEST:scan already pending');
      const prepared = readiness;
      return new Promise<void>((resolve, reject) => {
        let done: boolean = false;
        const finish = (error?: Error): void => {
          if (done) return;
          done = true;
          if (this.scanTimer >= 0) clearTimeout(this.scanTimer);
          this.scanTimer = -1;
          this.scanReject = undefined;
          this.detachScan();
          if (error !== undefined) reject(error); else resolve();
        };
        this.scanReject = (error: Error): void => finish(error);
        const callback = (state: number): void => {
          if (done || generation !== this.generation || !this.active || !this.started) return;
          // SDK: 1 = scan succeeded, 0 = failed.
          if (state !== 1) { finish(new Error('E_WIFI_SYSTEM_INTERNAL:Wi-Fi scan failed')); return; }
          try {
            const results: WifiInfoModel[] = wifiManager.getScanInfoList().map(scanInfo);
            this.events?.wifiList(results);
            finish();
          } catch (error) { finish(wifiError(error as Error)); }
        };
        try {
          this.scanSubscription = this.candidates.subscribe(prepared, 'wifiScanStateChange', callback);
          this.scanTimer = setTimeout(() => finish(new Error('E_WIFI_SYSTEM_INTERNAL:scan result timed out')), 15000);
          wifiManager.startScan();
        } catch (error) { finish(wifiError(error as Error)); }
      });
    } catch (error) {
      throw wifiError(error as Error);
    } finally {
      if (readiness !== undefined) this.candidates.releaseReadiness(readiness);
    }
  }

  async getConnectedWifi(partialInfo: boolean): Promise<WifiInfoModel> {
    this.guard();
    const generation = this.generation;
    await this.authorize(false);
    this.guard();
    if (generation !== this.generation) throw new Error('E_WIFI_NOT_INITIALIZED:session replaced');
    try {
      const info = await wifiManager.getLinkedInfo();
      this.guard();
      if (generation !== this.generation) throw new Error('E_WIFI_NOT_INITIALIZED:session replaced');
      if (info.connState !== wifiManager.ConnState.CONNECTED || !info.ssid) {
        throw new Error('E_WIFI_SYSTEM_CONFIG:no connected Wi-Fi network');
      }
      return linkedInfo(info, partialInfo);
    } catch (error) { throw wifiError(error as Error); }
  }

  async connectWifi(params: WifiConnectParamsModel): Promise<WifiInfoModel> {
    this.guard();
    const generation = this.generation;
    await this.authorize(true);
    this.guard();
    if (generation !== this.generation) throw new Error('E_WIFI_NOT_INITIALIZED:session replaced');
    if (!params.SSID || params.SSID.length > 32) throw new Error('E_WIFI_INVALID_SSID:invalid SSID');
    if (params.maunal) throw new Error('E_WIFI_SYSTEM_NOT_SUPPORTED:manual system network picker semantics unavailable');
    if (this.connectReject !== undefined) throw new Error('E_WIFI_DUPLICATE_REQUEST:connection already pending');
    const config: wifiManager.WifiDeviceConfig = {
      ssid: params.SSID, preSharedKey: params.password,
      securityType: params.password ? wifiManager.WifiSecurityType.WIFI_SEC_TYPE_PSK :
        wifiManager.WifiSecurityType.WIFI_SEC_TYPE_OPEN
    };
    try {
      const target = wifiManager.getScanInfoList().find((info: wifiManager.WifiScanInfo) =>
        info.ssid === params.SSID && (!params.BSSID || info.bssid === params.BSSID));
      if (target !== undefined) {
        if (target.securityType !== wifiManager.WifiSecurityType.WIFI_SEC_TYPE_OPEN &&
          target.securityType !== wifiManager.WifiSecurityType.WIFI_SEC_TYPE_PSK) {
          throw new Error('E_WIFI_SYSTEM_NOT_SUPPORTED:shared credentials support open and WPA PSK networks only');
        }
        if ((target.securityType === wifiManager.WifiSecurityType.WIFI_SEC_TYPE_OPEN) === !!params.password) {
          throw new Error('E_WIFI_INVALID_PASSWORD:credentials do not match network security');
        }
        config.securityType = target.securityType;
      }
    } catch (error) { throw wifiError(error as Error); }
    if (params.password && !((params.password.length >= 8 && params.password.length <= 63) ||
      /^[0-9a-fA-F]{64}$/.test(params.password))) throw new Error('E_WIFI_INVALID_PASSWORD:invalid WPA password');
    if (params.BSSID) {
      config.bssid = params.BSSID;
      config.bssidType = wifiManager.DeviceAddressType.RANDOM_DEVICE_ADDRESS;
    }
    return new Promise<WifiInfoModel>((resolve, reject) => {
      let done: boolean = false;
      let lease: HarmonyWifiCandidateLease | undefined = undefined;
      let approved: boolean = false;
      const finish = (error?: Error, info?: WifiInfoModel): void => {
        if (done) return;
        done = true;
        if (this.connectTimer >= 0) clearTimeout(this.connectTimer);
        this.connectTimer = -1;
        this.connectReject = undefined;
        this.connectVerify = undefined;
        if (error !== undefined) {
          if (lease !== undefined) this.candidates.retire(lease);
          reject(error);
        } else if (info !== undefined) resolve(info);
      };
      this.connectReject = (error: Error): void => finish(error);
      this.connectVerify = (): void => {
        if (!approved || done) return;
        try {
          wifiManager.getLinkedInfo().then((info: wifiManager.WifiLinkedInfo) => {
            if (done || generation !== this.generation || !this.active || !this.started) return;
            if (info.connState === wifiManager.ConnState.CONNECTED && info.ssid === params.SSID &&
              (!params.BSSID || info.bssid === params.BSSID)) finish(undefined, linkedInfo(info, params.partialInfo));
          }, (error: Error) => finish(wifiError(error)));
        } catch (error) { finish(wifiError(error as Error)); }
      };
      this.connectTimer = setTimeout(() => finish(new Error('E_WIFI_CONNECTION_TIMEOUT:association timed out')), 45000);
      Promise.resolve().then(async (): Promise<HarmonyWifiCandidateLease> => {
        this.guard();
        if (done || generation !== this.generation) throw new Error('E_WIFI_NOT_INITIALIZED:session replaced');
        const readiness = await this.candidates.ready(this.candidateOwner);
        try {
          this.guard();
          if (done || generation !== this.generation) throw new Error('E_WIFI_NOT_INITIALIZED:session replaced during SDK cleanup');
          return await this.candidates.allocate(readiness, config);
        } finally {
          this.candidates.releaseReadiness(readiness);
        }
      }).then(async (allocated: HarmonyWifiCandidateLease) => {
        lease = allocated;
        if (done || generation !== this.generation || this.closed || !this.active) {
          this.candidates.retire(allocated);
          return;
        }
        // API 26 overload explicitly waits for the user's decision, not association.
        await wifiManager.connectToCandidateConfig({
          networkId: allocated.id, withUserAction: true, userActionTimeout: 30, addNetworkToSystem: false
        });
        if (done || generation !== this.generation) return;
        approved = true;
        this.connectVerify?.();
      }).catch((error: Error) => finish(wifiError(error)));
    });
  }

  async setWifiList(wifiList: WifiCredentialModel[]): Promise<void> {
    this.guard();
    throw new Error('E_WIFI_SET_WIFI_LIST_UNSUPPORTED:SDK candidate configs do not implement mini-program system picker list semantics');
  }

  async getLocationPermissionState(): Promise<WifiPermissionStateModel> {
    if (this.closed) throw new Error('E_WIFI_NOT_INITIALIZED:host closed');
    // API 26 scan results expose virtual BSSIDs without location or MAC privileges.
    try {
      const granted = await this.permissions.check('ohos.permission.GET_WIFI_INFO') &&
        await this.permissions.check('ohos.permission.SET_WIFI_INFO');
      return { status: granted ? 'granted' : 'blocked', canAskAgain: false };
    } catch (_) { return { status: 'unavailable', canAskAgain: false }; }
  }

  async requestLocationPermission(): Promise<WifiPermissionStateModel> {
    return this.getLocationPermissionState();
  }

  setActive(active: boolean): void {
    this.candidates.setActive(this.candidateOwner, active);
    if (this.closed) return;
    this.active = active;
    if (!active) this.stopSession();
  }

  close(): void {
    if (this.closed) {
      this.candidates.recover();
      return;
    }
    this.active = false;
    this.stopSession();
    this.closed = true;
    this.events = undefined;
    this.candidates.closeOwner(this.candidateOwner);
  }
}
