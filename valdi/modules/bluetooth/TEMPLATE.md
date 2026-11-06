# bluetooth

Generated from the pinned Valdi CLI's `polyglot_bridge_module` template.
Template sources: `npm_modules/cli/.bootstrap/modules/polyglot_bridge_module`.

TS/TSX and resources use the repository's Node pipeline.
Android/iOS libraries and registration are discovered from module.json.
The App enables this module by listing `bluetooth` in package.json `valdi.modules`.
This module has Android/iOS Bluetooth implementations; it has no Web/macOS implementation.
Changing native implementations requires rebuilding the application.

Created through the real scaffold command:

```sh
pnpm new-module bluetooth --template polyglot_bridge_module --ios-language swift --android-context
```

The template's sample Calculator API was replaced with the existing BLE API,
Kotlin/Swift core and application-scoped native factory. The sample Web Calculator
was removed: this module implements Android/iOS Bluetooth, not a Web fallback.
Android dependencies/context and the shared permission service are documented in
`docs/custom-modules.md`.
