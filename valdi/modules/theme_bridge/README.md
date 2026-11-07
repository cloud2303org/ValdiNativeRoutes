# Shared design tokens

`assets/tokens.json` is the shared source for native UI and Valdi pages:
`light` and `dark` contain color palettes; `shared` contains numeric token groups.

JavaScript reads the native store through the generated module:

```ts
import { getHost } from 'theme_bridge/src';

const { light, dark, shared } = getHost().getTokens();
```

The app's `app_pages/src/components/theme.ts` already installs these palettes
at startup and follows the system appearance. Native UI selects the appropriate
palette for its current appearance.

Android host code can access the same store without calling JavaScript:

```kotlin
import io.valdiroutes.app.modules.theme_bridge.ThemeTokensStore

ThemeTokensStore.initialize(context.applicationContext)
val tokens = ThemeTokensStore.tokens
val light = tokens.light
```

Swift host code imports the independently compiled module:

```swift
import ThemeBridge

let tokens = try ThemeTokensStore.shared.tokens
let light = tokens.light
```

The public Swift singleton has a private initializer and a throwing `tokens`
getter. It decodes the JSON once with `JSONDecoder` and caches the result.
Missing files, malformed JSON and wrong field types throw the original read or
decode error; there is no empty-palette fallback or second validation pass.
The generated token model retains its existing mutable properties;
consumers should treat its contents as shared read-only data. The native module's
`getTokens` and the host accessor return the same store's token model.

Normal iOS module preparation exports `ThemeBridge.swiftmodule` into
`module-build/out/ios/swift`; the App already searches that directory and links
the module's archive. No source copies or separate JS initialization are needed
for native reads.

Edit the JSON, then rebuild the native App to update these values. The current
OTA scope is `app_pages`; it does not replace this module's bundled token assets.

To check the public Swift boundary after preparing the iOS modules:

```sh
node scripts/node-modules.mjs ios
ios/Tests/run-theme-tokens-access-tests.sh
```

The check compiles and links an independent iOS Simulator consumer against the
actual module and runtime libraries. It does not launch the simulator executable.

`ios/Tests/run-theme-tokens-store-tests.sh` exercises the actual store's
Foundation decoding, errors and cache on macOS, with a field-only transport
substitute. The independent iOS consumer checks the real generated model boundary.
