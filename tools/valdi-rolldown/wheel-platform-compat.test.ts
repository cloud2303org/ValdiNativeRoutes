import assert from 'node:assert/strict';
import { execFileSync } from 'node:child_process';
import { createHash } from 'node:crypto';
import { cpSync, existsSync, mkdirSync, mkdtempSync, readFileSync, rmSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import path from 'node:path';
import test from 'node:test';
import vm from 'node:vm';
import ts from 'typescript';
import { unpack } from './archive';
import { root, buildModule } from './pipeline';
import { valdiTs } from './valdiTs';
import { JSXProcessor } from './vendor/companion/JSXProcessor';

const fork = process.env.WHEEL_FORK_ROOT
  ?? '/Users/cloud/.config/superpowers/worktrees/Valdi-node-only/harmony-platform-20261102';
const pin = readFileSync(path.join(root, 'valdi/MODULE.bazel'), 'utf8').match(/VALDI_COMMIT = "([a-f0-9]+)"/)![1];
const proof = process.env.WHEEL_PROOF_DIR ?? mkdtempSync(path.join(tmpdir(), 'wheel-js-proof-'));
mkdirSync(proof, { recursive: true });
const pinned = path.join(proof, 'pin');
const overlay = path.join(proof, 'overlay');
const modulePrefix = 'src/valdi_modules/src/valdi';
// This is an isolated archive of the actual pin. The real parent-owned script
// runs only here; neither the source checkout nor .tools/harmony/upstream changes.
for (const directory of [pinned, overlay]) {
  mkdirSync(directory, { recursive: true });
  const archive = path.join(proof, path.basename(directory) + '.tar');
  execFileSync('git', ['-C', fork, 'archive', '-o', archive, pin,
    'src/valdi_modules', 'modules/_configs', 'modules/types', 'valdi_core', 'valdi/src/valdi/runtime']);
  execFileSync('tar', ['-xf', archive, '-C', directory]);
}
execFileSync(process.execPath, [path.join(root, 'scripts/harmony/apply-platform.mjs'), overlay]);
const hashes = new Map<string, string>();
const nativeFlows: { component: string; minify: boolean; attributes: { name: string; value: unknown }[] }[] = [];
const hash = (file: string) => {
  hashes.set(file, createHash('sha256').update(readFileSync(file)).digest('hex'));
};
hash(path.join(root, 'scripts/harmony/apply-platform.mjs'));
hash(import.meta.filename);
hash(path.join(proof, 'pin.tar'));
hash(path.join(proof, 'overlay.tar'));

function fixture(typesRoot: string, source?: string) {
  const dir = mkdtempSync(path.join(proof, 'fixture-'));
  mkdirSync(path.join(dir, 'src'));
  const modules = path.join(typesRoot, modulePrefix);
  const paths = Object.fromEntries(['valdi_core', 'valdi_tsx', 'coreutils'].map(name =>
    [`${name}/*`, [path.join(modules, name, '*')]]));
  writeFileSync(path.join(dir, 'tsconfig.json'), JSON.stringify({
    extends: path.join(typesRoot, 'modules/_configs/base.tsconfig.json'),
    compilerOptions: {
      baseUrl: dir, paths: { ...paths, 'wheel_fixture/*': [path.join(dir, '*')], tslib: [path.join(modules, 'valdi_core/src/tslib')] },
      types: [path.join(typesRoot, 'modules/types/Long'), path.join(typesRoot, 'modules/types/globals')],
    }, include: ['src/**/*'],
  }));
  if (source) writeFileSync(path.join(dir, 'src/fixture.tsx'), source);
  else {
    // Compile the three actual components and their actual schemas, including
    // callback/config types. AppUIHost and schemas' type-only imports stay real.
    for (const name of ['WheelPickers.tsx', 'WheelHost.ts', 'schemas.ts', 'AppUIHost.ts']) {
      const file = path.join(process.env.WHEEL_SHARED_SOURCE_ROOT ?? path.join(root, 'valdi/modules/app_pages/src'), name);
      hash(file);
      writeFileSync(path.join(dir, 'src', name), readFileSync(file));
    }
    // Package resolution uses the existing installation, never network.
    execFileSync('ln', ['-s', path.join(root, 'valdi/node_modules'), path.join(dir, 'node_modules')]);
  }
  const module = { name: 'wheel_fixture', dir, generatedDirs: [], nodeModules: path.join(root, 'valdi/node_modules') };
  const plugin = valdiTs(module);
  assert.equal(plugin.diagnostics(), '');
  for (const source of plugin.program().getSourceFiles()) hash(source.fileName);
  return { module, plugin };
}

function packaged(platform: number) {
  const entries = new Map<string, Buffer>();
  for (const name of ['valdi_core', 'coreutils', 'valdi_tsx']) {
    let bytes: Buffer;
    if (platform === 1) {
      const aar = path.join(root, 'android/app/libs/valdi_runtime.aar');
      hash(aar);
      bytes = execFileSync('unzip', ['-p', aar, `assets/${name}.valdimodule`], { maxBuffer: 32 * 1024 * 1024 });
    } else {
      const file = path.join(root, 'ios/Frameworks/ValdiRuntime.xcframework/ios-arm64/ValdiRuntime.framework',
        `${name}.valdimodule`);
      hash(file);
      bytes = readFileSync(file);
    }
    for (const [file, content] of unpack(bytes)) entries.set(`${name}/${file}`, content);
  }
  return entries;
}

// Execute the actual packaged bootstrap, Renderer, prototype and PropertyList
// implementations. Only native DeviceBridge/runtime/debug services are supplied
// by the host; RendererTestDelegate is the unmodified official native boundary.
function host(platform: number, application: Map<string, Buffer>, typesRoot: string) {
  const entries = platform === 6 ? new Map<string, Buffer>() : packaged(platform);
  const modulesRoot = path.join(typesRoot, modulePrefix);
  const cache = new Map<string, { exports: any }>();
  const context = vm.createContext({
    console, setTimeout, clearTimeout,
    runtime: { getCurrentPlatform: () => platform, getCurrentContext: () => 'wheel-proof',
      internString: (v: string) => v, getAttributeId: () => 0 },
  });
  vm.runInContext('global = globalThis;', context);
  function load(id: string, from = ''): any {
    if (id.startsWith('.')) id = path.posix.normalize(path.posix.join(path.posix.dirname(from), id));
    id = id.replace(/\.js$/, '');
    if (cache.has(id)) return cache.get(id)!.exports;
    if (id === 'valdi_core/src/BuildType') return { isDevBuild: () => false, isDebugEnabled: () => false };
    if (id === 'valdi_core/src/DeviceBridge') return {
      getSystemType: () => platform === 6 ? 'harmony' : platform === 1 ? 'android' : 'ios',
      observeDisplayInsetChange: () => ({ cancel() {} }),
      observeDisplaySizeChange: () => ({ cancel() {} }),
      observeDarkMode: () => ({ cancel() {} }),
    };
    if (id === 'valdi_core/src/debugging/DaemonClientManager') {
      return { DaemonClientManager: class { addListener() {} } };
    }
    const appId = id.replace(/^wheel_fixture\//, '');
    const bytes = application.get(appId + '.js') ?? entries.get(id + '.js');
    let code = bytes?.toString();
    if (!code) {
      const base = path.join(modulesRoot, id);
      const file = [base + '.ts', base + '.js', base + '.d.ts'].find(existsSync);
      assert.ok(file, `Missing real module ${id}`);
      hash(file);
      code = file.endsWith('.js') ? readFileSync(file, 'utf8') : ts.transpileModule(readFileSync(file, 'utf8'), {
        fileName: file.replace(/\.d\.ts$/, '.ts'),
        compilerOptions: { target: ts.ScriptTarget.ES2021, module: ts.ModuleKind.CommonJS },
      }).outputText;
    }
    const module = { exports: {} };
    cache.set(id, module);
    vm.runInContext(`(function(require,module,exports){${code}\n})`, context, { filename: id })(
      (name: string) => load(name, id), module, module.exports);
    return module.exports;
  }
  const { jsx } = load('valdi_core/src/JSXBootstrap');
  const { Renderer } = load('valdi_core/src/Renderer');
  const { RendererTestDelegate } = load('valdi_test/test/RendererTestDelegate');
  const delegate = new RendererTestDelegate();
  const renderer = new Renderer('wheel-proof', undefined, delegate);
  return { load, jsx, renderer, delegate };
}

test('actual shared wheels typecheck against pin and generated overlay; packaged Android/iOS retain class identity', async t => {
  for (const typesRoot of [pinned, overlay]) {
    const { module, plugin } = fixture(typesRoot);
    const emitted = plugin.emit(path.join(module.dir, 'src/WheelPickers.tsx'));
    writeFileSync(path.join(module.dir, 'WheelPickers.emitted.js'), emitted);
    // A static Harmony attribute in ANY branch would leak through old bootstraps.
    const prototypes = [...emitted.matchAll(/makeNodePrototype\([^;]+/g)].map(m => m[0]);
    assert.equal(prototypes.length, 3);
    for (const prototype of prototypes) {
      assert.match(prototype, /iosClass/);
      assert.match(prototype, /androidClass/);
      assert.doesNotMatch(prototype, /harmonyClass|config|onChange/);
    }
    for (const minify of [false, true]) {
      const { entries } = await buildModule(module, plugin, minify);
      for (const [name, bytes] of entries) {
        const file = path.join(module.dir, minify ? 'output-min' : 'output-debug', name);
        mkdirSync(path.dirname(file), { recursive: true });
        writeFileSync(file, bytes);
        hash(file);
      }
      for (const platform of typesRoot === overlay ? [1, 2, 6] : [1, 2]) {
        const h = host(platform, entries, typesRoot);
        const exports = h.load('wheel_fixture/src/WheelPickers');
        for (const [name, model, next, native] of [
          ['ColumnPicker', { options: ['A;,', 'B'], value: 'A;,' }, 'B', 'Column'],
          ['TimePicker', { mode: 'date', value: '2000-02-29', minYear: 1900, maxYear: 2100 }, '2000-03-01', 'Time'],
          ['TreePicker', { data: [{ value: 'a', label: 'a;', children: [{ value: 'b', label: 'b,' }] }], value: ['a', 'b'] }, ['a'], 'Tree'],
        ] as const) {
          const received: unknown[] = [];
          const instance = new exports[name]();
          instance.viewModel = { ...model, onChange: (v: unknown) => received.push(v) };
          const render = () => { h.renderer.begin(); instance.onRender(); h.renderer.end(); };
          h.delegate.clear();
          render();
          const first = h.delegate.requests.flatMap((r: any) => r.entries);
          const created = first.filter((e: any) => e.type === 'CreateElement');
          assert.equal(created.length, 1);
          assert.equal(created[0].className, platform === 6 ? 'Deferred' : platform === 1
            ? `io.valdiroutes.app.${native}WheelView` : `VR${native}WheelView`);
          const attributes = first.filter((e: any) => e.type === 'SetElementAttribute');
          const names = attributes.map((e: any) => e.name);
          const config = attributes.find((e: any) => e.name === 'config')?.value;
          assert.equal(typeof config, 'object', 'native picker config must be a data object, not JSON text');
          assert.ok(config !== null);
          const plainConfig = JSON.parse(JSON.stringify(config));
          if (name === 'ColumnPicker') {
            assert.deepEqual(plainConfig, { options: [{ value: 'A;,', label: 'A;,' }, { value: 'B', label: 'B' }], value: 'A;,' });
          } else if (name === 'TimePicker') {
            assert.deepEqual(plainConfig, model);
          } else {
            assert.deepEqual(plainConfig, { ...model, columns: 3 });
          }
          if (platform === 6) {
            assert.equal(attributes.find((e: any) => e.name === 'harmonyClass')?.value, `ArkUI${native}WheelView`);
            assert.ok(names.indexOf('harmonyClass') < names.indexOf('config'));
            nativeFlows.push({ component: name, minify, attributes: attributes
              .filter((e: any) => ['harmonyClass', 'config', 'onChange'].includes(e.name))
              .map((e: any) => ({ name: e.name, value: e.name === 'onChange' ? 'host-callback' : e.value })) });
          } else assert.ok(!names.includes('harmonyClass'));
          const callback = attributes.find((e: any) => e.name === 'onChange')?.value;
          assert.equal(typeof callback, 'function');
          callback(next);
          assert.deepEqual(JSON.parse(JSON.stringify(received)), [next]);
          instance.viewModel = { ...instance.viewModel, value: next };
          h.delegate.clear();
          render();
          const second = h.delegate.requests.flatMap((r: any) => r.entries);
          assert.ok(!second.some((e: any) => ['CreateElement', 'DestroyElement'].includes(e.type)), 'controlled rerender replaces native view');
          assert.ok(!second.some((e: any) => platform !== 6 && e.name === 'harmonyClass'));
          h.renderer.begin(); h.renderer.end(); // independent next component
        }
        t.diagnostic(`types=${typesRoot === pinned ? pin : 'generated overlay'} platform=${platform} minify=${minify}`);
      }
    }
  }
});

test('both production transformers reject harmonyClass with viewFactory in either order, preserving lazy/key/ref', async () => {
  // Load the maintained real compiler using the installed TS module, not a
  // handwritten transformer or alternate JSX declarations.
  const compiler = path.join(process.env.WHEEL_OFFICIAL_COMPANION ?? path.join(fork, 'compiler/companion/src'), 'JSXProcessor.ts');
  const companion = path.join(proof, 'official-companion');
  cpSync(path.dirname(compiler), companion, { recursive: true });
  execFileSync('ln', ['-s', path.join(root, 'tools/valdi-rolldown/node_modules'), path.join(companion, 'node_modules')]);
  const official = await import(path.join(companion, 'JSXProcessor.ts'));
  hash(compiler);
  let consumed = JSXProcessor;
  if (process.env.WHEEL_VENDOR_COMPANION) {
    const destination = path.join(proof, 'baseline-vendor');
    cpSync(process.env.WHEEL_VENDOR_COMPANION, destination, { recursive: true });
    execFileSync('ln', ['-s', path.join(root, 'tools/valdi-rolldown/node_modules'), path.join(destination, 'node_modules')]);
    consumed = (await import(path.join(destination, 'JSXProcessor.ts'))).JSXProcessor;
  }
  for (const Processor of [consumed, official.JSXProcessor]) {
    for (const reverse of [false, true]) for (const lazy of [false, true]) {
      const attrs = ['viewFactory={factory}', 'harmonyClass="ArkUIColumnWheelView"'];
      if (reverse) attrs.reverse();
      const { plugin, module } = fixture(overlay, `
import type {} from 'valdi_tsx/src/JSX';
import type { ViewFactory } from 'valdi_tsx/src/ViewFactory';
import type { IRenderedElementHolder } from 'valdi_tsx/src/IRenderedElementHolder';
import type { View } from 'valdi_tsx/src/NativeTemplateElements';
export function render(factory: ViewFactory, holder: IRenderedElementHolder<View>, cb: (v: string) => void) {
  <custom-view ${attrs.join(' ')} key="wheel" ref={holder} config="{}" onChange={cb} ${lazy ? 'lazy' : ''} />;
}`);
      const program = plugin.program();
      const source = program.getSourceFile(path.join(module.dir, 'src/fixture.tsx'))!;
      assert.throws(() => program.emit(source, () => {}, undefined, false, {
        before: new Processor().makeTransformers(program.getTypeChecker()),
      }), /custom-view cannot specify both viewFactory and platform view classes/);
    }
  }
});

test('valid Harmony spread retains lazy, key, ref and typed config/callback under both real transformers', async () => {
  const official = await import(path.join(proof, 'official-companion/JSXProcessor.ts'));
  for (const Processor of [JSXProcessor, official.JSXProcessor]) {
    const { plugin, module } = fixture(overlay, `
import type {} from 'valdi_tsx/src/JSX';
import { Device } from 'valdi_core/src/Device';
import type { IRenderedElementHolder } from 'valdi_tsx/src/IRenderedElementHolder';
import type { View } from 'valdi_tsx/src/NativeTemplateElements';
interface PlatformClass { readonly harmonyClass?: string }
function platform(): PlatformClass {
 return String(Device.getSystemType()) === 'harmony' ? {harmonyClass: 'ArkUIColumnWheelView'} : {};
}
export function render(holder: IRenderedElementHolder<View>, callback: (value: string) => void, config: {value: string}) {
 <custom-view iosClass="VRColumnWheelView" androidClass="io.valdiroutes.app.ColumnWheelView"
   {...platform()} key="wheel-key" ref={holder} lazy config={config} onChange={callback}/>;
}`);
    const program = ts.createProgram(plugin.program().getRootFileNames(),
      { ...plugin.program().getCompilerOptions(), module: ts.ModuleKind.CommonJS });
    const file = program.getSourceFile(path.join(module.dir, 'src/fixture.tsx'))!;
    const application = new Map<string, Buffer>();
    program.emit(file, (name, text) => {
      if (name.endsWith('.js') || name.endsWith('.jsx')) application.set('src/fixture.js', Buffer.from(text));
    }, undefined, false, { before: new Processor().makeTransformers(program.getTypeChecker()) });
    const code = application.get('src/fixture.js')!.toString();
    assert.match(code, /beginRenderIfNeeded/);
    assert.match(code, /wheel-key/);
    for (const platform of [1, 2, 6]) {
      const h = host(platform, application, overlay);
      let attached = 0;
      const holder = { onElementCreated() { ++attached; }, onElementDestroyed() {}, setElements() {} };
      const callback = (_value: string) => {};
      h.renderer.begin();
      const config = { value: 'a' };
      h.load('wheel_fixture/src/fixture').render(holder, callback, config);
      h.renderer.end();
      const initial = h.delegate.requests.flatMap((r: any) => r.entries);
      const created = initial.find((e: any) => e.type === 'CreateElement');
      assert.ok(created);
      assert.equal(attached, 0, 'lazy attributes ran before native visibility');
      h.delegate.notifyElementVisibilityChanged(created.id, true);
      h.delegate.clear();
      h.renderer.begin();
      h.load('wheel_fixture/src/fixture').render(holder, callback, config);
      h.renderer.end();
      const entries = h.delegate.requests.flatMap((r: any) => r.entries);
      assert.ok(!entries.some((e: any) => e.type === 'CreateElement'), 'lazy visibility replaced keyed view');
      const attrs = entries.filter((e: any) => e.type === 'SetElementAttribute');
      assert.equal(attached, 1, 'ref was lost');
      assert.equal(attrs.find((e: any) => e.name === 'onChange')?.value, callback);
      assert.equal(attrs.find((e: any) => e.name === 'config')?.value, config);
      assert.equal(attrs.some((e: any) => e.name === 'harmonyClass'), platform === 6);
    }
  }
});

test.after(() => {
  writeFileSync(path.join(proof, 'harmony-native-flow.json'), JSON.stringify(nativeFlows, null, 2));
  writeFileSync(path.join(proof, 'inputs.json'), JSON.stringify({ pin, fork, hashes: Object.fromEntries(hashes) }, null, 2));
  console.log(`Wheel JS proof: ${proof}`);
  if (!process.env.WHEEL_PROOF_DIR) rmSync(proof, { recursive: true, force: true });
});
