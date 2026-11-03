import test from 'node:test';
import assert from 'node:assert/strict';
import { createHash } from 'node:crypto';
import { readFileSync } from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '../../..');
const host = path.join(root, 'harmony/entry/src/main/cpp/host');
const source = readFileSync(path.join(host, 'HarmonyBridgeModules.cpp'), 'utf8');
const upstream = path.join(root, 'valdi/bazel-valdi/external/valdi+');
const read = file => readFileSync(path.join(upstream, file), 'utf8');

test('the failing DebugConsole getter is bound to the native display, not unsupported or window metadata', () => {
  for (const name of ['getDisplayWidth', 'getDisplayHeight']) {
    assert.match(source, new RegExp(`bind\\(module, "${name}"`), `${name} must have a real binding`);
    const unsupportedLists = [...source.matchAll(/for \(const auto\* name : \{([^}]+)\}\) \{\s*unsupported\(module, name\);/g)];
    assert.ok(unsupportedLists.every(match => !match[1].includes(`"${name}"`)), `${name} is unsupported`);
  }
  assert.match(source, /#include <window_manager\/oh_display_manager.h>/);
  for (const operation of ['Width', 'Height', 'DensityPixels']) {
    assert.match(source, new RegExp(`OH_NativeDisplayManager_GetDefaultDisplay${operation}`));
  }
  assert.doesNotMatch(source, /OH_ArkUI_NodeUtils_|OH_ArkUI_GetContextByNode/);
});

test('the bridge metadata ABI is unchanged', () => {
  const header = readFileSync(path.join(host, 'HarmonyBridgeModules.hpp'));
  assert.equal(createHash('sha256').update(header).digest('hex'),
    '01f76618067d9f8864d90159146c4dbe60d6ded70f9a2e87e7b17a5b3f7b328c');
});

test('all direct official DebugConsole Device calls have real bridge bindings', () => {
  const consoleSource = read('src/valdi_modules/src/valdi/valdi_core/src/debugging/DebugConsole.tsx');
  const calls = new Set([...consoleSource.matchAll(/Device\.(\w+)\(/g)].map(match => match[1]));
  assert.deepEqual([...calls].sort(), [
    'getDisplayBottomInset', 'getDisplayHeight', 'getDisplayTopInset', 'observeDisplayInsetChange',
  ]);
  // Insets use the existing content-viewport policy; this change only repairs dimensions.
  for (const name of calls) {
    assert.ok(source.includes(`"${name}"`), `missing ${name}`);
  }
});

test('pinned Android and iOS Device dimensions use logical units', () => {
  const android = read('valdi/src/java/com/snap/valdi/modules/ValdiDeviceModule.kt');
  assert.match(android, /displayWidth = displayMetrics\.widthPixels\.toDouble\(\) \/ scale/);
  assert.match(android, /displayHeight = displayMetrics\.heightPixels\.toDouble\(\) \/ scale/);
  const ios = read('valdi/src/valdi/ios/NativeModules/SCValdiDeviceModule.m');
  assert.match(ios, /_displayWidth = displaySize\.width/);
  assert.match(ios, /_displayHeight = displaySize\.height/);
  assert.match(ios, /UIScreen\.mainScreen\.bounds\.size/);
});
