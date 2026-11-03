// Source integration checks only. Native lease execution is a separate,
// explicitly scheduled command; `node --test` never starts a compiler.
import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '../../..');
const host = path.join(root, 'harmony/entry/src/main/cpp/host');
const header = readFileSync(process.env.HARMONY_HOST_HEADER ??
  path.join(host, 'HarmonyRuntimeHost.hpp'), 'utf8');
const source = readFileSync(path.join(host, 'HarmonyRuntimeHost.cpp'), 'utf8');

test('full-development admission is the actual host first member and is compiled out of lean', () => {
  const development = readFileSync(path.join(root, 'harmony/runtime-build/app-development.cmake'), 'utf8');
  assert.match(development, /VALDI_HARMONY_FULL_DEVELOPMENT=\$\{VALDI_HARMONY_APP_FULL_DEVELOPMENT\}/);
  // This order makes acquisition precede every other member constructor, and
  // release follow the destructor body and every other member destructor.
  assert.match(header,
    /private:\s*#if VALDI_HARMONY_FULL_DEVELOPMENT\s*(?:\/\/[^\n]*\n\s*)*HarmonyDevelopmentHostLease _developmentLease;\s*#endif\s*napi_env _env;/,
    'Full development must own exclusive admission before all runtime/NAPI members');
  assert.match(header,
    /#if VALDI_HARMONY_FULL_DEVELOPMENT\s*#include "HarmonyDevelopmentHostLease.hpp"\s*#endif/);
});

test('only final owner destruction can release admission; lifecycle and NAPI policy stay separate', () => {
  assert.doesNotMatch(source, /_developmentLease/,
    'Construction, mount, pause, unmount, worker teardown and UI release must not move/reset the member');
  const napi = readFileSync(path.join(host, 'NapiModule.cpp'), 'utf8');
  assert.match(napi, /constexpr size_t kMaxHosts = 16;/);
  assert.match(napi, /job->host = takeHostForDestruction\(environment->hosts, id\);/);
  assert.match(napi, /job->host->releaseOnUI\(\);[\s\S]*?job->host\.reset\(\);/);
  assert.doesNotMatch(napi, /_developmentLease|HarmonyDevelopmentHostLease/);
});
