import { nativeCall } from '../nativeCall';
import {
  type BleAdapterState,
  type BleCharacteristicValue,
  type BleConnectStateChange,
  type BleDevice,
  type BleMTUChange,
  type BleNotifyParams,
  type BlePairParams,
  type BlePeripheralAdvertisingParams,
  type BlePeripheralConnectionState,
  type BlePeripheralReadRequest,
  type BlePeripheralService,
  type BlePeripheralSubscriptionEvent,
  type BlePeripheralWriteParams,
  type BlePeripheralWriteRequest,
  type BleReadParams,
  type BleScanParams,
  bleHost,
} from './BleHost';
import { listen, unlisten } from './events';

// What wechat.ts and peripheral.ts call on the host's BleHost: its Promises go through nativeCall, the mini-program's
// ArrayBuffer crosses as Uint8Array, and listeners subscribe to events.ts instead of to native. Everything else uses
// the generated BleHost types as they are.

/** A scanned device as the mini-program reports it. */
export type Device = Omit<BleDevice, 'advertisData' | 'serviceData'> & {
  advertisData: ArrayBuffer;
  serviceData: Record<string, ArrayBuffer>;
};
export type CharacteristicValue = Omit<BleCharacteristicValue, 'value'> & { value: ArrayBuffer };
export type PeripheralWriteRequest = Omit<BlePeripheralWriteRequest, 'value'> & { value: ArrayBuffer };

/**
 * Outgoing bytes are copied: native reads the JS memory itself (no copy at the bridge), possibly after the caller
 * changed it.
 */
export const bytes = (buffer: ArrayBuffer): Uint8Array => new Uint8Array(buffer.slice(0));
/** Incoming bytes come in a buffer of their own, used as is unless the view covers only part of it. */
const buffer = (data: Uint8Array): ArrayBuffer =>
  data.byteOffset === 0 && data.byteLength === data.buffer.byteLength
    ? (data.buffer as ArrayBuffer)
    : (data.buffer as ArrayBuffer).slice(data.byteOffset, data.byteOffset + data.byteLength);

function device(source: BleDevice): Device {
  const serviceData: Record<string, ArrayBuffer> = {};
  source.serviceData.forEach(entry => {
    serviceData[entry.uuid] = buffer(entry.data);
  });
  return { ...source, advertisData: buffer(source.advertisData), serviceData };
}

/** Calling it neither opens Bluetooth nor asks for permission. */
export const nativeBLE = {
  openBluetoothAdapter: (mode: string | undefined) => nativeCall(() => bleHost().openBluetoothAdapter(mode)),
  closeBluetoothAdapter: () => nativeCall(() => bleHost().closeBluetoothAdapter()),
  getBluetoothAdapterState: () => nativeCall(() => bleHost().getBluetoothAdapterState()),

  startBluetoothDevicesDiscovery: (params: BleScanParams) =>
    nativeCall(() => bleHost().startBluetoothDevicesDiscovery(params)),
  startBluetoothDevicesDiscoveryWithNames: (names: string[]) =>
    nativeCall(() => bleHost().startBluetoothDevicesDiscoveryWithNames(names)),
  startBluetoothDevicesDiscoveryWithAddresses: (addresses: string[]) =>
    nativeCall(() => bleHost().startBluetoothDevicesDiscoveryWithAddresses(addresses)),
  stopBluetoothDevicesDiscovery: () => nativeCall(() => bleHost().stopBluetoothDevicesDiscovery()),
  getBluetoothDevices: async () => (await nativeCall(() => bleHost().getBluetoothDevices())).map(device),

  createBLEConnection: (deviceId: string, timeout: number | undefined) =>
    nativeCall(() => bleHost().createBLEConnection(deviceId, timeout)),
  closeBLEConnection: (deviceId: string) => nativeCall(() => bleHost().closeBLEConnection(deviceId)),
  makeBluetoothPair: (params: BlePairParams) => nativeCall(() => bleHost().makeBluetoothPair(params)),
  isBluetoothDevicePaired: (deviceId: string) => nativeCall(() => bleHost().isBluetoothDevicePaired(deviceId)),

  getBLEDeviceServices: (deviceId: string) => nativeCall(() => bleHost().getBLEDeviceServices(deviceId)),
  getBLEDeviceRSSI: (deviceId: string) => nativeCall(() => bleHost().getBLEDeviceRSSI(deviceId)),
  getBLEDeviceCharacteristics: (deviceId: string, serviceId: string) =>
    nativeCall(() => bleHost().getBLEDeviceCharacteristics(deviceId, serviceId)),
  notifyBLECharacteristicValueChange: (params: BleNotifyParams) =>
    nativeCall(() => bleHost().notifyBLECharacteristicValueChange(params)),
  writeBLECharacteristicValue: (params: BleReadParams & { value: ArrayBuffer; writeType?: string }) =>
    nativeCall(() => bleHost().writeBLECharacteristicValue({ ...params, value: bytes(params.value) })),
  readBLECharacteristicValue: (params: BleReadParams) => nativeCall(() => bleHost().readBLECharacteristicValue(params)),
  setBLEMTU: (deviceId: string, mtu: number) => nativeCall(() => bleHost().setBLEMTU(deviceId, mtu)),
  getBLEMTU: (deviceId: string, writeType: string | undefined) =>
    nativeCall(() => bleHost().getBLEMTU(deviceId, writeType)),
  getConnectedBluetoothDevices: (services: string[]) =>
    nativeCall(() => bleHost().getConnectedBluetoothDevices(services)),

  onBluetoothDeviceFound: (cb: (device: Device) => void) => listen('deviceFound', event => cb(device(event))),
  removeBluetoothDeviceFoundListener: (id: number) => unlisten('deviceFound', id),
  onAdapterStateChange: (cb: (state: BleAdapterState) => void) => listen('adapterStateChange', cb),
  removeAdapterStateListener: (id: number) => unlisten('adapterStateChange', id),
  onConnectStateChange: (cb: (event: BleConnectStateChange) => void) => listen('connectStateChange', cb),
  removeConnectStateListener: (id: number) => unlisten('connectStateChange', id),
  onCharacteristicUpdate: (cb: (event: CharacteristicValue) => void) =>
    listen('characteristicUpdate', event => cb({ ...event, value: buffer(event.value) })),
  removeCharacteristicListener: (id: number) => unlisten('characteristicUpdate', id),
  onMtuChange: (cb: (event: BleMTUChange) => void) => listen('mtuChange', cb),
  removeMtuListener: (id: number) => unlisten('mtuChange', id),

  // peripheral.ts builds the services, advertising and replies with Uint8Array already.
  createBLEPeripheralServer: () => nativeCall(() => bleHost().createBLEPeripheralServer()),
  addPeripheralService: (serverId: string, service: BlePeripheralService) =>
    nativeCall(() => bleHost().addPeripheralService(serverId, service)),
  removePeripheralService: (serverId: string, serviceId: string) =>
    nativeCall(() => bleHost().removePeripheralService(serverId, serviceId)),
  startPeripheralAdvertising: (params: BlePeripheralAdvertisingParams) =>
    nativeCall(() => bleHost().startPeripheralAdvertising(params)),
  stopPeripheralAdvertising: (serverId: string) => nativeCall(() => bleHost().stopPeripheralAdvertising(serverId)),
  writePeripheralCharacteristicValue: (params: BlePeripheralWriteParams) =>
    nativeCall(() => bleHost().writePeripheralCharacteristicValue(params)),
  closeBLEPeripheralServer: (serverId: string) => nativeCall(() => bleHost().closeBLEPeripheralServer(serverId)),
  onPeripheralReadRequest: (cb: (event: BlePeripheralReadRequest) => void) => listen('peripheralReadRequest', cb),
  removePeripheralReadRequestListener: (id: number) => unlisten('peripheralReadRequest', id),
  onPeripheralWriteRequest: (cb: (event: PeripheralWriteRequest) => void) =>
    listen('peripheralWriteRequest', event => cb({ ...event, value: buffer(event.value) })),
  removePeripheralWriteRequestListener: (id: number) => unlisten('peripheralWriteRequest', id),
  onPeripheralSubscribed: (cb: (event: BlePeripheralSubscriptionEvent) => void) => listen('peripheralSubscribed', cb),
  removePeripheralSubscribedListener: (id: number) => unlisten('peripheralSubscribed', id),
  onPeripheralUnsubscribed: (cb: (event: BlePeripheralSubscriptionEvent) => void) =>
    listen('peripheralUnsubscribed', cb),
  removePeripheralUnsubscribedListener: (id: number) => unlisten('peripheralUnsubscribed', id),
  onPeripheralConnectionStateChange: (cb: (event: BlePeripheralConnectionState) => void) =>
    listen('peripheralConnectionStateChange', cb),
  removePeripheralConnectionStateListener: (id: number) => unlisten('peripheralConnectionStateChange', id),
};

export type NativeBLE = typeof nativeBLE;
