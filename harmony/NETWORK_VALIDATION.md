# Harmony HTTPS validation

On November 2, 2026, the Windows Mate 90 Pro emulator ran a separate
`io.valdiroutes.networkprobe` HAP with the same URI through four real API paths.
The probe does not load Valdi or decode images.

| Request | GitHub raw image | Domestic PNG control |
| --- | --- | --- |
| ArkTS NetworkKit, GET, ArrayBuffer | 2300999 | HTTP 200, 6617 bytes |
| C API, null options | 2300999 | HTTP 200, 6617 bytes |
| C API, explicit GET, automatic protocol | 2300999 | HTTP 200, 6617 bytes |
| C API, explicit GET, HTTP/1.1 | 2300999 | HTTP 200, 6617 bytes |

The control URI is
`https://www.baidu.com/img/flexible/logo/pc/result.png`.
The original diagnostic URI is the pinned fork's
`valdi_web/res/emoji%403x.png` on `raw.githubusercontent.com`.
The original URI remains in the saved diagnostic evidence. The active fixture
uses the domestic endpoint, matching this environment's network constraint.

Core NETSTACK logs for the GitHub request include cURL error 35, OS error 104,
and no completed TLS handshake. The explicit HTTP/1.1 request also failed.
These observations do not establish a Valdi protocol-selection defect or the
precise component resetting the connection. The production HTTP adapter's
protocol, proxy, certificate verification and TLS settings were not changed.

Evidence is under `.ci/harmony/2026-11-02-elements/`:

- `network-probe-core.log` and `network-probe-final.log`: original failures.
- `network-control-install.log`: four successful live control responses.
- `network-comparison-proof.json`: bounded result extraction.
- `network-probe-install.log`: the initial wait invocation had an argument
  error; the later fresh tree and native logs establish actual completion.

The isolated probe deliberately retains bounded native allocations until
process exit. It is diagnostic code under `.tools/harmony/network-probe`,
separate from the production adapter, whose cancellation and destruction tests
are described in `entry/src/main/cpp/host/HTTP_API.md`.

These results prove emulator NetworkKit transport. The main application's
HTTP-to-image-decoder path has its own acceptance checks; a successful probe is
not a substitute for those checks. Physical-device networking is unvalidated.
