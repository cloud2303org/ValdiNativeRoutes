import { appUIApi } from 'app_ui/src/api';
import { bluetoothApi } from 'bluetooth/src/index';
import { storageApi } from 'mmkv/src/storage';
import { createNFCExtension } from 'nfc/src/extension';
import { createWifiExtension } from 'wifi/src/extension';

export type * from 'app_ui/src/api';

/** Public facade error identity, shared by the UI and synchronous storage APIs. */
export class ApiError extends Error {
  readonly errMsg: string;
  constructor(method: string, cause: unknown) {
    super(`${method}:fail ${cause instanceof Error ? cause.message : String(cause)}`);
    this.name = 'ApiError';
    this.errMsg = this.message;
  }
}

const fail = (method: string, cause: unknown) => new ApiError(method, cause);

type UiFacade = ReturnType<typeof appUIApi>;
type StorageFacade = ReturnType<typeof storageApi>;
type BleFacade = ReturnType<typeof bluetoothApi>;
type WifiFacade = ReturnType<typeof createWifiExtension>;
type NfcFacade = Pick<ReturnType<typeof createNFCExtension>, 'getNFCAdapter'>;
export type AppApi = UiFacade & StorageFacade & BleFacade & WifiFacade & NfcFacade;

// Compile-time proof that method-name routing partitions AppApi without overlap.
const _routingProof: [
  Exclude<keyof StorageFacade, `${string}StorageSync`>,
  Exclude<keyof WifiFacade, `${string}Wifi${string}`>,
  Exclude<keyof BleFacade, `${string}${'BLE' | 'Bluetooth'}${string}`>,
  Extract<
    keyof UiFacade,
    'getNFCAdapter' | `${string}StorageSync` | `${string}Wifi${string}` | `${string}${'BLE' | 'Bluetooth'}${string}`
  >,
] extends [never, never, never, never]
  ? true
  : never = true;
void _routingProof;

let ui: UiFacade | undefined;
let storage: StorageFacade | undefined;
let ble: BleFacade | undefined;
let wifi: WifiFacade | undefined;
let nfc: NfcFacade | undefined;

/**
 * App-owned composition: static imports keep module-selection checks strict, while lazy per-domain
 * instantiation avoids evaluating unused capability modules during `startApp()`.
 */
export const api: AppApi = new Proxy({} as Record<string, unknown>, {
  get(cache, prop, receiver) {
    if (typeof prop !== 'string') return Reflect.get(cache, prop, receiver);
    if (Object.prototype.hasOwnProperty.call(cache, prop)) return cache[prop];
    if (prop === 'then' || prop === 'toJSON') return undefined;
    const group: object =
      prop === 'getNFCAdapter'
        ? (nfc ??= { getNFCAdapter: createNFCExtension().getNFCAdapter })
        : prop.endsWith('StorageSync')
          ? (storage ??= storageApi(fail))
          : prop.includes('Wifi')
            ? (wifi ??= createWifiExtension())
            : prop.includes('BLE') || prop.includes('Bluetooth')
              ? (ble ??= bluetoothApi())
              : (ui ??= appUIApi(fail));
    if (!(prop in group)) return undefined;
    const value = Reflect.get(group, prop);
    cache[prop] = value;
    return value;
  },
}) as unknown as AppApi;
