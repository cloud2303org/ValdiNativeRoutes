import * as v from 'valibot';
import { snapshotStructuredValue } from './structuredData';

/**
 * The app's key-value store: one MMKV instance, synchronous, on the JS thread. The bridge carries structured
 * values; JSON encoding belongs to the native persistence boundary. Not for secrets: MMKV's file is readable
 * by whoever gets the app's files (the token is in
 * TokenStore, auth.ts).
 *
 * @ExportModel({ios: 'VRStorageHost', android: 'io.valdiroutes.pages.StorageHost'})
 */
export interface StorageHost {
  get: (key: string) => StorageReadReply;
  /** false when MMKV couldn't write it (no disk space, for one). */
  set: (request: StorageWriteRequest) => boolean;
  remove: (key: string) => void;
  clear: () => void;
}

/**
 * `payload` is a dictionary with one `value` entry, which may itself be a scalar, array, object or null.
 * As with route params, `any` is the exporter's dictionary spelling (Kotlin Map / Objective-C NSDictionary).
 * The envelope permits scalar roots without converting them to JSON text.
 *
 * @ExportModel({ios: 'VRStorageWriteRequest', android: 'io.valdiroutes.pages.StorageWriteRequest'})
 */
export interface StorageWriteRequest {
  key: string;
  payload: any;
}

/**
 * `found` distinguishes a missing key from a stored null. A corrupt stored value is an error, never a cache miss.
 *
 * @ExportModel({ios: 'VRStorageReadReply', android: 'io.valdiroutes.pages.StorageReadReply'})
 */
export interface StorageReadReply {
  found: boolean;
  payload: any;
  error: string;
}

// On globalThis, as AppUIHost: a module Valdi unloads and reloads would lose it.
const HOST_KEY = '__valdiRoutesStorageHost';

/**
 * Called by the host before startApp, so the first page can already read the store.
 *
 * @ExportFunction({ios: 'VRInstallStorageHost', android: 'io.valdiroutes.pages.InstallStorageHost'})
 */
export function installStorageHost(host: StorageHost): void {
  (globalThis as any)[HOST_KEY] = host;
}

function storageHost(): StorageHost {
  const host: StorageHost | undefined = (globalThis as any)[HOST_KEY];
  if (!host) {
    throw new Error('native storage is not installed');
  }
  return host;
}

const storageKey = v.pipe(v.string('key must be a string'), v.regex(/\S/, 'key must not be empty'));

/** Synchronous storage of plain structured values. Missing keys return undefined; invalid data throws ApiError. */
export function storageApi(fail: (method: string, cause: unknown) => Error) {
  const sync = <T>(method: string, run: () => T): T => {
    try {
      return run();
    } catch (cause) {
      throw fail(method, cause);
    }
  };
  return {
    getStorageSync<T = unknown>(key: string): T | undefined {
      return sync('getStorageSync', () => {
        const reply = storageHost().get(v.parse(storageKey, key));
        if (reply.error) throw new Error(reply.error);
        return reply.found ? (reply.payload.value as T) : undefined;
      });
    },

    setStorageSync(key: string, data: unknown): void {
      sync('setStorageSync', () => {
        const payload = { value: snapshotStructuredValue(data, 'storage data') };
        if (!storageHost().set({ key: v.parse(storageKey, key), payload })) {
          throw new Error('the store could not write it');
        }
      });
    },

    removeStorageSync(key: string): void {
      sync('removeStorageSync', () => storageHost().remove(v.parse(storageKey, key)));
    },

    clearStorageSync(): void {
      sync('clearStorageSync', () => storageHost().clear());
    },
  };
}
