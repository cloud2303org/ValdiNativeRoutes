import assert from 'node:assert/strict';
import { execFileSync } from 'node:child_process';
import { existsSync, mkdtempSync, readFileSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import path from 'node:path';
import test from 'node:test';
import vm from 'node:vm';
import ts from 'typescript';
import { unpack } from '../archive';
import { appModule, buildModule, root, valdiSourceRoot } from '../pipeline';
import { compileRuntimeModule } from '../runtime-module';
import { valdiTs } from '../valdiTs';

const sourceRoot = valdiSourceRoot();
assert.ok(sourceRoot, 'Prepare Valdi sources or set VALDI_SOURCE_ROOT');
const modulePrefix = 'src/valdi_modules/src/valdi';

const runtimeMode = process.env.BOTTOM_SHEET_RUNTIME ?? 'source';
assert.ok(
  ['source', 'android', 'ios'].includes(runtimeMode),
  'BOTTOM_SHEET_RUNTIME must be source, android or ios',
);

let sourceRuntimePromise: Promise<Map<string, Buffer>> | undefined;

function buildSourceRuntimeModules(): Promise<Map<string, Buffer>> {
  if (sourceRuntimePromise) return sourceRuntimePromise;
  sourceRuntimePromise = (async () => {
    const out = new Map<string, Buffer>();
    const temporary = mkdtempSync(path.join(tmpdir(), 'bottom-sheet-runtime-'));
    try {
      const modules: [string, string][] = [
        ['coreutils', 'SCCCoreutils'],
        ['valdi_tsx', 'SCCValdiTsx'],
        ['valdi_core', 'SCCValdiCore'],
      ];
      for (const [name, iosModuleName] of modules) {
        const moduleDirectory = path.join(sourceRoot!, modulePrefix, name);
        const sources = ['src', 'types']
          .map(folder => path.join(moduleDirectory, folder))
          .filter(existsSync)
          .flatMap(folder => ts.sys.readDirectory(folder, ['.ts', '.tsx', '.js']));
        const archivePath = path.join(temporary, `${name}.valdimodule`);
        await compileRuntimeModule({
          name,
          frameworkRoot: sourceRoot!,
          moduleDirectory,
          sources,
          outputs: [
            {
              relative: `android/debug/assets/${name}.valdimodule`,
              path: archivePath,
              directory: false,
            },
          ],
          dependencies: [
            'coreutils',
            'drawing',
            'jasmine',
            'source_map',
            'valdi_core',
            'valdi_tsx',
          ].map(module_name => ({
            module_name,
            module_path: '',
            module_content: '',
          })),
          iosModuleName,
          iosClassPrefix: '__valdi_unset_ios_class_prefix__',
          androidClassPath: `com.snap.modules.${name}`,
          disableAnnotations: false,
          asyncStrictMode: false,
          compilationMode: 'js',
        });
        for (const [file, content] of unpack(readFileSync(archivePath))) {
          out.set(`${name}/${file}`, content);
        }
      }
      return out;
    } finally {
      rmSync(temporary, { recursive: true, force: true });
    }
  })();
  return sourceRuntimePromise;
}

async function loadRuntimeModules(platform: 1 | 2): Promise<Map<string, Buffer>> {
  if (runtimeMode === 'source') return buildSourceRuntimeModules();
  const out = new Map<string, Buffer>();
  for (const name of ['valdi_core', 'coreutils', 'valdi_tsx']) {
    const bytes =
      platform === 1
        ? execFileSync(
            'unzip',
            ['-p', path.join(root, 'android/app/libs/valdi_runtime.aar'), `assets/${name}.valdimodule`],
            { maxBuffer: 32 * 1024 * 1024 },
          )
        : readFileSync(
            path.join(
              root,
              'ios/Frameworks/ValdiRuntime.xcframework/ios-arm64/ValdiRuntime.framework',
              `${name}.valdimodule`,
            ),
          );
    for (const [file, content] of unpack(bytes)) {
      out.set(`${name}/${file}`, content);
    }
  }
  return out;
}

function createHost(platform: 1 | 2, entries: Map<string, Buffer>, runtimeEntries: Map<string, Buffer>) {
  const modulesRoot = path.join(sourceRoot!, modulePrefix);
  const cache = new Map<string, { exports: any }>();
  const context = vm.createContext({
    console,
    setTimeout,
    clearTimeout,
    runtime: {
      getCurrentPlatform: () => platform,
      getCurrentContext: () => 'bottom-sheet-test',
      internString: (v: string) => v,
      getAttributeId: () => 0,
    },
  });
  vm.runInContext('global = globalThis;', context);

  function load(id: string, from = ''): any {
    if (id.startsWith('.')) {
      id = path.posix.normalize(path.posix.join(path.posix.dirname(from), id));
    }
    id = id.replace(/\.js$/, '');
    if (cache.has(id)) return cache.get(id)!.exports;

    if (id === 'valdi_core/src/BuildType') {
      return { isDevBuild: () => true, isDebugEnabled: () => false };
    }
    if (id === 'valdi_core/src/DeviceBridge') {
      return {
        getSystemType: () => (platform === 1 ? 'android' : 'ios'),
        isRTL: () => false,
        isDarkMode: () => false,
        observeDisplayInsetChange: () => ({ cancel() {} }),
        observeDisplaySizeChange: () => ({ cancel() {} }),
        observeDarkMode: () => ({ cancel() {} }),
      };
    }
    if (id === 'valdi_core/src/debugging/DaemonClientManager') {
      return { DaemonClientManager: class { addListener() {} } };
    }
    if (id === 'app_ui/src/AppUI') {
      return {};
    }
    if (id === 'theme_bridge/src/ThemeBridge') {
      const light = {
        surface: '#ffffff',
        text: '#172033',
        muted: '#667085',
        hairline: '#ececec',
        handle: '#D6DCE5',
        scrim: 'rgba(16,24,40,0.32)',
        buttonPrimary: '#1e62d0',
        buttonOnPrimary: '#ffffff',
        buttonSecondary: '#eef2f7',
        buttonOnSecondary: '#1d2939',
      };
      const dark = {
        surface: '#1E1F23',
        text: '#ffffff',
        muted: '#969696',
        hairline: '#2A2B32',
        handle: '#969696',
        scrim: 'rgba(0,0,0,0.75)',
        buttonPrimary: '#377dff',
        buttonOnPrimary: '#ffffff',
        buttonSecondary: '#2c2e35',
        buttonOnSecondary: '#f2f4f7',
      };
      return {
        getHost: () => ({
          getTokens: () => ({
            light,
            dark,
            shared: { radius: { sheet: 22 } },
          }),
        }),
      };
    }

    const bytes = entries.get(`${id}.js`) ?? runtimeEntries.get(`${id}.js`);
    let code = bytes?.toString();
    if (!code) {
      const base = path.join(modulesRoot, id);
      const file = [base + '.ts', base + '.tsx', base + '.js', base + '.d.ts'].find(existsSync);
      assert.ok(file, `Missing runtime module ${id}`);
      code = file.endsWith('.js')
        ? readFileSync(file, 'utf8')
        : ts.transpileModule(readFileSync(file, 'utf8'), {
            fileName: file.replace(/\.d\.ts$/, '.ts'),
            compilerOptions: {
              target: ts.ScriptTarget.ES2021,
              module: ts.ModuleKind.CommonJS,
            },
          }).outputText;
    }

    const mod = { exports: {} };
    cache.set(id, mod);
    vm.runInContext(`(function(require,module,exports){${code}\n})`, context, {
      filename: id,
    })((dep: string) => load(dep, id), mod, mod.exports);
    return mod.exports;
  }

  const { jsx } = load('valdi_core/src/JSXBootstrap');
  const { Renderer } = load('valdi_core/src/Renderer');
  const { RendererTestDelegate } = load('valdi_test/test/RendererTestDelegate');
  const delegate = new RendererTestDelegate();
  const renderer = new Renderer('bottom-sheet-test', undefined, delegate);
  return { load, jsx, renderer, delegate };
}

test('app_ui bottom_sheet aligns with @swmansion/react-native-bottom-sheet v1.1.0 API and Valdi runtime on Android and iOS', async () => {
  const uiModule = appModule('app_ui');
  const uiPlugin = valdiTs(uiModule);
  const commonModule = appModule('native_common');
  const commonPlugin = valdiTs(commonModule);
  const foundationModule = appModule('app_foundation');
  const foundationPlugin = valdiTs(foundationModule);

  const allEntries = new Map<string, Buffer>();
  try {
    assert.equal(uiPlugin.diagnostics(), '');
    for (const [mod, plug] of [
      [uiModule, uiPlugin],
      [commonModule, commonPlugin],
      [foundationModule, foundationPlugin],
    ] as const) {
      const built = await buildModule(mod, plug, false);
      for (const [name, bytes] of built.entries) {
        allEntries.set(`${mod.name}/${name}`, bytes);
      }
    }
  } finally {
    uiPlugin.dispose();
    commonPlugin.dispose();
    foundationPlugin.dispose();
  }

  const platforms: (1 | 2)[] =
    runtimeMode === 'android' ? [1] : runtimeMode === 'ios' ? [2] : [1, 2];
  for (const platform of platforms) {
    const runtimeEntries = await loadRuntimeModules(platform);
    const h = createHost(platform, allEntries, runtimeEntries);
    const api = h.load('app_ui/src/index');
    const utils = h.load('app_ui/src/bottom_sheet/bottomSheetUtils');
    const placement = h.load('app_ui/src/bottom_sheet/cardPlacement');

    // 1. Public exports exist on app_ui root
    assert.equal(typeof api.BottomSheet, 'function');
    assert.equal(typeof api.ModalBottomSheet, 'function');
    assert.equal(typeof api.BottomSheetProvider, 'function');

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

    // 3. SurfaceStyle & CSS boxShadow + settleDuration validation
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

    // 4. Render BottomSheetProvider + ModalBottomSheet + BottomSheet in Valdi Renderer
    const expectedPortalClass =
      platform === 1
        ? 'io.valdiroutes.app.BottomSheetPortalHostView'
        : 'VRBottomSheetPortalHostView';
    const expectedSheetClass =
      platform === 1 ? 'io.valdiroutes.app.BottomSheetView' : 'VRBottomSheetView';

    const positionEvents: any[] = [];
    const indexEvents: number[] = [];
    const settleEvents: number[] = [];
    let closeRequests = 0;

    const { Component } = h.load('valdi_core/src/Component');
    const jsxRuntime = h.load('valdi_core/src/JSX').jsx;
    const providerProto = jsxRuntime.makeComponentPrototype();
    const modalProto = jsxRuntime.makeComponentPrototype();
    const viewProto = jsxRuntime.makeNodePrototype('view', []);
    const labelProto = jsxRuntime.makeNodePrototype('label', ['value', 'Sheet Body']);

    class Harness extends Component {
      declare viewModel: { modalIndex: number };
      onRender(): void {
        const { BottomSheetProvider, ModalBottomSheet } = api;
        jsxRuntime.beginComponent(BottomSheetProvider, providerProto, undefined, undefined);
        jsxRuntime.setUnnamedSlot(() => {
          jsxRuntime.beginRender(viewProto, undefined);
          jsxRuntime.endRender();
          jsxRuntime.beginComponent(ModalBottomSheet, modalProto, undefined, undefined);
          jsxRuntime.setViewModelProperties({
            detents: [0, { value: 280, insets: { horizontal: 16 } }, '85%'],
            index: this.viewModel.modalIndex,
            maxWidth: 480,
            placement: 'end',
            lazy: true,
            settleDuration: 400,
            scrimColor: 'rgba(0, 0, 0, 0.5)',
            onIndexChange: (i: number) => indexEvents.push(i),
            onSettle: (i: number) => settleEvents.push(i),
            onPositionChange: (e: any) => positionEvents.push(e),
            onCloseRequest: () => {
              closeRequests += 1;
            },
          });
          jsxRuntime.setUnnamedSlot(() => {
            jsxRuntime.beginRender(labelProto, undefined);
            jsxRuntime.endRender();
          });
          jsxRuntime.endComponent();
        });
        jsxRuntime.endComponent();
      }
    }

    const harnessProto = jsxRuntime.makeComponentPrototype();

    // Initial closed render (index=0 -> 0pt detent) with lazy=true:
    // sheet host exists in portal, but 'Sheet Body' label is deferred!
    h.renderer.renderRootComponent(Harness, harnessProto, { modalIndex: 0 }, undefined);

    const initialEntries = h.delegate.requests.flatMap((r: any) => r.entries);
    const createdClasses = initialEntries
      .filter((e: any) => e.type === 'CreateElement')
      .map((e: any) => e.className);
    assert.ok(createdClasses.includes(expectedPortalClass), `Expected ${expectedPortalClass}`);
    assert.ok(createdClasses.includes(expectedSheetClass), `Expected ${expectedSheetClass}`);
    const initialLabels = initialEntries.filter(
      (e: any) => e.type === 'SetElementAttribute' && e.name === 'value' && e.value === 'Sheet Body',
    );
    assert.equal(initialLabels.length, 0, 'lazy=true must defer children while closed at index=0');

    // Verify detents wire format carries maxWidth & placementBias and pre-geometry children get maxWidth
    const detentsAttr = initialEntries
      .filter((e: any) => e.type === 'SetElementAttribute' && e.name === 'detents')
      .at(-1)?.value;
    assert.equal(detentsAttr[1].maxWidth, 480);
    assert.equal(detentsAttr[1].placementBias, 1);
    const preGeomMaxWidths = initialEntries.filter(
      (e: any) => e.type === 'SetElementAttribute' && e.name === 'maxWidth' && e.value === 480,
    );
    assert.equal(preGeomMaxWidths.length, 2, 'SurfaceView and ContentWrapperView cap pre-geometry maxWidth');

    // Open modal sheet to index=1 (280pt) -> lazy children mount and native callbacks wire through!
    h.delegate.clear();
    h.renderer.renderRootComponent(Harness, harnessProto, { modalIndex: 1 }, undefined);
    const openEntries = h.delegate.requests.flatMap((r: any) => r.entries);
    const openLabels = openEntries.filter(
      (e: any) => e.type === 'SetElementAttribute' && e.name === 'value' && e.value === 'Sheet Body',
    );
    assert.equal(openLabels.length, 1, 'lazy children mount when index points to an open detent');

    // Locate native callbacks on the sheet element and exercise them
    const allAttrs = [...initialEntries, ...openEntries].filter(
      (e: any) => e.type === 'SetElementAttribute',
    );
    const onNativeGeom = allAttrs.filter((e: any) => e.name === 'onNativeGeometry').at(-1)?.value;
    const onNativePos = allAttrs.filter((e: any) => e.name === 'onNativePositionChange').at(-1)?.value;
    const onNativeIdx = allAttrs.filter((e: any) => e.name === 'onNativeIndexChange').at(-1)?.value;
    const onNativeSettle = allAttrs.filter((e: any) => e.name === 'onNativeSettle').at(-1)?.value;
    const onNativeClose = allAttrs.filter((e: any) => e.name === 'onNativeCloseRequest').at(-1)?.value;

    assert.equal(typeof onNativeGeom, 'function');
    h.delegate.clear();
    onNativeGeom(480, 680, 800, 544, 1024);
    const geomEntries = h.delegate.requests.flatMap((r: any) => r.entries);
    const committedInset = geomEntries
      .filter((e: any) => e.type === 'SetElementAttribute' && e.name === 'committedContentRegionInset')
      .at(-1)?.value;
    assert.equal(committedInset, 544);

    assert.equal(typeof onNativePos, 'function');
    onNativePos(140, -0.5);
    assert.equal(positionEvents.length, 1);
    assert.deepEqual(JSON.parse(JSON.stringify(positionEvents[0])), {
      nativeEvent: { position: 140, index: -0.5 },
    });

    onNativeIdx(1);
    assert.deepEqual(indexEvents, [1]);

    onNativeSettle(1);
    assert.deepEqual(settleEvents, [1]);

    onNativeClose();
    assert.equal(closeRequests, 1);
  }
});

test('AppSheetOverlay renders actionSheet, picker, and datePicker exclusively via Valdi BottomSheet + WheelPickers on Android and iOS', async () => {
  const uiModule = appModule('app_ui');
  const uiPlugin = valdiTs(uiModule);
  const commonModule = appModule('native_common');
  const commonPlugin = valdiTs(commonModule);
  const foundationModule = appModule('app_foundation');
  const foundationPlugin = valdiTs(foundationModule);

  const allEntries = new Map<string, Buffer>();
  try {
    assert.equal(uiPlugin.diagnostics(), '');
    for (const [mod, plug] of [
      [uiModule, uiPlugin],
      [commonModule, commonPlugin],
      [foundationModule, foundationPlugin],
    ] as const) {
      const built = await buildModule(mod, plug, false);
      for (const [name, bytes] of built.entries) {
        allEntries.set(`${mod.name}/${name}`, bytes);
      }
    }
  } finally {
    uiPlugin.dispose();
    commonPlugin.dispose();
    foundationPlugin.dispose();
  }

  function findAccessibilityTap(entries: any[], accessibilityId: string): () => void {
    let targetElementId: number | undefined;
    for (const entry of entries) {
      if (
        entry.type === 'SetElementAttribute' &&
        entry.name === 'accessibilityId' &&
        entry.value === accessibilityId
      ) {
        targetElementId = entry.id;
      }
    }
    assert.notEqual(targetElementId, undefined, `Missing element with accessibilityId=${accessibilityId}`);
    const tapAttr = entries
      .filter(
        (e: any) =>
          e.type === 'SetElementAttribute' && e.id === targetElementId && e.name === 'onTap',
      )
      .at(-1);
    assert.equal(typeof tapAttr?.value, 'function', `Missing onTap on ${accessibilityId}`);
    return tapAttr.value;
  }

  const platforms: (1 | 2)[] =
    runtimeMode === 'android' ? [1] : runtimeMode === 'ios' ? [2] : [1, 2];
  for (const platform of platforms) {
    const runtimeEntries = await loadRuntimeModules(platform);
    // 1. ActionSheet inline (<=6 items) + selection -> close -> onDismissed
    {
      const h = createHost(platform, allEntries, runtimeEntries);
      const jsxRuntime = h.load('valdi_core/src/JSX').jsx;
      const { AppSheetOverlay } = h.load('app_ui/src/sheet_presenter/AppSheetOverlay');
      const proto = jsxRuntime.makeComponentPrototype();

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

      const baseVm = {
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
      };

      h.renderer.renderRootComponent(AppSheetOverlay, proto, baseVm, ctx);
      const entries = h.delegate.requests.flatMap((r: any) => r.entries);
      const scrollCreated = entries.filter(
        (e: any) => e.type === 'CreateElement' && e.viewClass === 'SCValdiScrollView',
      );
      assert.equal(scrollCreated.length, 0, '<=6 items should render inline without scroll');

      const tapSecond = findAccessibilityTap(entries, 'action-sheet-item-1');
      h.delegate.clear();
      tapSecond();
      assert.deepEqual(selected, [1]);

      const closeEntries = h.delegate.requests.flatMap((r: any) => r.entries);
      const reqIdx = closeEntries
        .filter((e: any) => e.type === 'SetElementAttribute' && e.name === 'detentIndex')
        .at(-1)?.value;
      assert.equal(reqIdx, -1);

      const onNativeSettle = entries
        .filter((e: any) => e.type === 'SetElementAttribute' && e.name === 'onNativeSettle')
        .at(-1)?.value;
      onNativeSettle(-1);
      assert.equal(dismissed, 1);
    }

    // 2. ActionSheet >6 items mounts Valdi <scroll>
    {
      const h = createHost(platform, allEntries, runtimeEntries);
      const jsxRuntime = h.load('valdi_core/src/JSX').jsx;
      const { AppSheetOverlay } = h.load('app_ui/src/sheet_presenter/AppSheetOverlay');
      const proto = jsxRuntime.makeComponentPrototype();
      const ctx = {
        onSelect: () => {},
        onConfirm: () => {},
        onCancel: () => {},
        onDismissed: () => {},
      };
      h.renderer.renderRootComponent(
        AppSheetOverlay,
        proto,
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
        ctx,
      );
      const entries = h.delegate.requests.flatMap((r: any) => r.entries);
      const createdScroll = entries.some(
        (e: any) => e.type === 'CreateElement' && String(e.className).includes('Scroll'),
      );
      assert.ok(createdScroll, '>6 action sheet items must mount a Valdi scroll container');
    }

    // 3. ColumnPicker sheet: wheel change + confirm -> onConfirm(value, index) -> onDismissed
    {
      const h = createHost(platform, allEntries, runtimeEntries);
      const jsxRuntime = h.load('valdi_core/src/JSX').jsx;
      const { AppSheetOverlay } = h.load('app_ui/src/sheet_presenter/AppSheetOverlay');
      const proto = jsxRuntime.makeComponentPrototype();

      const confirmed: Array<{ value: string; index: number }> = [];
      let dismissed = 0;
      const ctx = {
        onSelect: () => assert.fail('unexpected onSelect'),
        onConfirm: (value: string, index: number) => confirmed.push({ value, index }),
        onCancel: () => assert.fail('unexpected onCancel'),
        onDismissed: () => {
          dismissed += 1;
        },
      };

      h.renderer.renderRootComponent(
        AppSheetOverlay,
        proto,
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
        ctx,
      );

      const entries = h.delegate.requests.flatMap((r: any) => r.entries);
      const expectedWheelClass =
        platform === 1 ? 'io.valdiroutes.app.ColumnWheelView' : 'VRColumnWheelView';
      assert.ok(
        entries.some((e: any) => e.type === 'CreateElement' && e.className === expectedWheelClass),
        `Expected ${expectedWheelClass}`,
      );

      const wheelOnChange = entries
        .filter((e: any) => e.type === 'SetElementAttribute' && e.name === 'onChange')
        .at(-1)?.value;
      assert.equal(typeof wheelOnChange, 'function');
      wheelOnChange('sz');

      const tapConfirm = findAccessibilityTap(entries, 'sheet-confirm-button');
      tapConfirm();
      assert.deepEqual(confirmed, [{ value: 'sz', index: 2 }]);

      const onNativeSettle = entries
        .filter((e: any) => e.type === 'SetElementAttribute' && e.name === 'onNativeSettle')
        .at(-1)?.value;
      onNativeSettle(-1);
      assert.equal(dismissed, 1);
    }

    // 4. DatePicker sheet + host external cancellation (`open: false`) + pre-render `open: false`
    {
      const h = createHost(platform, allEntries, runtimeEntries);
      const jsxRuntime = h.load('valdi_core/src/JSX').jsx;
      const { AppSheetOverlay } = h.load('app_ui/src/sheet_presenter/AppSheetOverlay');
      const proto = jsxRuntime.makeComponentPrototype();

      let dismissed = 0;
      const ctx = {
        onSelect: () => {},
        onConfirm: () => {},
        onCancel: () => {},
        onDismissed: () => {
          dismissed += 1;
        },
      };

      const vm = {
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
      h.renderer.renderRootComponent(AppSheetOverlay, proto, vm, ctx);
      const entries = h.delegate.requests.flatMap((r: any) => r.entries);
      const expectedTimeWheelClass =
        platform === 1 ? 'io.valdiroutes.app.TimeWheelView' : 'VRTimeWheelView';
      assert.ok(
        entries.some((e: any) => e.type === 'CreateElement' && e.className === expectedTimeWheelClass),
        `Expected ${expectedTimeWheelClass}`,
      );

      // Host cancels presentation externally (`open: false`)
      h.delegate.clear();
      h.renderer.renderRootComponent(AppSheetOverlay, proto, { ...vm, open: false }, ctx);
      const cancelEntries = h.delegate.requests.flatMap((r: any) => r.entries);
      const reqIdx = cancelEntries
        .filter((e: any) => e.type === 'SetElementAttribute' && e.name === 'detentIndex')
        .at(-1)?.value;
      assert.equal(reqIdx, -1);

      const onNativeSettle = entries
        .filter((e: any) => e.type === 'SetElementAttribute' && e.name === 'onNativeSettle')
        .at(-1)?.value;
      onNativeSettle(-1);
      assert.equal(dismissed, 1);

      // Pre-render open: false dispatches onDismissed immediately without hanging
      const h2 = createHost(platform, allEntries, runtimeEntries);
      const jsx2 = h2.load('valdi_core/src/JSX').jsx;
      const { AppSheetOverlay: Overlay2 } = h2.load('app_ui/src/sheet_presenter/AppSheetOverlay');
      let preRenderDismissed = 0;
      h2.renderer.renderRootComponent(
        Overlay2,
        jsx2.makeComponentPrototype(),
        { ...vm, open: false },
        { ...ctx, onDismissed: () => (preRenderDismissed += 1) },
      );
      assert.equal(preRenderDismissed, 1);
    }
  }
});
