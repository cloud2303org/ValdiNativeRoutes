import assert from 'node:assert/strict';
import { createHash } from 'node:crypto';
import { existsSync, mkdtempSync, readFileSync, readdirSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import path from 'node:path';
import test from 'node:test';
import vm from 'node:vm';
import { unpack } from './archive';
import { compileNodeModule } from './module-build';
import { appModule, moduleConfig } from './pipeline';

const module = appModule('valdi_webview');
const iosName = 'SCCValdiWebView';
const nativeModulePath = 'valdi_webview/src/WebViewNative';

function sourceDigest(): string {
  const hash = createHash('sha256');
  for (const file of readdirSync(path.join(module.dir, 'src')).sort()) {
    hash.update(file).update(readFileSync(path.join(module.dir, 'src', file)));
  }
  return hash.digest('hex');
}

function checkNativeContracts(out: string): void {
  const kotlin = readFileSync(path.join(out, 'android/valdi_webview.kt'), 'utf8');
  assert.match(kotlin, /package com\.snap\.valdi\.modules\.webview\b/);
  assert.doesNotMatch(kotlin, /com\.snap\.modules\.valdi_webview/);
  for (const name of [
    'WebViewLoadRequest', 'WebViewJavaScriptResult', 'WebViewControllerState',
    'IWebViewListener', 'IWebViewController', 'WebViewNativeModule', 'WebViewNativeModuleFactory',
  ]) {
    assert.match(kotlin, new RegExp(`\\b(?:class|interface) ${name}\\b`));
  }
  assert.match(kotlin, /fun createNativeController\(\): IWebViewController/);
  assert.match(kotlin, /fun getState\(\): Promise<WebViewControllerState>/);
  assert.match(kotlin, /fun evaluateJavaScript\(script: String, callback: \(\(result: WebViewJavaScriptResult\) -> Unit\)\?\)/);
  assert.match(kotlin, /fun setListener\(listener: IWebViewListener\?\)/);
  assert.ok(kotlin.includes(`return "${nativeModulePath}"`));

  const types = readFileSync(path.join(out, 'ios', iosName + 'Types', iosName + 'Types.h'), 'utf8');
  const implementation = readFileSync(path.join(out, 'ios', iosName + 'Types', iosName + 'Types.m'), 'utf8');
  for (const name of [
    'SCValdiWebViewLoadRequest', 'SCValdiWebViewJavaScriptResult', 'SCValdiWebViewControllerState',
    'SCValdiWebViewListener', 'SCValdiWebViewController',
    'SCCValdiWebViewWebViewNativeModule', 'SCCValdiWebViewWebViewNativeModuleFactory',
    'SCValdiWebViewControllerEvaluateJavaScriptCallbackBlock',
  ]) {
    assert.ok(types.includes(name), name);
  }
  for (const method of ['loadWithRequest:', 'getState', 'evaluateJavaScriptWithScript:', 'setListenerWithListener:',
    'onMessageWithMessage:', 'onLoadFailedWithErrorMessage:', 'onLoadCompleted', 'createNativeController']) {
    assert.ok(types.includes(method), method);
  }
  assert.ok(implementation.includes(`return @"${nativeModulePath}"`));
  assert.match(types, /#import <ValdiRuntime\/SCValdiGeneratedModuleFactory\.h>/);
  assert.doesNotMatch(types + implementation, /#import <valdi_core\//);
  assert.ok(existsSync(path.join(out, 'cpp/valdi_modules/valdi_webview/valdi_webview.hpp')));
  assert.ok(existsSync(path.join(out, 'cpp/valdi_modules/valdi_webview/valdi_webview.cpp')));
}

for (const mode of ['debug', 'release'] as const) {
  test(`official WebView real ${mode} module preserves native contracts and packaged assets`, async t => {
    const temporary = mkdtempSync(path.join(tmpdir(), `valdi-webview-${mode}-`));
    t.after(() => rmSync(temporary, { recursive: true, force: true, maxRetries: 10, retryDelay: 200 }));
    const before = sourceDigest();
    const config = moduleConfig(module.name);
    assert.equal(config.androidClassPath, 'com.snap.valdi.modules.webview');
    assert.equal(config.iosModuleName, iosName);
    assert.equal(config.androidModuleFactory, 'com.snap.valdi.modules.webview.WebViewNativeModuleFactoryImpl');
    assert.equal(config.androidViewBinder, 'com.snap.valdi.modules.webview.ValdiWebViewAttributesBinder');
    assert.equal(config.iosModuleFactory, 'ValdiWebViewCreateModuleFactory');
    await compileNodeModule(module, temporary, iosName, mode);
    checkNativeContracts(temporary);

    const entries = unpack(readFileSync(path.join(temporary, 'valdi_webview.valdimodule')));
    assert.deepEqual([...entries.keys()].sort(), ['hash', 'src/WebView.js']);
    assert.match(entries.get('hash')!.toString(), /^[a-f0-9]{64}$/);
    assert.ok(!entries.has('src/WebViewNative.js'), 'the native bridge must stay native');
    assert.ok(!entries.has('res.assetcatalog'), 'the official module has no image/font resources');
    const maps = JSON.parse(readFileSync(path.join(temporary, 'valdi_webview.map.json'), 'utf8'));
    assert.ok(maps['valdi_webview/src/WebView.js']);
    const manifest = JSON.parse(readFileSync(path.join(temporary, 'build.json'), 'utf8'));
    assert.equal(manifest.mode, mode);
    assert.equal(manifest.name, module.name);
    assert.equal(manifest.iosModuleName, iosName);

    if (mode === 'release') {
      assert.equal(entries.get('src/WebView.js')!.readUInt32LE(0), 0x0100c634);
    } else {
      const javascript = entries.get('src/WebView.js')!.toString();
      assert.match(javascript, /require\(["']valdi_webview\/src\/WebViewNative["']\)/);
      // A host fixture checks only the official JS forwarding boundary. These
      // explicit native collaborators do not implement or simulate a browser.
      const first = Object.freeze({ nativeController: 'first' });
      const second = Object.freeze({ nativeController: 'second' });
      const failure = new Error('native controller construction failed');
      let creations = 0;
      const native = {
        createNativeController() {
          creations++;
          if (creations === 1) return first;
          if (creations === 2) return second;
          throw failure;
        },
      };
      const exports: Record<string, unknown> = {};
      const requireNative = (name: string) => {
        assert.equal(name, nativeModulePath);
        return native;
      };
      vm.runInNewContext(`(function(require, module, exports) {${javascript}\n})`)(
        requireNative, { exports }, exports,
      );
      const WebView = exports.WebView as { createController(): unknown };
      assert.equal(WebView.createController(), first);
      assert.equal(WebView.createController(), second, 'each request creates a native controller');
      assert.throws(() => WebView.createController(), error => error === failure);
      assert.equal(creations, 3);
    }
    assert.equal(sourceDigest(), before, 'isolated compilation must preserve the official sources');
  });
}
