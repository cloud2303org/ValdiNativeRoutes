import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { createRequire } from 'node:module';
import path from 'node:path';
import test from 'node:test';
import vm from 'node:vm';
import ts from 'typescript';
import { codegenModules, generateNativeCode, nativeSourceFiles } from './codegen/index';
import { appModule, root, valdiSourceRoot } from './pipeline';
import { valdiTs } from './valdiTs';

const app = appModule('app_pages');
// Use the actual application's compiler, transforms, tsconfig and source files, rather than a copied API fixture.
const compiler = valdiTs(app, ts.ModuleKind.CommonJS);
const emitted = new Map<string, string>();
const source = (name: string) => path.join(appModule('app_ui').dir, 'src', `${name}.ts`);
const emit = (file: string) => {
  if (!emitted.has(file)) emitted.set(file, compiler.emit(file));
  return emitted.get(file)!;
};
const plain = <T>(value: T): T => JSON.parse(JSON.stringify(value));

const signatures = {
  showModal: ['request: ModalRequest', 'ModalReply'],
  showActionSheet: ['request: ActionSheetRequest', 'PresentationReply'],
  showPicker: ['request: PickerRequest', 'PresentationReply'],
  showDatePicker: ['request: DatePickerRequest', 'PresentationReply'],
  showBottomSheet: ['request: BottomSheetRequest', 'PresentationReply'],
  previewImage: ['request: ImagePreviewRequest', 'PresentationReply'],
  scanCode: ['', 'ScanCodeReply'],
  pickAttachments: ['source: string, limit: number, mimeTypes: string[]', 'AttachmentSelection'],
  clearAttachmentCache: ['', 'void'],
  showToast: ['request: ToastRequest', 'void'],
  hideToast: ['', 'void'],
  showLoading: ['request: LoadingRequest', 'void'],
  hideLoading: ['', 'void'],
} as const;
type HostMethod = keyof typeof signatures;
const names = Object.keys(signatures) as HostMethod[];
const asset = { id: '1', uri: 'file:///picker/one.jpg', name: 'one.jpg', mimeType: 'image/jpeg', size: 42 };
const presentation = { confirm: true, cancel: false, value: 'one', index: 0 };

/** Native services outside AppUI are isolated; AppUIHost, api, schemas and storage execute their real compiler output. */
function runtime(available = true) {
  const calls: { method: HostMethod; args: any[] }[] = [];
  const handlers: Partial<Record<HostMethod, (...args: any[]) => any>> = {};
  const defaults: Record<HostMethod, any> = {
    showModal: { confirm: true, cancel: false, content: 'edited' },
    showActionSheet: presentation, showPicker: presentation, showDatePicker: presentation,
    showBottomSheet: presentation, previewImage: presentation,
    scanCode: { result: 'typed-result', scanType: 'QR_CODE' },
    pickAttachments: { canceled: false, assets: [asset] },
    clearAttachmentCache: undefined, showToast: undefined, hideToast: undefined,
    showLoading: undefined, hideLoading: undefined,
  };
  // Share Error with real npm dependencies so instanceof has the same meaning as in the bundled app.
  const context = vm.createContext({ Error });
  const requireApp = createRequire(path.join(app.dir, 'package.json'));
  const modules: Record<string, any> = {
    valibot: requireApp('valibot'),
    tslib: requireApp(path.join(valdiSourceRoot()!, 'src/valdi_modules/src/valdi/valdi_core/src/tslib.js')),
    // This is the CommonJS test adapter for the default imports handled by Rolldown in production.
    dayjs: { default: requireApp('dayjs') },
    'dayjs/plugin/customParseFormat': { default: requireApp('dayjs/plugin/customParseFormat') },
    'dayjs/plugin/utc': { default: requireApp('dayjs/plugin/utc') },
    'bluetooth/src/index': { bluetoothApi: () => ({}) },
    'nfc/src/extension': { createNFCExtension: () => ({ getNFCAdapter() {} }) },
    'wifi/src/extension': { createWifiExtension: () => ({}) },
  };
  const cache = new Map<string, any>();
  const load = (file: string): any => {
    if (cache.has(file)) return cache.get(file);
    const module = { exports: {} as any };
    cache.set(file, module.exports);
    vm.runInContext(`(function(require,module,exports){${emit(file)}\n})`, context, { filename: file })(
      (name: string) => {
        if (Object.hasOwn(modules, name)) return modules[name];
        if (name === './AppUI') return {
          getHost() {
            if (!available) throw Error('native AppUI is not installed');
            return host;
          },
        };
        if (name === './MMKV') return { getHost() { throw Error('native storage is not installed'); } };
        if (/^(app_ui|mmkv|native_common)\//.test(name)) return load(path.join(app.dir, '..', name + '.ts'));
        assert.ok(name.startsWith('.'), `Unexpected module: ${name}`);
        return load(`${path.resolve(path.dirname(file), name)}.ts`);
      }, module, module.exports,
    );
    return module.exports;
  };
  const bridge = load(source('AppUIHost'));
  const host = Object.fromEntries(names.map(method => [method, function(this: any, ...args: any[]) {
    assert.equal(this, host, `${method} keeps its native receiver`);
    assert.ok(args.every(value => typeof value !== 'function'), `${method} must not receive a JS callback`);
    calls.push({ method, args });
    return handlers[method] ? handlers[method]!(...args) : Promise.resolve(defaults[method]);
  }]));
  const { api, ApiError } = load(path.join(app.dir, 'src/api.ts'));
  return { api, ApiError, calls, handlers, bridge, host, cache, load };
}

function failure(ApiError: any, method: string, message?: string) {
  return (error: any) => {
    assert.ok(error instanceof ApiError);
    assert.equal(error.name, 'ApiError');
    assert.equal(error.errMsg, error.message);
    if (message !== undefined) assert.equal(error.errMsg, `${method}:fail ${message}`);
    else assert.ok(error.errMsg.startsWith(`${method}:fail `));
    return true;
  };
}

test('real compiler sees exactly thirteen callback-free typed Promise host methods and direct awaits', () => {
  const program = compiler.program();
  const checker = program.getTypeChecker();
  const hostSource = program.getSourceFile(source('AppUIHost'))!;
  const declaration = hostSource.statements.find(statement =>
    ts.isInterfaceDeclaration(statement) && statement.name.text === 'AppUIHost',
  ) as ts.InterfaceDeclaration;
  const hostType = checker.getTypeAtLocation(declaration);
  assert.deepEqual(hostType.getProperties().map(property => property.name), names);
  for (const property of hostType.getProperties()) {
    const type = checker.getTypeOfSymbolAtLocation(property, declaration);
    const [signature] = type.getCallSignatures();
    const [args, reply] = signatures[property.name as HostMethod];
    assert.equal(checker.signatureToString(signature), `(${args}): Promise<${reply}>`);
    for (const parameter of signature.parameters) {
      assert.equal(checker.getTypeOfSymbolAtLocation(parameter, declaration).getCallSignatures().length, 0);
    }
  }
  for (const file of [hostSource, program.getSourceFile(source('api'))!]) {
    assert.deepEqual(program.getSyntacticDiagnostics(file), []);
    assert.deepEqual(program.getSemanticDiagnostics(file).map(diagnostic =>
      ts.flattenDiagnosticMessageText(diagnostic.messageText, '\n')), []);
  }
  const api = emit(source('api'));
  assert.doesNotMatch(api, /function call\b|new Promise\b|\bdone\b/);
  for (const name of names) assert.match(api, new RegExp(`await \\(0, AppUIHost_\\d+\\.appUIHost\\)\\(\\)\\.${name}\\(`));
});

test('real generator emits canonical Kotlin, Objective-C and C++ Promise proxies with no completion ABI', () => {
  const target = codegenModules().app_ui;
  const code = generateNativeCode(target);
  const directories = {
    android: 'android/app/generated/valdi',
    ios: 'ios/Generated/valdi',
    cpp: 'valdi/native/generated',
  };
  const outputs: Record<string, string> = {};
  let files = 0;
  for (const platform of ['android', 'ios', 'cpp'] as const) {
    const generated = nativeSourceFiles(target, code, platform);
    outputs[platform] = [...generated.values()].join('\n');
    for (const [filename, content] of generated) {
      const canonical = platform === 'ios' ? content
        .replaceAll('#import <valdi_core/', '#import <ValdiRuntime/')
        .replaceAll('import ValdiCoreSwift', 'import ValdiRuntime') : content;
      assert.equal(readFileSync(path.join(root, directories[platform], filename), 'utf8'), canonical, filename);
      files++;
    }
  }
  assert.equal(files, 7);
  const kotlinHost = outputs.android.match(/interface AppUIHost: ValdiMarshallable \{([\s\S]*?)\n\}/)![1];
  const objcHost = outputs.ios.match(/@protocol VRAppUIHost <NSObject, SCValdiMarshallable>([\s\S]*?)@end/)![1];
  const cppHost = outputs.cpp.match(/class AppUIHost: public Valdi::CppGeneratedInterface \{([\s\S]*?)\n  \};/)![1];
  for (const name of names) {
    const reply = signatures[name][1];
    const kotlinReply = reply === 'void' ? 'Unit' : reply;
    const objcReply = reply === 'void' ? 'SCValdiUndefinedValue' : `VR${reply}`;
    assert.match(kotlinHost, new RegExp(`fun ${name}\\([^\\n]*\\): Promise<${kotlinReply}>`));
    assert.match(objcHost, new RegExp(`SCValdiPromise<${objcReply} \\*> \\* _Nonnull\\)${name}(?:With|;)`));
    assert.match(cppHost, new RegExp(`virtual Valdi::Future<${reply}> ${name}\\([^\\n]*\\) = 0;`));
  }
  for (const host of [kotlinHost, objcHost, cppHost]) assert.doesNotMatch(host, /\bdone\b|Block|\(\^|Valdi::Function/);
  assert.doesNotMatch(outputs.android, /class AppUIHost\(/);
  assert.doesNotMatch(outputs.ios, /VRAppUIHostShow\w+Block|@interface VRAppUIHost: SCValdiMarshallableObject/);
  assert.match(outputs.android, /proxyClass = AppUIHost_Proxy::class/);
  assert.match(outputs.ios, /@interface VRAppUIHost: SCValdiProxyMarshallableObject/);
  assert.match(outputs.cpp, /"c\+ 'snap::valdi_modules::app_ui::AppUIHost'\{/);
  const cppSchema = outputs.cpp.match(/"c\+ 'snap::valdi_modules::app_ui::AppUIHost'\{([^"]+)\}"/)![1];
  assert.equal((cppSchema.match(/f\|m\|/g) ?? []).length, 13);
  assert.equal((cppSchema.match(/: p</g) ?? []).length, 13);
  assert.match(cppSchema, /'scanCode':f\|m\|\(\): p<r:/);
  assert.match(cppSchema, /'pickAttachments':f\|m\|\(s, d, a<s>\): p<r:/);
  assert.match(cppSchema, /'clearAttachmentCache':f\|m\|\(\): p<v>/);
  assert.doesNotMatch(cppSchema, /f\([^)]*f\(|'done'|m<s,u>/);
  assert.match(outputs.cpp, /Valdi::Ref<AppUIHost>/);
});

test('all thirteen native methods execute without callbacks and retain public success results', async () => {
  const { api, calls } = runtime();
  assert.deepEqual(plain(await api.showModal()), { confirm: true, cancel: false, content: 'edited', errMsg: 'showModal:ok' });
  assert.deepEqual(plain(await api.showActionSheet({ itemList: ['one'] })), { tapIndex: 0, errMsg: 'showActionSheet:ok' });
  assert.deepEqual(plain(await api.showPicker({ options: ['one'] })), { ...presentation, errMsg: 'showPicker:ok' });
  assert.deepEqual(plain(await api.showDatePicker({ mode: 'year', value: '2026' })),
    { confirm: true, cancel: false, value: 'one', errMsg: 'showDatePicker:ok' });
  assert.deepEqual(plain(await api.showBottomSheet()), { confirm: true, cancel: false, errMsg: 'showBottomSheet:ok' });
  assert.deepEqual(plain(await api.previewImage({ urls: ['file:///one.jpg'] })), { errMsg: 'previewImage:ok' });
  assert.deepEqual(plain(await api.scanCode()), { result: 'typed-result', scanType: 'QR_CODE', errMsg: 'scanCode:ok' });
  assert.deepEqual(plain(await api.chooseFile()), {
    tempFilePaths: [asset.uri],
    tempFiles: [{ path: asset.uri, size: 42, name: asset.name, type: asset.mimeType }], errMsg: 'chooseFile:ok',
  });
  for (const [method, args] of [
    ['clearAttachmentCache', []], ['showToast', [{ title: 'hello' }]], ['hideToast', []],
    ['showLoading', [{ title: 'working' }]], ['hideLoading', []],
  ] as const) assert.deepEqual(plain(await api[method](...args)), { errMsg: `${method}:ok` });
  assert.deepEqual(calls.map(call => call.method), names);
  assert.deepEqual(calls.map(call => call.args.length), [1, 1, 1, 1, 1, 1, 0, 3, 0, 1, 0, 1, 0]);
  assert.deepEqual(plain(calls[0].args[0]), {
    title: '', content: '', showCancel: true, confirmText: '确定', cancelText: '取消',
    editable: false, placeholderText: '', defaultText: '',
  });
  assert.deepEqual(plain(calls[1].args[0]), { title: '', itemList: ['one'] });
  assert.deepEqual(plain(calls[2].args[0].options), [{ value: 'one', label: 'one' }]);
  assert.equal(calls[2].args[0].value, 'one');
  assert.equal(calls[5].args[0].current, 'file:///one.jpg');
  assert.deepEqual(plain(calls[7].args), ['files', 1, ['*/*']]);
  assert.deepEqual(plain(calls[9].args[0]), { title: 'hello', icon: 'success', duration: 1500, mask: false });
});

test('void Promises wait for native settlement and treat undefined fulfillment as success', async () => {
  const { api, handlers, ApiError } = runtime();
  for (const [method, args] of [
    ['clearAttachmentCache', []], ['showToast', [{ title: 'hello' }]], ['hideToast', []],
    ['showLoading', [{ title: 'working' }]], ['hideLoading', []],
  ] as const) {
    let resolve!: (value: void) => void;
    handlers[method] = () => new Promise<void>(done => { resolve = done; });
    let completed = false;
    const pending = api[method](...args).then((reply: any) => { completed = true; return reply; });
    await Promise.resolve();
    assert.equal(completed, false);
    resolve(undefined);
    assert.deepEqual(plain(await pending), { errMsg: `${method}:ok` });
    handlers[method] = () => Promise.reject(new Error('native failed'));
    await assert.rejects(api[method](...args), failure(ApiError, method, 'native failed'));
  }
});

test('Promise rejection, empty errors, undefined and synchronous throws stay ApiError failures without fallback success', async () => {
  const { api, handlers, ApiError } = runtime();
  for (const [cause, message] of [
    [new Error('native failed'), 'native failed'], ['native text', 'native text'],
    [new Error(''), ''], ['', ''], [undefined, 'undefined'], [null, 'null'],
  ] as const) {
    handlers.showModal = () => Promise.reject(cause);
    await assert.rejects(api.showModal(), failure(ApiError, 'showModal', message));
    handlers.hideToast = () => Promise.reject(cause);
    await assert.rejects(api.hideToast(), failure(ApiError, 'hideToast', message));
  }
  handlers.showModal = () => { throw new Error('native synchronous failure'); };
  await assert.rejects(api.showModal(), failure(ApiError, 'showModal', 'native synchronous failure'));
  // Rejection is never converted into the old done(error, fallbackReply) success/cancel shape.
  handlers.showPicker = () => Promise.reject(new Error(''));
  await assert.rejects(api.showPicker({ options: ['one'] }), failure(ApiError, 'showPicker', ''));
  // Typed data is required for data-returning methods; an undefined success does not fabricate a reply.
  handlers.showModal = () => Promise.resolve(undefined);
  await assert.rejects(api.showModal(), failure(ApiError, 'showModal'));
  handlers.pickAttachments = () => Promise.resolve(undefined);
  await assert.rejects(api.chooseFile(), failure(ApiError, 'chooseFile'));
});

test('presentation, scanner, action sheet and attachment cancellations preserve their distinct public semantics', async () => {
  const { api, handlers, ApiError } = runtime();
  const canceled = { confirm: false, cancel: true, value: 'highlighted', index: 3 };
  handlers.showModal = () => Promise.resolve({ confirm: false, cancel: true, content: '' });
  assert.deepEqual(plain(await api.showModal()), { confirm: false, cancel: true, content: '', errMsg: 'showModal:ok' });
  handlers.showPicker = () => Promise.resolve(canceled);
  assert.deepEqual(plain(await api.showPicker({ options: ['one'] })),
    { confirm: false, cancel: true, value: '', index: -1, errMsg: 'showPicker:ok' });
  handlers.showDatePicker = () => Promise.resolve(canceled);
  assert.deepEqual(plain(await api.showDatePicker()), { confirm: false, cancel: true, value: '', errMsg: 'showDatePicker:ok' });
  handlers.showBottomSheet = () => Promise.resolve(canceled);
  assert.deepEqual(plain(await api.showBottomSheet()), { confirm: false, cancel: true, errMsg: 'showBottomSheet:ok' });
  handlers.previewImage = () => Promise.resolve(canceled);
  assert.deepEqual(plain(await api.previewImage({ urls: ['file:///one.jpg'] })), { errMsg: 'previewImage:ok' });
  handlers.showActionSheet = () => Promise.resolve(canceled);
  await assert.rejects(api.showActionSheet({ itemList: ['one'] }), failure(ApiError, 'showActionSheet', 'cancel'));
  await assert.rejects(api.chooseImage(), failure(ApiError, 'chooseImage', 'cancel'));
  handlers.scanCode = () => Promise.reject(new Error('cancel'));
  await assert.rejects(api.scanCode(), failure(ApiError, 'scanCode', 'cancel'));
  for (const selection of [{ canceled: true, assets: [asset] }, { canceled: false, assets: [] }]) {
    handlers.pickAttachments = () => Promise.resolve(selection);
    await assert.rejects(api.chooseFile(), failure(ApiError, 'chooseFile', 'cancel'));
    await assert.rejects(api.chooseImage({ sourceType: ['album'] }), failure(ApiError, 'chooseImage', 'cancel'));
  }
});

test('chooseImage keeps source selection, camera count and output mapping', async () => {
  const { api, handlers, calls } = runtime();
  handlers.showActionSheet = () => Promise.resolve({ ...presentation, index: 1 });
  assert.deepEqual(plain(await api.chooseImage({ count: 7 })), {
    tempFilePaths: [asset.uri], tempFiles: [{ path: asset.uri, size: 42 }], errMsg: 'chooseImage:ok',
  });
  assert.deepEqual(plain(calls[0]), {
    method: 'showActionSheet', args: [{ title: '', itemList: ['从相册选择', '拍照'] }],
  });
  assert.deepEqual(plain(calls[1]), { method: 'pickAttachments', args: ['camera', 1, ['image/*']] });
  await api.chooseImage({ count: 4, sourceType: ['album'] });
  assert.deepEqual(plain(calls[2]), { method: 'pickAttachments', args: ['photos', 4, ['image/*']] });
});

test('validation rejects before native invocation and absent host errors keep method prefixes', async () => {
  const { api, calls, ApiError } = runtime();
  for (const [method, options] of [
    ['showToast', { title: '' }], ['showLoading', { title: ' ' }], ['showActionSheet', { itemList: [] }],
    ['showPicker', { options: ['one'], value: 'missing' }], ['showDatePicker', { mode: 'invalid' }],
    ['showBottomSheet', { showCancel: 'yes' }], ['previewImage', { urls: [] }],
    ['scanCode', { onlyFromCamera: false }], ['chooseFile', { count: 0 }],
    ['chooseImage', { sourceType: [] }], ['showModal', { editable: 'yes' }],
  ] as const) await assert.rejects(api[method](options), failure(ApiError, method));
  assert.equal(calls.length, 0);
  const missing = runtime(false);
  await assert.rejects(missing.api.showModal(), failure(missing.ApiError, 'showModal', 'native AppUI is not installed'));
  await assert.rejects(missing.api.hideToast(), failure(missing.ApiError, 'hideToast', 'native AppUI is not installed'));
});

test('native factory retains the host across module reload and in-flight work needs no caller-page callback', async () => {
  const { api, handlers, bridge, host, cache, load } = runtime();
  let settle!: (value: any) => void;
  handlers.showModal = () => new Promise(resolve => { settle = resolve; });
  const pending = api.showModal();
  cache.delete(source('AppUIHost'));
  const reloaded = load(source('AppUIHost'));
  assert.notEqual(reloaded, bridge);
  assert.equal(reloaded.appUIHost(), host);
  settle({ confirm: false, cancel: true, content: '' });
  assert.deepEqual(plain(await pending), { confirm: false, cancel: true, content: '', errMsg: 'showModal:ok' });
});
