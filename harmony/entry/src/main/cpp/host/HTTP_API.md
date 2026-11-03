# Harmony native HTTP adapter

`HarmonyHTTPRequestManager` implements the pinned official
`snap::valdi_core::HTTPRequestManager` ABI in `.tools/harmony/upstream`.
The transport is Huawei RemoteCommunicationKit's **native C RCP API** (API 12+),
using `RemoteCommunicationKit/rcp.h` and `librcp_c.so`. No ArkTS service, N-API
callback, JSON encoding or business bridge participates in HTTP transport.

## Installed SDK and parent integration

Validated SDK: `/Users/cloud/Library/Huawei/26.0.0.865/command-line-tools/sdk/default`.
RCP is in the **HMS overlay**, outside the OpenHarmony native sysroot:

```text
hms/native/sysroot/usr/include/RemoteCommunicationKit/rcp.h
hms/native/sysroot/usr/lib/x86_64-linux-ohos/librcp_c.so
hms/native/sysroot/usr/lib/aarch64-linux-ohos/librcp_c.so
```

The existing OpenHarmony compiler/toolchain and sysroot remain in use. The parent
must add the HMS include directory and matching RCP library to the `valdi_harmony`
target. For example, with `HARMONY_SDK_DEFAULT` identifying the directory above:

```cmake
set(HMS_NATIVE "${HARMONY_SDK_DEFAULT}/hms/native/sysroot")
if(OHOS_ARCH STREQUAL "arm64-v8a")
  set(RCP_TRIPLE aarch64-linux-ohos)
elseif(OHOS_ARCH STREQUAL "x86_64")
  set(RCP_TRIPLE x86_64-linux-ohos)
else()
  message(FATAL_ERROR "RCP adapter has not been validated for this ABI")
endif()
target_include_directories(valdi_harmony PRIVATE "${HMS_NATIVE}/usr/include")
target_link_libraries(valdi_harmony PRIVATE
  "${HMS_NATIVE}/usr/lib/${RCP_TRIPLE}/librcp_c.so")
```

`net_http` is no longer an adapter dependency. `rcp_quic` is not used or required
by this implementation. No HTTP version is forced. The platform selects its
normal transport behavior. The app must declare `ohos.permission.INTERNET`, and
the target OS must provide `SystemCapability.Collaboration.RemoteCommunication`.
Header/link proof does not establish that capability on a particular device.

Host setup uses the existing API:

```cpp
#include "host/HarmonyHTTPRequestManager.hpp"

auto requests = std::make_shared<ValdiHarmony::HarmonyHTTPRequestManager>();
runtimeManager->setRequestManager(requests);
// Register BytesAssetLoader and the other runtime loaders afterwards.

// Before runtime teardown:
requests->shutdown();
```

The constructor accepts `(uint32_t connectTimeoutMs, uint32_t requestTimeoutMs)`;
both default to 60,000 ms. They map to RCP's `connectMs` and overall `transferMs`.
Zero fails explicitly. The official Valdi request has no per-request timeout field.

The parent owns CMake, RuntimeHost, N-API and ArkTS integration. This change edits
none of those files and does not require an ArkTS fallback/service-port contract.

## Exact current capability matrix

| Official Valdi input/output | Current behavior |
| --- | --- |
| URL | `http://` and `https://`; rejects CR, LF and NUL. RCP validates the rest and applies OS plaintext restrictions. |
| Method omitted/empty | GET. |
| GET, HEAD, OPTIONS, DELETE, TRACE | Forwarded unchanged to RCP. Optional request bytes, when supplied, are forwarded too; any OS method/content restriction is reported as a native error. |
| POST, PUT, PATCH | Forwarded unchanged with absent, empty or nonempty binary bodies. PATCH is the actual `"PATCH"` method. |
| CONNECT, custom methods, lowercase aliases | Explicit failure before any native request starts. No method substitution. |
| Upload bytes | Snapshot copied before `performRequest()` returns; explicit-length `Rcp_Buffer` through `Rcp_RequestContent.data.contentStr`, type `RCP_CONTENT_TYPE_STRING`. This enum selects a byte buffer, with no UTF-8/JSON/string-length conversion. Maximum representable length is `UINT32_MAX`; larger uploads fail. |
| Request headers | Null/undefined means empty; otherwise a string map with token names and values without CR/LF/NUL. Copied before returning. Native header-setting errors fail explicitly. |
| Priority | Validates official 0..10 range. Advisory only: SDK RCP exposes no request priority setter/member. |
| Successful response | Actual status (100..599), copied header map and owned binary `BytesView`. HTTP 4xx/5xx are responses, not transport errors. |
| Response bytes | Copies exactly `Rcp_Response.body.length` bytes, including NUL/non-UTF8, from its explicit-length `Rcp_Buffer`. Empty bodies yield an owned empty view. Invalid/null nonempty buffers and bodies above 256 MiB fail. |
| Response headers | Always a map, including empty/null native headers. Repeated values for a key join with `", "`, matching Valdi's one-string-per-key contract. Native normalization remains RCP behavior. |
| Response URL | No fabricated field: pinned `HTTPResponse` contains only status, headers and optional body. |
| Transport/start/session errors | `onFail` includes numeric RCP error codes when available (e.g. timeout `1007900028`, canceled `1007900992`). Validation and allocation failures are explicit. |
| Cancellation | Returned official `Cancelable` suppresses completion immediately and schedules `HMS_Rcp_CancelRequest`. Retains native request and userdata until the terminal Fetch response callback. |
| Shutdown | Idempotent, suppresses outstanding completions, rejects new native work, cancels pending native requests, drains asynchronously. Safe inside a completion and with Cancelables surviving the manager. |
| Concurrent association | Real `void* usrCtx`, one stable Task per request. No static callback-slot limit; test covers 80 simultaneous native requests. OS resource limits still apply. |
| TLS/proxy/network policy | System certificate validation, system proxy and automatic path preference. No certificate bypass, custom proxy, DNS/path override, forced HTTP/1.1 or HTTP/3 override. |

Bodies are never silently discarded, methods are never rewritten, and binary
response bytes are never obtained from the old NetworkKit string-oriented buffer.
The 256 MiB response check runs at completion: RCP has already accumulated its own
response, so this is a limit on accepted/retained responses, not an OS streaming
allocation limit. Uploads are additionally limited by available snapshot memory.

## Native ownership and callback lifetime

A detached worker per manager owns one RCP session and all request start,
cancellation, destruction and Valdi completion delivery. Session creation is lazy;
a session-creation failure is reported to requests for that manager rather than
silently switching transport. The session configuration remains alive until close.

Each task owns its URL, method, copied headers, upload vector, `Rcp_RequestContent`,
`Rcp_Configuration`, and `Rcp_ResponseCallbackObject`. These remain at stable
addresses until the terminal response callback is processed. In particular,
`Rcp_Buffer` explicitly does not copy the upload buffer. No caller-owned bytes or
JS-backed header values survive into the worker.

The worker's task list strongly retains the callback userdata. Callback entry also
takes a strong task reference. A recursive native mutex serializes Fetch, Cancel,
DestroyRequest and response callback processing; inline Fetch/Cancel callbacks are
safe. Only the terminal response callback is installed: no competing data-end or
canceled event callback is used as a premature release signal.

The response callback copies metadata and binary bytes, then calls its
`destroyResponse(response)` function (also for canceled/error responses), and only
then publishes terminal state. The worker restores any original native request
fields before `HMS_Rcp_DestroyRequest`, detaching our borrowed method/content/config/
headers. It separately destroys the adapter-created headers with
`HMS_Rcp_DestroyHeaders`. Header-entry snapshots use
`HMS_Rcp_DestroyHeaderEntries`. Every successfully allocated object is released by
its matching API. Completion-owned BytesViews retain their bytes independently;
keeping a Cancelable does not retain another task-owned copy of upload/response.

Nonzero Fetch returns are rejected starts with no pending response, so their
allocations are released immediately. RCP uses distinct `DestroyRequest` and
`CancelRequest` APIs: allocation cleanup never invokes cancellation by an
uninitialized numeric ID. This removes the former `net_http` ID-zero hazard and
the `UINT32_MAX` workaround entirely. No RCP ID is fabricated or rewritten.

A successful Fetch owes one terminal response callback, including cancellation
normally reported as `1007900992`. Cancel acceptance alone is not a drain signal.
Even if `CancelRequest` fails, the task remains retained for its eventual response
or native timeout. If an OS violates that completion contract and never calls
back, the task/worker/session remain retained; no arbitrary timer frees potentially
live userdata. There is no synchronous drain guarantee.

A recursive delivery mutex makes cancel/shutdown serialize with an executing
completion on another thread, and allows completion reentry, including starting a
request, canceling itself, shutting down and destroying its manager. Foreign
completion exceptions do not unwind through the worker or cause a second callback.
Normal C++ rules still prohibit concurrent raw-pointer use after object destruction.

## SDK declaration audit

The installed `rcp.h` is the primary ABI evidence:

- Lines 107-110: real `RCP_METHOD_PATCH "PATCH"`.
- Lines 157-162: `Rcp_Buffer { const char* buffer; uint32_t length; }`, no copy.
- Lines 285-298: request content union, including explicit-length `contentStr`.
- Lines 1062-1085: actual request fields, including `content` and `configuration`.
- Lines 1444-1456: response callback and its `void* usrCtx` object.
- Lines 1462-1500: response status, headers, explicit-length body and destructor.
- Lines 1700-1701, 1791-1792, 1804-1805, 1825: session creation, async Fetch,
  request cancellation and session close.

SDK `rcp.h` SHA-256:
`1aeec6647cd56fb60de97fbc3f68091e79cef8e9fd2d3d804ad61603fc571b5e`.

## Focused proof and limits

```sh
python3 harmony/entry/src/main/cpp/host/tests/run-harmony-http.py \
  --sanitize --proof-dir /tmp/valdi-harmony-http-rcp-proof-20261102
```

The runner compiles the production manager against actual pinned Valdi and SDK
headers with `-Wall -Wextra -Werror` for both x86_64 and arm64-v8a. Each resulting
object strictly links to its actual SDK `librcp_c.so` and existing matching
`libvaldi_runtime_ohos_link_check.so` with `--no-undefined`. This is ABI/link closure,
not a full HAP or runtimeexport build. It reuses those existing runtime libraries.

Host tests compile the manager as a separate production translation unit, with
17 actual pinned Valdi utility/schema implementations and prepared fmt. The OS
boundary fake exports the exact installed RCP declarations; it retains borrowed
content/config/callback pointers and checks them through delayed completion.
Tests call the public production `performRequest`/`shutdown` APIs.

ASan and UBSan run with `halt_on_error=1`. Seven regression groups cover:

1. All eight supported method groups and default GET; NUL/non-UTF8 POST/PUT/PATCH
   upload snapshots, caller mutation before native start, headers, binary response
   lifetime, actual 404/204 status, absent versus present-empty bodies and headers.
2. Eighty simultaneous requests completed in reverse order, proving userdata
   association without the former 64-slot limit.
3. Request/header allocation, header setting and Fetch-start failures while a first
   request remains active; session creation errors; no collateral cancellation.
4. Input/method/header/priority/timeout validation, numeric transport timeout and TLS
   failures, native cancellation errors, invalid status/buffers and response size.
5. Idempotent cancel and failed native cancel, delayed terminal callback, retained
   binary upload/config/userdata and a Cancelable outliving its manager.
6. Callback/destruction exclusion while native response destruction blocks;
   synchronous success and cancellation callbacks with no gate deadlock.
7. Completion reentry starting a new PATCH, canceling itself, then shutting down
   and destroying the manager from its own completion; closed-manager suppression.

Result: **7 groups passed; 106 native Fetch calls; all request/header/response/
header-entry/session ownership counters balanced; both ABI strict links passed**.
The proof directory retains the objects, linked libraries, sanitized host test
executable, sources, command receipts and SHA-256 manifest.

No live Harmony HTTP transfer is claimed. No device, emulator, remote endpoint,
full HAP/runtimeexport build or commit was used. No live fixture was needed;
`fixture.invalid` is a fake-only URL and never resolved. Any subsequent live
fixture must use the user-authorized domestic endpoints and the normal OS policy.
