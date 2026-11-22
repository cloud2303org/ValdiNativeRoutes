import assert from 'node:assert/strict';
import path from 'node:path';
import { before, test } from 'node:test';
import vm from 'node:vm';
import type { ArchiveEntries } from '../archive';
import { appModule, buildModule } from '../pipeline';
import { valdiTs } from '../valdiTs';

const EntryOpcode = {
  CREATE_ELEMENT: 1,
  DESTROY_ELEMENT: 2,
  SET_ROOT_ELEMENT: 3,
  SET_ATTRIBUTE_UNDEFINED: 5,
  SET_ATTRIBUTE_NULL: 6,
  SET_ATTRIBUTE_FALSE: 7,
  SET_ATTRIBUTE_TRUE: 8,
  SET_ATTRIBUTE_INT: 9,
  SET_ATTRIBUTE_DOUBLE: 10,
  SET_ATTRIBUTE_ARRAY: 11,
  SET_ATTRIBUTE_STYLE: 12,
  SET_ATTRIBUTE_ATTACHED_VALUE: 13,
  BEGIN_ANIMATIONS: 14,
  END_ANIMATIONS: 15,
  ON_LAYOUT_COMPLETE: 16,
  CANCEL_ANIMATION: 17,
  ON_NEXT_DRAW: 18,
  DETACH_ELEMENT: 19,
  INSERT_ELEMENT_BEFORE: 20,
} as const;

interface DecodedOp {
  opcode: number;
  id: number;
  tag?: string;
  parentId?: number;
  anchorId?: number;
  attr?: string;
  value?: unknown;
}

interface RecordedBatch {
  treeId: string;
  ops: DecodedOp[];
}

interface HotReloadListener {
  observingModulePath: string;
  targetPath: string;
  callback: () => void;
}

function decodeBatch(
  descriptor: ArrayBuffer,
  descriptorSize: number,
  values: unknown[],
  stringsById: Map<number, string>,
  attrsById: Map<number, string>,
): DecodedOp[] {
  const view = new DataView(descriptor, 0, descriptorSize * 4);
  const ops: DecodedOp[] = [];
  let pos = 0;

  while (pos < view.byteLength) {
    const header = view.getUint32(pos, true);
    pos += 4;
    const opcode = header & 0xff;
    const id = header >>> 8;

    switch (opcode) {
      case EntryOpcode.CREATE_ELEMENT: {
        const strId = view.getUint32(pos, true);
        pos += 4;
        ops.push({ opcode, id, tag: stringsById.get(strId) });
        break;
      }
      case EntryOpcode.DESTROY_ELEMENT:
      case EntryOpcode.SET_ROOT_ELEMENT:
      case EntryOpcode.DETACH_ELEMENT:
        ops.push({ opcode, id });
        break;
      case EntryOpcode.INSERT_ELEMENT_BEFORE: {
        const parentId = view.getUint32(pos, true);
        const anchorId = view.getUint32(pos + 4, true);
        pos += 8;
        ops.push({ opcode, id, parentId, anchorId });
        break;
      }
      case EntryOpcode.SET_ATTRIBUTE_UNDEFINED:
      case EntryOpcode.SET_ATTRIBUTE_NULL:
      case EntryOpcode.SET_ATTRIBUTE_FALSE:
      case EntryOpcode.SET_ATTRIBUTE_TRUE: {
        const attrId = view.getUint32(pos, true) & 0xffffff;
        pos += 4;
        ops.push({ opcode, id, attr: attrsById.get(attrId) });
        break;
      }
      case EntryOpcode.SET_ATTRIBUTE_DOUBLE: {
        const attrId = view.getUint32(pos, true) & 0xffffff;
        const val = view.getFloat64(pos + 4, true);
        pos += 12;
        ops.push({ opcode, id, attr: attrsById.get(attrId), value: val });
        break;
      }
      case EntryOpcode.SET_ATTRIBUTE_ARRAY: {
        const attrId = view.getUint32(pos, true) & 0xffffff;
        const len = view.getUint32(pos + 4, true);
        pos += 8;
        const items: unknown[] = [];
        for (let i = 0; i < len; i++) {
          items.push(values[view.getUint32(pos, true)]);
          pos += 4;
        }
        ops.push({ opcode, id, attr: attrsById.get(attrId), value: items });
        break;
      }
      case EntryOpcode.SET_ATTRIBUTE_STYLE: {
        const attrId = view.getUint32(pos, true) & 0xffffff;
        const styleId = view.getUint32(pos + 4, true);
        pos += 8;
        ops.push({ opcode, id, attr: attrsById.get(attrId), value: styleId });
        break;
      }
      case EntryOpcode.SET_ATTRIBUTE_ATTACHED_VALUE: {
        const attrId = view.getUint32(pos, true) & 0xffffff;
        const valIdx = view.getUint32(pos + 4, true);
        pos += 8;
        ops.push({ opcode, id, attr: attrsById.get(attrId), value: values[valIdx] });
        break;
      }
      case EntryOpcode.ON_NEXT_DRAW:
      case EntryOpcode.ON_LAYOUT_COMPLETE:
      case EntryOpcode.CANCEL_ANIMATION:
        pos += 4;
        ops.push({ opcode, id });
        break;
      default:
        throw new Error(`Unexpected EntryOpcode in test decoder: ${opcode}`);
    }
  }

  return ops;
}

const builtBundles = new Map<string, ArchiveEntries>();

before(async () => {
  for (const name of ['solid_runtime', 'solid_native']) {
    const mod = appModule(name);
    const plugin = valdiTs(mod);
    try {
      const built = await buildModule(mod, plugin, false);
      builtBundles.set(name, built.entries);
    } finally {
      plugin.dispose();
    }
  }
});

function createSolidTestHarness() {
  const strings = new Map<string, number>();
  const stringsById = new Map<number, string>();
  const attrs = new Map<string, number>();
  const attrsById = new Map<number, string>();
  let nextStrId = 1;
  let nextAttrId = 1;
  let nextCssId = 1;

  const batches: RecordedBatch[] = [];
  const contextStack: Array<string | undefined> = [];
  const loadCalls: Array<{ path: string; disableProxy?: boolean; disableSyncDependencies?: boolean }> = [];
  const hotReloadListeners: HotReloadListener[] = [];
  const debugMessages: Array<{ level: number; message: string }> = [];
  const daemonListeners: Array<{ onMessage?: (msg: any) => void }> = [];

  const daemonClientManager = {
    addListener(listener: { onMessage?: (msg: any) => void }) {
      daemonListeners.push(listener);
    },
    removeListener(listener: { onMessage?: (msg: any) => void }) {
      const idx = daemonListeners.indexOf(listener);
      if (idx >= 0) daemonListeners.splice(idx, 1);
    },
    dispatch(type: number, body: any): any[] {
      const responses: any[] = [];
      const message = {
        message: {
          senderClientId: 1,
          requestId: 'req-1',
          type,
          body,
        },
        respond(makeMessage: (requestId: string) => string) {
          responses.push(JSON.parse(makeMessage('req-1')));
        },
      };
      for (const listener of [...daemonListeners]) {
        listener.onMessage?.(message);
      }
      return responses;
    },
  };

  const valdiRuntime = {
    isLoggingEnabled: true,
    isDebugEnabled: true,
    getCurrentPlatform: () => 1,
    submitDebugMessage(level: number, message: string) {
      debugMessages.push({ level, message });
    },
    internString(str: string) {
      let id = strings.get(str);
      if (id === undefined) {
        id = nextStrId++;
        strings.set(str, id);
        stringsById.set(id, str);
      }
      return id;
    },
    getAttributeId(name: string) {
      let id = attrs.get(name);
      if (id === undefined) {
        id = nextAttrId++;
        attrs.set(name, id);
        attrsById.set(id, name);
      }
      return id;
    },
    createCSSRule: () => nextCssId++,
    pushCurrentContext(contextId: string | undefined) {
      contextStack.push(contextId);
    },
    popCurrentContext() {
      contextStack.pop();
    },
    submitRawRenderRequest(
      req: { treeId: string; descriptor: ArrayBuffer; descriptorSize: number; values: unknown[] },
      release: () => void,
    ) {
      try {
        const ops = decodeBatch(req.descriptor, req.descriptorSize, req.values, stringsById, attrsById);
        batches.push({ treeId: req.treeId, ops });
      } finally {
        release();
      }
    },
    getFrameForElementId: () => {},
    getNativeViewForElementId: () => {},
    getNativeNodeForElementId: () => undefined,
    takeElementSnapshot: (contextId: string, elementId: number, cb: (snapshot: string | undefined) => void) => {
      cb(`snap:${contextId}:${elementId}`);
    },
  };

  const moduleCache = new Map<string, { exports: any }>();
  const customModules = new Map<string, (mod: { exports: any; path: string }, req: (id: string) => any) => void>();

  const moduleLoader = {
    load(modulePath: string, disableProxy?: boolean, disableSyncDependencies?: boolean) {
      loadCalls.push({ path: modulePath, disableProxy, disableSyncDependencies });
      return loadCjs(modulePath);
    },
    onHotReload(observingModule: { path: string }, targetPath: string, callback: () => void) {
      const entry: HotReloadListener = {
        observingModulePath: observingModule.path,
        targetPath,
        callback,
      };
      hotReloadListeners.push(entry);
      return () => {
        const index = hotReloadListeners.indexOf(entry);
        if (index >= 0) hotReloadListeners.splice(index, 1);
      };
    },
  };

  const builtinModules: Record<string, any> = {
    'valdi_core/src/ModuleLoaderGlobal': { getModuleLoader: () => moduleLoader },
    'valdi_core/src/ValdiRuntimeProvider': { getValdiRuntime: () => valdiRuntime },
    'valdi_core/src/Valdi': { getDaemonClientManager: () => daemonClientManager },
    'valdi_core/src/utils/StringUtils': {
      debugStringify(value: unknown) {
        if (value === undefined) return 'undefined';
        if (typeof value === 'string') return value;
        return JSON.stringify(value);
      },
    },
    'valdi_core/src/debugging/Messages': {
      Messages: {
        listContextsResponse(requestId: string, contexts: unknown[]) {
          return JSON.stringify({ type: -2, requestId, body: contexts });
        },
        getContextTreeResponse(requestId: string, body: unknown) {
          return JSON.stringify({ type: -3, requestId, body });
        },
        takeElementSnapshotResponse(requestId: string, body: string) {
          return JSON.stringify({ type: -4, requestId, body });
        },
        errorResponse(requestId: string, error: string | Error) {
          return JSON.stringify({
            type: -1,
            requestId,
            body: { message: typeof error === 'string' ? error : error.message },
          });
        },
      },
    },
    'valdi_core/src/NativeReferences': {
      withLocalNativeRefs<T>(contextId: string, cb: () => T): T {
        valdiRuntime.pushCurrentContext(contextId);
        try {
          return cb();
        } finally {
          valdiRuntime.popCurrentContext();
        }
      },
    },
  };

  function resolveModulePath(fromId: string, request: string): string {
    if (request.startsWith('.')) {
      const normalized = path.posix.normalize(path.posix.join(path.posix.dirname(fromId), request));
      return normalized.replace(/\.js$/, '');
    }
    return request.replace(/\.js$/, '');
  }

  function loadCjs(rawId: string): any {
    const id = rawId.replace(/\.js$/, '');
    if (builtinModules[id]) return builtinModules[id];
    const cached = moduleCache.get(id);
    if (cached) return cached.exports;

    const mod = { exports: {}, path: id };
    moduleCache.set(id, mod);

    const req = (specifier: string) => loadCjs(resolveModulePath(id, specifier));

    try {
      const customFactory = customModules.get(id);
      if (customFactory) {
        customFactory(mod, req);
        return mod.exports;
      }

      const slash = id.indexOf('/');
      if (slash <= 0) throw new Error(`Unknown module: ${id}`);
      const bundleName = id.slice(0, slash);
      const fileName = `${id.slice(slash + 1)}.js`;
      const sourceBuf = builtBundles.get(bundleName)?.get(fileName);
      if (!sourceBuf) {
        throw new Error(`Missing compiled file ${bundleName}:${fileName}`);
      }

      const wrapper = `(function (exports, require, module, __filename, __dirname) {\n${sourceBuf.toString('utf8')}\n})`;
      const fn = vm.runInThisContext(wrapper, { filename: `${id}.js` });
      fn(mod.exports, req, mod, `${id}.js`, path.posix.dirname(id));
      return mod.exports;
    } catch (error) {
      moduleCache.delete(id);
      throw error;
    }
  }

  function registerModule(
    modulePath: string,
    factory: (mod: { exports: any; path: string }, req: (id: string) => any) => void,
  ) {
    customModules.set(modulePath, factory);
  }

  function unloadModule(modulePath: string) {
    moduleCache.delete(modulePath);
  }

  function triggerHotReload(modulePath: string) {
    unloadModule(modulePath);
    const active = hotReloadListeners.filter(item => item.targetPath === modulePath);
    for (const listener of active) {
      listener.callback();
    }
  }

  const bridge = loadCjs('solid_native/src/bridge');
  const renderer = loadCjs('solid_native/src/renderer');
  const solid = loadCjs('solid_runtime/src/solid');

  return {
    bridge,
    renderer,
    solid,
    batches,
    contextStack,
    loadCalls,
    hotReloadListeners,
    debugMessages,
    daemonListeners,
    daemonClientManager,
    registerModule,
    unloadModule,
    triggerHotReload,
  };
}

test('solid_native hotReload disposes old root, flushes native teardown, remounts updated page with latest viewModel, recovers from errors, and unsubscribes on destroy', async () => {
  const harness = createSolidTestHarness();
  const { bridge, batches, loadCalls, hotReloadListeners, registerModule, triggerHotReload } = harness;
  const events: string[] = [];

  registerModule('app_pages/src/TestPage', (mod, req) => {
    const { onCleanup } = req('solid_runtime/src/solid');
    const { createElement, insert, setProp } = req('solid_native/src/renderer');
    const { onPageShow, whilePageVisible } = req('solid_native/src/bridge');
    mod.exports = {
      TestPage(props: any) {
        onCleanup(() => events.push('v1:cleanup'));
        onPageShow(() => events.push('v1:show'));
        whilePageVisible(() => {
          events.push('v1:visible:start');
          return () => events.push('v1:visible:stop');
        });
        const container = createElement('view');
        const label = createElement('label');
        setProp(label, 'value', 'v1');
        insert(container, label);
        return container;
      },
    };
  });

  const manager = bridge.createRootComponentsManager();
  manager.create(
    'ctx-1',
    'TestPage@app_pages/src/TestPage',
    { visible: false, insets: { top: 20, right: 0, bottom: 0, left: 0 }, params: { id: 'p1' } },
    { route: 'test' },
  );

  assert.equal(loadCalls.at(-1)?.path, 'app_pages/src/TestPage');
  assert.equal(loadCalls.at(-1)?.disableSyncDependencies, true);
  assert.equal(hotReloadListeners.length, 1);
  assert.equal(hotReloadListeners[0].observingModulePath, 'solid_native/src/bridge');
  assert.equal(hotReloadListeners[0].targetPath, 'app_pages/src/TestPage');

  // Become visible after mount and also update latestViewModel.
  manager.render('ctx-1', {
    visible: true,
    insets: { top: 48, right: 0, bottom: 0, left: 0 },
    params: { id: 'p2' },
    title: 'updated-title',
  });

  assert.deepEqual(events, ['v1:show', 'v1:visible:start']);
  const rootId = batches[0].ops.find(op => op.opcode === EntryOpcode.SET_ROOT_ELEMENT)?.id;
  assert.equal(rootId, 1);
  assert.ok(batches[0].ops.some(op => op.opcode === EntryOpcode.SET_ATTRIBUTE_ATTACHED_VALUE && op.value === 'v1'));

  // Case 1: Hot reload to v2 with updated text and latest viewModel/insets.
  registerModule('app_pages/src/TestPage', (mod, req) => {
    const { onCleanup } = req('solid_runtime/src/solid');
    const { createElement, insert, setProp } = req('solid_native/src/renderer');
    const { onPageShow, whilePageVisible } = req('solid_native/src/bridge');
    mod.exports = {
      TestPage(props: any) {
        onCleanup(() => events.push('v2:cleanup'));
        onPageShow(() => events.push('v2:show'));
        whilePageVisible(() => {
          events.push('v2:visible:start');
          return () => events.push('v2:visible:stop');
        });
        const container = createElement('view');
        const label = createElement('label');
        setProp(
          label,
          'value',
          `v2:${props.params.id}:${props.insets.top}:${props.viewModel().title}`,
        );
        insert(container, label);
        return container;
      },
    };
  });

  batches.length = 0;
  const loadCountBeforeReload = loadCalls.length;
  triggerHotReload('app_pages/src/TestPage');

  assert.equal(loadCalls[loadCountBeforeReload].disableSyncDependencies, true);
  assert.deepEqual(events, [
    'v1:show',
    'v1:visible:start',
    'v1:visible:stop',
    'v1:cleanup',
    'v2:show',
    'v2:visible:start',
  ]);
  // Two batches: teardown of old subtree, then remount of v2.
  assert.equal(batches.length, 2);
  const teardownOps = batches[0].ops;
  assert.ok(teardownOps.some(op => op.opcode === EntryOpcode.DETACH_ELEMENT));
  assert.ok(teardownOps.some(op => op.opcode === EntryOpcode.DESTROY_ELEMENT));
  assert.ok(!teardownOps.some(op => op.opcode === EntryOpcode.DESTROY_ELEMENT && op.id === rootId));

  const mountOps = batches[1].ops;
  assert.ok(
    mountOps.some(
      op =>
        op.opcode === EntryOpcode.SET_ATTRIBUTE_ATTACHED_VALUE &&
        op.value === 'v2:p2:48:updated-title',
    ),
  );
  assert.ok(manager.rootComponents['ctx-1']);

  // Case 2: Module load throws -> logged cleanly, listener remains intact.
  registerModule('app_pages/src/TestPage', () => {
    throw new Error('syntax error during reload');
  });
  batches.length = 0;
  const origConsoleError = console.error;
  const capturedErrors: string[] = [];
  console.error = (...args: unknown[]) => capturedErrors.push(args.map(String).join(' '));
  try {
    assert.doesNotThrow(() => triggerHotReload('app_pages/src/TestPage'));

    // Case 3: Component throws during render -> logged cleanly, listener remains intact.
    registerModule('app_pages/src/TestPage', mod => {
      mod.exports = {
        TestPage() {
          throw new Error('render crash');
        },
      };
    });
    assert.doesNotThrow(() => triggerHotReload('app_pages/src/TestPage'));
  } finally {
    console.error = origConsoleError;
  }
  assert.ok(capturedErrors.some(e => e.includes('Failed to load TestPage@app_pages/src/TestPage')));
  assert.ok(capturedErrors.some(e => e.includes('Failed to render TestPage@app_pages/src/TestPage')));
  assert.equal(hotReloadListeners.length, 1);

  // Case 4: Recover cleanly on next save with v4 and keep reactivity alive!
  let setDynamicCount!: (next: number) => void;
  registerModule('app_pages/src/TestPage', (mod, req) => {
    const { createSignal } = req('solid_runtime/src/solid');
    const { createElement, effect, insert, setProp } = req('solid_native/src/renderer');
    const { onPageShow, whilePageVisible } = req('solid_native/src/bridge');
    mod.exports = {
      TestPage() {
        const [count, setCount] = createSignal(0);
        setDynamicCount = setCount;
        onPageShow(() => events.push('v4:show'));
        whilePageVisible(() => {
          events.push('v4:visible:start');
          return () => events.push('v4:visible:stop');
        });
        const container = createElement('view');
        const label = createElement('label');
        effect(
          () => `v4:${count()}`,
          (value: string) => {
            setProp(label, 'value', value);
          },
        );
        insert(container, label);
        return container;
      },
    };
  });
  batches.length = 0;
  triggerHotReload('app_pages/src/TestPage');
  assert.ok(
    batches.some(b => b.ops.some(op => op.opcode === EntryOpcode.SET_ATTRIBUTE_ATTACHED_VALUE && op.value === 'v4:0')),
  );
  batches.length = 0;
  setDynamicCount(7);
  harness.solid.flush();
  await Promise.resolve();
  assert.ok(
    batches.some(b => b.ops.some(op => op.opcode === EntryOpcode.SET_ATTRIBUTE_ATTACHED_VALUE && op.value === 'v4:7')),
  );

  // Case 5: Background page (visible: false) reloads without firing show/visible effects.
  manager.render('ctx-1', { visible: false, title: 'hidden' });
  const eventsBeforeBgReload = events.length;
  triggerHotReload('app_pages/src/TestPage');
  assert.equal(events.slice(eventsBeforeBgReload).filter(e => e.includes('show') || e.includes('visible:start')).length, 0);

  // Case 6: destroy(contextId) unsubscribes onHotReload and stops subsequent reloads.
  const loadsBeforeDestroy = loadCalls.length;
  manager.destroy('ctx-1');
  assert.equal(hotReloadListeners.length, 0);
  triggerHotReload('app_pages/src/TestPage');
  assert.equal(loadCalls.length, loadsBeforeDestroy);
});

test('solid_native provides full RootComponentsManager parity: batched Reloaded logs, onRuntimeIssue, daemon inspector, and stashData/restoreData', async () => {
  const harness = createSolidTestHarness();
  const {
    bridge,
    batches,
    hotReloadListeners,
    debugMessages,
    daemonListeners,
    daemonClientManager,
    registerModule,
    triggerHotReload,
  } = harness;
  const events: string[] = [];
  let allowCleanupThrow = false;

  registerModule('app_pages/src/MainPage', (mod, req) => {
    const { onCleanup } = req('solid_runtime/src/solid');
    const { createElement, createTextNode, insert, setProp } = req('solid_native/src/renderer');
    const { onPageShow, onPageHide } = req('solid_native/src/bridge');
    mod.exports = {
      MainPage(props: any) {
        onCleanup(() => events.push(`main:cleanup:${props.contextId}`));
        onPageShow(() => events.push(`main:show:${props.contextId}`));
        onPageHide(() => events.push(`main:hide:${props.contextId}`));
        if (props.contextId === 'ctx-throw-dispose') {
          onCleanup(() => {
            if (allowCleanupThrow) throw new Error('dispose boom');
          });
        }
        const rootView = createElement('view');
        const label = createElement('label');
        setProp(label, 'value', `main-v1:${props.viewModel().title ?? 'none'}`);
        insert(rootView, createTextNode(''));
        insert(rootView, label);
        return rootView;
      },
    };
  });

  const manager1 = bridge.createRootComponentsManager();
  assert.equal(daemonListeners.length, 1);

  manager1.create(
    'ctx-main',
    'MainPage@app_pages/src/MainPage',
    { visible: true, title: 'initial' },
    { route: 'main' },
  );
  manager1.render('ctx-main', { visible: true, title: 'latest-main' });

  manager1.create(
    'ctx-throw-dispose',
    'MainPage@app_pages/src/MainPage',
    { visible: true, title: 'thrower' },
    { route: 'thrower' },
  );

  manager1.create(
    'ctx-bg',
    'MainPage@app_pages/src/MainPage',
    { visible: false, title: 'bg-init' },
    { route: 'bg' },
  );

  // 1) Batched submitDebugMessage(DEBUG, 'Reloaded N from ...') after hotReload.
  debugMessages.length = 0;
  triggerHotReload('app_pages/src/MainPage');
  await new Promise(resolve => setTimeout(resolve, 10));
  const reloadedDebug = debugMessages.filter(m => m.level === 0 && m.message.startsWith('Reloaded '));
  assert.equal(reloadedDebug.length, 1);
  assert.equal(reloadedDebug[0].message, 'Reloaded 3 from MainPage@app_pages/src/MainPage');

  // Load/render errors forward to submitDebugMessage(ERROR).
  debugMessages.length = 0;
  registerModule('app_pages/src/MainPage', () => {
    throw new Error('bad reload');
  });
  const origErr = console.error;
  console.error = () => {};
  try {
    triggerHotReload('app_pages/src/MainPage');
  } finally {
    console.error = origErr;
  }
  assert.ok(debugMessages.some(m => m.level === 3 && m.message.includes('Failed to load MainPage@app_pages/src/MainPage')));

  // Restore clean MainPage v1 for inspector checks.
  registerModule('app_pages/src/MainPage', (mod, req) => {
    const { onCleanup } = req('solid_runtime/src/solid');
    const { createElement, createTextNode, insert, setProp } = req('solid_native/src/renderer');
    const { onPageShow, onPageHide } = req('solid_native/src/bridge');
    mod.exports = {
      MainPage(props: any) {
        onCleanup(() => events.push(`main:cleanup:${props.contextId}`));
        onPageShow(() => events.push(`main:show:${props.contextId}`));
        onPageHide(() => events.push(`main:hide:${props.contextId}`));
        if (props.contextId === 'ctx-throw-dispose') {
          onCleanup(() => {
            throw new Error('dispose boom');
          });
        }
        const rootView = createElement('view');
        const label = createElement('label');
        setProp(label, 'value', `main-v1:${props.viewModel().title ?? 'none'}`);
        insert(rootView, createTextNode(''));
        insert(rootView, label);
        return rootView;
      },
    };
  });
  triggerHotReload('app_pages/src/MainPage');
  await new Promise(resolve => setTimeout(resolve, 10));

  // 2) onRuntimeIssue forwards error (level 3) and warn (level 2).
  debugMessages.length = 0;
  const origWarn = console.warn;
  console.error = () => {};
  console.warn = () => {};
  try {
    manager1.onRuntimeIssue('ctx-main', true, 'boom error');
    manager1.onRuntimeIssue('ctx-main', false, 'minor warning');
  } finally {
    console.error = origErr;
    console.warn = origWarn;
  }
  assert.deepEqual(debugMessages, [
    { level: 3, message: '[Valdi:ctx-main] boom error' },
    { level: 2, message: '[Valdi:ctx-main] minor warning' },
  ]);

  // 3) Daemon inspector: LIST_CONTEXTS_REQUEST, GET_CONTEXT_TREE_REQUEST, TAKE_ELEMENT_SNAPSHOT_REQUEST.
  const listRes = daemonClientManager.dispatch(2, {});
  assert.equal(listRes.length, 1);
  assert.equal(listRes[0].type, -2);
  assert.deepEqual(listRes[0].body, [
    { id: 'ctx-main', rootComponentName: 'MainPage' },
    { id: 'ctx-throw-dispose', rootComponentName: 'MainPage' },
    { id: 'ctx-bg', rootComponentName: 'MainPage' },
  ]);

  const treeRes = daemonClientManager.dispatch(3, { id: 'ctx-main', includeComponentData: true });
  assert.equal(treeRes.length, 1);
  assert.equal(treeRes[0].type, -3);
  assert.equal(treeRes[0].body.tag, 'view');
  assert.ok(treeRes[0].body.component.viewModel.includes('latest-main'));
  // Root -> container view -> label (sentinel omitted).
  assert.equal(treeRes[0].body.children.length, 1);
  const containerNode = treeRes[0].body.children[0];
  assert.equal(containerNode.children.length, 1);
  const labelNode = containerNode.children[0];
  assert.equal(labelNode.tag, 'label');
  assert.equal(labelNode.element.attributes.value, 'main-v1:latest-main');

  const snapResponses: any[] = [];
  const snapMsg = {
    message: {
      senderClientId: 1,
      requestId: 'req-snap',
      type: 4,
      body: { contextId: 'ctx-main', elementId: labelNode.element.id },
    },
    respond(makeMessage: (id: string) => string) {
      snapResponses.push(JSON.parse(makeMessage('req-snap')));
    },
  };
  daemonListeners[0].onMessage?.(snapMsg);
  await Promise.resolve();
  assert.equal(snapResponses.length, 1);
  assert.equal(snapResponses[0].type, -4);
  assert.equal(snapResponses[0].body, `snap:ctx-main:${labelNode.element.id}`);

  const missingElemRes = daemonClientManager.dispatch(4, { contextId: 'ctx-main', elementId: 999999 });
  assert.equal(missingElemRes[0].type, -1);

  // 4) stashData() + restoreData() across two managers.
  allowCleanupThrow = true;
  events.length = 0;
  batches.length = 0;
  console.error = () => {};
  let stashed: any;
  try {
    stashed = manager1.stashData();
  } finally {
    console.error = origErr;
  }
  assert.equal(daemonListeners.length, 0);
  assert.equal(hotReloadListeners.length, 0);
  assert.equal(stashed.length, 3);
  assert.deepEqual(
    stashed.map((s: any) => s.contextId),
    ['ctx-main', 'ctx-throw-dispose', 'ctx-bg'],
  );
  // Old trees flushed DETACH/DESTROY before disposal for healthy contexts.
  assert.ok(batches.some(b => b.treeId === 'ctx-main' && b.ops.some(op => op.opcode === EntryOpcode.DESTROY_ELEMENT)));
  assert.ok(batches.some(b => b.treeId === 'ctx-bg' && b.ops.some(op => op.opcode === EntryOpcode.DESTROY_ELEMENT)));

  // Subsequent daemon dispatch on stashed manager1 produces no responses.
  assert.equal(daemonClientManager.dispatch(2, {}).length, 0);

  // Update & unload MainPage module before restoreData on manager2 (as ModuleLoader.unload does).
  registerModule('app_pages/src/MainPage', (mod, req) => {
    const { createElement, insert, setProp } = req('solid_native/src/renderer');
    const { onPageShow, onPageHide } = req('solid_native/src/bridge');
    mod.exports = {
      MainPage(props: any) {
        onPageShow(() => events.push(`restored:show:${props.contextId}`));
        onPageHide(() => events.push(`restored:hide:${props.contextId}`));
        const rootView = createElement('view');
        const label = createElement('label');
        setProp(
          label,
          'value',
          `restored-v2:${props.initialViewModel.title}->${props.viewModel().title}`,
        );
        insert(rootView, label);
        return rootView;
      },
    };
  });
  harness.unloadModule('app_pages/src/MainPage');

  const manager2 = bridge.createRootComponentsManager();
  assert.equal(daemonListeners.length, 1);

  batches.length = 0;
  events.length = 0;
  debugMessages.length = 0;
  // Exclude ctx-throw-dispose so restore stays clean.
  manager2.restoreData(stashed.filter((s: any) => s.contextId !== 'ctx-throw-dispose'));
  await new Promise(resolve => setTimeout(resolve, 10));

  assert.equal(hotReloadListeners.length, 2);
  assert.ok(
    batches.some(
      b =>
        b.treeId === 'ctx-main' &&
        b.ops.some(
          op =>
            op.opcode === EntryOpcode.SET_ATTRIBUTE_ATTACHED_VALUE &&
            op.value === 'restored-v2:initial->latest-main',
        ),
    ),
  );
  // Only visible restored page fires onPageShow; background page does not fire show or hide.
  assert.deepEqual(events, ['restored:show:ctx-main']);

  const restoreDebug = debugMessages.filter(m => m.level === 0 && m.message.startsWith('Reloaded '));
  assert.equal(restoreDebug.length, 1);
  assert.equal(restoreDebug[0].message, 'Reloaded 2 from MainPage@app_pages/src/MainPage');

  // Verify inspector now queries manager2 cleanly.
  const listRes2 = daemonClientManager.dispatch(2, {});
  assert.deepEqual(listRes2[0].body, [
    { id: 'ctx-main', rootComponentName: 'MainPage' },
    { id: 'ctx-bg', rootComponentName: 'MainPage' },
  ]);

  manager2.destroy('ctx-main');
  manager2.destroy('ctx-bg');
});

test('solid_native exposes fine-grained reactive props.insets getters that update on safe-area changes and stay frozen on unchanged updates', async () => {
  const harness = createSolidTestHarness();
  const { bridge, batches, registerModule } = harness;
  let topEffectRuns = 0;
  let leftEffectRuns = 0;
  let capturedInsets: any;

  registerModule('app_pages/src/InsetsPage', (mod, req) => {
    const { createElement, effect, insert, setProp } = req('solid_native/src/renderer');
    mod.exports = {
      InsetsPage(props: any) {
        const { insets } = props;
        capturedInsets = insets;
        const container = createElement('view');
        const label = createElement('label');
        effect(
          () => insets.top,
          (top: number) => {
            topEffectRuns++;
            setProp(container, 'paddingTop', top);
          },
        );
        effect(
          () => insets.left,
          (left: number) => {
            leftEffectRuns++;
            setProp(label, 'value', `left:${left}`);
          },
        );
        insert(container, label);
        return container;
      },
    };
  });

  const manager = bridge.createRootComponentsManager();
  manager.create(
    'ctx-insets',
    'InsetsPage@app_pages/src/InsetsPage',
    { visible: true, insets: { top: 24, bottom: 20, left: 0, right: 0 }, params: {} },
    {},
  );

  assert.deepEqual(Object.keys(capturedInsets), ['top', 'bottom', 'left', 'right']);
  assert.throws(() => {
    capturedInsets.top = 999;
  }, TypeError);
  assert.equal(topEffectRuns, 1);
  assert.equal(leftEffectRuns, 1);

  // Visibility change with identical insets must not re-run either insets effect.
  batches.length = 0;
  manager.render('ctx-insets', {
    visible: false,
    insets: { top: 24, bottom: 20, left: 0, right: 0 },
    params: {},
  });
  harness.solid.flush();
  await Promise.resolve();
  assert.equal(topEffectRuns, 1);
  assert.equal(leftEffectRuns, 1);

  // Rotating to landscape updates top/left and fires only the matching edge effects.
  manager.render('ctx-insets', {
    visible: false,
    insets: { top: 12, bottom: 20, left: 48, right: 0 },
    params: {},
  });
  harness.solid.flush();
  await Promise.resolve();
  assert.equal(topEffectRuns, 2);
  assert.equal(leftEffectRuns, 2);
  assert.equal(capturedInsets.top, 12);
  assert.equal(capturedInsets.left, 48);
  assert.ok(batches.some(b => b.ops.some(op => op.attr === 'paddingTop' && op.value === 12)));
  assert.ok(batches.some(b => b.ops.some(op => op.attr === 'value' && op.value === 'left:48')));

  manager.destroy('ctx-insets');
});
