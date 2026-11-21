import assert from 'node:assert/strict';
import { existsSync, readFileSync } from 'node:fs';
import path from 'node:path';
import test from 'node:test';
import vm from 'node:vm';
import { transformSync } from '@babel/core';
import solidBabelPlugin from '@solidjs/babel-plugin';
import ts from 'typescript';

const repoRoot = path.resolve(import.meta.dirname, '../../..');
const outRoot = path.join(repoRoot, 'tools/valdi-rolldown/out');

type TransportMode = 'compat' | 'native-solid';

const enum Opcode {
  CREATE_ELEMENT = 1,
  DESTROY_ELEMENT = 2,
  SET_ROOT_ELEMENT = 3,
  MOVE_ELEMENT_TO_PARENT = 4,
  SET_ATTRIBUTE_UNDEFINED = 5,
  SET_ATTRIBUTE_NULL = 6,
  SET_ATTRIBUTE_FALSE = 7,
  SET_ATTRIBUTE_TRUE = 8,
  SET_ATTRIBUTE_INT = 9,
  SET_ATTRIBUTE_DOUBLE = 10,
  SET_ATTRIBUTE_ARRAY = 11,
  SET_ATTRIBUTE_STYLE = 12,
  SET_ATTRIBUTE_ATTACHED_VALUE = 13,
  ON_NEXT_DRAW = 18,
  DETACH_ELEMENT = 19,
  INSERT_ELEMENT_BEFORE = 20,
}

type DecodedOp =
  | { type: Opcode.CREATE_ELEMENT; id: number; viewClass: string }
  | { type: Opcode.DESTROY_ELEMENT; id: number }
  | { type: Opcode.SET_ROOT_ELEMENT; id: number }
  | { type: Opcode.MOVE_ELEMENT_TO_PARENT; id: number; parentId: number; index: number }
  | {
      type:
        | Opcode.SET_ATTRIBUTE_UNDEFINED
        | Opcode.SET_ATTRIBUTE_NULL
        | Opcode.SET_ATTRIBUTE_FALSE
        | Opcode.SET_ATTRIBUTE_TRUE
        | Opcode.SET_ATTRIBUTE_INT
        | Opcode.SET_ATTRIBUTE_DOUBLE
        | Opcode.SET_ATTRIBUTE_ARRAY
        | Opcode.SET_ATTRIBUTE_ATTACHED_VALUE;
      id: number;
      attr: string;
      injected: boolean;
      value: unknown;
    }
  | { type: Opcode.ON_NEXT_DRAW; callback: () => void }
  | { type: Opcode.DETACH_ELEMENT; id: number }
  | { type: Opcode.INSERT_ELEMENT_BEFORE; id: number; parentId: number; beforeId: number };

interface SimNode {
  id: number;
  viewClass: string;
  parentId?: number;
  children: number[];
  attrs: Record<string, unknown>;
}

interface SimTree {
  treeId: string;
  rootId?: number;
  nodes: Map<number, SimNode>;
  batches: DecodedOp[][];
  onNextDrawCallbacks: (() => void)[];
}

function createCppSimulator() {
  const strings: string[] = [];
  const attributes: string[] = [];
  const trees = new Map<string, SimTree>();

  const getTree = (treeId: string): SimTree => {
    let tree = trees.get(treeId);
    if (!tree) {
      tree = { treeId, nodes: new Map(), batches: [], onNextDrawCallbacks: [] };
      trees.set(treeId, tree);
    }
    return tree;
  };

  const unlinkFromParent = (tree: SimTree, node: SimNode) => {
    if (node.parentId === undefined) return;
    const oldParent = tree.nodes.get(node.parentId);
    if (oldParent) {
      const idx = oldParent.children.indexOf(node.id);
      if (idx >= 0) oldParent.children.splice(idx, 1);
    }
    node.parentId = undefined;
  };

  const destroySubtree = (tree: SimTree, id: number): boolean => {
    const node = tree.nodes.get(id);
    if (!node) return false;
    tree.nodes.delete(id);
    while (node.children.length > 0) {
      const childId = node.children.pop()!;
      const child = tree.nodes.get(childId);
      if (child) child.parentId = undefined;
      if (!destroySubtree(tree, childId)) {
        // Already detached or destroyed
      }
    }
    unlinkFromParent(tree, node);
    if (tree.rootId === id) tree.rootId = undefined;
    return true;
  };

  const applyRequest = (request: {
    treeId: string;
    descriptor: ArrayBuffer;
    descriptorSize: number;
    values: unknown[];
  }) => {
    const tree = getTree(String(request.treeId));
    const dv = new DataView(request.descriptor);
    const wordLen = request.descriptorSize;
    assert.ok(wordLen * 4 <= request.descriptor.byteLength, 'descriptorSize exceeds buffer byteLength');

    const ops: DecodedOp[] = [];
    let cur = 0;

    while (cur < wordLen) {
      const header = dv.getUint32(cur * 4, true);
      cur++;
      const opcode = header & 0xff;
      const nodeId = opcode < 14 || opcode === 19 || opcode === 20 ? header >>> 8 : 0;

      if (opcode === Opcode.CREATE_ELEMENT) {
        assert.notEqual(nodeId, 0, 'Invalid element id 0');
        const strId = dv.getUint32(cur * 4, true);
        cur++;
        const viewClass = strings[strId];
        assert.ok(typeof viewClass === 'string', `Unknown interned string id ${strId}`);
        assert.ok(!tree.nodes.has(nodeId), `Duplicate element id ${nodeId}`);
        tree.nodes.set(nodeId, { id: nodeId, viewClass, children: [], attrs: {} });
        ops.push({ type: Opcode.CREATE_ELEMENT, id: nodeId, viewClass });
      } else if (opcode === Opcode.DESTROY_ELEMENT) {
        destroySubtree(tree, nodeId);
        ops.push({ type: Opcode.DESTROY_ELEMENT, id: nodeId });
      } else if (opcode === Opcode.SET_ROOT_ELEMENT) {
        const node = tree.nodes.get(nodeId);
        assert.ok(node, `SET_ROOT_ELEMENT unknown node ${nodeId}`);
        unlinkFromParent(tree, node);
        tree.rootId = nodeId;
        ops.push({ type: Opcode.SET_ROOT_ELEMENT, id: nodeId });
      } else if (opcode === Opcode.MOVE_ELEMENT_TO_PARENT) {
        const parentId = dv.getUint32(cur * 4, true) & 0xffffff;
        const index = dv.getUint32((cur + 1) * 4, true);
        cur += 2;
        const parent = tree.nodes.get(parentId);
        const child = tree.nodes.get(nodeId);
        assert.ok(parent, `MOVE unknown parent ${parentId}`);
        assert.ok(child, `MOVE unknown child ${nodeId}`);
        assert.notEqual(child.id, parent.id, 'Cannot insert node into itself');
        unlinkFromParent(tree, child);
        assert.ok(
          index <= parent.children.length,
          `Out of bounds insertion: index=${index}, size=${parent.children.length}, parent=${parentId}, child=${nodeId}`,
        );
        parent.children.splice(index, 0, child.id);
        child.parentId = parent.id;
        ops.push({ type: Opcode.MOVE_ELEMENT_TO_PARENT, id: nodeId, parentId, index });
      } else if (opcode >= 5 && opcode <= 13) {
        const attrHeader = dv.getUint32(cur * 4, true);
        cur++;
        const attrId = attrHeader & 0xffffff;
        const injected = (attrHeader >>> 24) !== 0;
        const attr = attributes[attrId];
        assert.ok(typeof attr === 'string', `Unknown attribute id ${attrId}`);
        const node = tree.nodes.get(nodeId);
        assert.ok(node, `SET_ATTRIBUTE unknown node ${nodeId}`);

        let value: unknown;
        if (opcode === Opcode.SET_ATTRIBUTE_UNDEFINED) {
          value = undefined;
        } else if (opcode === Opcode.SET_ATTRIBUTE_NULL) {
          value = null;
        } else if (opcode === Opcode.SET_ATTRIBUTE_FALSE) {
          value = false;
        } else if (opcode === Opcode.SET_ATTRIBUTE_TRUE) {
          value = true;
        } else if (opcode === Opcode.SET_ATTRIBUTE_INT) {
          value = dv.getUint32(cur * 4, true);
          cur++;
        } else if (opcode === Opcode.SET_ATTRIBUTE_DOUBLE) {
          value = dv.getFloat64(cur * 4, true);
          cur += 2;
        } else if (opcode === Opcode.SET_ATTRIBUTE_ARRAY) {
          const len = dv.getUint32(cur * 4, true);
          cur++;
          const arr: unknown[] = [];
          for (let i = 0; i < len; i++) {
            const valIdx = dv.getUint32(cur * 4, true);
            cur++;
            arr.push(request.values[valIdx]);
          }
          value = arr;
        } else if (opcode === Opcode.SET_ATTRIBUTE_ATTACHED_VALUE) {
          const valIdx = dv.getUint32(cur * 4, true);
          cur++;
          value = request.values[valIdx];
        } else {
          throw new Error(`Unsupported SET_ATTRIBUTE opcode ${opcode}`);
        }

        if (value === undefined) {
          delete node.attrs[attr];
        } else {
          node.attrs[attr] = value;
        }
        ops.push({ type: opcode as any, id: nodeId, attr, injected, value });
      } else if (opcode === Opcode.ON_NEXT_DRAW) {
        const valIdx = dv.getUint32(cur * 4, true);
        cur++;
        const callback = request.values[valIdx] as () => void;
        assert.equal(typeof callback, 'function', 'ON_NEXT_DRAW expects callback function');
        tree.onNextDrawCallbacks.push(callback);
        ops.push({ type: Opcode.ON_NEXT_DRAW, callback });
      } else if (opcode === Opcode.DETACH_ELEMENT) {
        const node = tree.nodes.get(nodeId);
        assert.ok(node, `DETACH_ELEMENT unknown node ${nodeId}`);
        unlinkFromParent(tree, node);
        if (tree.rootId === nodeId) tree.rootId = undefined;
        ops.push({ type: Opcode.DETACH_ELEMENT, id: nodeId });
      } else if (opcode === Opcode.INSERT_ELEMENT_BEFORE) {
        const parentId = dv.getUint32(cur * 4, true) & 0xffffff;
        const beforeId = dv.getUint32((cur + 1) * 4, true) & 0xffffff;
        cur += 2;
        const parent = tree.nodes.get(parentId);
        const child = tree.nodes.get(nodeId);
        assert.ok(parent, `INSERT_BEFORE unknown parent ${parentId}`);
        assert.ok(child, `INSERT_BEFORE unknown child ${nodeId}`);
        assert.notEqual(child.id, parent.id, 'Cannot insert node into itself');
        unlinkFromParent(tree, child);
        if (beforeId === 0) {
          parent.children.push(child.id);
        } else {
          const idx = parent.children.indexOf(beforeId);
          parent.children.splice(idx >= 0 ? idx : parent.children.length, 0, child.id);
        }
        child.parentId = parent.id;
        ops.push({ type: Opcode.INSERT_ELEMENT_BEFORE, id: nodeId, parentId, beforeId });
      } else {
        throw new Error(`Unsupported opcode ${opcode} at word ${cur - 1}`);
      }
    }

    tree.batches.push(ops);
  };

  return {
    strings,
    attributes,
    trees,
    getTree,
    runtimeApi: {
      getCurrentPlatform: () => 2, // iOS
      internString: (str: string) => {
        const idx = strings.indexOf(str);
        if (idx >= 0) return idx;
        strings.push(str);
        return strings.length - 1;
      },
      getAttributeId: (name: string) => {
        const idx = attributes.indexOf(name);
        if (idx >= 0) return idx;
        attributes.push(name);
        return attributes.length - 1;
      },
      pushCurrentContext: (_id?: string) => {},
      popCurrentContext: () => {},
      submitRawRenderRequest: (request: any, cb?: () => void) => {
        applyRequest(request);
        cb?.();
      },
    },
  };
}

function createValdiTestHarness(mode: TransportMode = 'compat') {
  const sim = createCppSimulator();
  const contextStack: (string | undefined)[] = [];
  sim.runtimeApi.pushCurrentContext = (id?: string) => {
    contextStack.push(id);
  };
  sim.runtimeApi.popCurrentContext = () => {
    contextStack.pop();
  };

  let nextTimerId = 1;
  const activeTimers = new Set<number>();
  const clearedTimers: number[] = [];
  const pushes: Array<{ route: string; params: any }> = [];
  let backs = 0;

  const moduleCache = new Map<string, any>();
  const memoryModules = new Map<string, string>();

  const builtins: Record<string, any> = {
    'valdi_core/src/ValdiRuntimeProvider': {
      getValdiRuntime: () => sim.runtimeApi,
    },
    'valdi_core/src/NativeReferences': {
      withLocalNativeRefs: (contextId: string, cb: () => any) => {
        sim.runtimeApi.pushCurrentContext(contextId);
        try {
          return cb();
        } finally {
          sim.runtimeApi.popCurrentContext();
        }
      },
      withGlobalNativeRefs: (_attribution: string, cb: () => any) => cb(),
    },
    'valdi_core/src/ModuleLoaderGlobal': {
      getModuleLoader: () => moduleLoader,
    },
    'valdi_core/src/SystemFont': {
      systemFont: (size: number) => `system ${size}`,
      systemSemiboldFont: (size: number) => `system-semibold ${size}`,
      systemBoldFont: (size: number) => `system-bold ${size}`,
    },
    'valdi_core/src/Device': {
      Device: {
        getSystemType: () => 'ios',
        isAndroid: () => false,
        isIOS: () => true,
      },
    },
    'valdi_core/src/UncaughtErrorHandler': {
      UncaughtErrorHandlerResult: { CRASH_APPLICATION: 1, IGNORE: 0 },
      setCatchAllUncaughtErrorHandler: () => {},
    },
    'app_foundation/src/host/AppContext': {
      getHost: () => ({
        getNavigationHost: () => ({
          push: (route: string, params: any) => pushes.push({ route, params }),
          back: () => {
            backs++;
          },
          updateRoutes: () => {},
        }),
      }),
    },
  };

  const sandboxGlobals: Record<string, any> = {
    console,
    Promise,
    queueMicrotask,
    ArrayBuffer,
    Uint8Array,
    Int32Array,
    Float64Array,
    DataView,
    Map,
    Set,
    WeakMap,
    WeakSet,
    Symbol,
    Error,
    TypeError,
    RangeError,
    Object,
    Array,
    Number,
    String,
    Boolean,
    Math,
    JSON,
    runtime: sim.runtimeApi,
    setTimeout: (fn: () => void, ms = 0) => {
      const id = nextTimerId++;
      activeTimers.add(id);
      const nativeId = setTimeout(() => {
        activeTimers.delete(id);
        fn();
      }, ms);
      (nativeId as any).unref?.();
      return id;
    },
    clearTimeout: (id: number) => {
      activeTimers.delete(id);
      clearedTimers.push(id);
    },
    setInterval: (_fn: () => void, _ms = 0) => {
      const id = nextTimerId++;
      activeTimers.add(id);
      return id;
    },
    clearInterval: (id: number) => {
      activeTimers.delete(id);
      clearedTimers.push(id);
    },
  };
  sandboxGlobals.globalThis = sandboxGlobals;
  const vmContext = vm.createContext(sandboxGlobals);

  function resolveModuleKey(request: string, fromId?: string): string {
    const clean = request.replace(/\.js$/, '');
    if (builtins[clean] || memoryModules.has(clean)) return clean;
    if (clean.startsWith('.') && fromId) {
      const joined = path.posix.normalize(path.posix.join(path.posix.dirname(fromId), clean));
      return joined;
    }
    return clean;
  }

  function loadModule(id: string): any {
    const normalized = resolveModuleKey(id);
    if (builtins[normalized]) return builtins[normalized];
    if (moduleCache.has(normalized)) return moduleCache.get(normalized);

    let code: string | undefined = memoryModules.get(normalized);
    if (code === undefined) {
      const diskPath = path.join(outRoot, `${normalized}.js`);
      if (!existsSync(diskPath)) {
        throw new Error(`Module not found in Valdi test harness: ${normalized} (${diskPath})`);
      }
      code = readFileSync(diskPath, 'utf8');
    }

    const mod = { exports: {} as any };
    moduleCache.set(normalized, mod.exports);

    const localRequire = (specifier: string) => {
      const resolved = resolveModuleKey(specifier, normalized);
      return loadModule(resolved);
    };

    const fn = vm.runInContext(`(function(require, module, exports){${code}\n})`, vmContext, {
      filename: `${normalized}.js`,
    });
    fn(localRequire, mod, mod.exports);
    moduleCache.set(normalized, mod.exports);
    return mod.exports;
  }

  const moduleLoader = {
    load: (modulePath: string) => loadModule(modulePath),
  };
  sandboxGlobals.moduleLoader = moduleLoader;

  function compileInlineTsx(moduleId: string, tsxSource: string) {
    const jsFromTs = ts.transpileModule(tsxSource, {
      fileName: `${moduleId}.tsx`,
      compilerOptions: {
        jsx: ts.JsxEmit.Preserve,
        target: ts.ScriptTarget.ES2020,
        module: ts.ModuleKind.ESNext,
      },
    }).outputText;

    const solidJs = transformSync(jsFromTs, {
      filename: `${moduleId}.tsx`,
      configFile: false,
      babelrc: false,
      plugins: [[solidBabelPlugin, { generate: 'universal', moduleName: 'solid_native/src/renderer', dev: false }]],
    })?.code;
    assert.ok(solidJs, 'Expected Babel Solid universal output');

    const cjsCode = ts.transpileModule(solidJs, {
      fileName: `${moduleId}.js`,
      compilerOptions: {
        target: ts.ScriptTarget.ES2020,
        module: ts.ModuleKind.CommonJS,
        esModuleInterop: true,
      },
    }).outputText;

    // Rewrite solid-js imports to shared solid_runtime just as valdiTs does
    const rewritten = cjsCode.replace(/require\((["'])solid-js\1\)/g, 'require("solid_runtime/src/solid")');
    memoryModules.set(moduleId, rewritten);
    moduleCache.delete(moduleId);
    return loadModule(moduleId);
  }

  const bridge = loadModule('solid_native/src/bridge');
  bridge.setDefaultTransportMode(mode);
  const manager = bridge.createRootComponentsManager(mode);

  const flushMicrotasks = async () => {
    for (let i = 0; i < 6; i++) {
      await Promise.resolve();
    }
  };

  return {
    sim,
    manager,
    bridge,
    activeTimers,
    clearedTimers,
    pushes,
    getBacks: () => backs,
    loadModule,
    compileInlineTsx,
    flushMicrotasks,
  };
}

function collectLabels(tree: SimTree, nodeId = tree.rootId): string[] {
  if (!nodeId) return [];
  const node = tree.nodes.get(nodeId);
  if (!node) return [];
  const out: string[] = [];
  if (typeof node.attrs.value === 'string') {
    out.push(node.attrs.value);
  }
  for (const childId of node.children) {
    out.push(...collectLabels(tree, childId));
  }
  return out;
}

function findNodeWithLabel(tree: SimTree, predicate: (label: string) => boolean): SimNode | undefined {
  for (const node of tree.nodes.values()) {
    if (typeof node.attrs.value === 'string' && predicate(node.attrs.value)) {
      return node;
    }
  }
  return undefined;
}

function tapButtonWithText(tree: SimTree, text: string): void {
  const labelNode = findNodeWithLabel(tree, v => v === text);
  assert.ok(labelNode, `Expected label "${text}" in tree ${tree.treeId}`);
  let cur: SimNode | undefined = labelNode;
  while (cur) {
    if (typeof cur.attrs.onTap === 'function') {
      (cur.attrs.onTap as () => void)();
      return;
    }
    cur = cur.parentId ? tree.nodes.get(cur.parentId) : undefined;
  }
  throw new Error(`No ancestor with onTap found for label "${text}"`);
}

function findForRowLabels(tree: SimTree): string[] {
  return collectLabels(tree).filter(v => /^\[\d+\] #\d+ · /.test(v));
}

function makePageViewModel(route: string, pageId: string) {
  return {
    pageId,
    route,
    params: {},
    presentation: 'push',
    insets: { top: 47, bottom: 34, left: 0, right: 0 },
    visible: true,
    visibilityReason: 'navigation',
  };
}

function runSuiteForMode(mode: TransportMode) {
  test(`[${mode}] 1. Babel universal compilation compiles JSX with staticProps & reactive props`, async () => {
    const h = createValdiTestHarness(mode);
    const solid = h.loadModule('solid_runtime/src/solid');
    const [count, setCount] = solid.createSignal(1);

    h.compileInlineTsx(
      'inline_test/StaticPropsPage',
      `
      export function StaticPropsPage(props) {
        return (
          <view backgroundColor="#FFFFFF" padding={12}>
            <label value={"Count=" + props.viewModel().count} color="#111111" />
          </view>
        );
      }
      `,
    );

    h.manager.create('10', 'StaticPropsPage@inline_test/StaticPropsPage', { count: count() }, { back() {}, finish() {} });
    const tree = h.sim.getTree('10');
    assert.ok(tree.rootId !== undefined);
    assert.deepEqual(collectLabels(tree), ['Count=1']);

    const viewNode = [...tree.nodes.values()].find(n => n.attrs.padding === 12);
    assert.ok(viewNode);
    assert.equal(viewNode.attrs.backgroundColor, '#FFFFFF');
    if (mode === 'compat') {
      assert.equal(viewNode.viewClass, 'SCValdiView');
    } else {
      assert.equal(viewNode.viewClass, 'view');
    }

    h.manager.render('10', { count: 42 });
    await h.flushMicrotasks();
    assert.deepEqual(collectLabels(tree), ['Count=42']);
    h.manager.destroy('10');
  });

  test(`[${mode}] 2. Multi-signal updates auto-batch into a single RenderRequest via microtask without batch()`, async () => {
    const h = createValdiTestHarness(mode);
    const solid = h.loadModule('solid_runtime/src/solid');
    const [a, setA] = solid.createSignal('A0');
    const [b, setB] = solid.createSignal('B0');
    const [c, setC] = solid.createSignal('#000000');

    h.compileInlineTsx(
      'inline_test/MultiSignalPage',
      `
      export function MultiSignalPage(props) {
        const s = props.viewModel().signals;
        return (
          <view backgroundColor={s.c()}>
            <label value={s.a()} />
            <label value={s.b()} />
          </view>
        );
      }
      `,
    );

    h.manager.create('11', 'MultiSignalPage@inline_test/MultiSignalPage', { signals: { a, b, c } }, {});
    const tree = h.sim.getTree('11');
    const initialBatches = tree.batches.length;
    assert.equal(initialBatches, 1);

    // Mutate all 3 signals synchronously with ZERO batch() wrapper
    setA('A1');
    setB('B1');
    setC('#FF0000');

    // Before microtask drain, nothing has been submitted yet
    assert.equal(tree.batches.length, initialBatches);

    await h.flushMicrotasks();
    assert.equal(tree.batches.length, initialBatches + 1, '3 signal writes must produce exactly 1 native batch');

    const batch = tree.batches[initialBatches];
    assert.equal(batch.length, 3);
    assert.ok(batch.every(op => op.type >= 5 && op.type <= 13), 'Batch must only contain SET_ATTRIBUTE ops');
    assert.deepEqual(collectLabels(tree), ['A1', 'B1']);
    h.manager.destroy('11');
  });

  test(`[${mode}] 3. Per-page Solid roots + single shared solid_runtime on compiled app_pages`, async () => {
    const h = createValdiTestHarness(mode);
    const routesMod = h.loadModule('app_pages/src/routes');
    assert.equal(routesMod.routes.pages.home.component, 'HomePage@app_pages/src/pages/HomePage');
    assert.equal(routesMod.routes.pages.shared.component, 'SharedPage@app_pages/src/pages/SharedPage');

    const page1Back = () => {};
    const page2Back = () => {};
    h.manager.create('1', 'HomePage@app_pages/src/pages/HomePage', makePageViewModel('home', 'p1'), { back: page1Back, finish() {} });
    h.manager.create('2', 'SharedPage@app_pages/src/pages/SharedPage', makePageViewModel('shared', 'p2'), { back: page2Back, finish() {} });

    const tree1 = h.sim.getTree('1');
    const tree2 = h.sim.getTree('2');
    assert.ok(findNodeWithLabel(tree1, v => v.includes('Local: 0') && v.includes('Global: 0') && v.includes('Sum: 0')));
    assert.ok(findNodeWithLabel(tree2, v => v.includes('Global Counter: 0')));

    // SharedPage registers setInterval + onCleanup
    assert.equal(h.activeTimers.size, 1);

    // Mutate globalCount from Page 2 -> BOTH Page 1 and Page 2 update in shared runtime
    tapButtonWithText(tree2, '+10 Global');
    await h.flushMicrotasks();
    assert.ok(findNodeWithLabel(tree1, v => v === 'Local: 0   ·   Global: 10   ·   Sum: 10'));
    assert.ok(findNodeWithLabel(tree2, v => v.includes('Global Counter: 10')));

    const page2BatchCountBeforeDestroy = tree2.batches.length;

    // Dispose ONLY Page 2's Solid root
    h.manager.destroy('2');
    assert.equal(h.activeTimers.size, 0, 'Page 2 interval cleanup must run on root destroy');

    // Burst x3 on Page 1 -> Page 1 updates cleanly, Page 2 emits ZERO new batches
    const page1BatchesBefore = tree1.batches.length;
    tapButtonWithText(tree1, 'Burst x3 (1 Batch)');
    await h.flushMicrotasks();
    assert.equal(tree1.batches.length, page1BatchesBefore + 1);
    assert.equal(tree2.batches.length, page2BatchCountBeforeDestroy);
    assert.ok(findNodeWithLabel(tree1, v => v === 'Local: 1   ·   Global: 11   ·   Sum: 12'));

    h.manager.destroy('1');
  });

  test(`[${mode}] 4. <Show> conditional mount/unmount across repeated cycles without sentinel views or OOB`, async () => {
    const h = createValdiTestHarness(mode);
    h.manager.create('1', 'HomePage@app_pages/src/pages/HomePage', makePageViewModel('home', 'p1'), { back() {}, finish() {} });
    const tree = h.sim.getTree('1');

    const hasSentinelNode = () => [...tree.nodes.values()].some(n => n.viewClass === '#sentinel');
    assert.equal(hasSentinelNode(), false);
    assert.ok(findNodeWithLabel(tree, v => v.startsWith('Mounted panel ·')));

    for (let cycle = 0; cycle < 3; cycle++) {
      tapButtonWithText(tree, 'Hide');
      await h.flushMicrotasks();
      assert.equal(hasSentinelNode(), false);
      assert.ok(findNodeWithLabel(tree, v => v.startsWith('Panel unmounted cleanly')));
      assert.equal(findNodeWithLabel(tree, v => v.startsWith('Mounted panel ·')), undefined);

      tapButtonWithText(tree, 'Show');
      await h.flushMicrotasks();
      assert.equal(hasSentinelNode(), false);
      assert.ok(findNodeWithLabel(tree, v => v.startsWith('Mounted panel ·')));
      assert.equal(findNodeWithLabel(tree, v => v.startsWith('Panel unmounted cleanly')), undefined);
    }

    h.manager.destroy('1');
  });

  test(`[${mode}] 5. <For> keyed list append, prepend, reverse, rotate, remove middle, clear`, async () => {
    const h = createValdiTestHarness(mode);
    h.manager.create('1', 'HomePage@app_pages/src/pages/HomePage', makePageViewModel('home', 'p1'), { back() {}, finish() {} });
    const tree = h.sim.getTree('1');

    assert.deepEqual(findForRowLabels(tree), [
      '[0] #1 · Alpha signal row',
      '[1] #2 · Beta signal row',
      '[2] #3 · Gamma signal row',
    ]);

    tapButtonWithText(tree, '+ Append');
    await h.flushMicrotasks();
    assert.deepEqual(findForRowLabels(tree), [
      '[0] #1 · Alpha signal row',
      '[1] #2 · Beta signal row',
      '[2] #3 · Gamma signal row',
      '[3] #4 · Item #4 (appended)',
    ]);

    tapButtonWithText(tree, '+ Prepend');
    await h.flushMicrotasks();
    assert.deepEqual(findForRowLabels(tree), [
      '[0] #5 · Item #5 (prepended)',
      '[1] #1 · Alpha signal row',
      '[2] #2 · Beta signal row',
      '[3] #3 · Gamma signal row',
      '[4] #4 · Item #4 (appended)',
    ]);

    tapButtonWithText(tree, 'Reverse');
    await h.flushMicrotasks();
    assert.deepEqual(findForRowLabels(tree), [
      '[0] #4 · Item #4 (appended)',
      '[1] #3 · Gamma signal row',
      '[2] #2 · Beta signal row',
      '[3] #1 · Alpha signal row',
      '[4] #5 · Item #5 (prepended)',
    ]);

    tapButtonWithText(tree, 'Rotate');
    await h.flushMicrotasks();
    assert.deepEqual(findForRowLabels(tree), [
      '[0] #3 · Gamma signal row',
      '[1] #2 · Beta signal row',
      '[2] #1 · Alpha signal row',
      '[3] #5 · Item #5 (prepended)',
      '[4] #4 · Item #4 (appended)',
    ]);

    // Remove middle row (#1)
    const rowLabel = findNodeWithLabel(tree, v => v === '[2] #1 · Alpha signal row');
    assert.ok(rowLabel?.parentId);
    const rowView = tree.nodes.get(rowLabel.parentId);
    assert.ok(rowView);
    const removeBtnView = tree.nodes.get(rowView.children[1]);
    assert.ok(removeBtnView && typeof removeBtnView.attrs.onTap === 'function');
    (removeBtnView.attrs.onTap as () => void)();
    await h.flushMicrotasks();
    assert.deepEqual(findForRowLabels(tree), [
      '[0] #3 · Gamma signal row',
      '[1] #2 · Beta signal row',
      '[2] #5 · Item #5 (prepended)',
      '[3] #4 · Item #4 (appended)',
    ]);

    tapButtonWithText(tree, 'Clear');
    await h.flushMicrotasks();
    assert.deepEqual(findForRowLabels(tree), []);
    assert.ok(findNodeWithLabel(tree, v => v.startsWith('List is empty.')));
    assert.equal([...tree.nodes.values()].some(n => n.viewClass === '#sentinel'), false);

    h.manager.destroy('1');
  });

  test(`[${mode}] 6. Text child policy rejects non-empty text and keeps "" as pure-JS sentinel`, () => {
    const h = createValdiTestHarness(mode);
    const renderer = h.loadModule('solid_native/src/renderer');
    const tree = new (h.loadModule('solid_native/src/native-tree').NativeTree)(
      new (h.loadModule('solid_native/src/transport').ValdiBinarySink)('99', mode, h.sim.runtimeApi),
    );

    const dispose = renderer.render(
      () =>
        renderer.createComponent(renderer.RenderContext, {
          value: tree,
          get children() {
            const empty = renderer.createTextNode('');
            assert.equal(empty.kind, 'sentinel');
            assert.throws(() => renderer.createTextNode('Hello'), /Direct text children are not supported/);
            return empty;
          },
        }),
      tree.root,
    );
    tree.flush();
    const simTree = h.sim.getTree('99');
    assert.equal(simTree.nodes.size, 0, 'Empty sentinel must not materialize a C++ view');
    dispose();
    tree.dispose();
  });

  test(`[${mode}] 7. onNextDraw emits ON_NEXT_DRAW opcode for splash screen dismissal`, () => {
    const h = createValdiTestHarness(mode);
    h.manager.create('1', 'HomePage@app_pages/src/pages/HomePage', makePageViewModel('home', 'p1'), { back() {}, finish() {} });
    const simTree = h.sim.getTree('1');
    let drawn = false;
    h.manager.rootComponents['1'].renderer.onNextDraw(() => {
      drawn = true;
    });
    assert.equal(simTree.onNextDrawCallbacks.length, 1);
    simTree.onNextDrawCallbacks[0]();
    assert.equal(drawn, true);
    h.manager.destroy('1');
  });
}

runSuiteForMode('compat');
runSuiteForMode('native-solid');

test('[native-solid] 8. Default transport uses native-solid raw tags, INSERT_ELEMENT_BEFORE (20), and DETACH_ELEMENT (19) re-attach', () => {
  const h = createValdiTestHarness('native-solid');
  const defaultMgr = h.bridge.createRootComponentsManager();
  defaultMgr.create('77', 'HomePage@app_pages/src/pages/HomePage', makePageViewModel('home', 'p77'), {
    back() {},
    finish() {},
  });
  assert.equal(defaultMgr.getBatchStats('77')?.mode, 'native-solid');
  const defaultTree = h.sim.getTree('77');
  assert.equal(
    defaultTree.batches[0].some(op => op.type === Opcode.MOVE_ELEMENT_TO_PARENT),
    false,
    'native-solid must use INSERT_ELEMENT_BEFORE instead of MOVE_ELEMENT_TO_PARENT',
  );
  assert.ok(
    defaultTree.batches[0].some(op => op.type === Opcode.CREATE_ELEMENT && op.viewClass === 'view'),
    'native-solid must send raw "view" tag',
  );
  defaultMgr.destroy('77');

  const { NativeTree } = h.loadModule('solid_native/src/native-tree');
  const { ValdiBinarySink } = h.loadModule('solid_native/src/transport');
  const sink = new ValdiBinarySink('20', 'native-solid', h.sim.runtimeApi);
  const tree = new NativeTree(sink);

  const a = tree.create('label', { value: 'A' });
  const b = tree.create('view', { backgroundColor: '#123456' });
  const c = tree.create('label', { value: 'C' });

  // Batch 1: initial [A, C]
  tree.insert(tree.root, a);
  tree.insert(tree.root, c);
  tree.flush();
  const simTree = h.sim.getTree('20');
  assert.deepEqual(simTree.nodes.get(tree.root.id)?.children, [a.id, c.id]);
  assert.ok(simTree.batches[0].every(op => op.type !== Opcode.MOVE_ELEMENT_TO_PARENT));
  assert.ok(simTree.batches[0].some(op => op.type === Opcode.INSERT_ELEMENT_BEFORE && op.id === a.id && op.beforeId === 0));

  // Batch 2: insert B before C
  tree.insert(tree.root, b, c);
  tree.flush();
  assert.deepEqual(simTree.nodes.get(tree.root.id)?.children, [a.id, b.id, c.id]);
  assert.ok(
    simTree.batches[1].some(
      op => op.type === Opcode.INSERT_ELEMENT_BEFORE && op.id === b.id && op.parentId === tree.root.id && op.beforeId === c.id,
    ),
  );

  // Batch 3: detach B cleanly (no DESTROY_ELEMENT)
  tree.remove(tree.root, b);
  tree.flush();
  assert.deepEqual(simTree.nodes.get(tree.root.id)?.children, [a.id, c.id]);
  assert.equal(simTree.nodes.has(b.id), true, 'Detached node must survive across batches');
  assert.deepEqual(simTree.batches[2], [{ type: Opcode.DETACH_ELEMENT, id: b.id }]);

  // Batch 4: re-attach surviving B before A (no duplicate CREATE_ELEMENT, no DESTROY_ELEMENT)
  tree.insert(tree.root, b, a);
  tree.flush();
  assert.deepEqual(simTree.nodes.get(tree.root.id)?.children, [b.id, a.id, c.id]);
  assert.deepEqual(simTree.batches[3], [
    { type: Opcode.INSERT_ELEMENT_BEFORE, id: b.id, parentId: tree.root.id, beforeId: a.id },
  ]);

  tree.dispose();
});
