import assert from 'node:assert/strict';
import { createRequire } from 'node:module';
import { readFileSync } from 'node:fs';
import path from 'node:path';
import test from 'node:test';
import vm from 'node:vm';
import ts from 'typescript';
import { root } from './pipeline';
import type { NavigationOptions, ResolvedNavigation } from '../../valdi/modules/app_pages/src/navigation/options';

const require = createRequire(path.join(root, 'valdi/package.json'));
const source = path.join(root, 'valdi/modules/app_pages/src/navigation/options.ts');
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

test('Harmony preserves native transitions and duration without borrowing iOS presentation', () => {
  const resolve = resolver('harmony');
  assert.deepEqual(plain(resolve()), { animation: 'default', durationMs: 300, presentation: 'push' });
  assert.deepEqual(plain(resolve(
    { animation: 'default', durationMs: 500, ios: { presentation: 'fullScreen' }, android: { animation: 'zoom' } },
    { harmony: { animation: 'default', durationMs: 2000 } },
    { animation: 'none', durationMs: 100 },
  )), { animation: 'none', durationMs: 0, presentation: 'push' });
  for (const animation of ['default', 'slideRight', 'slideUp', 'fade', 'zoom'] as const) {
    assert.deepEqual(plain(resolve(
      { ios: { presentation: 'fullScreen' }, harmony: { animation, durationMs: 450 } },
    )), { animation, durationMs: 450, presentation: 'push' });
  }
  assert.deepEqual(plain(resolve({ harmony: { animation: 'zoom', durationMs: 0 } })),
    { animation: 'none', durationMs: 0, presentation: 'push' });
});

test('Android and iOS retain layer precedence, branch isolation, defaults and existing duration behavior', () => {
  for (const platform of ['android', 'ios']) {
    const resolve = resolver(platform);
    assert.deepEqual(plain(resolve(undefined)), { animation: 'default', durationMs: 300, presentation: 'push' });
    const global: NavigationOptions = {
      durationMs: 400,
      android: { animation: 'slideRight' },
      ios: { presentation: 'fullScreen' },
      harmony: { animation: 'none', durationMs: 0 },
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

test('all branches are strictly validated on every platform, including unsupported Harmony presentation/animations', () => {
  const bad: unknown[] = [
    { harmony: { animation: 'unknown' } },
    { harmony: { presentation: 'fullScreen' } },
    { harmony: { animation: 'none', extra: true } },
    { harmony: { durationMs: -1 } },
    { harmony: { durationMs: 2001 } },
    { harmony: { durationMs: 1.5 } },
    { harmony: { durationMs: '300' } },
    { ios: { presentation: 'sheet' } },
    { android: { animation: 'typo' } },
    { durationMS: 100 },
  ];
  for (const platform of ['harmony', 'android', 'ios']) {
    const resolve = resolver(platform);
    for (const options of bad) assert.throws(() => resolve(options as NavigationOptions), undefined,
      `${platform} must reject ${JSON.stringify(options)}`);
    assert.doesNotThrow(() => resolve({ harmony: { animation: 'none', durationMs: 0 } },
      { harmony: { animation: 'default', durationMs: 2000 } }));
  }
});
