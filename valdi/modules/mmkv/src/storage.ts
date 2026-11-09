import { getHost } from './MMKV';
import * as v from 'valibot';

/**
 * The app's key-value store: one MMKV instance, synchronous, on the JS thread. The bridge carries strings only;
 * JSON serialization and structure checking belong to JS. MMKV does not
 * define an application's authentication or secret-storage policy.
 *
 * @ExportModel({ios: 'VRStorageHost', android: 'io.valdiroutes.mmkv.StorageHost'})
 */
export interface StorageHost {
  /** `found` distinguishes a missing key from a stored null. `value` is the stored JSON text. */
  get: (key: string) => StorageReadReply;
  /** false when MMKV couldn't write it (no disk space, for one). `value` is the JSON text to persist. */
  set: (request: StorageWriteRequest) => boolean;
  remove: (key: string) => void;
  clear: () => void;
}

/**
 * The bridge carries JSON text; JS owns serialization. Empty or absent text is never stored: `setStorageSync`
 * stringifies first, so `value` is always non-empty.
 *
 * @ExportModel({ios: 'VRStorageWriteRequest', android: 'io.valdiroutes.mmkv.StorageWriteRequest'})
 */
export interface StorageWriteRequest {
  key: string;
  value: string;
}

/**
 * `found` distinguishes a missing key from a stored value. A corrupt stored value is an error reported by JS
 * parsing, never a cache miss.
 *
 * @ExportModel({ios: 'VRStorageReadReply', android: 'io.valdiroutes.mmkv.StorageReadReply'})
 */
export interface StorageReadReply {
  found: boolean;
  value: string;
}

const storageKey = v.pipe(v.string('key must be a string'), v.regex(/\S/, 'key must not be empty'));

/** Synchronous storage of JSON-serializable values. Missing keys return undefined; invalid data throws ApiError. */
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
        const reply = getHost().get(v.parse(storageKey, key));
        if (!reply.found) return undefined;
        try {
          return JSON.parse(reply.value) as T;
        } catch {
          throw new Error(`the stored value is not valid JSON (key ${JSON.stringify(key)})`);
        }
      });
    },

    setStorageSync(key: string, data: unknown): void {
      sync('setStorageSync', () => {
        const value = JSON.stringify(data);
        if (value === undefined) throw new Error('the value is not JSON-serializable');
        if (!getHost().set({ key: v.parse(storageKey, key), value })) {
          throw new Error('the store could not write it');
        }
      });
    },

    removeStorageSync(key: string): void {
      sync('removeStorageSync', () => getHost().remove(v.parse(storageKey, key)));
    },

    clearStorageSync(): void {
      sync('clearStorageSync', () => getHost().clear());
    },
  };
}
