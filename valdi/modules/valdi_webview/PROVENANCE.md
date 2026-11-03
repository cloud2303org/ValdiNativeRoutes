# Official Valdi WebView module

Copied from the read-only local checkout `/Users/cloud/project/Valdi-node-only`
at commit `51cec8ae3645c7e778c9f36fbe4b3bffba1ccddf`,
directory `src/valdi_modules/src/valdi/valdi_webview`.
The upstream project is Snap's Valdi, distributed under the MIT license.
`LICENSE` is copied verbatim from that checkout's root.

The complete upstream `src/`, `android/`, and `ios/` trees are included.
The TypeScript public API, model/controller names, native implementation class
names, and Android implementation are unchanged.

Local adaptations:

- `BUILD.bazel` uses `node_valdi_module`, the existing exported runtime, and
  Apple's WebKit framework.
- `module.json` declares the official Android generated-code package, native
  module factory, existing attributes binder, and explicit iOS factory.
- Four iOS runtime imports use the actual exported `ValdiRuntime` headers
  instead of upstream's internal include paths.
- `SCValdiWebViewNativeModule.m` uses the new public
  `SCValdiWebViewNativeModule.h` and exports
  `ValdiWebViewCreateModuleFactory()`. It preserves the official factory and
  module implementation classes, while removing `VALDI_REGISTER_MODULE()`
  and its internal registry import. The host explicitly registers the
  returned factory, just as it does for calculator.

The upstream `tsconfig.json` is intentionally omitted: the local Node module
compiler writes an isolated configuration. The upstream macOS implementation
and upstream Bazel rules are not part of this Android/iOS adaptation.
No browser engine, message bridge, controller, or lifetime behavior is
reimplemented. See `docs/webview-module.md` in the app checkout for integration,
upstream behavior boundaries, and validation requirements.
