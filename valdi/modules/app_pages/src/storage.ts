import * as v from 'valibot';

/**
 * The app's key-value store: one MMKV instance ('app'), synchronous, on the JS thread. Values are JSON text; the host
 * stores them as they are. Not for secrets: MMKV's file is readable by whoever gets the app's files (the token is in
 * TokenStore, auth.ts).
 *
 * @ExportModel({ios: 'VRStorageHost', android: 'io.valdiroutes.pages.StorageHost'})
 */
export interface StorageHost {
  /** The JSON stored for `key`; '' when there is none. */
  get: (key: string) => string;
  /** false when MMKV couldn't write it (no disk space, for one). */
  set: (key: string, json: string) => boolean;
  remove: (key: string) => void;
  clear: () => void;
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

/** JSON text of `data`; anything JSON.stringify drops or can't write (undefined, a function, a BigInt, a cycle) fails. */
function toJson(data: unknown): string {
  let json: string | undefined;
  try {
    json = JSON.stringify(data);
  } catch (cause) {
    throw new Error(`data must be JSON: ${(cause as Error).message}`);
  }
  if (json === undefined) {
    throw new Error('data must be JSON, not undefined or a function');
  }
  return json;
}

/**
 * `api`'s storage methods, as a mini program's but without the async variants: every call is synchronous and throws
 * an ApiError (made by `fail`) for a bad argument. A missing key reads as undefined, not ''. Values go through JSON:
 * a Date comes back as its string, undefined members are dropped.
 */
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
        const json = storageHost().get(v.parse(storageKey, key));
        return json ? (JSON.parse(json) as T) : undefined;
      });
    },

    setStorageSync(key: string, data: unknown): void {
      sync('setStorageSync', () => {
        const json = toJson(data);
        if (!storageHost().set(v.parse(storageKey, key), json)) {
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
