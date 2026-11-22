import assert from 'node:assert/strict';
import { createHash } from 'node:crypto';
import { existsSync, readFileSync, readdirSync } from 'node:fs';
import path from 'node:path';
import test from 'node:test';
import vm from 'node:vm';
import ts from 'typescript';

const root = path.resolve(import.meta.dirname, '../../..');
const modules = path.join(root, 'valdi/modules');
const pageFile = path.join(modules, 'app_pages/src/features/video/VideoPage.tsx');
const pageCode = ts.transpileModule(readFileSync(pageFile, 'utf8'), {
  fileName: pageFile,
  compilerOptions: { target: ts.ScriptTarget.ES2020, module: ts.ModuleKind.CommonJS, jsx: ts.JsxEmit.React },
}).outputText;

test('video page and generic host typecheck with the application configuration', () => {
  const directory = path.join(modules, 'app_pages');
  const configFile = path.join(directory, 'tsconfig.json');
  const config = ts.readConfigFile(configFile, ts.sys.readFile);
  assert.equal(config.error, undefined);
  const parsed = ts.parseJsonConfigFileContent(config.config, ts.sys, directory, { noEmit: true }, configFile);
  assert.deepEqual(parsed.errors, []);
  const program = ts.createProgram([pageFile, path.join(modules, 'solid_native/src/jsx.d.ts')], parsed.options);
  const diagnostics = ts.getPreEmitDiagnostics(program);
  assert.deepEqual(diagnostics.map(error => ts.flattenDiagnosticMessageText(error.messageText, '\n')), []);
});

// The real page executes against native/platform boundaries. Solid signals and cleanups
// are supplied in memory so lifecycle methods and cleanup guards execute unchanged.
for (const android of [true, false]) {
  test(`business page loads its own ${android ? 'Android asset' : 'iOS bundle'} sample and releases it`, async () => {
    const sources: string[] = [];
    const commands: string[] = [];
    let protectedCalls = 0;
    const cleanups: (() => void)[] = [];
    const buttons = new Map<string, () => void>();
    const signalGetters: Array<() => unknown> = [];
    let sourceSignalIndex = -1;

    const host = {
      async create(source: string) {
        sources.push(source);
        const id = sources.length;
        return {
          getSource: () => `valdi-video://test-${id}`,
          async setPageVisible(visible: boolean) { assert.equal(visible, true); },
          async subscribe() {
            return { unsubscribe() { commands.push(`unsubscribe-${id}`); return Promise.resolve(); } };
          },
          release() { commands.push(`release-${id}`); return Promise.resolve(); },
        };
      },
    };
    const React = {
      Fragment: Symbol('Fragment'),
      createElement(type: unknown, props: Record<string, any> | null) {
        if (type === 'Button' && props?.id && typeof props.onTap === 'function') {
          buttons.set(props.id, props.onTap);
        }
        return { type, props };
      },
    };
    const boundaries: Record<string, unknown> = {
      'app_video/src/Video': { getHost: () => host },
      'solid-js': {
        createSignal<T>(initial: T) {
          let value = initial;
          const idx = signalGetters.length;
          const get = () => value;
          if (sourceSignalIndex < 0 && idx === 0) sourceSignalIndex = idx;
          signalGetters.push(get);
          const set = (next: T | ((prev: T) => T)) => {
            value = typeof next === 'function' ? (next as (prev: T) => T)(value) : next;
            return value;
          };
          return [get, set];
        },
        onCleanup: (fn: () => void) => cleanups.push(fn),
        Show: () => null,
      },
      'solid_native/src/bridge': {
        onPageShow: () => () => {},
        onPageHide: () => () => {},
      },
      'valdi_core/src/Device': { Device: { isAndroid: () => android } },
      'valdi_core/src/NativeReferences': {
        asyncWithProtectedRefsForContextId(id: string, operation: () => unknown) {
          assert.equal(id, '42');
          protectedCalls++;
          return operation();
        },
      },
      'valdi_core/src/Style': { Style: class {} },
      'valdi_core/src/SystemFont': { systemFont() {}, systemSemiboldFont() {} },
      '../../components/Button': { Button: 'Button' },
      '../../components/NavigationBar': { NavigationBar: 'NavigationBar' },
      '../../components/usePageStatusBar': { usePageStatusBar: () => () => {} },
      '../../components/theme': { color: {}, tokens: { space: {}, radius: {} } },
    };
    const module = { exports: {} as { VideoPage: (props: any) => any } };
    vm.runInNewContext(`(function(require, module, exports, React) { ${pageCode}\n})`, {}, { filename: pageFile })(
      (name: string) => {
        assert.ok(Object.hasOwn(boundaries, name), `Unexpected dependency ${name}`);
        return boundaries[name];
      }, module, module.exports, React,
    );
    const settle = () => new Promise(resolve => setImmediate(resolve));
    module.exports.VideoPage({
      contextId: '42',
      viewModel: () => ({ visible: true }),
      initialViewModel: { visible: true, insets: { top: 0, bottom: 0, left: 0, right: 0 } },
      insets: { top: 0, bottom: 0, left: 0, right: 0 },
      params: {},
      context: { back() {}, finish() {} },
    });
    await settle();
    assert.equal(signalGetters[sourceSignalIndex](), 'valdi-video://test-1');
    const reloadOffline = buttons.get('video-offline');
    assert.ok(reloadOffline, 'Expected video-offline Button handler');
    reloadOffline();
    await settle();
    assert.equal(signalGetters[sourceSignalIndex](), 'valdi-video://test-2');
    for (const fn of cleanups) fn();
    // Both commands must already be submitted before the first cleanup await.
    assert.deepEqual(commands, ['unsubscribe-1', 'release-1', 'unsubscribe-2', 'release-2']);
    await settle();
    assert.deepEqual(sources, Array(2).fill(android ? 'asset:///flower.mp4' : 'bundle:///flower.mp4'));
    assert.equal(protectedCalls, 4); // initial load, reload, previous close, destroy close
  });
}

test('sample payload and complete provenance belong to the business module', () => {
  const assets = path.join(modules, 'app_pages/assets');
  const sample = readFileSync(path.join(assets, 'flower.mp4'));
  const provenance = JSON.parse(readFileSync(path.join(assets, 'flower.source.json'), 'utf8'));
  assert.equal(createHash('sha256').update(sample).digest('hex'), provenance.sha256);
  const gitHeader = Buffer.from(`blob ${sample.length}\0`);
  assert.equal(createHash('sha1').update(gitHeader).update(sample).digest('hex'), provenance.gitBlobSha1);
  assert.match(readFileSync(path.join(assets, 'MDN-LICENSE.txt'), 'utf8'), /CC0/);
  const genericAssets = path.join(modules, 'app_video/assets');
  assert.deepEqual(existsSync(genericAssets) ? readdirSync(genericAssets) : [], []);
  for (const file of ['src/VideoHost.ts', 'android/VideoHostImpl.kt', 'ios/VRVideoService.m', 'ios/VRVideoSource.m']) {
    assert.doesNotMatch(readFileSync(path.join(modules, 'app_video', file), 'utf8'), /getDemoSource|flower\.mp4/);
  }
});
