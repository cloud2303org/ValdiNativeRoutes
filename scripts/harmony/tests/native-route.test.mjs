import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { resolve, dirname } from 'node:path';

const root = resolve(dirname(fileURLToPath(import.meta.url)), '../../..');
const host = name => readFileSync(resolve(root, 'harmony/entry/src/main/cpp/host', name), 'utf8');

// Fast ownership fences supplement (and do not replace) the executable SDK and
// extracted-production probes documented in harmony-native-routes.md.
test('native roots use the existing backend and preserve both public selections', () => {
  const navigator = host('HarmonyNavigator.cpp');
  const header = host('HarmonyNavigator.hpp');
  assert.match(navigator, /_viewManager\.createRootView\(\)/);
  assert.match(navigator, /_nativeScreens\.contains\(definition->getNativeName\(\)->slowToString\(\)\)/);
  assert.match(header, /VALDI_HARMONY_USE_FORK_UI_ASSETS[\s\S]*<ArkUIViewManager.hpp>/);
  assert.match(navigator, /if \(page->tree != nullptr\) page->tree->setLayoutSpecs/);
  assert.doesNotMatch(navigator, /next->tree->setLayoutSpecs/);
  assert.match(navigator, /static_cast<int32_t>\(std::round\(_size.width \* _nativeScale\)\)/);
});

test('the app adapter adds a receiver without replacing backend event userdata', () => {
  const surface = host('HarmonyNativeRouteSurface.cpp');
  assert.match(surface, /addNodeCustomEventReceiver\(root, customEvent\)/);
  assert.doesNotMatch(surface, /registerNodeCustomEvent\(/);
  assert.match(surface, /getUserData\(root\)/);
  assert.match(surface, /measureNode\(owner->_content, copy\)/);
  assert.match(surface, /layoutNode\(owner->_content, 0, 0\)/);
  assert.match(surface, /LayoutConstraint_SetPercentReferenceHeight\(copy, owner->_height\)/);
  assert.match(surface, /if \(owner->_callbacks\) owner->deferDisposal\(\)/);
});

test('RuntimeHost injects its own weak typed AppUI provider and retains the lease first', () => {
  const runtime = host('HarmonyRuntimeHost.cpp');
  const header = host('HarmonyRuntimeHost.hpp');
  assert.match(runtime, /makeHarmonyNativeAppUI\([\s\S]*queue->async/);
  assert.match(runtime, /weak = std::weak_ptr<HarmonyAppUIHost>\(_appUI\)/);
  assert.match(runtime, /CppMarshaller::unmarshall\(tracker, owner->hostValue\(\), result\)/);
  assert.match(header, /private:\s*#if VALDI_HARMONY_FULL_DEVELOPMENT[\s\S]*?HarmonyDevelopmentHostLease _developmentLease;/);
  assert.doesNotMatch(runtime, /_developmentLease\s*=|_developmentLease\.release/);
  const native = host('HarmonyNativeScreens.cpp');
  assert.match(native, /host->showModal/);
  assert.match(native, /host->showToast/);
  assert.doesNotMatch(native, /_pending|NativeApp::|static\s+.*AppUIHost/);
});
