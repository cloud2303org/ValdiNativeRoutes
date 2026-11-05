# Bluetooth and Android NFC binary transport

Public Bluetooth write APIs and Android NFC command/NDEF APIs accept either an
`ArrayBuffer` or a `Uint8Array`. Existing `ArrayBuffer` callers remain supported.
Passing a `Uint8Array` preserves its exact `byteOffset` and `byteLength`; callers
do not need to extract or copy its backing buffer.

An existing JS library can continue passing its `ArrayBuffer` directly:

```ts
const command: ArrayBuffer = codec.encode(request);
await technology.transceive({ data: command });
```

The public API takes the snapshot internally. It does not require the library
to switch to `Uint8Array`, change its serializer, or manually copy the buffer.

## Sending

```ts
const bytes = Uint8Array.of(0xaa, 0x30, 0x00, 0xbb);
const command = bytes.subarray(1, 3);

const pending = bluetooth.writeBLECharacteristicValue({
  deviceId,
  serviceId,
  characteristicId,
  value: command,
});

bytes.fill(0); // The submitted command remains [0x30, 0x00].
await pending;
```

For Android NFC, use the same input directly:

```ts
const command = Uint8Array.of(0x30, 0x00);
const pending = technology.transceive({ data: command });
command.fill(0);
const { data: response } = await pending;
```

The public schemas take one independent JS byte snapshot synchronously,
before dispatch or an async
wait. Modifying or reusing the original storage after the call cannot change
the admitted command. This also applies to each binary field in Bluetooth
peripheral services/advertising/replies and NFC NDEF records.

The internal native adapters forward those owned snapshots without another JS
payload copy. They are not public entry points for caller-owned mutable arrays.

## Receiving

Existing receive APIs continue returning `ArrayBuffer`. Full-buffer native
replies are reused by the JS adapter. To parse them without another copy:

```ts
const bytes = new Uint8Array(response);
const view = new DataView(bytes.buffer, bytes.byteOffset, bytes.byteLength);
const status = view.getUint16(0, false);
const payload = bytes.subarray(2);
```

These are views, not immutable data. If a consumer needs an independent writable
copy, it can explicitly call `bytes.slice()`.

A native subview that does not cover its entire backing buffer still needs a
range copy when converted to the legacy `ArrayBuffer` response. Returning its
entire backing buffer would expose unrelated bytes and change the API result.
NFC discovery/tag state and per-listener snapshots retain their existing
isolation copies.

## Ownership and platform limits

The change removes duplicate copies in application JS; it does not promise
end-to-end zero-copy radio I/O:

- The generated Android binary contract is `ByteArray`. Its JNI conversion
  allocates/copies. Native core queues retain their existing defensive snapshots
  because they also accept mutable data from native consumers.
- iOS Bluetooth retains its existing Swift/CoreBluetooth implementation and
  Foundation conversion behavior.
- The runtime retains the backing owner for native-backed JS buffers. This
  change introduces no scratch-buffer pool, manual JS release, or early reuse.
- iOS NFC remains unsupported by this application's current adapter.
- Completion of an API call keeps its existing meaning. This change does not
  turn a Bluetooth write without response into peer acknowledgement.

## Verification

The Node regression suites execute the production validation, dispatch and
adapter code with controlled native-host collaborators. They cover caller
mutation, overlapping views, pending commands, forwarding owned snapshots,
retained receive buffers, and nested NDEF fields. They do not emulate the radio,
prove hardware behavior, or measure native copy counts or throughput.
