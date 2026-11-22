import assert from 'node:assert/strict';
import { execFileSync } from 'node:child_process';
import { createHash } from 'node:crypto';
import { existsSync, mkdirSync, mkdtempSync, readFileSync, rmSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import path from 'node:path';
import test from 'node:test';
import vm from 'node:vm';
import { transformSync } from '@babel/core';
import solidBabelPlugin from '@solidjs/babel-plugin';
import ts from 'typescript';
import { unpack } from '../archive';
import { appModule, root, buildModule, valdiSourceRoot } from '../pipeline';
import { valdiTs } from '../valdiTs';
import { JSXProcessor } from '../vendor/companion/JSXProcessor';

const sourceRoot = valdiSourceRoot();
assert.ok(sourceRoot, 'Prepare Valdi sources or set VALDI_SOURCE_ROOT');
const runtimeMode = process.env.WHEEL_RUNTIME ?? 'source';
assert.ok(['source', 'android', 'ios'].includes(runtimeMode),
  'WHEEL_RUNTIME must be source, android or ios');
const platforms = runtimeMode === 'android' ? [1] : runtimeMode === 'ios' ? [2] : [1, 2];
const runtimeLabel = runtimeMode === 'source' ? 'selected-source Android/iOS' : `packaged ${runtimeMode}`;
const proof = process.env.WHEEL_PROOF_DIR ?? mkdtempSync(path.join(tmpdir(), 'wheel-js-proof-'));
mkdirSync(proof, { recursive: true });
const modulePrefix = 'src/valdi_modules/src/valdi';
const hashes = new Map<string, string>();
const hash = (file: string) => {
  hashes.set(file, createHash('sha256').update(readFileSync(file)).digest('hex'));
};
hash(import.meta.filename);

function fixture(typesRoot: string, source?: string) {
  const dir = mkdtempSync(path.join(proof, 'fixture-'));
  mkdirSync(path.join(dir, 'src'));
  const modules = path.join(typesRoot, modulePrefix);
  const paths = Object.fromEntries(['valdi_core', 'valdi_tsx', 'coreutils'].map(name =>
    [`${name}/*`, [path.join(modules, name, '*')]]));
  for (const name of ['native_common', 'app_ui'])
    paths[`${name}/*`] = [path.join(root, 'valdi/modules', name, '*')];
  if (source) {
    writeFileSync(path.join(dir, 'tsconfig.json'), JSON.stringify({
      extends: path.join(typesRoot, 'modules/_configs/base.tsconfig.json'),
      compilerOptions: {
        allowSyntheticDefaultImports: true,
        moduleResolution: 'node10',
        baseUrl: dir, paths: { ...paths, 'wheel_fixture/*': [path.join(dir, '*')], tslib: [path.join(modules, 'valdi_core/src/tslib')] },
        types: [path.join(typesRoot, 'modules/types/Long'), path.join(typesRoot, 'modules/types/globals')],
      }, include: ['src/**/*'],
    }));
    writeFileSync(path.join(dir, 'src/fixture.tsx'), source);
    const module = { name: 'wheel_fixture', dir, generatedDirs: [], nodeModules: path.join(root, 'valdi/node_modules'), jsxBackend: 'valdi' as const };
    const plugin = valdiTs(module);
    assert.equal(plugin.diagnostics(), '');
    for (const file of plugin.program().getSourceFiles()) hash(file.fileName);
    return { module, plugin };
  }

  for (const name of ['solid_native', 'solid_runtime'])
    paths[`${name}/*`] = [path.join(root, 'valdi/modules', name, '*')];
  writeFileSync(path.join(dir, 'tsconfig.json'), JSON.stringify({
    extends: path.join(typesRoot, 'modules/_configs/base.tsconfig.json'),
    compilerOptions: {
      allowSyntheticDefaultImports: true,
      module: 'preserve',
      moduleResolution: 'bundler',
      baseUrl: dir, paths: { ...paths, 'wheel_fixture/*': [path.join(dir, '*')], tslib: [path.join(modules, 'valdi_core/src/tslib')] },
      types: [path.join(typesRoot, 'modules/types/Long'), path.join(typesRoot, 'modules/types/globals')],
    }, include: ['src/**/*', path.join(root, 'valdi/modules/solid_native/src/jsx.d.ts')],
  }));
  // Compile the three actual components and their actual schemas, including
  // callback/config types. AppUIHost and schemas' type-only imports stay real.
  mkdirSync(path.join(dir, 'src/wheels'));
  writeFileSync(path.join(dir, 'src/AppUIHost.ts'), "export type * from 'app_ui/src/AppUIHost';\n");
  for (const name of ['WheelPickers.tsx', 'WheelHost.ts', 'schemas.ts']) {
    const file = path.join(process.env.WHEEL_SHARED_SOURCE_ROOT ?? path.join(root, 'valdi/modules/app_ui/src/wheels'), name);
    hash(file);
    writeFileSync(path.join(dir, 'src/wheels', name), readFileSync(file));
  }
  // Package resolution uses the existing installation, never network.
  execFileSync('ln', ['-s', path.join(root, 'valdi/node_modules'), path.join(dir, 'node_modules')]);
  const module = { name: 'wheel_fixture', dir, generatedDirs: [], nodeModules: path.join(root, 'valdi/node_modules'), jsxBackend: 'solid' as const };
  const plugin = valdiTs(module);
  assert.equal(plugin.diagnostics(), '');
  for (const file of plugin.program().getSourceFiles()) hash(file.fileName);
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

function createSolidSimulator(platform: number) {
  const strings: string[] = [];
  const attributes: string[] = [];
  const cssRules: Record<string, unknown>[] = [];
  const trees = new Map<string, {
    rootId?: number;
    nodes: Map<number, { id: number; viewClass: string; parentId?: number; children: number[]; attrs: Record<string, unknown> }>;
    batches: Array<Array<{ type: number; id?: number; viewClass?: string; attr?: string; value?: unknown }>>;
    visibilityObserver?: (
      appearingIds: number[],
      disappearingIds: number[],
      viewportUpdates: number[],
      acknowledger: () => void,
      eventTime: number,
    ) => void;
  }>();
  const getTree = (id: string) => {
    let tree = trees.get(id);
    if (!tree) {
      tree = { nodes: new Map(), batches: [] };
      trees.set(id, tree);
    }
    return tree;
  };
  const applyRequest = (request: {
    treeId: string;
    descriptor: ArrayBuffer;
    descriptorSize: number;
    values: unknown[];
    visibilityObserver?: (
      appearingIds: number[],
      disappearingIds: number[],
      viewportUpdates: number[],
      acknowledger: () => void,
      eventTime: number,
    ) => void;
  }) => {
    const tree = getTree(request.treeId);
    if (request.visibilityObserver) tree.visibilityObserver = request.visibilityObserver;
    const view = new DataView(request.descriptor, 0, request.descriptorSize * 4);
    const ops: Array<{ type: number; id?: number; viewClass?: string; attr?: string; value?: unknown }> = [];
    let pos = 0;
    const readInt = () => { const v = view.getInt32(pos, true); pos += 4; return v; };
    const readDouble = () => { const v = view.getFloat64(pos, true); pos += 8; return v; };
    while (pos < view.byteLength) {
      const header = view.getUint32(pos, true);
      pos += 4;
      const type = header & 0xff;
      const id = header >>> 8;
      if (type === 1) {
        const viewClass = strings[readInt()];
        tree.nodes.set(id, { id, viewClass, children: [], attrs: {} });
        ops.push({ type, id, viewClass });
      } else if (type === 2) {
        tree.nodes.delete(id);
        ops.push({ type, id });
      } else if (type === 3) {
        tree.rootId = id;
        ops.push({ type, id });
      } else if (type === 4) {
        const parentId = readInt();
        readInt();
        const node = tree.nodes.get(id);
        if (node) node.parentId = parentId;
        ops.push({ type, id });
      } else if (type === 5 || type === 6 || type === 7 || type === 8) {
        const raw = readInt();
        const attr = attributes[raw & 0xffffff];
        const value = type === 5 ? undefined : type === 6 ? null : type === 8;
        const node = tree.nodes.get(id);
        if (node) node.attrs[attr] = value;
        ops.push({ type, id, attr, value });
      } else if (type === 9) {
        const raw = readInt();
        const attr = attributes[raw & 0xffffff];
        const value = readInt();
        const node = tree.nodes.get(id);
        if (node) node.attrs[attr] = value;
        ops.push({ type, id, attr, value });
      } else if (type === 10) {
        const raw = readInt();
        const attr = attributes[raw & 0xffffff];
        const value = readDouble();
        const node = tree.nodes.get(id);
        if (node) node.attrs[attr] = value;
        ops.push({ type, id, attr, value });
      } else if (type === 11) {
        const raw = readInt();
        const attr = attributes[raw & 0xffffff];
        const count = readInt();
        const value: unknown[] = [];
        for (let i = 0; i < count; i++) value.push(request.values[readInt()]);
        const node = tree.nodes.get(id);
        if (node) node.attrs[attr] = value;
        ops.push({ type, id, attr, value });
      } else if (type === 12 || type === 13) {
        const raw = readInt();
        const attr = attributes[raw & 0xffffff];
        const value = type === 12 ? cssRules[readInt()] : request.values[readInt()];
        const node = tree.nodes.get(id);
        if (node) node.attrs[attr] = value;
        ops.push({ type, id, attr, value });
      } else if (type === 14) {
        for (let i = 0; i < 6; i++) readInt();
        pos += 8;
      } else if (type === 16 || type === 18 || type === 17 || type === 19) {
        if (type !== 19) readInt();
        ops.push({ type, id });
      } else if (type === 20) {
        const parentId = readInt();
        readInt();
        const node = tree.nodes.get(id);
        if (node) {
          node.parentId = parentId;
          tree.nodes.get(parentId)?.children.push(id);
        }
        ops.push({ type, id });
      }
    }
    tree.batches.push(ops);
  };
  return {
    getTree,
    runtimeApi: {
      getCurrentPlatform: () => platform,
      getCurrentContext: () => 'wheel-proof',
      internString: (v: string) => {
        const idx = strings.indexOf(v);
        if (idx >= 0) return idx;
        strings.push(v);
        return strings.length - 1;
      },
      getAttributeId: (v: string) => {
        const idx = attributes.indexOf(v);
        if (idx >= 0) return idx;
        attributes.push(v);
        return attributes.length - 1;
      },
      createCSSRule: (attrs: Record<string, unknown>) => {
        cssRules.push({ ...attrs });
        return cssRules.length - 1;
      },
      pushCurrentContext: () => {},
      popCurrentContext: () => {},
      submitRawRenderRequest: (request: any, cb?: () => void) => {
        applyRequest(request);
        cb?.();
      },
    },
  };
}

function solidHost(platform: number, application: Map<string, Buffer>, typesRoot: string) {
  const entries = runtimeMode === 'source' ? new Map<string, Buffer>() : packaged(platform);
  if (runtimeMode !== 'source') {
    for (const required of [
      'valdi_core/src/Valdi',
      'valdi_core/src/NativeDebuggerTransport',
      'valdi_core/src/Style',
      'valdi_core/src/ValdiRuntimeProvider',
      'valdi_core/src/NativeReferences',
      'valdi_core/src/ModuleLoaderGlobal',
    ]) {
      assert.ok(entries.has(`${required}.js`), `Missing exported runtime module ${required}`);
    }
    assert.match(entries.get('valdi_core/src/Valdi.js')!.toString(), /solid_native\/src\/bridge/);
    assert.equal(entries.has('valdi_core/src/Renderer.js'), false,
      'legacy valdi_core/src/Renderer.js must remain stripped in Solid 2.0 packaged runtime');
    assert.equal(entries.has('valdi_core/src/JSXBootstrap.js'), false,
      'legacy valdi_core/src/JSXBootstrap.js must remain stripped in Solid 2.0 packaged runtime');
  }
  const sim = createSolidSimulator(platform);
  const modulesRoot = path.join(typesRoot, modulePrefix);
  const cache = new Map<string, { exports: any }>();
  const memoryModules = new Map<string, string>();
  const context = vm.createContext({
    console, setTimeout, clearTimeout, queueMicrotask, Promise,
    ArrayBuffer, Uint8Array, Int32Array, Float64Array, DataView,
    Map, Set, WeakMap, WeakSet, Symbol, Error, TypeError, Object, Array,
    Number, String, Boolean, Math, JSON, runtime: sim.runtimeApi,
  });
  vm.runInContext('global = globalThis; globalThis.global = globalThis;', context);
  const moduleLoader = { load: (id: string) => load(id) };
  (context as any).moduleLoader = moduleLoader;
  const builtins: Record<string, any> = {
    'valdi_core/src/ValdiRuntimeProvider': { getValdiRuntime: () => sim.runtimeApi },
    'valdi_core/src/NativeReferences': {
      withLocalNativeRefs: (_id: string, cb: () => any) => cb(),
      withGlobalNativeRefs: (_name: string, cb: () => any) => cb(),
    },
    'valdi_core/src/ModuleLoaderGlobal': { getModuleLoader: () => moduleLoader },
    'valdi_core/src/BuildType': { isDevBuild: () => false, isDebugEnabled: () => false },
    'valdi_core/src/Device': {
      Device: {
        getSystemType: () => (platform === 1 ? 'android' : 'ios'),
        isAndroid: () => platform === 1,
        isIOS: () => platform === 2,
        observeDisplayInsetChange: () => ({ cancel() {} }),
        observeDisplaySizeChange: () => ({ cancel() {} }),
        observeDarkMode: () => ({ cancel() {} }),
      },
    },
    'valdi_core/src/UncaughtErrorHandler': {
      UncaughtErrorHandlerResult: { IGNORE: 0 },
      setCatchAllUncaughtErrorHandler: () => {},
    },
    'valdi_core/src/Valdi': { getDaemonClientManager: () => undefined },
    'valdi_core/src/debugging/Messages': {
      Messages: { listContextsResponse: () => ({}), getContextTreeResponse: () => ({}), takeElementSnapshotResponse: () => ({}), errorResponse: () => ({}) },
    },
    'valdi_core/src/utils/StringUtils': { debugStringify: (v: unknown) => String(v) },
  };
  function load(id: string, from = ''): any {
    if (id.startsWith('.')) id = path.posix.normalize(path.posix.join(path.posix.dirname(from), id));
    id = id.replace(/\.js$/, '');
    if (builtins[id]) return builtins[id];
    if (cache.has(id)) return cache.get(id)!.exports;
    const appId = id.replace(/^wheel_fixture\//, '');
    const bytes = memoryModules.get(id) ?? application.get(`${appId}.js`) ?? application.get(`${id}.js`) ?? entries.get(`${id}.js`);
    let code = typeof bytes === 'string' ? bytes : bytes?.toString();
    if (!code) {
      assert.ok(runtimeMode === 'source' || !['valdi_core', 'valdi_tsx', 'coreutils'].includes(id.split('/')[0]),
        `Missing exported runtime module ${id}; packaged checks cannot fall back to source`);
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
  function compileInlineTsx(moduleId: string, tsxSource: string) {
    const jsFromTs = ts.transpileModule(tsxSource, {
      fileName: `${moduleId}.tsx`,
      compilerOptions: { jsx: ts.JsxEmit.Preserve, target: ts.ScriptTarget.ES2020, module: ts.ModuleKind.ESNext },
    }).outputText;
    const solidJs = transformSync(jsFromTs, {
      filename: `${moduleId}.tsx`, configFile: false, babelrc: false,
      plugins: [[solidBabelPlugin, { generate: 'universal', moduleName: 'solid_native/src/renderer', dev: false }]],
    })?.code;
    assert.ok(solidJs);
    const cjs = ts.transpileModule(solidJs, {
      fileName: `${moduleId}.js`,
      compilerOptions: { target: ts.ScriptTarget.ES2020, module: ts.ModuleKind.CommonJS, esModuleInterop: true },
    }).outputText.replace(/require\((["'])solid-js\1\)/g, 'require("solid_runtime/src/solid")');
    memoryModules.set(moduleId, cjs);
    cache.delete(moduleId);
    return load(moduleId);
  }
  const bridge = load('solid_native/src/bridge');
  return { sim, manager: bridge.createRootComponentsManager(), compileInlineTsx };
}

// Source checks run before native exports. `host()` is the legacy
// `jsxBackend: 'valdi'` source harness (exported packaged runtimes strip legacy
// `JSXBootstrap` and `Renderer` for Solid 2.0); `solidHost()` verifies both
// selected sources and packaged platform archives.
// Only native DeviceBridge/runtime/debug services are supplied by the host;
// RendererTestDelegate is the unmodified official native boundary for legacy tests.
function host(platform: number, application: Map<string, Buffer>, typesRoot: string) {
  const entries = runtimeMode === 'source' ? new Map<string, Buffer>() : packaged(platform);
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
      getSystemType: () => platform === 1 ? 'android' : 'ios',
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
      assert.ok(runtimeMode === 'source' || !['valdi_core', 'valdi_tsx', 'coreutils'].includes(id.split('/')[0]),
        `Missing exported runtime module ${id}; packaged checks cannot fall back to source`);
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

test(`actual shared wheels typecheck against selected sources; ${runtimeLabel} retain class identity`, async t => {
  for (const typesRoot of [sourceRoot]) {
    const { module, plugin } = fixture(typesRoot);
    const emitted = plugin.emit(path.join(module.dir, 'src/wheels/WheelPickers.tsx'));
    writeFileSync(path.join(module.dir, 'WheelPickers.emitted.js'), emitted);
    for (const cls of ['VRColumnWheelView', 'VRTimeWheelView', 'VRTreeWheelView',
      'io.valdiroutes.app.ColumnWheelView', 'io.valdiroutes.app.TimeWheelView', 'io.valdiroutes.app.TreeWheelView']) {
      assert.ok(emitted.includes(cls), `Expected ${cls} in emitted Solid output`);
    }
    for (const minify of [false, true]) {
      const { entries } = await buildModule(module, plugin, minify);
      for (const depName of ['native_common', 'solid_runtime', 'solid_native']) {
        const depModule = appModule(depName);
        const depPlugin = valdiTs(depModule);
        try {
          const built = await buildModule(depModule, depPlugin, minify);
          assert.equal(depPlugin.diagnostics(), '');
          for (const source of depPlugin.program().getSourceFiles()) hash(source.fileName);
          for (const [file, bytes] of built.entries) entries.set(`${depName}/${file}`, bytes);
        } finally { depPlugin.dispose(); }
      }
      for (const [name, bytes] of entries) {
        const file = path.join(module.dir, minify ? 'output-min' : 'output-debug', name);
        mkdirSync(path.dirname(file), { recursive: true });
        writeFileSync(file, bytes);
        hash(file);
      }
      for (const platform of platforms) {
        const h = solidHost(platform, entries, typesRoot);
        h.compileInlineTsx('inline/WheelProof', `
          import { ColumnPicker, TimePicker, TreePicker } from 'wheel_fixture/src/wheels/WheelPickers';
          export function WheelProof(props) {
            const vm = props.viewModel;
            return (
              <view>
                <ColumnPicker options={['A;,', 'B']} value={vm().col} onChange={v => vm().onCol(v)} />
                <TimePicker mode="date" value={vm().date} minYear={1900} maxYear={2100} onChange={v => vm().onDate(v)} />
                <TreePicker
                  data={[{ value: 'a', label: 'a;', children: [{ value: 'b', label: 'b,' }] }]}
                  value={vm().tree}
                  onChange={v => vm().onTree(v)}
                />
              </view>
            );
          }
        `);
        const received: Record<string, unknown[]> = { col: [], date: [], tree: [] };
        const vm0 = {
          col: 'A;,',
          date: '2000-02-29',
          tree: ['a', 'b'],
          onCol: (v: string) => received.col.push(v),
          onDate: (v: string) => received.date.push(v),
          onTree: (v: string[]) => received.tree.push(v),
        };
        h.manager.create('wheel-1', 'WheelProof@inline/WheelProof', vm0, {});
        const tree = h.sim.getTree('wheel-1');
        for (const [key, model, next, native] of [
          ['col', { options: [{ value: 'A;,', label: 'A;,' }, { value: 'B', label: 'B' }], value: 'A;,' }, 'B', 'Column'],
          ['date', { mode: 'date', value: '2000-02-29', minYear: 1900, maxYear: 2100 }, '2000-03-01', 'Time'],
          ['tree', { data: [{ value: 'a', label: 'a;', children: [{ value: 'b', label: 'b,' }] }], value: ['a', 'b'], columns: 3 }, ['a'], 'Tree'],
        ] as const) {
          const expectedClass = platform === 1 ? `io.valdiroutes.app.${native}WheelView` : `VR${native}WheelView`;
          const nodes = [...tree.nodes.values()].filter(n => n.viewClass === expectedClass);
          assert.equal(nodes.length, 1);
          const config = nodes[0].attrs.config;
          assert.equal(typeof config, 'object', 'native picker config must be a data object, not JSON text');
          assert.ok(config !== null);
          assert.deepEqual(JSON.parse(JSON.stringify(config)), model);
          const callback = nodes[0].attrs.onChange as (v: unknown) => void;
          assert.equal(typeof callback, 'function');
          callback(next);
          assert.deepEqual(JSON.parse(JSON.stringify(received[key])), [next]);
        }
        const batchesBefore = tree.batches.length;
        h.manager.render('wheel-1', { ...vm0, col: 'B', date: '2000-03-01', tree: ['a'] });
        for (let i = 0; i < 6; i++) await Promise.resolve();
        const updateOps = tree.batches.slice(batchesBefore).flat();
        assert.equal(updateOps.some(op => op.type === 1 || op.type === 2), false,
          'controlled rerender reuses native view');
        h.manager.destroy('wheel-1');
        t.diagnostic(`types=${typesRoot} runtime=${runtimeMode} platform=${platform} minify=${minify}`);
      }
    }
  }
});

test(`Solid <Lazy> + <custom-view> defers creation until visible and retains ref, config, and callback across ${runtimeLabel}`, async t => {
  const entries = new Map<string, Buffer>();
  for (const depName of ['solid_runtime', 'solid_native']) {
    const depModule = appModule(depName);
    const depPlugin = valdiTs(depModule);
    try {
      const built = await buildModule(depModule, depPlugin, false);
      assert.equal(depPlugin.diagnostics(), '');
      for (const source of depPlugin.program().getSourceFiles()) hash(source.fileName);
      for (const [file, bytes] of built.entries) entries.set(`${depName}/${file}`, bytes);
    } finally {
      depPlugin.dispose();
    }
  }

  for (const platform of platforms) {
    const h = solidHost(platform, entries, sourceRoot);
    h.compileInlineTsx('inline/LazyWheelProof', `
      import { Lazy } from 'solid_native/src/Lazy';
      export function LazyWheelProof(props) {
        const vm = props.viewModel;
        return (
          <Lazy height={200} unmountWhenHidden={false}>
            <custom-view
              iosClass="VRColumnWheelView"
              androidClass="io.valdiroutes.app.ColumnWheelView"
              ref={(el: any) => vm().onRef(el)}
              config={vm().config}
              onChange={vm().onChange}
            />
          </Lazy>
        );
      }
    `);

    const attachedRefs: any[] = [];
    const callback = (_value: string) => {};
    const config = { value: 'a' };
    const vm0 = {
      config,
      onChange: callback,
      onRef: (el: any) => attachedRefs.push(el),
    };
    const expectedClass = platform === 1 ? 'io.valdiroutes.app.ColumnWheelView' : 'VRColumnWheelView';

    h.manager.create('lazy-wheel-1', 'LazyWheelProof@inline/LazyWheelProof', vm0, {});
    const tree = h.sim.getTree('lazy-wheel-1');

    assert.equal([...tree.nodes.values()].filter(n => n.viewClass === expectedClass).length, 0,
      'deferred child custom-view must not materialize before visibility');
    assert.equal(attachedRefs.length, 0, 'ref must not run before child materializes');
    const lazyNode = [...tree.nodes.values()].find(n => n.viewClass === 'layout' && n.attrs.observeVisibility === true);
    assert.ok(lazyNode, 'Lazy container layout must register observeVisibility');
    assert.ok(tree.visibilityObserver, 'Solid tree must register visibilityObserver');

    tree.visibilityObserver!([lazyNode.id], [], [], () => {}, 1);
    for (let i = 0; i < 6; i++) await Promise.resolve();

    const wheelNodes = [...tree.nodes.values()].filter(n => n.viewClass === expectedClass);
    assert.equal(wheelNodes.length, 1);
    const wheelNode = wheelNodes[0];
    assert.equal(attachedRefs.length, 1, 'ref must attach once visible');
    assert.equal(attachedRefs[0].id, wheelNode.id);
    assert.equal(wheelNode.attrs.config, config, 'config must retain object reference identity');
    assert.equal(wheelNode.attrs.onChange, callback, 'onChange must retain callback identity');

    const batchesBefore = tree.batches.length;
    const nextConfig = { value: 'b' };
    h.manager.render('lazy-wheel-1', { ...vm0, config: nextConfig });
    for (let i = 0; i < 6; i++) await Promise.resolve();

    const updateOps = tree.batches.slice(batchesBefore).flat();
    assert.equal(updateOps.some(op => op.type === 1 || op.type === 2), false,
      'controlled rerender inside <Lazy> must reuse custom-view');
    assert.equal(attachedRefs.length, 1, 'ref must not re-fire on controlled update');
    assert.equal(wheelNode.attrs.config, nextConfig, 'updated config must retain object reference identity');

    h.manager.destroy('lazy-wheel-1');
    t.diagnostic(`types=${sourceRoot} runtime=${runtimeMode} platform=${platform}`);
  }
});

test('mobile classes retain lazy, key, ref and typed config/callback under the production transformer',
  { skip: runtimeMode !== 'source' ? 'exported mobile runtime strips legacy valdi_core JSXBootstrap/Renderer for Solid 2.0' : false },
  () => {
  for (const Processor of [JSXProcessor]) {
    const { plugin, module } = fixture(sourceRoot, `
import type {} from 'valdi_tsx/src/JSX';
import type { IRenderedElementHolder } from 'valdi_tsx/src/IRenderedElementHolder';
import type { View } from 'valdi_tsx/src/NativeTemplateElements';
export function render(holder: IRenderedElementHolder<View>, callback: (value: string) => void, config: {value: string}) {
 <custom-view iosClass="VRColumnWheelView" androidClass="io.valdiroutes.app.ColumnWheelView"
   key="wheel-key" ref={holder} lazy config={config} onChange={callback}/>;
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
    for (const platform of platforms) {
      const h = host(platform, application, sourceRoot);
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
    }
  }
});

test.after(() => {
  writeFileSync(path.join(proof, 'inputs.json'), JSON.stringify({ sourceRoot, runtimeMode, platforms, hashes: Object.fromEntries(hashes) }, null, 2));
  console.log(`Wheel JS proof: ${proof}`);
  if (!process.env.WHEEL_PROOF_DIR) rmSync(proof, { recursive: true, force: true });
});
