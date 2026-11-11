import assert from 'node:assert/strict';
import { createRequire } from 'node:module';
import { readFileSync } from 'node:fs';
import path from 'node:path';
import test from 'node:test';
import vm from 'node:vm';
import ts from 'typescript';
import { root } from './pipeline';
import type { NavigationOptions, ResolvedNavigation } from '../../valdi/modules/app_foundation/src/navigation/options';

const require = createRequire(path.join(root, 'valdi/package.json'));
const source = path.join(root, 'valdi/modules/app_foundation/src/navigation/options.ts');
const code = ts.transpileModule(readFileSync(source, 'utf8'), {
  compilerOptions: { module: ts.ModuleKind.CommonJS, target: ts.ScriptTarget.ES2020 },
}).outputText;

/** Execute the actual validator/resolver with the real valibot package, replacing only the device boundary. */
function resolver(platform: string): (...layers: (NavigationOptions | undefined)[]) => ResolvedNavigation {
  const exports = {};
  vm.runInNewContext(`(function(require,exports){${code}\n})`)(
    (name: string) => {
      if (name === 'valdi_core/src/Device') {
        return { Device: { getSystemType: () => platform, isAndroid: () => platform === 'android' } };
      }
      assert.equal(name, 'valibot');
      return require(name);
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

test('all mobile branches are strictly validated on every platform', () => {
  const bad: unknown[] = [
    ...[-1, 2001, 1.5, '300'].map(durationMs => ({ android: { durationMs } })),
    { android: { animation: 'none', extra: true } },
    { ios: { presentation: 'sheet' } },
    { android: { animation: 'typo' } },
    { durationMS: 100 },
  ];
  for (const platform of ['android', 'ios']) {
    const resolve = resolver(platform);
    for (const options of bad) assert.throws(() => resolve(options as NavigationOptions),
      `${platform} must reject ${JSON.stringify(options)}`);
  }
});
