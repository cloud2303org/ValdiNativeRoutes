import assert from 'node:assert/strict';
import { chmodSync, mkdirSync, mkdtempSync, readFileSync, rmSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import path from 'node:path';
import test from 'node:test';
import { packageSwiftRuntime } from '../package-swift-runtime.mjs';

test('Swift framework packaging ships relocatable Clang dependencies and is repeatable with readonly Bazel headers', t => {
  const directory = mkdtempSync(path.join(tmpdir(), 'valdi-swift-package-'));
  t.after(() => rmSync(directory, { recursive: true, force: true }));
  const framework = path.join(directory, 'ValdiRuntime.xcframework');
  const sources = path.join(directory, 'sources');
  const shim = path.join(sources, 'valdi_core/src/valdi_core/ios/swift/cpp');
  mkdirSync(shim, { recursive: true });
  writeFileSync(path.join(shim, 'SwiftValdiTypes.h'), '#pragma once\n');
  writeFileSync(path.join(shim, 'SwiftValdiMarshaller.h'), '#include <valdi_core/ios/swift/cpp/SwiftValdiTypes.h>\n');
  const header = path.join(directory, 'Public.h');
  writeFileSync(header, '#pragma once\n');
  chmodSync(header, 0o444);
  for (const slice of ['ios-arm64', 'ios-arm64_x86_64-simulator'])
    mkdirSync(path.join(framework, slice, 'ValdiRuntime.framework'), { recursive: true });
  packageSwiftRuntime(framework, { headers: [header], sources });
  packageSwiftRuntime(framework, { headers: [header], sources });
  const bundle = path.join(framework, 'ios-arm64/ValdiRuntime.framework');
  assert.equal(readFileSync(path.join(bundle, 'Headers/Public.h'), 'utf8'), '#pragma once\n');
  assert.match(readFileSync(path.join(bundle, 'Headers/SwiftValdiMarshaller.h'), 'utf8'), /#include "SwiftValdiTypes.h"/);
  const map = readFileSync(path.join(bundle, 'Modules/module.modulemap'), 'utf8');
  assert.match(map, /framework module valdi_core/);
  assert.match(map, /framework module ValdiCoreCPP/);
  assert.ok(!map.includes(directory), 'module maps must relocate with the framework');
});
