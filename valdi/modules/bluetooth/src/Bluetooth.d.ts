import type { BleHost } from './BleHost';

/**
 * Application-wide native capability. The factory retains one implementation;
 * pages subscribe to TS events and never own the native session.
 *
 * @ExportModule({ios: 'VRBluetoothNativeModule', android: 'io.valdiroutes.bluetooth.BluetoothNativeModule'})
 */
export declare function getHost(): BleHost;
