import assert from 'node:assert/strict';
import { createHash } from 'node:crypto';
import { existsSync, readFileSync, readdirSync } from 'node:fs';
import path from 'node:path';
import test from 'node:test';
import vm from 'node:vm';
import ts from 'typescript';

const root = path.resolve(import.meta.dirname, '../..');
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
  const program = ts.createProgram([pageFile], parsed.options);
  const diagnostics = ts.getPreEmitDiagnostics(program);
  assert.deepEqual(diagnostics.map(error => ts.flattenDiagnosticMessageText(error.messageText, '\n')), []);
});

// The real page executes against native/platform boundaries. Rendering is not invoked.
// This exercises both initial load and the offline reload through real lifecycle/cleanup code.
for (const android of [true, false]) {
  test(`business page loads its own ${android ? 'Android asset' : 'iOS bundle'} sample and releases it`, async () => {
    const sources: string[] = [];
    const commands: string[] = [];
    let protectedCalls = 0;
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
    class Page {
      renderer = { contextId: 42 };
      viewModel = { visible: true };
      state = {};
      setState(update: object) { Object.assign(this.state, update); }
    }
    const boundaries: Record<string, unknown> = {
      'app_video/src/Video': { getHost: () => host },
      'valdi_core/src/Device': { Device: { isAndroid: () => android } },
      'valdi_core/src/NativeReferences': {
        asyncWithProtectedRefsForContextId(id: number, operation: () => unknown) {
          assert.equal(id, 42);
          protectedCalls++;
          return operation();
        },
      },
      'valdi_core/src/Style': { Style: class {} },
      'valdi_core/src/SystemFont': { systemFont() {}, systemSemiboldFont() {} },
      '../../components/Button': {},
      '../../components/NavigationBar': {},
      'app_foundation/src/page/PageComponent': { Page },
      '../../components/theme': { color: {}, tokens: { space: {}, radius: {} } },
    };
    const module = { exports: {} as { VideoPage: new () => any } };
    vm.runInNewContext(`(function(require, module, exports) { ${pageCode}\n})`, {}, { filename: pageFile })(
      (name: string) => {
        assert.ok(Object.hasOwn(boundaries, name), `Unexpected dependency ${name}`);
        return boundaries[name];
      }, module, module.exports,
    );
    const page = new module.exports.VideoPage();
    const settle = () => new Promise(resolve => setImmediate(resolve));
    page.onCreate();
    await settle();
    assert.equal(page.state.source, 'valdi-video://test-1');
    page.handleOffline();
    await settle();
    assert.equal(page.state.source, 'valdi-video://test-2');
    page.onDestroy();
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
