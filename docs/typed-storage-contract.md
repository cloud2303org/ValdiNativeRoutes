# Typed storage transport

`app_pages/src/storage.ts` exports `StorageWriteRequest`, `StorageReadReply` and
`StorageHost`. Android and iOS consume the real generated bindings. The shared
C++ host uses the same contract.

```ts
interface StorageWriteRequest {
  key: string;
  payload: any; // generated dictionary; exactly one `value` entry
}
interface StorageReadReply {
  found: boolean;
  payload: any; // { value: storedValue } when found
  error: string; // empty on success/miss
}
interface StorageHost {
  get: (key: string) => StorageReadReply;
  set: (request: StorageWriteRequest) => boolean;
  remove: (key: string) => void;
  clear: () => void;
}
```

The exporter's `any` spelling means a dictionary (`Map<String, Any?>`,
`NSDictionary<NSString *, id>`, `Ref<ValueMap>`), as for route params. The
`{ value }` envelope carries scalar/array/null roots without stringifying the
bridge argument. `found: false` distinguishes absence from `found: true` with
`payload.value: null`. A malformed persisted record reports `error`; the public
API throws its usual `ApiError` instead of reporting a cache miss.

`api.getStorageSync<T>`, `setStorageSync`, `removeStorageSync` and
`clearStorageSync` keep their public signatures. Values must be plain objects,
arrays, strings, finite numbers, booleans or null. `structuredData.ts` snapshots
and validates these values without JSON.stringify/JSON.parse; routes reuse the
same validator with their existing outer-dictionary requirement. Optional
undefined object fields are omitted. Undefined roots/array elements, holes,
Date/class instances, toJSON callbacks, accessors, symbols, nonfinite numbers
and cycles are rejected before calling native.

Native StorageCodec persists the complete `{ value }` envelope. Android and iOS
use the new MMKV instance `app-structured`. There is no old-format reader, fallback,
migration or copying of old records. The earlier store is not read by this API.
Missing keys and stored null remain distinct; invalid envelopes are errors.

The code generator must regenerate Kotlin, Objective-C and C++ together. Since
C++ bindings are compiled into the exported runtime, `ota.mjs check-export`
requires fresh runtime exports before building an app against this changed ABI.

Validation entry points:

- `node tools/valdi-rolldown/node_modules/tsx/dist/cli.mjs --test tools/valdi-rolldown/typed-storage.test.ts`
- `node scripts/project.mjs android :app:testDebugUnitTest --max-workers=2`
- `sh ios/Tests/run-storage-codec-tests.sh`

The bridge audit found navigation, AppUI, embedded wheel configurations and
Bluetooth/Wi-Fi/NFC/permission/vision hosts already using models, structured
maps, arrays or binary buffers. Remaining JSON operations are native storage
persistence, OTA manifests/state, and displayed diagnostic output.
They are not JSON-string business bridge parameters.
