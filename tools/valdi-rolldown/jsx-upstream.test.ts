import assert from 'node:assert/strict';
import { existsSync, mkdirSync, mkdtempSync, rmSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import path from 'node:path';
import test, { type TestContext } from 'node:test';
import vm from 'node:vm';
import { buildModule, root, valdiSourceRoot } from './pipeline';
import { valdiTs } from './valdiTs';

// Use the full runtime's types, never a local approximation of its ABI.
const upstream = process.env.VALDI_SOURCE_ROOT
  ?? valdiSourceRoot()
  ?? path.join(root, 'valdi/.valdi-sources/external/valdi+');

function fixture(t: TestContext, source: string) {
  assert.ok(upstream, 'Set VALDI_SOURCE_ROOT to the full upgraded Valdi source checkout');
  const dir = mkdtempSync(path.join(tmpdir(), 'valdi-jsx-upstream-'));
  t.after(() => rmSync(dir, { recursive: true, force: true, maxRetries: 10, retryDelay: 200 }));
  mkdirSync(path.join(dir, 'src'));
  const runtime = path.join(upstream, 'src/valdi_modules/src/valdi');
  writeFileSync(path.join(dir, 'tsconfig.json'), JSON.stringify({
    extends: path.join(upstream, 'modules/_configs/base.tsconfig.json'),
    compilerOptions: {
      baseUrl: dir,
      paths: {
        'jsx_fixture/*': [path.join(dir, '*')],
        'valdi_core/*': [path.join(runtime, 'valdi_core/*')],
        'valdi_tsx/*': [path.join(runtime, 'valdi_tsx/*')],
        tslib: [path.join(runtime, 'valdi_core/src/tslib')],
      },
      types: [path.join(upstream, 'modules/types/Long'), path.join(upstream, 'modules/types/globals')],
    },
    include: ['src/**/*'],
  }));
  writeFileSync(path.join(dir, 'src/fixture.tsx'), `
import type {} from 'valdi_tsx/src/JSX';
import type { ViewFactory } from 'valdi_tsx/src/ViewFactory';
import type { IRenderedElementHolder } from 'valdi_tsx/src/IRenderedElementHolder';
import type { View } from 'valdi_tsx/src/NativeTemplateElements';
${source}`);
  const module = { name: 'jsx_fixture', dir, generatedDirs: [] };
  const plugin = valdiTs(module);
  assert.equal(plugin.diagnostics(), '');
  return { module, plugin };
}

const renderSource = (lazy: boolean) => `
export function render(factory: ViewFactory, holder: IRenderedElementHolder<View>,
                       evaluate: <T>(name: string, value: T) => T) {
  <custom-view width={evaluate('width', 42)}
    viewFactory={evaluate('factory', factory)}
    key={evaluate('key', 'factory-key')}
    ref={evaluate('ref', holder)} ${lazy ? 'lazy' : ''}>
    <label value={evaluate('child', 'hello')} />
  </custom-view>;
}
`;

type Call = [string, ...unknown[]];

// Records only the generated JS -> renderer call boundary. No native factory
// or marshaller implementation is fabricated; factory values stay opaque.
function execute(entries: Map<string, Buffer>, shouldRender = true) {
  const calls: Call[] = [];
  const stack: string[] = [];
  const jsx = {
    makeNodePrototype(tag: string, attributes?: unknown[]) { return { tag, attributes }; },
    beginRenderWithViewFactory(node: { tag: string }, factory: unknown, key: unknown) {
      calls.push(['factory-begin', node.tag, factory, key]);
      stack.push(node.tag);
    },
    beginRenderWithViewFactoryIfNeeded(node: { tag: string }, factory: unknown, key: unknown) {
      calls.push(['factory-begin-lazy', node.tag, factory, key]);
      if (shouldRender) stack.push(node.tag);
      return shouldRender;
    },
    beginRender(node: { tag: string }, key: unknown) {
      calls.push(['begin', node.tag, key]);
      stack.push(node.tag);
    },
    setAttributeRef(holder: unknown) { calls.push(['ref', stack.at(-1), holder]); },
    setAttributeNumber(name: string, value: number) { calls.push(['number', stack.at(-1), name, value]); },
    setAttributeString(name: string, value: string) { calls.push(['string', stack.at(-1), name, value]); },
    endRender() { calls.push(['end', stack.pop()]); },
  };
  const cache = new Map<string, { exports: Record<string, any> }>();
  function load(id: string): Record<string, any> {
    if (cache.has(id)) return cache.get(id)!.exports;
    const code = entries.get(id);
    assert.ok(code, `Missing emitted entry ${id}`);
    const module = { exports: {} };
    cache.set(id, module);
    const require = (specifier: string) => {
      if (specifier === 'valdi_core/src/JSX') return { jsx };
      assert.ok(specifier.startsWith('.'), `Unexpected external runtime dependency ${specifier}`);
      return load(path.posix.normalize(path.posix.join(path.posix.dirname(id), specifier)) + '.js');
    };
    vm.runInNewContext(`(function(require, module, exports) {${code.toString()}\n})`, {}, { filename: id })(
      require, module, module.exports,
    );
    return module.exports;
  }
  return { render: load('src/fixture.js').render as Function, calls, stack };
}

for (const minify of [false, true]) {
  for (const lazy of [false, true]) {
    test(`factory custom-view executes in ${minify ? 'minified' : 'debug'} Rolldown output (lazy=${lazy})`, async t => {
      const { module, plugin } = fixture(t, renderSource(lazy));
      const { entries } = await buildModule(module, plugin, minify);
      const factory = Object.freeze({ nativeFactoryIdentity: Symbol('opaque factory') });
      const holder = Object.freeze({ holderIdentity: Symbol('opaque holder') });
      for (const shouldRender of lazy ? [true, false] : [true]) {
        const { render, calls, stack } = execute(entries, shouldRender);
        const evaluate = (name: string, value: unknown) => { calls.push(['evaluate', name]); return value; };
        render(factory, holder, evaluate);
        assert.deepEqual(calls, [
          ['evaluate', 'factory'], ['evaluate', 'key'],
          [lazy ? 'factory-begin-lazy' : 'factory-begin', 'custom-view', factory, 'factory-key'],
          ...(shouldRender ? [
            ['evaluate', 'ref'], ['ref', 'custom-view', holder],
            ['evaluate', 'width'], ['number', 'custom-view', 'width', 42],
            ['begin', 'label', undefined],
            ['evaluate', 'child'], ['string', 'label', 'value', 'hello'],
            ['end', 'label'], ['end', 'custom-view'],
          ] : []),
        ]);
        assert.deepEqual(stack, []);
      }
    });
  }
}

test('factory identity updates per render and omitted key stays undefined', async t => {
  const { module, plugin } = fixture(t, `
export function render(factory: ViewFactory) { <custom-view viewFactory={factory} />; }
`);
  const { entries } = await buildModule(module, plugin, false);
  const { render, calls } = execute(entries);
  const first = Object.freeze({ identity: 1 });
  const second = Object.freeze({ identity: 2 });
  render(first);
  render(second);
  assert.deepEqual(calls, [
    ['factory-begin', 'custom-view', first, undefined], ['end', 'custom-view'],
    ['factory-begin', 'custom-view', second, undefined], ['end', 'custom-view'],
  ]);
});

test('all platform classes conflict with a factory in either attribute order and lazy mode', async t => {
  for (const platform of ['iosClass', 'androidClass', 'macosClass', 'linuxClass', 'webClass']) {
    for (const lazy of [false, true]) {
      for (const factoryFirst of [false, true]) {
        await t.test(`${platform}, lazy=${lazy}, factoryFirst=${factoryFirst}`, async t => {
          const attributes = ['viewFactory={factory}', `${platform}="NativeView"`];
          if (!factoryFirst) attributes.reverse();
          const { module, plugin } = fixture(t, `
export function render(factory: ViewFactory) {
  <custom-view ${attributes.join(' ')} ${lazy ? 'lazy' : ''} />;
}`);
          const conflict = /custom-view cannot specify both viewFactory and platform view classes/;
          assert.throws(() => plugin.emit(path.join(module.dir, 'src/fixture.tsx')), conflict);
          await assert.rejects(buildModule(module, plugin, false), conflict);
        });
      }
    }
  }
});
