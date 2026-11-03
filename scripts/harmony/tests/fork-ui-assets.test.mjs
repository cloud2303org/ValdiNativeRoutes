import test from 'node:test';
import assert from 'node:assert/strict';
import { createHash } from 'node:crypto';
import { readFileSync } from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '../../..');
const cpp = path.join(root, 'harmony/entry/src/main/cpp');
const read = relative => readFileSync(path.join(cpp, relative), 'utf8');
const sha = value => createHash('sha256').update(value).digest('hex');

test('fork UI and image assets are one explicit default-OFF app selection', () => {
  const cmake = read('CMakeLists.txt');
  assert.match(cmake, /option\(VALDI_HARMONY_USE_FORK_UI_ASSETS\s+"[^"]+"\s+OFF\)/);
  assert.match(cmake, /VALDI_HARMONY_RUNTIME_MODE STREQUAL "fork"/);
  assert.match(cmake, /VALDI_HARMONY_APP_CONFIGURED_UI_ASSETS/);
  assert.match(cmake, /VALDI_HARMONY_USE_FORK_UI_ASSETS=\$<BOOL:\$\{VALDI_HARMONY_USE_FORK_UI_ASSETS\}>/);
});

// Original whole-host hashes remain in the adoption receipt. Later native
// routes extend these hosts; lifecycle fences have their own admission tests.
test('each host selects exactly one backend or asset header through the paired option', () => {
  for (const [file, legacy, selected] of [
    ['host/HarmonyNavigator.hpp', '../backend/ArkUIViewManager.hpp', 'ArkUIViewManager.hpp'],
    ['host/HarmonyRuntimeHost.hpp', '../backend/ArkUIViewManager.hpp', 'ArkUIViewManager.hpp'],
    ['host/HarmonyRuntimeHost.cpp', '../assets/HarmonyImageAssetLoader.hpp', 'HarmonyImageAssetLoader.hpp'],
  ]) {
    const block = `#if VALDI_HARMONY_USE_FORK_UI_ASSETS\n#include <${selected}>\n#else\n#include "${legacy}"\n#endif`;
    const source = read(file);
    assert.equal(source.split(block).length, 2, `exactly one selected include: ${file}`);
    const otherIncludes = source.replace(block, '').split('\n')
      .filter(line => /^\s*#\s*include\b/.test(line));
    assert.ok(otherIncludes.every(line =>
      !line.includes(selected) && !line.includes(legacy)),
    `selected header must not also be included outside the option: ${file}`);
  }
});

test('protected legacy input and label implementations remain frozen', () => {
  for (const [file, expected] of [
    ['NativeTextInput.inc', '89135a690e812393a5aaf8b45d43b0ad7ffb10267f61341051056a3e8d5be10a'],
    ['InputState.hpp', '8f0f102fe3e667b607054524a16198498e8bc0fd86579c8b68e42e54effc0cdb'],
    ['NativeLabel.inc', 'ad85faace7940c6ea5084211d20fb90fedc38edc7c00c28d8a7b09391bfa50fd'],
  ]) assert.equal(sha(readFileSync(path.join(cpp, 'backend', file))), expected, file);
});
