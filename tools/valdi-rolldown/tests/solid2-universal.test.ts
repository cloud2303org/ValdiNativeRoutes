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
  BEGIN_ANIMATIONS = 14,
  END_ANIMATIONS = 15,
  ON_LAYOUT_COMPLETE = 16,
  CANCEL_ANIMATION = 17,
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
        | Opcode.SET_ATTRIBUTE_STYLE
        | Opcode.SET_ATTRIBUTE_ATTACHED_VALUE;
      id: number;
      attr: string;
      injected: boolean;
      value: unknown;
    }
  | {
      type: Opcode.BEGIN_ANIMATIONS;
      duration: number;
      curveInt: number;
      beginFromCurrentState: boolean;
      crossfade: boolean;
      stiffness: number;
      damping: number;
      controlPoints: unknown;
      completion: unknown;
      cancelToken: number;
    }
  | { type: Opcode.END_ANIMATIONS }
  | { type: Opcode.ON_LAYOUT_COMPLETE; callback: () => void }
  | { type: Opcode.CANCEL_ANIMATION; cancelToken: number }
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
  onLayoutCompleteCallbacks: (() => void)[];
  frameObserver?: (updates: Float64Array) => void;
  visibilityObserver?: (
    appearingElements: number[],
    disappearingElements: number[],
    viewportUpdates: number[],
    acknowledger: () => void,
    eventTime: number,
  ) => void;
}

function createCppSimulator(initialPlatform = 2) {
  let platform = initialPlatform;
  const strings: string[] = [];
  const attributes: string[] = [];
  const cssRules: Record<string, unknown>[] = [];
  const trees = new Map<string, SimTree>();
  const elementFrames = new Map<string, { x: number; y: number; width: number; height: number }>();
  const nativeViews = new Map<string, any>();
  const nativeNodes = new Map<string, any>();
  const snapshots = new Map<string, string>();

  const getTree = (treeId: string): SimTree => {
    let tree = trees.get(treeId);
    if (!tree) {
      tree = {
        treeId,
        nodes: new Map(),
        batches: [],
        onNextDrawCallbacks: [],
        onLayoutCompleteCallbacks: [],
      };
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
    frameObserver?: (updates: Float64Array) => void;
    visibilityObserver?: (
      appearingElements: number[],
      disappearingElements: number[],
      viewportUpdates: number[],
      acknowledger: () => void,
      eventTime: number,
    ) => void;
  }) => {
    const tree = getTree(String(request.treeId));
    if (request.frameObserver) tree.frameObserver = request.frameObserver;
    if (request.visibilityObserver) tree.visibilityObserver = request.visibilityObserver;
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
        } else if (opcode === Opcode.SET_ATTRIBUTE_STYLE) {
          const styleId = dv.getUint32(cur * 4, true);
          cur++;
          const styleAttrs = cssRules[styleId];
          assert.ok(styleAttrs !== undefined, `Unknown CSS rule id ${styleId}`);
          value = { __styleId: styleId, attrs: styleAttrs };
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
      } else if (opcode === Opcode.BEGIN_ANIMATIONS) {
        assert.ok(cur + 12 <= wordLen, 'BEGIN_ANIMATIONS requires 12 payload words');
        const duration = dv.getFloat64(cur * 4, true);
        cur += 2;
        const curveInt = dv.getUint32(cur * 4, true);
        cur++;
        const beginFromCurrentState = dv.getUint32(cur * 4, true) !== 0;
        cur++;
        const crossfade = dv.getUint32(cur * 4, true) !== 0;
        cur++;
        const stiffness = dv.getFloat64(cur * 4, true);
        cur += 2;
        const damping = dv.getFloat64(cur * 4, true);
        cur += 2;
        const controlPointsIndex = dv.getUint32(cur * 4, true);
        cur++;
        const completionIndex = dv.getUint32(cur * 4, true);
        cur++;
        const cancelToken = dv.getUint32(cur * 4, true);
        cur++;
        assert.ok(curveInt >= 1 && curveInt <= 4, `Invalid animation curve ${curveInt}`);
        assert.ok(controlPointsIndex < request.values.length, 'controlPointsIndex out of range');
        assert.ok(completionIndex < request.values.length, 'completionIndex out of range');
        ops.push({
          type: Opcode.BEGIN_ANIMATIONS,
          duration,
          curveInt,
          beginFromCurrentState,
          crossfade,
          stiffness,
          damping,
          controlPoints: request.values[controlPointsIndex],
          completion: request.values[completionIndex],
          cancelToken,
        });
      } else if (opcode === Opcode.END_ANIMATIONS) {
        ops.push({ type: Opcode.END_ANIMATIONS });
      } else if (opcode === Opcode.ON_LAYOUT_COMPLETE) {
        const valIdx = dv.getUint32(cur * 4, true);
        cur++;
        const callback = request.values[valIdx] as () => void;
        assert.equal(typeof callback, 'function', 'ON_LAYOUT_COMPLETE expects callback function');
        tree.onLayoutCompleteCallbacks.push(callback);
        ops.push({ type: Opcode.ON_LAYOUT_COMPLETE, callback });
      } else if (opcode === Opcode.CANCEL_ANIMATION) {
        const cancelToken = dv.getUint32(cur * 4, true);
        cur++;
        ops.push({ type: Opcode.CANCEL_ANIMATION, cancelToken });
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
    cssRules,
    trees,
    elementFrames,
    nativeViews,
    nativeNodes,
    snapshots,
    getTree,
    setPlatform: (nextPlatform: number) => {
      platform = nextPlatform;
    },
    runtimeApi: {
      getCurrentPlatform: () => platform,
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
      createCSSRule: (attrs: Record<string, unknown>) => {
        cssRules.push({ ...attrs });
        return cssRules.length - 1;
      },
      getFrameForElementId: (treeId: string, elementId: number, cb: (frame: any) => void) => {
        cb(elementFrames.get(`${treeId}:${elementId}`));
      },
      getNativeViewForElementId: (treeId: string, elementId: number, cb: (view: any) => void) => {
        cb(nativeViews.get(`${treeId}:${elementId}`));
      },
      getNativeNodeForElementId: (treeId: string, elementId: number) => {
        return nativeNodes.get(`${treeId}:${elementId}`);
      },
      takeElementSnapshot: (treeId: string, elementId: number, cb: (snapshot: string | undefined) => void) => {
        cb(snapshots.get(`${treeId}:${elementId}`));
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

function createValdiTestHarness(mode: TransportMode = 'compat', platform = 2) {
  const sim = createCppSimulator(platform);
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
    'valdi_core/src/AnimationOptions': {
      AnimationCurve: {
        Linear: 'linear',
        EaseIn: 'easeIn',
        EaseOut: 'easeOut',
        EaseInOut: 'easeInOut',
      },
    },
    'valdi_core/src/Style': {
      Style: class Style<T> {
        readonly attributes: T;
        private native: number | undefined;
        constructor(attributes: T) {
          this.attributes = attributes;
        }
        toNative(convertFunc: (attributes: T) => number): number {
          if (this.native === undefined) {
            this.native = convertFunc(this.attributes);
          }
          return this.native;
        }
        extend(attributes: any) {
          const next = attributes?.attributes ?? attributes;
          return new (this.constructor as any)({ ...this.attributes, ...next });
        }
      },
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

  test(`[${mode}] 9. Style objects emit SET_ATTRIBUTE_STYLE (12) and reuse cached native CSS rule ids`, async () => {
    const h = createValdiTestHarness(mode);
    const { Style } = h.loadModule('valdi_core/src/Style');

    h.compileInlineTsx(
      'inline_test/StylePage',
      `
      import { Style } from 'valdi_core/src/Style';
      const cardStyle = new Style({ backgroundColor: '#123456', borderRadius: 8, padding: 10 });
      export function StylePage() {
        return (
          <view>
            <view style={cardStyle} />
            <view style={cardStyle} />
          </view>
        );
      }
      `,
    );

    h.manager.create('31', 'StylePage@inline_test/StylePage', {}, { back() {}, finish() {} });
    const simTree = h.sim.getTree('31');

    const styleOps = simTree.batches[0].filter(
      (op): op is Extract<DecodedOp, { attr: string }> => op.type === Opcode.SET_ATTRIBUTE_STYLE,
    );
    assert.equal(styleOps.length, 2, 'Both views must emit SET_ATTRIBUTE_STYLE');
    assert.equal(h.sim.cssRules.length, 1, 'Style must cache createCSSRule id across views');
    assert.deepEqual(h.sim.cssRules[0], { backgroundColor: '#123456', borderRadius: 8, padding: 10 });
    assert.deepEqual(styleOps[0].value, {
      __styleId: 0,
      attrs: { backgroundColor: '#123456', borderRadius: 8, padding: 10 },
    });
    assert.deepEqual(styleOps[1].value, styleOps[0].value);
    h.manager.destroy('31');
    assert.ok(Style);
  });

  test(`[${mode}] 10. <custom-view> resolves platform class names and viewFactory -> Deferred`, () => {
    // iOS (platform = 2)
    const iosHarness = createValdiTestHarness(mode, 2);
    iosHarness.compileInlineTsx(
      'inline_test/CustomViewPage',
      `
      export function CustomViewPage(props) {
        return (
          <view>
            <custom-view iosClass="SCMyCustomIOSView" androidClass="com.example.MyView" macosClass="NSMyCustomView" padding={6} />
            <custom-view viewFactory={props.viewModel().factory} backgroundColor="#112233" />
          </view>
        );
      }
      `,
    );
    const factory = { __tag: 'ViewFactory' };
    iosHarness.manager.create('41', 'CustomViewPage@inline_test/CustomViewPage', { factory }, { back() {}, finish() {} });
    const iosTree = iosHarness.sim.getTree('41');
    const iosCustom = [...iosTree.nodes.values()].find(n => n.viewClass === 'SCMyCustomIOSView');
    assert.ok(iosCustom, 'iOS platform must resolve iosClass');
    assert.equal(iosCustom.attrs.padding, 6);
    assert.equal(iosCustom.attrs.iosClass, undefined);
    assert.equal(iosCustom.attrs.androidClass, undefined);

    const iosDeferred = [...iosTree.nodes.values()].find(n => n.viewClass === 'Deferred');
    assert.ok(iosDeferred, 'viewFactory must create Deferred view');
    assert.equal(iosDeferred.attrs.viewFactory, factory);
    assert.equal(iosDeferred.attrs.backgroundColor, '#112233');
    iosHarness.manager.destroy('41');

    // Android (platform = 1)
    const androidHarness = createValdiTestHarness(mode, 1);
    androidHarness.compileInlineTsx(
      'inline_test/CustomViewPage',
      `
      export function CustomViewPage() {
        return <custom-view iosClass="SCMyCustomIOSView" androidClass="com.example.MyView" padding={8} />;
      }
      `,
    );
    androidHarness.manager.create('42', 'CustomViewPage@inline_test/CustomViewPage', {}, { back() {}, finish() {} });
    const androidTree = androidHarness.sim.getTree('42');
    const androidCustom = [...androidTree.nodes.values()].find(n => n.viewClass === 'com.example.MyView');
    assert.ok(androidCustom, 'Android platform must resolve androidClass');
    assert.equal(androidCustom.attrs.padding, 8);
    androidHarness.manager.destroy('42');
  });

  test(`[${mode}] 11. Visibility/viewport observers, $onLayout, and onLayoutComplete dispatch & acknowledger safety`, async () => {
    const h = createValdiTestHarness(mode);
    const solid = h.loadModule('solid_runtime/src/solid');
    const [trackVis, setTrackVis] = solid.createSignal(true);
    const events: any[] = [];
    const onLayoutCompleteCb = () => {
      events.push('element-layout-complete');
    };
    const treeLayoutCompleteCb = () => {
      events.push('tree-layout-complete');
    };

    h.compileInlineTsx(
      'inline_test/VisibilityPage',
      `
      export function VisibilityPage(props) {
        const cfg = props.viewModel();
        return (
          <view>
            <view
              backgroundColor="#AAA"
              onLayout={f => cfg.events.push(['layoutA', f])}
              $onLayout={f => cfg.events.push(['$layoutA', f])}
              onVisibilityChanged={cfg.trackVis() ? (v, t) => cfg.events.push(['visA', v, t]) : undefined}
              onViewportChanged={cfg.trackVis() ? (vp, fr, t) => cfg.events.push(['vpA', vp, fr, t]) : undefined}
              onLayoutComplete={cfg.onLayoutCompleteCb}
            />
            <view
              backgroundColor="#BBB"
              onVisibilityChanged={(v, t) => {
                cfg.events.push(['visB', v, t]);
                if (v === false) throw new Error('simulated callback error');
              }}
            />
          </view>
        );
      }
      `,
    );

    h.manager.create(
      '51',
      'VisibilityPage@inline_test/VisibilityPage',
      { trackVis, events, onLayoutCompleteCb },
      { back() {}, finish() {} },
    );
    const sessionTree = h.manager.rootComponents['51'].tree;
    const simTree = h.sim.getTree('51');
    const nodeA = [...simTree.nodes.values()].find(n => n.attrs.backgroundColor === '#AAA')!;
    const nodeB = [...simTree.nodes.values()].find(n => n.attrs.backgroundColor === '#BBB')!;
    assert.ok(nodeA && nodeB);

    assert.equal(nodeA.attrs.observeVisibility, true);
    assert.equal(nodeB.attrs.observeVisibility, true);
    assert.equal(nodeA.attrs.onVisibilityChanged, undefined);
    assert.equal(nodeA.attrs.onViewportChanged, undefined);
    assert.equal(nodeA.attrs.onLayout, undefined);
    assert.equal(nodeA.attrs.$onLayout, undefined);
    assert.equal(nodeA.attrs.onLayoutComplete, onLayoutCompleteCb, 'Element onLayoutComplete stays native attr');
    assert.ok(simTree.frameObserver, 'frameObserver must be registered');
    assert.ok(simTree.visibilityObserver, 'visibilityObserver must be registered');

    // Simulate frame update for A -> caches frame for subsequent viewport update and calls onLayout + $onLayout
    const plain = <T>(value: T): T => JSON.parse(JSON.stringify(value));
    simTree.frameObserver!(new Float64Array([nodeA.id, 10, 20, 300, 120]));
    assert.deepEqual(plain(events.slice(0, 2)), [
      ['layoutA', { x: 10, y: 20, width: 300, height: 120 }],
      ['$layoutA', { x: 10, y: 20, width: 300, height: 120 }],
    ]);

    events.length = 0;
    let ackCount = 0;
    assert.throws(
      () => {
        simTree.visibilityObserver!(
          [nodeA.id], // C++ param 1: visibleIds (appearing)
          [nodeB.id], // C++ param 2: invisibleIds (disappearing)
          [nodeA.id, 0, 10, 300, 100],
          () => {
            ackCount++;
          },
          9876,
        );
      },
      /simulated callback error/,
    );
    assert.equal(ackCount, 1, 'acknowledger() must run in finally even when callback throws');
    assert.deepEqual(plain(events), [['visB', false, 9876]]);

    events.length = 0;
    simTree.visibilityObserver!(
      [nodeA.id],
      [],
      [nodeA.id, 0, 10, 300, 100],
      () => {
        ackCount++;
      },
      9999,
    );
    assert.equal(ackCount, 2);
    assert.deepEqual(plain(events), [
      ['visA', true, 9999],
      ['vpA', { x: 0, y: 10, width: 300, height: 100 }, { x: 10, y: 20, width: 300, height: 120 }, 9999],
    ]);

    // Clearing both visibility callbacks on A must set observeVisibility = false
    setTrackVis(false);
    await h.flushMicrotasks();
    assert.equal(nodeA.attrs.observeVisibility, false);

    // Tree-level onNextLayoutComplete / onLayoutComplete emits opcode 16
    const renderer = h.loadModule('solid_native/src/renderer');
    const triggeredEvents = events as unknown[];
    triggeredEvents.length = 0;
    renderer.onNextLayoutComplete(sessionTree, treeLayoutCompleteCb);
    await h.flushMicrotasks();
    assert.equal(simTree.onLayoutCompleteCallbacks.length, 1);
    simTree.onLayoutCompleteCallbacks[0]();
    assert.ok(triggeredEvents.includes('tree-layout-complete'));

    h.manager.destroy('51');
  });

  test(`[${mode}] 12. Native animate() / useAnimate() / cancel() emit BEGIN_ANIMATIONS (14), mutations, END_ANIMATIONS (15), CANCEL_ANIMATION (17)`, async () => {
    const h = createValdiTestHarness(mode);
    const solid = h.loadModule('solid_runtime/src/solid');
    const [preWidth, setPreWidth] = solid.createSignal(50);
    const [animWidth, setAnimWidth] = solid.createSignal(100);
    let animateHandle: any;

    h.compileInlineTsx(
      'inline_test/AnimPage',
      `
      import { useAnimate } from 'solid_native/src/renderer';
      import { AnimationCurve } from 'valdi_core/src/AnimationOptions';
      export function AnimPage(props) {
        const animate = useAnimate();
        return (
          <view>
            <view width={props.viewModel().preWidth()} />
            <view
              width={props.viewModel().animWidth()}
              onTap={() => {
                props.viewModel().onStarted(
                  animate(
                    {
                      duration: 0.35,
                      curve: AnimationCurve.EaseOut,
                      beginFromCurrentState: true,
                      crossfade: false,
                      completion: props.viewModel().completion,
                    },
                    () => props.viewModel().setAnimWidth(240),
                  ),
                );
              }}
            />
          </view>
        );
      }
      `,
    );

    const completion = () => {};
    h.manager.create(
      '61',
      'AnimPage@inline_test/AnimPage',
      {
        preWidth,
        animWidth,
        setAnimWidth,
        completion,
        onStarted: (handle: any) => {
          animateHandle = handle;
        },
      },
      { back() {}, finish() {} },
    );
    const simTree = h.sim.getTree('61');
    const animatedNode = [...simTree.nodes.values()].find(n => n.attrs.width === 100)!;
    assert.ok(animatedNode);

    // Enqueue a pre-existing dirty write before tapping animate; animate() must flush it separately first.
    setPreWidth(75);
    const batchesBefore = simTree.batches.length;
    (animatedNode.attrs.onTap as () => void)();

    // Both batches flush synchronously inside animate() (no wait for microtask needed!)
    assert.equal(simTree.batches.length, batchesBefore + 2);
    const preBatch = simTree.batches[batchesBefore];
    assert.equal(preBatch.length, 1);
    assert.equal(preBatch[0].type, Opcode.SET_ATTRIBUTE_DOUBLE);

    const animBatch = simTree.batches[batchesBefore + 1];
    assert.equal(animBatch.length, 3);
    assert.equal(animBatch[0].type, Opcode.BEGIN_ANIMATIONS);
    if (animBatch[0].type === Opcode.BEGIN_ANIMATIONS) {
      assert.equal(animBatch[0].duration, 0.35);
      assert.equal(animBatch[0].curveInt, 3); // EaseOut
      assert.equal(animBatch[0].beginFromCurrentState, true);
      assert.equal(animBatch[0].crossfade, false);
      assert.equal(animBatch[0].completion, completion);
      assert.equal(animBatch[0].cancelToken, animateHandle.token);
    }
    assert.equal(animBatch[1].type, Opcode.SET_ATTRIBUTE_DOUBLE);
    if (animBatch[1].type === Opcode.SET_ATTRIBUTE_DOUBLE) {
      assert.equal(animBatch[1].id, animatedNode.id);
      assert.equal(animBatch[1].attr, 'width');
      assert.equal(animBatch[1].value, 240);
    }
    assert.equal(animBatch[2].type, Opcode.END_ANIMATIONS);

    animateHandle.cancel();
    assert.equal(simTree.batches.length, batchesBefore + 3);
    assert.deepEqual(simTree.batches[batchesBefore + 2], [
      { type: Opcode.CANCEL_ANIMATION, cancelToken: animateHandle.token },
    ]);

    h.manager.destroy('61');

    // Also exercise HomePage's compiled parity card ("Animate Box" -> "Collapse Box")
    h.manager.create('62', 'HomePage@app_pages/src/pages/HomePage', makePageViewModel('home', 'p62'), {
      back() {},
      finish() {},
    });
    const homeTree = h.sim.getTree('62');
    const batchesBeforeHomeTap = homeTree.batches.length;
    tapButtonWithText(homeTree, 'Animate Box');
    assert.ok(homeTree.batches.length > batchesBeforeHomeTap);
    const homeAnimBatch = homeTree.batches.find(
      b => b.some(op => op.type === Opcode.BEGIN_ANIMATIONS) && b.some(op => op.type === Opcode.END_ANIMATIONS),
    );
    assert.ok(homeAnimBatch, 'HomePage Animate Box tap must emit BEGIN_ANIMATIONS + END_ANIMATIONS');
    assert.ok(findNodeWithLabel(homeTree, v => v === 'Collapse Box'));
    h.manager.destroy('62');
  });

  test(`[${mode}] 13. Imperative NativeElement helpers getFrame, getNativeView, getNativeNode, takeSnapshot`, async () => {
    const h = createValdiTestHarness(mode);
    let capturedRef: any;

    h.compileInlineTsx(
      'inline_test/RefHelpersPage',
      `
      export function RefHelpersPage(props) {
        return <view ref={el => props.viewModel().setRef(el)} backgroundColor="#ABCDEF" />;
      }
      `,
    );

    h.manager.create(
      '71',
      'RefHelpersPage@inline_test/RefHelpersPage',
      {
        setRef: (el: any) => {
          capturedRef = el;
        },
      },
      { back() {}, finish() {} },
    );
    assert.ok(capturedRef, 'ref callback must receive NativeElement');

    const expectedFrame = { x: 4, y: 8, width: 120, height: 48 };
    const expectedView = { __nativeElementType: 'nativeView', tag: 'mock' };
    const expectedNode = { id: capturedRef.id };
    h.sim.elementFrames.set(`71:${capturedRef.id}`, expectedFrame);
    h.sim.nativeViews.set(`71:${capturedRef.id}`, expectedView);
    h.sim.nativeNodes.set(`71:${capturedRef.id}`, expectedNode);
    h.sim.snapshots.set(`71:${capturedRef.id}`, 'base64-png-stub');

    assert.deepEqual(await capturedRef.getFrame(), expectedFrame);
    assert.equal(await capturedRef.getNativeView(), expectedView);
    assert.equal(capturedRef.getNativeNode(), expectedNode);
    assert.equal(await capturedRef.takeSnapshot(), 'base64-png-stub');

    h.manager.destroy('71');
    assert.equal(await capturedRef.getFrame(), undefined);
    assert.equal(await capturedRef.getNativeView(), undefined);
    assert.equal(capturedRef.getNativeNode(), undefined);
    assert.equal(await capturedRef.takeSnapshot(), undefined);
  });
}

test('[types] 14. Full 17-element JSX definitions typecheck and disallow direct children on <label>', () => {
  const tsconfigPath = path.join(repoRoot, 'valdi/modules/app_pages/tsconfig.json');
  const configResult = ts.readConfigFile(tsconfigPath, ts.sys.readFile);
  assert.equal(configResult.error, undefined);
  const parsed = ts.parseJsonConfigFileContent(configResult.config, ts.sys, path.dirname(tsconfigPath));

  const virtualValid = path.join(repoRoot, 'valdi/modules/app_pages/src/__virtual_jsx_check.tsx');
  const validSource = `
    import { For } from 'solid-js';
    import { Style } from 'valdi_core/src/Style';
    import type { View } from 'valdi_tsx/src/NativeTemplateElements';
    const boxStyle = new Style<View>({ padding: 8, backgroundColor: '#fff' });
    export function AllElements() {
      return (
        <layout flexDirection="column" onLayoutComplete={() => {}}>
          <view style={boxStyle} onVisibilityChanged={() => {}} onViewportChanged={() => {}}>
            <scroll horizontal={true} contentOffsetX={10} showsHorizontalScrollIndicator={false}>
              <label value="Title" numberOfLines={1} />
            </scroll>
            <image src="https://example.com/a.png" objectFit="cover" />
            <video />
            <webview />
            <textfield placeholder="Input" onChange={() => {}} />
            <textview placeholder="Multiline" />
            <textanimationgroup>
              <label value="Animated" />
            </textanimationgroup>
            <spinner />
            <shape />
            <blur blurStyle="dark">
              <label value="Blurred" />
            </blur>
            <glass>
              <label value="Glass" />
            </glass>
            <animatedimage />
            <button onTap={() => {}} />
            <custom-view iosClass="SCMyView" androidClass="com.example.MyView" padding={4} />
            <For each={['a', 'b']}>{item => <label value={item} />}</For>
          </view>
        </layout>
      );
    }
  `;

  const virtualBad = path.join(repoRoot, 'valdi/modules/app_pages/src/__virtual_jsx_bad.tsx');
  const badSource = `
    export function BadLabel() {
      return <label>Direct text not allowed</label>;
    }
  `;

  const host = ts.createCompilerHost(parsed.options, true);
  const origGetSourceFile = host.getSourceFile.bind(host);
  const origFileExists = host.fileExists.bind(host);
  const virtuals = new Map<string, string>([
    [virtualValid, validSource],
    [virtualBad, badSource],
  ]);
  host.fileExists = f => virtuals.has(f) || origFileExists(f);
  host.getSourceFile = (f, langVersion, onError, shouldCreate) => {
    const src = virtuals.get(f);
    if (src !== undefined) {
      return ts.createSourceFile(f, src, langVersion);
    }
    return origGetSourceFile(f, langVersion, onError, shouldCreate);
  };

  const jsxDeclPath = path.join(repoRoot, 'valdi/modules/solid_native/src/jsx.d.ts');
  const validProgram = ts.createProgram([jsxDeclPath, virtualValid], parsed.options, host);
  const validDiags = ts.getPreEmitDiagnostics(validProgram, validProgram.getSourceFile(virtualValid));
  assert.deepEqual(
    validDiags.map(d => ts.flattenDiagnosticMessageText(d.messageText, '\n')),
    [],
    'All 17 Valdi intrinsic elements and <For> must typecheck cleanly',
  );

  const badProgram = ts.createProgram([jsxDeclPath, virtualBad], parsed.options, host);
  const badDiags = ts.getPreEmitDiagnostics(badProgram, badProgram.getSourceFile(virtualBad));
  assert.ok(badDiags.length > 0, '<label> with direct child text must fail typecheck');
});

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
