import { bindMethods } from '../bindMethods';
import { type WechatBleApi, wechatBle } from './wechat';

// After ExpoNativeRoutes' createBluetoothExtension: the mini-program Bluetooth methods, bound to the one app-wide
// runtime so `api.openBluetoothAdapter()` etc. work from any page. Pages only remove the listeners they added;
// connections, scans and servers stay until the business code stops or closes them.
//
// wechat.ts and peripheral.ts are the one implementation on both platforms; native (BleHost) is capability only.

const NAMES = [
  'openBluetoothAdapter',
  'createBLEPeripheralServer',
  'onBLEPeripheralConnectionStateChanged',
  'offBLEPeripheralConnectionStateChanged',
  'closeBluetoothAdapter',
  'getBluetoothAdapterState',
  'startBluetoothDevicesDiscovery',
  'stopBluetoothDevicesDiscovery',
  'getBluetoothDevices',
  'createBLEConnection',
  'closeBLEConnection',
  'makeBluetoothPair',
  'isBluetoothDevicePaired',
  'getBLEDeviceServices',
  'getBLEDeviceCharacteristics',
  'getBLEDeviceRSSI',
  'notifyBLECharacteristicValueChange',
  'writeBLECharacteristicValue',
  'readBLECharacteristicValue',
  'setBLEMTU',
  'getBLEMTU',
  'getConnectedBluetoothDevices',
  'onBluetoothDeviceFound',
  'offBluetoothDeviceFound',
  'onBluetoothAdapterStateChange',
  'offBluetoothAdapterStateChange',
  'onBLEConnectionStateChange',
  'offBLEConnectionStateChange',
  'onBLECharacteristicValueChange',
  'offBLECharacteristicValueChange',
  'onBLEMTUChange',
  'offBLEMTUChange',
] as const;

export type BluetoothApi = Pick<WechatBleApi, (typeof NAMES)[number]>;

export function bluetoothApi(): BluetoothApi {
  return bindMethods(wechatBle, NAMES);
}
