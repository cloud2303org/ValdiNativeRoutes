/**
 * The Valdi bridge to the native BLE core, implemented by each host and installed at startup. It is capability only:
 * wechat.ts and peripheral.ts own every mini-program rule (validation, UUIDs, queues, sessions, errCodes) for both
 * platforms. Calls return a native Promise, rejected with the core's `E_BLE_…:message`: a callback created by a page
 * would be disposed with that page and leave the shared queues waiting forever. Events go to the one BleHostEvents
 * given at install time; native.ts fans them out to listeners.
 */

/** @ExportModel({ios: 'VRBleServiceData', android: 'io.valdiroutes.pages.BleServiceData'}) */
export interface BleServiceData {
  uuid: string;
  data: Uint8Array;
}

/** @ExportModel({ios: 'VRBleDevice', android: 'io.valdiroutes.pages.BleDevice'}) */
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

/** @ExportModel({ios: 'VRBleService', android: 'io.valdiroutes.pages.BleService'}) */
export interface BleService {
  uuid: string;
  isPrimary: boolean;
}

/** @ExportModel({ios: 'VRBleCharacteristicProperties', android: 'io.valdiroutes.pages.BleCharacteristicProperties'}) */
export interface BleCharacteristicProperties {
  read: boolean;
  write: boolean;
  writeDefault: boolean;
  writeNoResponse: boolean;
  notify: boolean;
  indicate: boolean;
}

/** @ExportModel({ios: 'VRBleCharacteristic', android: 'io.valdiroutes.pages.BleCharacteristic'}) */
export interface BleCharacteristic {
  uuid: string;
  properties: BleCharacteristicProperties;
}

/** @ExportModel({ios: 'VRBleAdapterState', android: 'io.valdiroutes.pages.BleAdapterState'}) */
export interface BleAdapterState {
  available: boolean;
  discovering: boolean;
  peripheralAvailable?: boolean;
}

/** @ExportModel({ios: 'VRBleConnectStateChange', android: 'io.valdiroutes.pages.BleConnectStateChange'}) */
export interface BleConnectStateChange {
  deviceId: string;
  connected: boolean;
}

/** @ExportModel({ios: 'VRBleCharacteristicValue', android: 'io.valdiroutes.pages.BleCharacteristicValue'}) */
export interface BleCharacteristicValue {
  deviceId: string;
  serviceId: string;
  characteristicId: string;
  value: Uint8Array;
}

/** @ExportModel({ios: 'VRBleMTUChange', android: 'io.valdiroutes.pages.BleMTUChange'}) */
export interface BleMTUChange {
  deviceId: string;
  mtu: number;
}

/** @ExportModel({ios: 'VRBleConnectedDevice', android: 'io.valdiroutes.pages.BleConnectedDevice'}) */
export interface BleConnectedDevice {
  deviceId: string;
  name: string;
}

/** @ExportModel({ios: 'VRBleScanParams', android: 'io.valdiroutes.pages.BleScanParams'}) */
export interface BleScanParams {
  services?: string[];
  allowDuplicatesKey?: boolean;
  interval?: number;
  powerLevel?: string;
}

/** @ExportModel({ios: 'VRBleNotifyParams', android: 'io.valdiroutes.pages.BleNotifyParams'}) */
export interface BleNotifyParams {
  deviceId: string;
  serviceId: string;
  characteristicId: string;
  state: boolean;
  type?: string;
}

/** @ExportModel({ios: 'VRBleWriteParams', android: 'io.valdiroutes.pages.BleWriteParams'}) */
export interface BleWriteParams {
  deviceId: string;
  serviceId: string;
  characteristicId: string;
  value: Uint8Array;
  writeType?: string;
}

/** @ExportModel({ios: 'VRBleReadParams', android: 'io.valdiroutes.pages.BleReadParams'}) */
export interface BleReadParams {
  deviceId: string;
  serviceId: string;
  characteristicId: string;
}

/** @ExportModel({ios: 'VRBlePairParams', android: 'io.valdiroutes.pages.BlePairParams'}) */
export interface BlePairParams {
  deviceId: string;
  pin: string;
  timeout: number;
}

/** @ExportModel({ios: 'VRBlePeripheralProperties', android: 'io.valdiroutes.pages.BlePeripheralProperties'}) */
export interface BlePeripheralProperties {
  read: boolean;
  write: boolean;
  writeNoResponse: boolean;
  notify: boolean;
  indicate: boolean;
}

/** @ExportModel({ios: 'VRBlePeripheralPermissions', android: 'io.valdiroutes.pages.BlePeripheralPermissions'}) */
export interface BlePeripheralPermissions {
  readable: boolean;
  writeable: boolean;
  readEncryptionRequired: boolean;
  writeEncryptionRequired: boolean;
}

/** @ExportModel({ios: 'VRBlePeripheralDescriptor', android: 'io.valdiroutes.pages.BlePeripheralDescriptor'}) */
export interface BlePeripheralDescriptor {
  uuid: string;
  read: boolean;
  write: boolean;
  value: Uint8Array;
}

/** @ExportModel({ios: 'VRBlePeripheralCharacteristic', android: 'io.valdiroutes.pages.BlePeripheralCharacteristic'}) */
export interface BlePeripheralCharacteristic {
  uuid: string;
  properties: BlePeripheralProperties;
  permission: BlePeripheralPermissions;
  value: Uint8Array;
  descriptors: BlePeripheralDescriptor[];
}

/** @ExportModel({ios: 'VRBlePeripheralService', android: 'io.valdiroutes.pages.BlePeripheralService'}) */
export interface BlePeripheralService {
  uuid: string;
  characteristics: BlePeripheralCharacteristic[];
}

/** @ExportModel({ios: 'VRBlePeripheralManufacturerData', android: 'io.valdiroutes.pages.BlePeripheralManufacturerData'}) */
export interface BlePeripheralManufacturerData {
  manufacturerId: number;
  manufacturerSpecificData: Uint8Array;
}

/** @ExportModel({ios: 'VRBlePeripheralBeacon', android: 'io.valdiroutes.pages.BlePeripheralBeacon'}) */
export interface BlePeripheralBeacon {
  uuid: string;
  major: number;
  minor: number;
  measuredPower: number;
}

/** @ExportModel({ios: 'VRBlePeripheralAdvertisingParams', android: 'io.valdiroutes.pages.BlePeripheralAdvertisingParams'}) */
export interface BlePeripheralAdvertisingParams {
  serverId: string;
  connectable: boolean;
  deviceName: string;
  serviceUuids: string[];
  manufacturerData: BlePeripheralManufacturerData[];
  powerLevel: string;
  beacon?: BlePeripheralBeacon;
}

/** @ExportModel({ios: 'VRBlePeripheralWriteParams', android: 'io.valdiroutes.pages.BlePeripheralWriteParams'}) */
export interface BlePeripheralWriteParams {
  serverId: string;
  serviceId: string;
  characteristicId: string;
  value: Uint8Array;
  needNotify: boolean;
  callbackId?: number;
}

/** @ExportModel({ios: 'VRBlePeripheralReadRequest', android: 'io.valdiroutes.pages.BlePeripheralReadRequest'}) */
export interface BlePeripheralReadRequest {
  serverId: string;
  serviceId: string;
  characteristicId: string;
  callbackId: number;
  deviceId: string;
  offset: number;
}

/** @ExportModel({ios: 'VRBlePeripheralWriteRequest', android: 'io.valdiroutes.pages.BlePeripheralWriteRequest'}) */
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

/** @ExportModel({ios: 'VRBlePeripheralSubscriptionEvent', android: 'io.valdiroutes.pages.BlePeripheralSubscriptionEvent'}) */
export interface BlePeripheralSubscriptionEvent {
  serverId: string;
  serviceId: string;
  characteristicId: string;
  deviceId: string;
}

/** @ExportModel({ios: 'VRBlePeripheralConnectionState', android: 'io.valdiroutes.pages.BlePeripheralConnectionState'}) */
export interface BlePeripheralConnectionState {
  serverId: string;
  deviceId: string;
  connected: boolean;
}

/**
 * Everything the core reports, for the app's lifetime. Native only drops repeat advertisements the scan would filter
 * anyway (allowDuplicatesKey false, or inside `interval`), to keep them off the bridge; wechat.ts still decides.
 *
 * @ExportModel({ios: 'VRBleHostEvents', android: 'io.valdiroutes.pages.BleHostEvents'})
 */
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

/**
 * One app-wide BleCore session.
 *
 * @ExportProxy({ios: 'VRBleHost', android: 'io.valdiroutes.pages.BleHost'})
 */
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

import { bleEvents } from './events';

const HOST_KEY = '__valdiRoutesBleHost';

/**
 * Called by the host at startup, from a JS scope it keeps for the app's lifetime.
 *
 * @ExportFunction({ios: 'VRInstallBleHost', android: 'io.valdiroutes.pages.InstallBleHost'})
 */
export function installBleHost(host: BleHost): void {
  (globalThis as any)[HOST_KEY] = host;
  host.setEvents(bleEvents);
}

export function bleHost(): BleHost {
  const host: BleHost | undefined = (globalThis as any)[HOST_KEY];
  if (!host) {
    throw new Error('E_BLE_NOT_AVAILABLE:native Bluetooth is not installed');
  }
  return host;
}
