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
use the new MMKV instance `app-structured`; Harmony uses
`app-storage-structured.sqlite3`. There is no old-format reader, fallback,
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

## Harmony persistence correction, November 3, 2026

The local Harmony host uses JSONCPP only at the SQLite persistence boundary.
It writes doubles with round-trip precision and standard control escapes.
Strict local decoding preserves subnormals, negative zero, integer limits,
booleans, null, Unicode, and embedded NUL in strings and keys. Raw NUL bytes and
unquoted trailing commas in stored JSON are rejected. Missing rows and corrupt
empty records remain distinct.

The focused native entry point is documented in
[the storage proof instructions](../harmony/entry/src/main/cpp/business/tests/STORAGE.md).
It invokes the production host through the current generated request/reply
marshaller without using an old Context/runtime archive.

The final 12-case fixture produces exactly the two expected corruption failures
against the immutable preceding implementation, then passes all 12 cases with
the correction under ASan/UBSan. Local storage and canonical bindings also
compile for SDK26 x86_64 and arm64-v8a. Source review is clean. The execution
record is `/tmp/harmony-storage-boundary-review-20261103/execution-receipt.json`
(SHA-256 `78d6a924976f0bc3ebce88f6c7c03ef68250d213c7afef5f696124df8be09df1`).
This establishes native macOS typed-host execution and SDK object compilation,
not a linked Harmony application, HAP, or device result. The maintained fork
remains unchanged by this local correction.
