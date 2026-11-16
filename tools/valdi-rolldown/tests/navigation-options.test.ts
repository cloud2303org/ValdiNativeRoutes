import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import path from 'node:path';
import test from 'node:test';
import vm from 'node:vm';
import ts from 'typescript';
import { root } from '../pipeline';
import type { NavigationOptions, ResolvedNavigation } from '../../../valdi/modules/app_foundation/src/navigation/options';

const source = path.join(root, 'valdi/modules/app_foundation/src/navigation/options.ts');
const code = ts.transpileModule(readFileSync(source, 'utf8'), {
  compilerOptions: { module: ts.ModuleKind.CommonJS, target: ts.ScriptTarget.ES2020 },
}).outputText;

/** Execute the actual resolver, replacing only the device boundary. */
function resolver(platform: string): (...layers: (NavigationOptions | undefined)[]) => ResolvedNavigation {
  const exports = {};
  vm.runInNewContext(`(function(require,exports){${code}\n})`)(
    (name: string) => {
      assert.equal(name, 'valdi_core/src/Device');
      return { Device: { getSystemType: () => platform, isAndroid: () => platform === 'android' } };
    },
    exports,
  );
  return (exports as any).resolveNavigation;
}

function plain(value: ResolvedNavigation) {
  return JSON.parse(JSON.stringify(value));
}

test('Android and iOS retain layer precedence, branch isolation, defaults and existing duration behavior', () => {
  for (const platform of ['android', 'ios']) {
    const resolve = resolver(platform);
    assert.deepEqual(plain(resolve(undefined)), { animation: 'default', durationMs: 300, presentation: 'push' });
    const global: NavigationOptions = {
      durationMs: 400,
      android: { animation: 'slideRight' },
      ios: { presentation: 'fullScreen' },
    };
    assert.deepEqual(plain(resolve(global, { animation: 'none', durationMs: 120 }, {
      android: { animation: 'zoom' }, ios: { animation: 'default' },
    })), platform === 'android'
      ? { animation: 'zoom', durationMs: 120, presentation: 'push' }
      : { animation: 'default', durationMs: 120, presentation: 'fullScreen' });
    assert.deepEqual(plain(resolve({ animation: 'default', durationMs: 0 })),
      { animation: 'default', durationMs: 0, presentation: 'push' });
  }
});

test('non-object navigation layers are rejected on every platform', () => {
  for (const platform of ['android', 'ios']) {
    const resolve = resolver(platform);
    const bad: unknown[] = ['sheet', [], 42, true, null, { [platform]: [] }, { [platform]: 'fullScreen' }];
    for (const options of bad) assert.throws(() => resolve(options as NavigationOptions),
      `${platform} must reject ${JSON.stringify(options)}`);
  }
});
