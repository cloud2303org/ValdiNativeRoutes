import assert from 'node:assert/strict';
import { existsSync, readFileSync } from 'node:fs';
import path from 'node:path';
import test from 'node:test';
import vm from 'node:vm';
import { transformSync } from '@babel/core';
import solidBabelPlugin from '@solidjs/babel-plugin';
import ts from 'typescript';
import { appModule, buildModule } from '../pipeline';
import { valdiTs } from '../valdiTs';

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
  layoutCompletions: (() => void)[];
  animationCompletions: ((wasCancelled: boolean) => void)[];
}

function createCppSimulator(initialPlatform: 1 | 2) {
  const strings: string[] = [];
  const attributes: string[] = [];
  const cssRules: Record<string, unknown>[] = [];
  const trees = new Map<string, SimTree>();

  const getTree = (treeId: string): SimTree => {
    let tree = trees.get(treeId);
    if (!tree) {
      tree = { treeId, nodes: new Map(), batches: [], layoutCompletions: [], animationCompletions: [] };
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

  const destroySubtree = (tree: SimTree, id: number) => {
    const node = tree.nodes.get(id);
    if (!node) return;
    tree.nodes.delete(id);
    while (node.children.length > 0) {
      const childId = node.children.pop()!;
      const child = tree.nodes.get(childId);
      if (child) child.parentId = undefined;
      destroySubtree(tree, childId);
    }
    unlinkFromParent(tree, node);
    if (tree.rootId === id) tree.rootId = undefined;
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
    const ops: DecodedOp[] = [];
    let cur = 0;

    while (cur < wordLen) {
      const header = dv.getUint32(cur * 4, true);
      cur++;
      const opcode = header & 0xff;
      const nodeId = opcode < 14 || opcode === 19 || opcode === 20 ? header >>> 8 : 0;

      if (opcode === Opcode.CREATE_ELEMENT) {
        const strId = dv.getUint32(cur * 4, true);
        cur++;
        const viewClass = strings[strId];
        assert.ok(!tree.nodes.has(nodeId), `Duplicate element id ${nodeId}`);
        tree.nodes.set(nodeId, { id: nodeId, viewClass, children: [], attrs: {} });
        ops.push({ type: Opcode.CREATE_ELEMENT, id: nodeId, viewClass });
      } else if (opcode === Opcode.DESTROY_ELEMENT) {
        destroySubtree(tree, nodeId);
        ops.push({ type: Opcode.DESTROY_ELEMENT, id: nodeId });
      } else if (opcode === Opcode.SET_ROOT_ELEMENT) {
        const node = tree.nodes.get(nodeId);
        assert.ok(node);
        unlinkFromParent(tree, node);
        tree.rootId = nodeId;
        ops.push({ type: Opcode.SET_ROOT_ELEMENT, id: nodeId });
      } else if (opcode === Opcode.MOVE_ELEMENT_TO_PARENT) {
        const parentId = dv.getUint32(cur * 4, true) & 0xffffff;
        const index = dv.getUint32((cur + 1) * 4, true);
        cur += 2;
        const parent = tree.nodes.get(parentId)!;
        const child = tree.nodes.get(nodeId)!;
        unlinkFromParent(tree, child);
        parent.children.splice(index, 0, child.id);
        child.parentId = parent.id;
        ops.push({ type: Opcode.MOVE_ELEMENT_TO_PARENT, id: nodeId, parentId, index });
      } else if (opcode >= 5 && opcode <= 13) {
        const attrHeader = dv.getUint32(cur * 4, true);
        cur++;
        const attrId = attrHeader & 0xffffff;
        const injected = (attrHeader >>> 24) !== 0;
        const attr = attributes[attrId];
        const node = tree.nodes.get(nodeId)!;

        let value: unknown;
        if (opcode === Opcode.SET_ATTRIBUTE_UNDEFINED) value = undefined;
        else if (opcode === Opcode.SET_ATTRIBUTE_NULL) value = null;
        else if (opcode === Opcode.SET_ATTRIBUTE_FALSE) value = false;
        else if (opcode === Opcode.SET_ATTRIBUTE_TRUE) value = true;
        else if (opcode === Opcode.SET_ATTRIBUTE_INT) {
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
            arr.push(request.values[dv.getUint32(cur * 4, true)]);
            cur++;
          }
          value = arr;
        } else if (opcode === Opcode.SET_ATTRIBUTE_STYLE) {
          const styleId = dv.getUint32(cur * 4, true);
          cur++;
          value = { __styleId: styleId, attrs: cssRules[styleId] };
        } else {
          const valIdx = dv.getUint32(cur * 4, true);
          cur++;
          value = request.values[valIdx];
        }

        if (value === undefined) delete node.attrs[attr];
        else node.attrs[attr] = value;
        ops.push({ type: opcode as any, id: nodeId, attr, injected, value });
      } else if (opcode === Opcode.BEGIN_ANIMATIONS) {
        const completionIdx = dv.getUint32((cur + 10) * 4, true);
        const completion = request.values[completionIdx];
        if (typeof completion === 'function') {
          tree.animationCompletions.push(completion as (wasCancelled: boolean) => void);
        }
        cur += 12;
      } else if (opcode === Opcode.END_ANIMATIONS) {
        // no-op
      } else if (opcode === Opcode.ON_LAYOUT_COMPLETE) {
        const callbackIdx = dv.getUint32(cur * 4, true);
        const cb = request.values[callbackIdx];
        if (typeof cb === 'function') {
          tree.layoutCompletions.push(cb as () => void);
        }
        cur += 1;
      } else if (opcode === Opcode.CANCEL_ANIMATION || opcode === Opcode.ON_NEXT_DRAW) {
        cur += 1;
      } else if (opcode === Opcode.DETACH_ELEMENT) {
        const node = tree.nodes.get(nodeId)!;
        unlinkFromParent(tree, node);
        if (tree.rootId === nodeId) tree.rootId = undefined;
        ops.push({ type: Opcode.DETACH_ELEMENT, id: nodeId });
      } else if (opcode === Opcode.INSERT_ELEMENT_BEFORE) {
        const parentId = dv.getUint32(cur * 4, true) & 0xffffff;
        const beforeId = dv.getUint32((cur + 1) * 4, true) & 0xffffff;
        cur += 2;
        const parent = tree.nodes.get(parentId)!;
        const child = tree.nodes.get(nodeId)!;
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
        throw new Error(`Unsupported opcode ${opcode}`);
      }
    }

    tree.batches.push(ops);
  };

  return {
    trees,
    getTree,
    runtimeApi: {
      getCurrentPlatform: () => initialPlatform,
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
      pushCurrentContext: (_id?: string) => {},
      popCurrentContext: () => {},
      submitRawRenderRequest: (request: any, cb?: () => void) => {
        applyRequest(request);
        cb?.();
      },
    },
  };
}

let builtModulesPromise: Promise<Map<string, Buffer>> | undefined;

function buildAllTargetModules(): Promise<Map<string, Buffer>> {
  if (builtModulesPromise) return builtModulesPromise;
  builtModulesPromise = (async () => {
    const entries = new Map<string, Buffer>();
    for (const name of ['solid_runtime', 'solid_native', 'app_ui', 'native_common', 'app_foundation']) {
      const mod = appModule(name);
      const plugin = valdiTs(mod);
      try {
        const diag = plugin.diagnostics();
        assert.equal(diag, '', `Expected zero TypeScript diagnostics for ${name}:\n${diag}`);
        const built = await buildModule(mod, plugin, false);
        for (const [file, bytes] of built.entries) {
          entries.set(`${name}/${file}`, bytes);
        }
      } finally {
        plugin.dispose();
      }
    }
    return entries;
  })();
  return builtModulesPromise;
}

function createSolidHost(platform: 1 | 2, entries: Map<string, Buffer>) {
  const sim = createCppSimulator(platform);
  const moduleCache = new Map<string, any>();
  const memoryModules = new Map<string, string>();
  const darkListeners = new Set<(dark: boolean) => void>();

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
    'valdi_core/src/BuildType': {
      isDevBuild: () => true,
      isDebugEnabled: () => false,
    },
    'valdi_core/src/Device': {
      Device: {
        getSystemType: () => (platform === 1 ? 'android' : 'ios'),
        isAndroid: () => platform === 1,
        isIOS: () => platform === 2,
        isRTL: () => false,
        isDarkMode: () => false,
        observeDarkMode: (cb: (dark: boolean) => void) => {
          darkListeners.add(cb);
          return {
            cancel() {
              darkListeners.delete(cb);
            },
          };
        },
      },
    },
    'valdi_core/src/SystemFont': {
      systemFont: (size: number) => `system ${size}`,
      systemSemiboldFont: (size: number) => `system-semibold ${size}`,
      systemBoldFont: (size: number) => `system-bold ${size}`,
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
    'valdi_core/src/AnimationOptions': {
      AnimationCurve: { Linear: 'linear', EaseIn: 'easeIn', EaseOut: 'easeOut', EaseInOut: 'easeInOut' },
    },
    'app_ui/src/AppUI': {
      getHost: () => ({}),
    },
    'theme_bridge/src/ThemeBridge': {
      getHost: () => ({
        getTokens: () => ({
          light: {
            canvas: '#f5f7fb',
            surface: '#ffffff',
            text: '#172033',
            muted: '#667085',
            hairline: '#ececec',
            border: '#E8ECF1',
            handle: '#D6DCE5',
            scrim: 'rgba(16,24,40,0.32)',
            buttonPrimary: '#1e62d0',
            buttonOnPrimary: '#ffffff',
            buttonSecondary: '#eef2f7',
            buttonOnSecondary: '#1d2939',
          },
          dark: {
            canvas: '#121316',
            surface: '#1E1F23',
            text: '#ffffff',
            muted: '#969696',
            hairline: '#2A2B32',
            border: '#2A2B32',
            handle: '#969696',
            scrim: 'rgba(0,0,0,0.75)',
            buttonPrimary: '#377dff',
            buttonOnPrimary: '#ffffff',
            buttonSecondary: '#2c2e35',
            buttonOnSecondary: '#f2f4f7',
          },
          shared: { radius: { sheet: 22 } },
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
    Date,
    RegExp,
    JSON,
    runtime: sim.runtimeApi,
    setTimeout,
    clearTimeout,
  };
  sandboxGlobals.globalThis = sandboxGlobals;
  const vmContext = vm.createContext(sandboxGlobals);

  function resolveModuleKey(request: string, fromId?: string): string {
    const clean = request.replace(/\.js$/, '');
    if (builtins[clean] || memoryModules.has(clean)) return clean;
    if (clean.startsWith('.') && fromId) {
      return path.posix.normalize(path.posix.join(path.posix.dirname(fromId), clean));
    }
    return clean;
  }

  function loadModule(id: string): any {
    const normalized = resolveModuleKey(id);
    if (builtins[normalized]) return builtins[normalized];
    if (moduleCache.has(normalized)) return moduleCache.get(normalized);

    const code = memoryModules.get(normalized) ?? entries.get(`${normalized}.js`)?.toString();
    assert.ok(code, `Missing compiled module ${normalized}`);

    const mod = { exports: {} as any };
    moduleCache.set(normalized, mod.exports);
    const localRequire = (specifier: string) => loadModule(resolveModuleKey(specifier, normalized));
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
    assert.ok(solidJs);

    const cjsCode = ts.transpileModule(solidJs, {
      fileName: `${moduleId}.js`,
      compilerOptions: {
        target: ts.ScriptTarget.ES2020,
        module: ts.ModuleKind.CommonJS,
        esModuleInterop: true,
      },
    }).outputText.replace(/require\((["'])solid-js\1\)/g, 'require("solid_runtime/src/solid")');

    memoryModules.set(moduleId, cjsCode);
    moduleCache.delete(moduleId);
    return loadModule(moduleId);
  }

  const bridge = loadModule('solid_native/src/bridge');
  const manager = bridge.createRootComponentsManager();

  const flushMicrotasks = async () => {
    for (let i = 0; i < 6; i++) {
      await Promise.resolve();
    }
  };

  return { sim, manager, loadModule, compileInlineTsx, flushMicrotasks };
}

function findNodes(tree: SimTree, predicate: (node: SimNode) => boolean): SimNode[] {
  return [...tree.nodes.values()].filter(predicate);
}

function findByA11y(tree: SimTree, accessibilityId: string): SimNode {
  const node = [...tree.nodes.values()].find(n => n.attrs.accessibilityId === accessibilityId);
  assert.ok(node, `Missing element with accessibilityId=${accessibilityId}`);
  return node;
}

test('app_ui bottom_sheet & wheels align with Solid 2.0 Universal on Android and iOS', async () => {
  const allEntries = await buildAllTargetModules();

  for (const platform of [1, 2] as const) {
    const h = createSolidHost(platform, allEntries);
    const api = h.loadModule('app_ui/src/index');
    const wheels = h.loadModule('app_ui/src/wheels/WheelPickers');
    const utils = h.loadModule('app_ui/src/bottom_sheet/bottomSheetUtils');
    const placement = h.loadModule('app_ui/src/bottom_sheet/cardPlacement');

    // 1. Public exports exist on app_ui root & wheels
    assert.equal(typeof api.BottomSheet, 'function');
    assert.equal(typeof api.ModalBottomSheet, 'function');
    assert.equal(typeof api.BottomSheetProvider, 'function');
    assert.equal(typeof api.appUIApi, 'function');
    assert.equal(typeof wheels.ColumnPicker, 'function');
    assert.equal(typeof wheels.TimePicker, 'function');
    assert.equal(typeof wheels.TreePicker, 'function');

    // 2. Detent normalization & v1.1.0 cardPlacement / validation rules
    assert.equal(placement.resolveMaxWidth(undefined), 0);
    assert.equal(placement.resolveMaxWidth(Infinity), 0);
    assert.equal(placement.resolveMaxWidth(480), 480);
    assert.throws(() => placement.resolveMaxWidth(0), /maxWidth/);
    assert.throws(() => placement.resolveMaxWidth(-100), /maxWidth/);
    assert.throws(() => placement.resolveMaxWidth(Number.NaN), /maxWidth/);

    assert.equal(placement.resolvePlacement(undefined, false), 0.5);
    assert.equal(placement.resolvePlacement('start', false), 0);
    assert.equal(placement.resolvePlacement('end', false), 1);
    assert.equal(placement.resolvePlacement('start', true), 1);
    assert.equal(placement.resolvePlacement('end', true), 0);
    assert.throws(() => placement.resolvePlacement('middle', false), /placement/);

    assert.deepEqual(
      JSON.parse(JSON.stringify(placement.placeCard(1024, 16, 16, 500, 0.5, 2))),
      { left: 278, width: 468 },
    );
    assert.deepEqual(
      JSON.parse(JSON.stringify(placement.placeCard(390, 16, 16, 500, 1, 3))),
      { left: 16, width: 358 },
    );
    assert.equal(
      placement.crowdedInsetsWarning([{ insetLeft: 16, insetRight: 16 }], 1024, 500),
      null,
    );
    assert.match(
      placement.crowdedInsetsWarning([{ insetLeft: 160, insetRight: 160 }], 300, 500) ?? '',
      /leaves no room for the sheet/,
    );

    const normalized = utils.normalizeDetents(
      [
        { value: 'content', insets: { start: 12, end: 16, bottom: 8 }, scrimOpacity: 0.4 },
        { value: '60%', programmatic: true },
        '100%',
      ],
      false,
      undefined,
      { maxWidth: 480, placementBias: 1 },
    );
    assert.equal(normalized.length, 3);
    assert.equal(normalized[0].kind, 'content');
    assert.equal(normalized[0].insetLeft, 12);
    assert.equal(normalized[0].insetRight, 16);
    assert.equal(normalized[0].insetBottom, 8);
    assert.equal(normalized[0].maxWidth, 480);
    assert.equal(normalized[0].placementBias, 1);
    assert.equal(normalized[0].scrimOpacity, 0.4);
    assert.equal(normalized[1].kind, 'percentage');
    assert.equal(normalized[1].value, 0.6);
    assert.equal(normalized[1].programmatic, true);
    assert.equal(normalized[1].widestCard, true);
    assert.equal(normalized[2].widestCard, false);
    assert.equal(normalized[2].usesStatusBarTopInset, true);

    assert.throws(() => utils.normalizeDetents([], false), /at least one detent/);
    assert.throws(() => utils.normalizeDetents([400, 200], false), /ascending/);
    assert.throws(() => utils.normalizeDetents(['content', 'content'], false), /at most one 'content'/);

    assert.doesNotThrow(() => utils.validateSettleDuration(undefined));
    assert.doesNotThrow(() => utils.validateSettleDuration(300));
    assert.throws(() => utils.validateSettleDuration(-10), /settleDuration/);

    const surfaceResolved = utils.resolveSurfaceStyle({
      borderTopLeftRadius: 24,
      borderTopRightRadius: 24,
      borderCurve: 'continuous',
      boxShadow: '0px -4px 16px 2px rgba(0, 0, 0, 0.25)',
      elevation: 8,
      backgroundColor: '#f8fafc',
    });
    assert.deepEqual([...surfaceResolved.cornerRadii], [24, 24, 0, 0]);
    assert.equal(surfaceResolved.cornerCurve, 'continuous');
    assert.equal(surfaceResolved.elevation, 8);
    assert.equal(surfaceResolved.shadows.length, 1);
    assert.equal(surfaceResolved.shadows[0].offsetY, -4);
    assert.equal(surfaceResolved.shadows[0].blurRadius, 16);
    assert.equal(surfaceResolved.shadows[0].spreadDistance, 2);

    // 3. Solid BottomSheetProvider + ModalBottomSheet (lazy mount + events + reorder without destroy)
    const expectedPortalClass =
      platform === 1 ? 'io.valdiroutes.app.BottomSheetPortalHostView' : 'VRBottomSheetPortalHostView';
    const expectedSheetClass =
      platform === 1 ? 'io.valdiroutes.app.BottomSheetView' : 'VRBottomSheetView';

    const positionEvents: any[] = [];
    const indexEvents: number[] = [];
    const settleEvents: number[] = [];
    let closeRequests = 0;

    h.compileInlineTsx(
      'inline_test/BottomSheetHarness',
      `
      import { BottomSheetProvider, ModalBottomSheet } from 'app_ui/src/index';

      export function BottomSheetHarness(props) {
        const vm = props.viewModel;
        return (
          <BottomSheetProvider>
            <view />
            <ModalBottomSheet
              detents={[0, { value: 280, insets: { start: 16, end: 16 } }, '85%']}
              index={vm().sheetAIndex}
              maxWidth={480}
              placement="end"
              lazy={true}
              settleDuration={400}
              scrimColor="rgba(0, 0, 0, 0.5)"
              onIndexChange={i => vm().hooks.onIndexChange(i)}
              onSettle={i => vm().hooks.onSettle(i)}
              onPositionChange={e => vm().hooks.onPositionChange(e)}
              onCloseRequest={() => vm().hooks.onCloseRequest()}
            >
              <label value="Sheet Body" />
            </ModalBottomSheet>
            <ModalBottomSheet
              detents={[0, 320]}
              index={vm().sheetBIndex}
              accessibilityId="sheet-b"
            >
              <label value="Sheet B Body" />
            </ModalBottomSheet>
          </BottomSheetProvider>
        );
      }

      export function WindowOverlaySheet() {
        return (
          <ModalBottomSheet detents={['50%']} index={0} windowOverlay={true}>
            <label value="Window" />
          </ModalBottomSheet>
        );
      }
      `,
    );

    // Isolate the expected reactive throw in its own VM host so Solid 2.0's
    // [REACTIVITY_HALTED] state does not poison subsequent assertions on `h`.
    const hMissing = createSolidHost(platform, allEntries);
    hMissing.compileInlineTsx(
      'inline_test/MissingProviderSheet',
      `
      import { ModalBottomSheet } from 'app_ui/src/index';

      export function MissingProviderSheet() {
        return (
          <ModalBottomSheet detents={['50%']} index={0}>
            <label value="Orphan" />
          </ModalBottomSheet>
        );
      }
      `,
    );

    // ModalBottomSheet outside BottomSheetProvider throws unless windowOverlay={true}
    assert.throws(() => {
      hMissing.manager.create('missing-provider', 'MissingProviderSheet@inline_test/MissingProviderSheet', {}, {});
    }, /BottomSheetProvider/);

    assert.doesNotThrow(() => {
      h.manager.create('window-overlay', 'WindowOverlaySheet@inline_test/BottomSheetHarness', {}, {});
    });
    h.manager.destroy('window-overlay');

    const baseSheetVm = {
      sheetAIndex: 0,
      sheetBIndex: 0,
      hooks: {
        onIndexChange: (i: number) => indexEvents.push(i),
        onSettle: (i: number) => settleEvents.push(i),
        onPositionChange: (e: any) => positionEvents.push(e),
        onCloseRequest: () => {
          closeRequests += 1;
        },
      },
    };
    h.manager.create('bs-1', 'BottomSheetHarness@inline_test/BottomSheetHarness', baseSheetVm, {});

    const sheetTree = h.sim.getTree('bs-1');
    const portalHosts = findNodes(sheetTree, n => n.viewClass === expectedPortalClass);
    const sheetViews = findNodes(sheetTree, n => n.viewClass === expectedSheetClass);
    assert.equal(portalHosts.length, 1);
    assert.equal(sheetViews.length, 2);

    const portalHost = portalHosts[0];
    const sheetA = sheetViews[0];
    const sheetB = sheetViews[1];

    // lazy=true defers 'Sheet Body' while closed at index=0
    assert.equal(findNodes(sheetTree, n => n.attrs.value === 'Sheet Body').length, 0);

    // Pre-geometry wire config carries maxWidth, placementBias=1, no committedContentRegionInset, and maxWidth=480 on Surface & ContentWrapper
    const cfgA = sheetA.attrs.config as any;
    assert.equal(cfgA.detents[1].maxWidth, 480);
    assert.equal(cfgA.detents[1].placementBias, 1);
    assert.equal(cfgA.committedContentRegionInset, undefined);
    const sheetAChildren = sheetA.children.map(id => sheetTree.nodes.get(id)!);
    assert.equal(
      sheetAChildren.filter(n => n.attrs.maxWidth === 480).length,
      2,
      'SurfaceView and ContentWrapperView cap pre-geometry maxWidth',
    );

    // Open Sheet A to index=1 -> openOrder becomes 1 -> mounts 'Sheet Body' and moves Sheet A after Sheet B
    const batchCountBeforeOpenA = sheetTree.batches.length;
    h.manager.render('bs-1', { ...baseSheetVm, sheetAIndex: 1, sheetBIndex: 0 });
    await h.flushMicrotasks();
    assert.equal(findNodes(sheetTree, n => n.attrs.value === 'Sheet Body').length, 1);
    assert.deepEqual(portalHost.children, [sheetB.id, sheetA.id]);

    // Trigger native callbacks
    (sheetA.attrs.onNativeGeometry as any)(480, 680, 800, 544, 1024);
    await h.flushMicrotasks();
    assert.equal((sheetA.attrs.config as any).committedContentRegionInset, 544);

    (sheetA.attrs.onNativePositionChange as any)(140, -0.5);
    assert.deepEqual(JSON.parse(JSON.stringify(positionEvents)), [{ nativeEvent: { position: 140, index: -0.5 } }]);

    (sheetA.attrs.onNativeIndexChange as any)(1);
    assert.deepEqual(indexEvents, [1]);

    (sheetA.attrs.onNativeSettle as any)(1);
    assert.deepEqual(settleEvents, [1]);

    (sheetA.attrs.onNativeCloseRequest as any)();
    assert.equal(closeRequests, 1);

    // Now open Sheet B (openOrder becomes 2 > Sheet A's 1) -> reorders in portal WITHOUT destroying/recreating SheetView!
    const batchesBeforeReorder = sheetTree.batches.length;
    h.manager.render('bs-1', { ...baseSheetVm, sheetAIndex: 1, sheetBIndex: 1 });
    await h.flushMicrotasks();
    assert.deepEqual(portalHost.children, [sheetA.id, sheetB.id]);
    const reorderOps = sheetTree.batches.slice(batchesBeforeReorder).flat();
    assert.equal(
      reorderOps.some(
        op => (op.type === Opcode.CREATE_ELEMENT || op.type === Opcode.DESTROY_ELEMENT) && (op.id === sheetA.id || op.id === sheetB.id),
      ),
      false,
      'Reordering sheets in portal must not destroy or recreate native BottomSheetView nodes',
    );
    assert.ok(
      reorderOps.some(op => op.type === Opcode.INSERT_ELEMENT_BEFORE && op.parentId === portalHost.id),
      'Reordering sheets must move existing node via INSERT_ELEMENT_BEFORE',
    );

    // Close Sheet A back to 0 -> 'Sheet Body' stays mounted until onNativeSettle(0)
    h.manager.render('bs-1', { ...baseSheetVm, sheetAIndex: 0, sheetBIndex: 1 });
    await h.flushMicrotasks();
    assert.equal(
      findNodes(sheetTree, n => n.attrs.value === 'Sheet Body').length,
      1,
      'lazy children remain mounted during close animation until settle',
    );

    (sheetA.attrs.onNativeSettle as any)(0);
    await h.flushMicrotasks();
    assert.equal(
      findNodes(sheetTree, n => n.attrs.value === 'Sheet Body').length,
      0,
      'lazy children unmount after settling at closed detent',
    );
    assert.ok(batchCountBeforeOpenA > 0);
    h.manager.destroy('bs-1');
  }
});

test('AppSheetOverlay runs through Solid createRootComponentsManager for ActionSheet, Picker, and DatePicker on Android and iOS', async () => {
  const allEntries = await buildAllTargetModules();
  const componentPath = 'AppSheetOverlay@app_ui/src/sheet_presenter/AppSheetOverlay';

  for (const platform of [1, 2] as const) {
    const h = createSolidHost(platform, allEntries);

    // 1. ActionSheet inline (<=6 items) -> select item 1 -> onSelect(1) & detentIndex=-1 -> settle(-1) -> onDismissed()
    {
      const selected: number[] = [];
      let dismissed = 0;
      const ctx = {
        onSelect: (idx: number) => selected.push(idx),
        onConfirm: () => assert.fail('unexpected onConfirm'),
        onCancel: () => assert.fail('unexpected onCancel'),
        onDismissed: () => {
          dismissed += 1;
        },
      };
      h.manager.create(
        'overlay-as-1',
        componentPath,
        {
          open: true,
          kind: 'actionSheet',
          title: '选择操作',
          confirmText: '',
          cancelText: '取消',
          items: ['拍照', '从相册选择'],
          options: [],
          value: '',
          dateMode: 'date',
          minYear: 2020,
          maxYear: 2030,
          bottomInset: 24,
        },
        ctx,
      );
      const tree = h.sim.getTree('overlay-as-1');
      assert.equal(findNodes(tree, n => n.viewClass === 'scroll').length, 0);

      const secondItem = findByA11y(tree, 'action-sheet-item-1');
      (secondItem.attrs.onTap as () => void)();
      await h.flushMicrotasks();
      assert.deepEqual(selected, [1]);

      const sheetClass = platform === 1 ? 'io.valdiroutes.app.BottomSheetView' : 'VRBottomSheetView';
      const sheet = findNodes(tree, n => n.viewClass === sheetClass)[0];
      assert.equal((sheet.attrs.config as any).detentIndex, -1);

      (sheet.attrs.onNativeSettle as any)(-1);
      await h.flushMicrotasks();
      assert.equal(dismissed, 1);
      h.manager.destroy('overlay-as-1');
    }

    // 2. ActionSheet > 6 items mounts <scroll>
    {
      h.manager.create(
        'overlay-as-2',
        componentPath,
        {
          open: true,
          kind: 'actionSheet',
          title: '',
          confirmText: '',
          cancelText: '取消',
          items: ['1', '2', '3', '4', '5', '6', '7'],
          options: [],
          value: '',
          dateMode: 'date',
          minYear: 2020,
          maxYear: 2030,
          bottomInset: 0,
        },
        { onSelect() {}, onConfirm() {}, onCancel() {}, onDismissed() {} },
      );
      const tree = h.sim.getTree('overlay-as-2');
      assert.ok(findNodes(tree, n => n.viewClass === 'scroll').length >= 1);
      h.manager.destroy('overlay-as-2');
    }

    // 3. ColumnPicker sheet: wheel change -> confirm -> onConfirm(value, index) -> settle(-1) -> onDismissed()
    {
      const confirmed: Array<{ value: string; index: number }> = [];
      let dismissed = 0;
      h.manager.create(
        'overlay-picker',
        componentPath,
        {
          open: true,
          kind: 'picker',
          title: '选择城市',
          confirmText: '确定',
          cancelText: '取消',
          items: [],
          options: [
            { value: 'sh', label: '上海' },
            { value: 'hz', label: '杭州' },
            { value: 'sz', label: '深圳' },
          ],
          value: 'sh',
          dateMode: 'date',
          minYear: 2020,
          maxYear: 2030,
          bottomInset: 16,
        },
        {
          onSelect: () => assert.fail('unexpected onSelect'),
          onConfirm: (value: string, index: number) => confirmed.push({ value, index }),
          onCancel: () => assert.fail('unexpected onCancel'),
          onDismissed: () => {
            dismissed += 1;
          },
        },
      );
      const tree = h.sim.getTree('overlay-picker');
      const wheelClass = platform === 1 ? 'io.valdiroutes.app.ColumnWheelView' : 'VRColumnWheelView';
      const wheel = findNodes(tree, n => n.viewClass === wheelClass)[0];
      assert.ok(wheel, `Expected ${wheelClass}`);
      (wheel.attrs.onChange as (v: string) => void)('sz');
      await h.flushMicrotasks();

      const confirmBtn = findByA11y(tree, 'sheet-confirm-button');
      (confirmBtn.attrs.onTap as () => void)();
      await h.flushMicrotasks();
      assert.deepEqual(confirmed, [{ value: 'sz', index: 2 }]);

      const sheetClass = platform === 1 ? 'io.valdiroutes.app.BottomSheetView' : 'VRBottomSheetView';
      const sheet = findNodes(tree, n => n.viewClass === sheetClass)[0];
      (sheet.attrs.onNativeSettle as any)(-1);
      await h.flushMicrotasks();
      assert.equal(dismissed, 1);
      h.manager.destroy('overlay-picker');
    }

    // 4. DatePicker sheet + external host cancellation + initial open: false
    {
      let dismissed = 0;
      const baseVm = {
        open: true,
        kind: 'datePicker',
        title: '选择日期',
        confirmText: '确定',
        cancelText: '取消',
        items: [],
        options: [],
        value: '2026-05-20',
        dateMode: 'date',
        minYear: 2020,
        maxYear: 2030,
        bottomInset: 0,
      };
      h.manager.create('overlay-dp', componentPath, baseVm, {
        onSelect() {},
        onConfirm() {},
        onCancel() {},
        onDismissed: () => {
          dismissed += 1;
        },
      });
      const tree = h.sim.getTree('overlay-dp');
      const timeWheelClass = platform === 1 ? 'io.valdiroutes.app.TimeWheelView' : 'VRTimeWheelView';
      assert.equal(findNodes(tree, n => n.viewClass === timeWheelClass).length, 1);

      h.manager.render('overlay-dp', { ...baseVm, open: false });
      await h.flushMicrotasks();
      const sheetClass = platform === 1 ? 'io.valdiroutes.app.BottomSheetView' : 'VRBottomSheetView';
      const sheet = findNodes(tree, n => n.viewClass === sheetClass)[0];
      assert.equal((sheet.attrs.config as any).detentIndex, -1);

      (sheet.attrs.onNativeSettle as any)(-1);
      await h.flushMicrotasks();
      assert.equal(dismissed, 1);
      h.manager.destroy('overlay-dp');

      let preDismissed = 0;
      h.manager.create(
        'overlay-closed',
        componentPath,
        { ...baseVm, open: false },
        {
          onSelect() {},
          onConfirm() {},
          onCancel() {},
          onDismissed: () => {
            preDismissed += 1;
          },
        },
      );
      assert.equal(preDismissed, 1);
      h.manager.destroy('overlay-closed');
    }
  }
});

test('AppModalOverlay runs through Solid createRootComponentsManager for confirm, editable return, cancel, and host close on Android and iOS', async () => {
  const allEntries = await buildAllTargetModules();
  const componentPath = 'AppModalOverlay@app_ui/src/modal_presenter/AppModalOverlay';

  const pumpLayout = async (tree: SimTree, flush: () => Promise<void>) => {
    while (tree.layoutCompletions.length > 0) {
      tree.layoutCompletions.shift()!();
    }
    await flush();
  };

  const pumpAnimations = async (tree: SimTree, flush: () => Promise<void>, wasCancelled = false) => {
    while (tree.animationCompletions.length > 0) {
      tree.animationCompletions.shift()!(wasCancelled);
    }
    await flush();
  };

  for (const platform of [1, 2] as const) {
    const h = createSolidHost(platform, allEntries);

    // 1. Editable modal: initial enter animation -> input edit -> confirm button -> exit animation -> onDismissed
    {
      const confirmed: string[] = [];
      let dismissed = 0;
      h.manager.create(
        'modal-confirm',
        componentPath,
        {
          open: true,
          title: '确认输入',
          content: '请输入名称',
          showCancel: true,
          confirmText: '确定',
          cancelText: '取消',
          editable: true,
          placeholderText: '请输入',
          defaultText: 'hi',
          topInset: 24,
          bottomInset: 16,
        },
        {
          onConfirm: (content: string) => confirmed.push(content),
          onCancel: () => assert.fail('unexpected onCancel'),
          onDismissed: () => {
            dismissed += 1;
          },
        },
      );
      const tree = h.sim.getTree('modal-confirm');
      const scrim = findByA11y(tree, 'app-modal-scrim');
      const card = findByA11y(tree, 'app-modal-card');
      const input = findByA11y(tree, 'app-modal-input');
      assert.equal(scrim.attrs.opacity, 0);
      assert.equal(card.attrs.opacity, 0);
      assert.equal(card.attrs.scaleX, 0.96);
      assert.equal(input.attrs.value, 'hi');

      await pumpLayout(tree, h.flushMicrotasks);
      assert.equal(scrim.attrs.opacity, 1);
      assert.equal(card.attrs.opacity, 1);
      assert.equal(card.attrs.scaleX, 1);
      assert.equal(card.attrs.scaleY, 1);

      (input.attrs.onChange as (event: { text: string }) => void)({ text: 'hello' });
      await h.flushMicrotasks();
      assert.equal(input.attrs.value, 'hello');

      const confirmBtn = findByA11y(tree, 'app-modal-confirm-button');
      (confirmBtn.attrs.onTap as () => void)();
      await h.flushMicrotasks();
      assert.deepEqual(confirmed, ['hello']);
      assert.equal(scrim.attrs.opacity, 0);
      assert.equal(card.attrs.opacity, 0);
      assert.equal(card.attrs.scaleX, 0.96);
      assert.equal(dismissed, 0);

      await pumpAnimations(tree, h.flushMicrotasks);
      assert.equal(dismissed, 1);
      h.manager.destroy('modal-confirm');
    }

    // 2. Editable modal Return key confirms with latest text and dismisses once
    {
      const confirmed: string[] = [];
      let dismissed = 0;
      h.manager.create(
        'modal-return',
        componentPath,
        {
          open: true,
          title: '快捷确认',
          content: '',
          showCancel: false,
          confirmText: '完成',
          cancelText: '取消',
          editable: true,
          placeholderText: '输入内容',
          defaultText: '',
          topInset: 0,
          bottomInset: 0,
        },
        {
          onConfirm: (content: string) => confirmed.push(content),
          onCancel: () => assert.fail('unexpected onCancel'),
          onDismissed: () => {
            dismissed += 1;
          },
        },
      );
      const tree = h.sim.getTree('modal-return');
      await pumpLayout(tree, h.flushMicrotasks);

      const input = findByA11y(tree, 'app-modal-input');
      (input.attrs.onReturn as (event: { text: string }) => void)({ text: 'enter-done' });
      await h.flushMicrotasks();
      assert.deepEqual(confirmed, ['enter-done']);

      await pumpAnimations(tree, h.flushMicrotasks);
      assert.equal(dismissed, 1);
      h.manager.destroy('modal-return');
    }

    // 3. Cancel button and scrim tap trigger onCancel and dismiss once
    for (const targetA11y of ['app-modal-cancel-button', 'app-modal-scrim'] as const) {
      let canceled = 0;
      let dismissed = 0;
      const treeId = `modal-${targetA11y}`;
      h.manager.create(
        treeId,
        componentPath,
        {
          open: true,
          title: '提示',
          content: '确认关闭吗？',
          showCancel: true,
          confirmText: '确定',
          cancelText: '取消',
          editable: false,
          placeholderText: '',
          defaultText: '',
          topInset: 0,
          bottomInset: 0,
        },
        {
          onConfirm: () => assert.fail('unexpected onConfirm'),
          onCancel: () => {
            canceled += 1;
          },
          onDismissed: () => {
            dismissed += 1;
          },
        },
      );
      const tree = h.sim.getTree(treeId);
      await pumpLayout(tree, h.flushMicrotasks);

      const target = findByA11y(tree, targetA11y);
      (target.attrs.onTap as () => void)();
      await h.flushMicrotasks();
      assert.equal(canceled, 1);

      await pumpAnimations(tree, h.flushMicrotasks);
      assert.equal(dismissed, 1);
      h.manager.destroy(treeId);
    }

    // 4. Host-driven close (open: true -> false) + initial open: false
    {
      let dismissed = 0;
      const baseModalVm = {
        open: true,
        title: '系统弹窗',
        content: '外部取消测试',
        showCancel: true,
        confirmText: '确定',
        cancelText: '取消',
        editable: false,
        placeholderText: '',
        defaultText: '',
        topInset: 0,
        bottomInset: 0,
      };
      h.manager.create('modal-host-close', componentPath, baseModalVm, {
        onConfirm: () => assert.fail('unexpected onConfirm'),
        onCancel: () => assert.fail('unexpected onCancel'),
        onDismissed: () => {
          dismissed += 1;
        },
      });
      const tree = h.sim.getTree('modal-host-close');
      await pumpLayout(tree, h.flushMicrotasks);

      h.manager.render('modal-host-close', { ...baseModalVm, open: false });
      await h.flushMicrotasks();
      const card = findByA11y(tree, 'app-modal-card');
      assert.equal(card.attrs.opacity, 0);
      assert.equal(dismissed, 0);

      await pumpAnimations(tree, h.flushMicrotasks);
      assert.equal(dismissed, 1);
      h.manager.destroy('modal-host-close');

      let preDismissed = 0;
      h.manager.create(
        'modal-pre-closed',
        componentPath,
        { ...baseModalVm, open: false },
        {
          onConfirm: () => assert.fail('unexpected onConfirm'),
          onCancel: () => assert.fail('unexpected onCancel'),
          onDismissed: () => {
            preDismissed += 1;
          },
        },
      );
      assert.equal(preDismissed, 1);
      h.manager.destroy('modal-pre-closed');
    }
  }
});

test('Solid WheelPickers (ColumnPicker, TimePicker, TreePicker) reuse native <custom-view> on controlled updates on Android and iOS', async () => {
  const allEntries = await buildAllTargetModules();

  for (const platform of [1, 2] as const) {
    const h = createSolidHost(platform, allEntries);
    h.compileInlineTsx(
      'inline_test/WheelHarness',
      `
      import { ColumnPicker, TimePicker, TreePicker } from 'app_ui/src/wheels/WheelPickers';

      export function WheelHarness(props) {
        const vm = props.viewModel;
        return (
          <view>
            <ColumnPicker
              options={['A;,', 'B']}
              value={vm().col}
              onChange={v => vm().onCol(v)}
            />
            <TimePicker
              mode="date"
              value={vm().date}
              minYear={1900}
              maxYear={2100}
              onChange={v => vm().onDate(v)}
            />
            <TreePicker
              data={[{ value: 'a', label: 'a;', children: [{ value: 'b', label: 'b,' }] }]}
              value={vm().tree}
              onChange={v => vm().onTree(v)}
            />
          </view>
        );
      }
      `,
    );

    const received: Record<string, unknown[]> = { col: [], date: [], tree: [] };
    const vm0 = {
      col: 'A;,',
      date: '2000-02-29',
      tree: ['a', 'b'],
      onCol: (v: string) => received.col.push(v),
      onDate: (v: string) => received.date.push(v),
      onTree: (v: string[]) => received.tree.push(v),
    };
    h.manager.create('wheels-1', 'WheelHarness@inline_test/WheelHarness', vm0, {});
    const tree = h.sim.getTree('wheels-1');

    const colClass = platform === 1 ? 'io.valdiroutes.app.ColumnWheelView' : 'VRColumnWheelView';
    const timeClass = platform === 1 ? 'io.valdiroutes.app.TimeWheelView' : 'VRTimeWheelView';
    const treeClass = platform === 1 ? 'io.valdiroutes.app.TreeWheelView' : 'VRTreeWheelView';

    const colNode = findNodes(tree, n => n.viewClass === colClass)[0];
    const timeNode = findNodes(tree, n => n.viewClass === timeClass)[0];
    const treeNode = findNodes(tree, n => n.viewClass === treeClass)[0];
    assert.ok(colNode && timeNode && treeNode);

    assert.deepEqual(JSON.parse(JSON.stringify(colNode.attrs.config)), {
      options: [
        { value: 'A;,', label: 'A;,' },
        { value: 'B', label: 'B' },
      ],
      value: 'A;,',
    });
    assert.deepEqual(JSON.parse(JSON.stringify(timeNode.attrs.config)), {
      mode: 'date',
      value: '2000-02-29',
      minYear: 1900,
      maxYear: 2100,
    });
    assert.deepEqual(JSON.parse(JSON.stringify(treeNode.attrs.config)), {
      data: [{ value: 'a', label: 'a;', children: [{ value: 'b', label: 'b,' }] }],
      value: ['a', 'b'],
      columns: 3,
    });

    (colNode.attrs.onChange as (v: string) => void)('B');
    (timeNode.attrs.onChange as (v: string) => void)('2000-03-01');
    (treeNode.attrs.onChange as (v: string[]) => void)(['a']);
    assert.deepEqual(JSON.parse(JSON.stringify(received)), {
      col: ['B'],
      date: ['2000-03-01'],
      tree: [['a']],
    });

    const batchesBeforeUpdate = tree.batches.length;
    h.manager.render('wheels-1', { ...vm0, col: 'B', date: '2000-03-01', tree: ['a'] });
    await h.flushMicrotasks();
    const updateOps = tree.batches.slice(batchesBeforeUpdate).flat();
    assert.equal(
      updateOps.some(op => op.type === Opcode.CREATE_ELEMENT || op.type === Opcode.DESTROY_ELEMENT),
      false,
      'Controlled wheel updates must reuse existing native custom-views',
    );
    assert.equal((colNode.attrs.config as any).value, 'B');
    assert.equal((timeNode.attrs.config as any).value, '2000-03-01');
    assert.deepEqual(JSON.parse(JSON.stringify((treeNode.attrs.config as any).value)), ['a', 'b']);

    h.manager.destroy('wheels-1');
  }
});
