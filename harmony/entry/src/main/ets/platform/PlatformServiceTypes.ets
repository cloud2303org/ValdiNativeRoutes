// Frozen per-runtime ArkTS service contract. Mirrors the business TypeScript models.
// SDK units pass through unchanged (milliseconds, dBm, MHz, bytes).
// Construct children with the owning UIAbilityContext; no global service broker.

export interface BleServiceData {
  uuid: string;
  data: Uint8Array;
}
export interface BleDevice {
  RSSI: number;
  advertisData: Uint8Array;
  advertisServiceUUIDs: string[];
  deviceId: string;
  localName: string;
  name: string;
  serviceData: BleServiceData[];
  connectable?: boolean;
}
export interface BleService {
  uuid: string;
  isPrimary: boolean;
}
export interface BleCharacteristicProperties {
  read: boolean;
  write: boolean;
  writeDefault: boolean;
  writeNoResponse: boolean;
  notify: boolean;
  indicate: boolean;
}
export interface BleCharacteristic {
  uuid: string;
  properties: BleCharacteristicProperties;
}
export interface BleAdapterState {
  available: boolean;
  discovering: boolean;
  peripheralAvailable?: boolean;
}
export interface BleConnectStateChange {
  deviceId: string;
  connected: boolean;
}
export interface BleCharacteristicValue {
  deviceId: string;
  serviceId: string;
  characteristicId: string;
  value: Uint8Array;
}
export interface BleMTUChange {
  deviceId: string;
  mtu: number;
}
export interface BleConnectedDevice {
  deviceId: string;
  name: string;
}
export interface BleScanParams {
  services?: string[];
  allowDuplicatesKey?: boolean;
  interval?: number;
  powerLevel?: string;
}
export interface BleNotifyParams {
  deviceId: string;
  serviceId: string;
  characteristicId: string;
  state: boolean;
  type?: string;
}
export interface BleWriteParams {
  deviceId: string;
  serviceId: string;
  characteristicId: string;
  value: Uint8Array;
  writeType?: string;
}
export interface BleReadParams {
  deviceId: string;
  serviceId: string;
  characteristicId: string;
}
export interface BlePairParams {
  deviceId: string;
  pin: string;
  timeout: number;
}
export interface BlePeripheralProperties {
  read: boolean;
  write: boolean;
  writeNoResponse: boolean;
  notify: boolean;
  indicate: boolean;
}
export interface BlePeripheralPermissions {
  readable: boolean;
  writeable: boolean;
  readEncryptionRequired: boolean;
  writeEncryptionRequired: boolean;
}
export interface BlePeripheralDescriptor {
  uuid: string;
  read: boolean;
  write: boolean;
  value: Uint8Array;
}
export interface BlePeripheralCharacteristic {
  uuid: string;
  properties: BlePeripheralProperties;
  permission: BlePeripheralPermissions;
  value: Uint8Array;
  descriptors: BlePeripheralDescriptor[];
}
export interface BlePeripheralService {
  uuid: string;
  characteristics: BlePeripheralCharacteristic[];
}
export interface BlePeripheralManufacturerData {
  manufacturerId: number;
  manufacturerSpecificData: Uint8Array;
}
export interface BlePeripheralBeacon {
  uuid: string;
  major: number;
  minor: number;
  measuredPower: number;
}
export interface BlePeripheralAdvertisingParams {
  serverId: string;
  connectable: boolean;
  deviceName: string;
  serviceUuids: string[];
  manufacturerData: BlePeripheralManufacturerData[];
  powerLevel: string;
  beacon?: BlePeripheralBeacon;
}
export interface BlePeripheralWriteParams {
  serverId: string;
  serviceId: string;
  characteristicId: string;
  value: Uint8Array;
  needNotify: boolean;
  callbackId?: number;
}
export interface BlePeripheralReadRequest {
  serverId: string;
  serviceId: string;
  characteristicId: string;
  callbackId: number;
  deviceId: string;
  offset: number;
}
export interface BlePeripheralWriteRequest {
  serverId: string;
  serviceId: string;
  characteristicId: string;
  callbackId: number;
  deviceId: string;
  offset: number;
  value: Uint8Array;
  needResponse: boolean;
}
export interface BlePeripheralSubscriptionEvent {
  serverId: string;
  serviceId: string;
  characteristicId: string;
  deviceId: string;
}
export interface BlePeripheralConnectionState {
  serverId: string;
  deviceId: string;
  connected: boolean;
}
export interface BleHostEvents {
  deviceFound: (device: BleDevice) => void;
  adapterStateChange: (state: BleAdapterState) => void;
  connectStateChange: (event: BleConnectStateChange) => void;
  characteristicUpdate: (event: BleCharacteristicValue) => void;
  mtuChange: (event: BleMTUChange) => void;
  peripheralReadRequest: (event: BlePeripheralReadRequest) => void;
  peripheralWriteRequest: (event: BlePeripheralWriteRequest) => void;
  peripheralSubscribed: (event: BlePeripheralSubscriptionEvent) => void;
  peripheralUnsubscribed: (event: BlePeripheralSubscriptionEvent) => void;
  peripheralConnectionStateChange: (event: BlePeripheralConnectionState) => void;
}
export interface BleHost {
  setEvents(events: BleHostEvents): void;

  openBluetoothAdapter(mode: string | undefined): Promise<void>;
  closeBluetoothAdapter(): Promise<void>;
  getBluetoothAdapterState(): Promise<BleAdapterState>;

  startBluetoothDevicesDiscovery(params: BleScanParams): Promise<void>;
  startBluetoothDevicesDiscoveryWithNames(names: string[]): Promise<void>;
  startBluetoothDevicesDiscoveryWithAddresses(addresses: string[]): Promise<void>;
  stopBluetoothDevicesDiscovery(): Promise<void>;
  getBluetoothDevices(): Promise<BleDevice[]>;

  createBLEConnection(deviceId: string, timeout: number | undefined): Promise<void>;
  closeBLEConnection(deviceId: string): Promise<void>;
  makeBluetoothPair(params: BlePairParams): Promise<void>;
  isBluetoothDevicePaired(deviceId: string): Promise<void>;

  getBLEDeviceServices(deviceId: string): Promise<BleService[]>;
  getBLEDeviceRSSI(deviceId: string): Promise<number>;
  getBLEDeviceCharacteristics(deviceId: string, serviceId: string): Promise<BleCharacteristic[]>;
  notifyBLECharacteristicValueChange(params: BleNotifyParams): Promise<void>;
  writeBLECharacteristicValue(params: BleWriteParams): Promise<void>;
  readBLECharacteristicValue(params: BleReadParams): Promise<void>;
  setBLEMTU(deviceId: string, mtu: number): Promise<number>;
  getBLEMTU(deviceId: string, writeType: string | undefined): Promise<number>;
  getConnectedBluetoothDevices(services: string[]): Promise<BleConnectedDevice[]>;

  createBLEPeripheralServer(): Promise<string>;
  addPeripheralService(serverId: string, service: BlePeripheralService): Promise<void>;
  removePeripheralService(serverId: string, serviceId: string): Promise<void>;
  startPeripheralAdvertising(params: BlePeripheralAdvertisingParams): Promise<void>;
  stopPeripheralAdvertising(serverId: string): Promise<void>;
  writePeripheralCharacteristicValue(params: BlePeripheralWriteParams): Promise<void>;
  closeBLEPeripheralServer(serverId: string): Promise<void>;
}

export interface PermissionGrant {
  permission: string;
  /** 'granted', 'denied' or 'never_ask_again'. */
  result: string;
}
export interface PermissionHost {
  /** Android: ContextCompat.checkSelfPermission. */
  check(permission: string): Promise<boolean>;
  /** Android: one system prompt for all, from the foreground activity. */
  requestMultiple(permissions: string[]): Promise<PermissionGrant[]>;
  /** The app's page in system settings. */
  openSettings(): Promise<void>;
}

export interface WifiInfoModel {
  SSID: string;
  BSSID?: string;
  secure?: boolean;
  signalStrength?: number;
  frequency?: number;
}
export interface WifiConnectParamsModel {
  SSID: string;
  BSSID: string;
  password: string;
  maunal: boolean;
  partialInfo: boolean;
}
export interface WifiCredentialModel {
  SSID: string;
  BSSID?: string;
  password: string;
}
export interface WifiPermissionStateModel {
  status: string;
  canAskAgain: boolean;
}
export interface WifiHostEvents {
  wifiConnected: (wifi: WifiInfoModel) => void;
  wifiList: (wifiList: WifiInfoModel[]) => void;
}
export interface WifiHost {
  setEvents(events: WifiHostEvents): void;
  startWifi(): Promise<void>;
  stopWifi(): Promise<void>;
  connectWifi(params: WifiConnectParamsModel): Promise<WifiInfoModel>;
  getWifiList(): Promise<void>;
  getConnectedWifi(partialInfo: boolean): Promise<WifiInfoModel>;
  setWifiList(wifiList: WifiCredentialModel[]): Promise<void>;
  getLocationPermissionState(): Promise<WifiPermissionStateModel>;
  requestLocationPermission(): Promise<WifiPermissionStateModel>;
}

export interface NfcHandleModel {
  tagHandle: string;
  tech: string;
}
export interface NfcAvailabilityModel {
  supported: boolean;
  enabled: boolean;
  foreground: boolean;
  permissionGranted: boolean;
}
export interface NfcRecordModel {
  id: Uint8Array;
  type: Uint8Array;
  payload: Uint8Array;
  tnf: number;
}
export interface NfcTagModel {
  tagHandle: string;
  id: Uint8Array;
  techs: string[];
  messages: NfcRecordModel[];
}
export interface NfcHostEvents {
  discovered: (tag: NfcTagModel) => void;
  discoveryStateChange: (discovering: boolean) => void;
}
export interface NfcHost {
  setEvents(events: NfcHostEvents): void;
  getAvailability(): Promise<NfcAvailabilityModel>;
  startDiscovery(): Promise<void>;
  stopDiscovery(): Promise<void>;
  connect(handle: NfcHandleModel): Promise<void>;
  close(handle: NfcHandleModel): Promise<void>;
  isConnected(handle: NfcHandleModel): Promise<boolean>;
  transceive(handle: NfcHandleModel, data: Uint8Array): Promise<Uint8Array>;
  getMaxTransceiveLength(handle: NfcHandleModel): Promise<number>;
  setTimeout(handle: NfcHandleModel, timeout: number): Promise<void>;
  getAtqa(handle: NfcHandleModel): Promise<Uint8Array>;
  getSak(handle: NfcHandleModel): Promise<number>;
  getHistoricalBytes(handle: NfcHandleModel): Promise<Uint8Array>;
  writeNdefMessage(handle: NfcHandleModel, records: NfcRecordModel[], uris: string[], texts: string[]): Promise<void>;
}

export interface PlatformServices {
  version: 1;
  ble: BleHost;
  permissions: PermissionHost;
  wifi: WifiHost;
  nfc: NfcHost;
  setActive(active: boolean): void;
  close(): void;
}
