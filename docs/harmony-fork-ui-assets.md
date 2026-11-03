# Explicit application adoption of fork ArkUI and assets

The application defaults to its frozen local backend and image assets. Runtime
selection remains independent: a fork runtime can still use those local sources
while runtime/debugger acceptance proceeds.

After selecting the maintained fork runtime through the existing explicit
`VALDI_HARMONY_RUNTIME_MODE=fork`, root, profile and dependency inputs, pass:

```text
-DVALDI_HARMONY_USE_FORK_UI_ASSETS=ON
```

This one option selects both `Valdi::HarmonyArkUI` and `Valdi::HarmonyAssets`.
The application removes both local production source groups from its target.
The fork supplies its own ArkUI, public asset interface and concrete image
implementation. The three host include sites select the exported fork headers
through a private numeric 0/1 definition. No local backend/asset file is edited.
Both ON and OFF work with the fork runtime; ON with the legacy runtime fails.
Changing the UI/assets selection in a configured directory fails and requires a
fresh CMake binary directory, separately from the existing runtime identity guard.
An existing runtime cache without a UI/assets identity also rejects its first ON
selection; this covers caches created before the option existed. OFF can record
their existing legacy selection.

The manager and loader public APIs remain compatible. Navigation, AppUI, OTA,
business services, generated bindings and worker/font/lifecycle configuration
are unchanged. Host changes are confined to includes. The fork asset keeps the
same `ValdiHarmony::HarmonyImageAsset` name but derives from the real public
`Valdi::Harmony::ArkUIImageAsset`; the old concrete class does not. Do not link
both implementations or include the old concrete header in an ON translation
unit. Direct loaded-asset effective-filter rejection remains unchanged.

The existing profile helper and default Hvigor build profile do not forward
this new option. The parent must supply it to its controlled fresh configure.
This change does not select a fork by environment variable or silently change a
pin, profile, dependency root, canonical module package or platform tag.

Source-only checks (no compiler lease required):

```sh
node --test scripts/harmony/tests/fork-ui-assets.test.mjs
```

Reserve the parent native slot before the following SDK probe. Supply existing
absolute `FORK`, `SDK`, `EXTERNAL`, `PROTO`, `WEBSOCKETPP`, `ARKUI_RECEIPT`, and
`ASSETS_RECEIPT` inputs; output must be a fresh temporary directory.

```sh
python3 -B scripts/harmony/tests/fork-ui-assets-probe.py \
  --native-lease --fork-root "$FORK" --sdk "$SDK" \
  --external "$EXTERNAL" --proto "$PROTO" --websocketpp "$WEBSOCKETPP" \
  --arkui-receipt "$ARKUI_RECEIPT" --assets-receipt "$ASSETS_RECEIPT" \
  --output /tmp/valdi-fork-ui-assets-adoption-proof
```

The probe configures the actual app through a temporary parent using the real
SDK CMake toolchain, for both supported ABIs. Each ABI covers legacy/OFF,
fork/OFF and fork/ON, plus legacy/ON and both cached-selection rejection
directions, including a pre-option untracked-cache control. Its actual target properties, link plans and compile database must
contain exclusively the selected production source owners. It compiles the
three actual host translation units, selected backend/asset sources and a
real-header consumer directly from those generated commands, one compiler at a
time. Dependency files reject old/new header mixing. The consumer checks the
current fork's 616-byte `IJavaScriptContext` layout, including the three map
transport `JSValueRef` fields accounting for the 96-byte increase, and actual image parent;
the old concrete asset header is an intended failing compiler control.

All generated configuration/object/log outputs stay outside the source tree.
No entry/build, restored .cxx, context/core archive, Ninja build, runtime rebuild,
shared app link, HAP, device, generator or export is used. Reading the real app
link plan does not execute it. Frozen app53/assets25 and fork74/assets46 sources
and current runtime/consumed-header hashes are checked before and after.

This evidence covers source/configuration and SDK object compatibility. Final
current-runtime linking and HAP acceptance remain with the parent. New
application runtime evidence must replay glyphs/rich text, input, custom-root
reset/click-through, images/filters, PNG/opaque refs, Refresh and lifecycle
behavior. Earlier legacy-UI HAP results do not establish paired adoption.
