# Native Fetch, streams and WebSocket

The new Valdi fork integration ports NSH's Rust Web APIs to Hermes through a
C++ binding. JavaScript imports the native exports; it does not run a QuickJS
engine or a streams/fetch polyfill.

The implementation is available in the pinned Valdi fork and is included in
this template's standard runtime. `valdi/BUILD.bazel` packages the `native_web`
framework module, and `valdi/.bazelrc` enables its Rust/C++ implementation.
The application entry installs its globals before loading business services.

## Build the runtime

```sh
scripts/export-android.sh release
scripts/export-ios.sh debug
```

Run these scripts from the repository root. The optional second argument
sets the output directory. Both standard runtime targets include Native Web.
The scripts also write runtime `valdi_ota.json` with only `platform` / `config`
and package Swift support libraries.

The pinned fork configures Bazel-managed Rust 1.99.1, rules_rust 0.75.0, and mobile target
libraries. Source exports download and cache that toolchain as needed; no
separate global Rust installation is required. An application consuming
precompiled runtime artifacts does not compile Rust.
Both Bazel workspaces include the same small rules_rust patch under
`bzl/patches/rules_rust/0.75.0/`. It resolves producer-root patch labels in the
fork's committed crate locks against the fork, so the PNG build-script patch
also works in a new template project. Keep these root-local patch copies and
their `single_version_override` entries together when updating build rules.

For local fork development, add `--override_module=valdi=$VALDI_WEB_FORK`.
Local overrides bypass the archive patches in `valdi/MODULE.bazel`, so use an
integration copy with `valdi/bzl/patches/clientsql-drizzle.patch` applied.
That patch preserves the application's existing ClientSQL ABI and remains
separate from the native Web framework changes.

These are native runtime builds. An OTA package cannot add the native
implementation to an existing binary. Runtime artifacts must be re-exported
after updating the fork pin. Native builds check artifact existence and
platform/configuration metadata; developers must manually replace exports from
before this integration. There is no automatic source fingerprint validation or
runtime re-export.

## Use the native exports

Use the public wrapper path:

```ts
import {
  AbortController,
  fetch,
  TextDecoder,
  WebSocket,
} from 'native_web/src/NativeWeb';

const abort = new AbortController();
const response = await fetch('https://example.com/events', {
  signal: abort.signal,
  headers: { accept: 'text/event-stream' },
});

if (!response.ok) {
  throw new Error(`HTTP ${response.status}`);
}

const reader = response.body!.getReader();
const decoder = new TextDecoder();
try {
  for (;;) {
    const { done, value } = await reader.read();
    if (done) break;
    const text = decoder.decode(value, { stream: true });
    // Pass text to the application's event-stream parser.
    console.log(text);
  }
  const tail = decoder.decode();
  if (tail) console.log(tail);
} finally {
  reader.releaseLock();
}

const socket = new WebSocket('wss://example.com/socket');
socket.binaryType = 'arraybuffer';
socket.onopen = () => socket.send('hello');
socket.onmessage = event => console.log(event.data);
socket.onerror = event => console.error(event);
socket.onclose = event => console.log(event.code, event.reason);

// When the owner is disposed:
abort.abort();
socket.close();
```

Response chunks can split both UTF-8 characters and SSE records. Streaming
`TextDecoder` handles the former; the application still needs an SSE record
parser. A body chunk is not necessarily one message.

Importing the framework module provides named exports without changing globals.
This template already calls the installer in
`app_pages/src/services/nativeWeb.ts`, imported first by `app_pages/src/app.ts`.
Pages and services can use global `fetch`, `WebSocket`, `AbortController`,
`TextDecoder` and streams directly. No per-page installer is needed.

For a different application entry, preserve that first side-effect import or
install once before loading services:

```ts
import { installNativeWeb } from 'native_web/src/NativeWeb';

installNativeWeb();
// Other pages in this JS context can use global fetch, WebSocket,
// Response, ReadableStream and the other Web APIs without repeated imports.
```

The public `native_web/src/NativeWeb` entry is a small JS wrapper. Its internal
raw factory is registered in C++ at `native_web/src/NativeWebNative`; application
code should keep importing the public path. The generated raw declaration
`src/NativeWebNative.d.ts` contains the Web API types without an installer.
Registering that factory makes the module loadable; it does not put its exports
on `globalThis`. The application's first side-effect import installs those globals
once; it does not register the native module again.

The JS installer calls `Object.defineProperty` with the original native values
captured when the wrapper evaluates. Native raw exports are non-enumerable,
so the wrapper snapshots own property descriptors and names rather than
`Object.keys(raw)`. Later replacement of raw exports, public exports or globals
does not change those captured installation values. Installed globals are
writable, non-enumerable and configurable. Existing configurable Web globals
are replaced; nonconfigurable conflicts throw. A failed call may leave earlier
properties installed and can be retried, since completion is recorded only
after all definitions succeed.

Repeated successful calls do nothing and retain the same object identities;
they do not restore globals changed afterward. Named imports remain usable
without installation. The installer has no options, makes no network requests
and implements no Web algorithms. Installation applies to one JS context and
does not revive a closed native context. Fetch, streams, encoding, abort and
WebSocket behavior remains Rust/native.

## Implementation boundaries

- Android HTTP uses NSH's `HttpURLConnection` adapter; iOS HTTP uses its
  `NSURLSession` adapter. They use platform networking and trust settings.
- Desktop HTTP uses `ureq`. WebSocket uses the extracted Rust
  Tokio/tungstenite implementation. Those TLS paths use bundled WebPKI roots.
- Response streams, abort, text encoding and WebSocket objects run in Rust,
  with C++ handling Hermes values, promises, GC ownership and scheduling.
- Rust I/O sends native events to the JS scheduler. It does not call Hermes
  from network threads.
- Receive payloads transfer ownership through C++ into Hermes external
  ArrayBuffers. Normal body reads and binary WebSocket ArrayBuffer messages
  reuse that allocation. This removes bridge and stream-transfer copies;
  platform/JNI snapshots, text decoding, BYOB destinations, clones and
  outgoing buffer snapshots can still require copies.
- Context teardown stops delivery and releases context-owned work. Desktop
  HTTP cancellation cannot immediately interrupt an already blocked
  `ureq` read or write.
- Application-termination cleanup runs on the owning JS queue after
  in-flight work. It returns promptly on the caller's thread. This follows
  Valdi's existing partial-teardown lifetime; it does not restart the VM.

The fork's `docs/native-web.md`, `libs/nsh_web/ABI.md` and
`libs/nsh_web_transport/ABI.md` describe the API surface, source provenance
and lifecycle in more detail.

## Local validation

Android application validation for this project must use the user's
Windows-hosted AVD through remote ADB. Do not start an Android emulator on
the Mac. Verify the Windows emulator process and match the Android serial
through both Windows ADB and the remote connection before selecting it.
The Mac can continue to host the iOS simulator.

The November 8, 2026 receive-buffer update passed 51 linked Rust/C++/Hermes
tests, including allocation identity, detachment, GC/shutdown release,
split-UTF8 SSE, BYOB and clone independence. The separate engine suite passed
19 tests and transport tests passed 47. The real-runtime lifecycle regression
remains passing. These are host tests, not a mobile throughput benchmark.

The November 7, 2026 local integration passed 33 linked Rust/C++/Hermes
tests and one real-runtime partial-teardown regression. The Android Release
AAR exported successfully for arm32, arm64 and x86_64; all five HTTP JNI
callbacks are defined in each library. The Java HTTP class, shrinker rule
and HBC99 module entry are present.

The iOS Debug XCFramework contains linked device arm64 and simulator
arm64/x86_64 runtimes, the checked Rust Web/transport symbols, and the Debug
JS reexport entry. A separate application-module fixture resolves the full
generated declarations and compiles to an external native require and
Release Hermes bytecode. Generated editor configs provide the declaration
alias when preparing the selected fork.

The November 8 simulator validation uses a separate `io.valdiroutes.nshqa`
application and a local Node HTTP/WebSocket server. The actual application
loads the native module through Hermes. Its 21 assertions cover request and
response headers, JSON, mutable binary subviews, streamed upload, split-UTF8
SSE, headers before body, cancellation, and WebSocket protocol/text/binary/
close behavior. Backend self-checks are recorded separately from application
results.

This validation exposed and fixed two native integration defects: the
missing default `DOMException` used by no-argument `abort()`, and a background
network wake incorrectly sent through the context-owner scheduler overload.
The corrected implementation passes 57 linked tests and two real-runtime
tests.

The Android API 36 emulator completed two fresh-process runs of the same
final APK with all 21 assertions passing in each run. The backend records
both runs under the same frozen client/server fingerprint.

The iOS 26.5 simulator application completed two unchanged runs with 16 of
21 assertions passing. GET, binary POST, streamed upload, split-UTF8 SSE and
all five WebSocket assertions pass. Three headers-before-body assertions and
two dependent abort assertions fail because their Fetch response is not
delivered before the fixture deadline. These failures remain recorded.

Independent macOS Foundation and production-adapter probes reproduce a
matching response-delivery limitation: zero-body responses can withhold the
head callback, and small `text/plain` bodies without `nosniff` can also
withhold head/data callbacks. EOF releases the callbacks; nonempty SSE and
octet-stream controls deliver incrementally. This demonstrates a sufficient
system-stack cause without establishing every detail of the iOS failure.
No private API, transport replacement or test relaxation was added.

The project's acceptance scope is ordinary body/JSON responses, uploads,
incremental SSE and WebSocket behavior. Those 16 checks passed on both
platforms in both final runs. At the project owner's direction, the
headers-only acknowledgment gate is not an application acceptance
requirement and does not justify replacing the iOS transport. The original
21-case results remain historical evidence.

A subsequent 19-case business probe replaces the three response-head gates
with one ordinary complete plain-text response and cancels an already
streaming SSE response. The rebuilt iOS App and the Android App on the
Windows-hosted `valdi_test` AVD each passed all 19 checks twice with the
same client/server pair. Installed Android APK hashes match across both
fresh processes. Cancellation verifies the exact native
AbortError reason and a real server-observed client disconnect; it does not
count a watchdog close as success. The native runtime is byte-identical to
the previous run.

These are local HTTP/WS correctness checks, not mobile TLS verification,
hardware testing or a performance benchmark. The fork pin is unchanged;
temporary probe source and selected runtime artifacts are restored after
the validation.

The subsequent JS-installer revision is pinned in both application
workspaces. It passed 61 linked Rust/C++/Hermes cases and two Runtime cases,
including execution of the actual compiled public JS wrapper against the
native factory. The template's complete `pnpm test` passes with 444 cases,
zero failures and zero skips, plus binding golden verification. Declaration
generation, strict API types and Debug/Release HBC99 wrapper compilation also
pass. The earlier simulator runs precede this installer revision; using the
new entry requires freshly exported native runtime artifacts.
