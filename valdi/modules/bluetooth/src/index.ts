import { bleHost } from './BleHost';
import { configureBluetoothPermissions, type BluetoothPermissions } from './permissions';

export { bluetoothApi, type BluetoothApi } from './extension';
export type * from './wechat';

/** Call from the App's retained startup scope before rendering any BLE page. */
export function initializeBluetooth(permissions: BluetoothPermissions): void {
  configureBluetoothPermissions(permissions);
  bleHost();
}
