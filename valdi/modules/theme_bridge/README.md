# Native design tokens

`ThemeTokensStore` constructs the native token tree once. The bridge returns that
same instance, and native UI reads it directly. Token values are not loaded from
JSON and JavaScript does not supply defaults or write values back.

The contract is `src/host.d.ts`: `ThemeTokens` contains two `ThemeColorTokens`
palettes and a `ThemeSharedTokens` tree with typed radius, size, space, font,
icon and motion groups. Every field has a fixed name and a string or number type.
The regular code generator produces the corresponding Kotlin and Swift models.

Set the values in the platform's native store:

- Android: `android/ThemeTokensStore.kt`.
- iOS: `ios/ThemeTokensStore.swift`.

Both stores initialize once on first access and expose their token instance for
reads. Treat the generated native model instances as read-only after construction;
the generated transport classes still have mutable native properties. TypeScript
fields are declared `readonly`.

```kotlin
val tokens = ThemeTokensStore.tokens
val surface: String = tokens.light.surface
val radius: Double = tokens.shared.radius.card
```

```swift
import ThemeBridge

let tokens: VRThemeTokens = ThemeTokensStore.shared.tokens
let surface: String = tokens.light.surface
let radius: Double = tokens.shared.radius.card
```

Valdi reads the same native tree through the module factory:

```ts
import { getHost } from 'theme_bridge/src';

const tokens = getHost().getTokens();
const surface: string = tokens.light.surface;
const radius: number = tokens.shared.radius.card;
```

`app_pages/src/components/theme.ts` exposes exact color identifiers and typed
shared tokens. It converts the palettes to dictionaries only when calling
Valdi's color-palette API, then switches the active palette with system
appearance changes. It never maintains another set of token values.

`app_ui`'s native `UiDesign` reads its overlapping color and numeric fields from
this store. Its additional native-only component constants remain in `UiDesign`.
Keep `theme_bridge` enabled when using those native UI components.

Adding a shared token means adding a field to the contract and supplying it in
both native constructors. Missing or incorrectly typed constructor arguments fail
the native build. The shared colors currently use `#RRGGBB` or `rgba(r,g,b,a)`
values, which the native UI adapter converts to platform colors. Changing native values requires rebuilding the native module
and App; an application JavaScript update cannot replace native token values.

Validation:

```sh
node scripts/node-modules.mjs android
python3 valdi/modules/theme_bridge/tests/run_theme_tokens_tests.py --evidence /tmp/valdi-theme-tests
node scripts/node-modules.mjs ios
ios/Tests/run-theme-tokens-access-tests.sh
pnpm test
```

The Android runner executes the real store and generated models on the JVM,
checks shared instance identity through the factory, and checks that the Kotlin
compiler rejects a mismatched field type. The Swift consumer compiles and links
against the actual iOS module and runtime, and checks compiler rejection of a
mismatched field type; it does not execute an iOS app. TypeScript regression tests
check valid fields, misspellings, readonly access and the actual generated ABI.
