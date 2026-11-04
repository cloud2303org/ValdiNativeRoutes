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
const wifiApi = createWifiExtension();
const nfcApi = { getNFCAdapter: createNFCExtension().getNFCAdapter };

/** App-owned composition: referencing a disabled service intentionally fails the selection check. */
export const api = {
  ...appUIApi(fail),
  ...storageApi(fail),
  ...bluetoothApi(),
  ...wifiApi,
  ...nfcApi,
};
