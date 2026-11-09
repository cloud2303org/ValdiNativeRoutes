import assert from 'node:assert/strict';
import { createRequire } from 'node:module';
import path from 'node:path';
import test from 'node:test';
import vm from 'node:vm';
import ts from 'typescript';
import { codegenModules, generateNativeCode, nativeSourceFiles } from './codegen/index';
import { appModule, valdiSourceRoot } from './pipeline';
import { valdiTs } from './valdiTs';

const app = appModule('app_pages');
const compiler = valdiTs(app, ts.ModuleKind.CommonJS);
const source = (name: string) => path.join(app.dir, '..', `${name}.ts`);
const emitted = new Map<string, string>();
const plain = <T>(value: T): T => JSON.parse(JSON.stringify(value));

// Only the generated native entry and Device are substituted. The real facades, schemas, enum declarations,
// nativeCall and permission queue execute the application's compiler output, without production injection hooks.
function runtime() {
  const calls: { method: string; args: any[] }[] = [];
  const context = vm.createContext({ Error });
  const requireApp = createRequire(path.join(app.dir, 'package.json'));
  const cache = new Map<string, any>();
  const grants = new Set<string>();
  const host = {
    async showToast(...args: any[]) { calls.push({ method: 'showToast', args }); },
    async showDatePicker(...args: any[]) {
      calls.push({ method: 'showDatePicker', args });
      return { confirm: true, cancel: false, value: 'selected', index: 0 };
    },
    async showActionSheet(...args: any[]) {
      calls.push({ method: 'showActionSheet', args });
      return { confirm: true, cancel: false, value: '', index: 1 };
    },
    async pickAttachments(...args: any[]) {
      calls.push({ method: 'pickAttachments', args });
      return {
        canceled: false,
        assets: [{ id: 'asset', uri: 'file:///picked', name: 'picked', mimeType: 'image/jpeg', size: 42 }],
      };
    },
  };
  const permissionHost = {
    async check(permission: string) { return grants.has(permission); },
    async requestMultiple(permissions: string[]) {
      return permissions.map(permission => {
        grants.add(permission);
        return { permission, result: 'granted' };
      });
    },
    async openSettings() {},
  };
  const boundaries: Record<string, any> = {
    './AppUI': { getHost: () => host },
    './Permissions': { getHost: () => permissionHost, getAndroidSdk: () => 36 },
    'valdi_core/src/Device': { Device: { isAndroid: () => true } },
    valibot: requireApp('valibot'),
    tslib: requireApp(path.join(valdiSourceRoot()!, 'src/valdi_modules/src/valdi/valdi_core/src/tslib.js')),
    dayjs: { default: requireApp('dayjs') },
    'dayjs/plugin/customParseFormat': { default: requireApp('dayjs/plugin/customParseFormat') },
    'dayjs/plugin/utc': { default: requireApp('dayjs/plugin/utc') },
  };
  function load(file: string): any {
    if (cache.has(file)) return cache.get(file);
    const module = { exports: {} as any };
    cache.set(file, module.exports);
    if (!emitted.has(file)) emitted.set(file, compiler.emit(file));
    vm.runInContext(`(function(require,module,exports){${emitted.get(file)}\n})`, context, { filename: file })(
      (name: string) => {
        if (Object.hasOwn(boundaries, name)) return boundaries[name];
        if (/^(app_ui|permissions|native_common)\//.test(name)) return load(source(name));
        assert.ok(name.startsWith('.'), `Unexpected module: ${name}`);
        return load(`${path.resolve(path.dirname(file), name)}.ts`);
      }, module, module.exports,
    );
    return module.exports;
  }
  return {
    api: load(source('app_ui/src/api')).appUIApi(),
    permissions: load(source('permissions/src/index')),
    bridge: load(source('app_ui/src/AppUIHost')),
    permissionBridge: load(source('permissions/src/PermissionHost')),
    permissionHost, calls,
  };
}

const contracts = [
  {
    module: 'app_ui', name: 'ToastRequestIcon', ios: 'VRToastRequestIcon',
    cases: { Success: 'success', Error: 'error', Loading: 'loading', None: 'none' },
  },
  {
    module: 'app_ui', name: 'DatePickerMode', ios: 'VRDatePickerMode',
    cases: { Year: 'year', YearMonth: 'year-month', Date: 'date', Time: 'time', DateTime: 'datetime' },
  },
  {
    module: 'app_ui', name: 'AttachmentSource', ios: 'VRAttachmentSource',
    cases: { Photos: 'photos', Camera: 'camera', Files: 'files' },
  },
  {
    module: 'permissions', name: 'PermissionGrantResult', ios: 'VRPermissionGrantResult',
    cases: { Granted: 'granted', Denied: 'denied', NeverAskAgain: 'never_ask_again' },
  },
] as const;

test('finite host values generate registered string enums and typed Kotlin, Objective-C and C++ fields', () => {
  const targets = codegenModules();
  const outputs = new Map<string, Record<string, string>>();
  for (const name of ['app_ui', 'permissions']) {
    const target = targets[name];
    const code = generateNativeCode(target);
    outputs.set(name, Object.fromEntries(['android', 'ios', 'cpp'].map(platform => [
      platform, [...nativeSourceFiles(target, code, platform as 'android' | 'ios' | 'cpp').values()].join('\n'),
    ])));
  }
  for (const contract of contracts) {
    const { android, ios, cpp } = outputs.get(contract.module)!;
    assert.ok(android.includes(`enum class ${contract.name} {`), `${contract.name} is a generated Kotlin enum`);
    assert.ok(ios.includes(`typedef NSString * _Nonnull ${contract.ios} NS_STRING_ENUM`), contract.ios);
    assert.ok(cpp.includes(`enum class ${contract.name}`), `${contract.name} is a generated C++ enum`);
    assert.ok(cpp.includes(`CppStringEnumMarshaller<${contract.name},`), `${contract.name} uses string marshalling`);
    assert.ok(ios.includes(`VALDI_STRING_ENUM(${contract.ios},`), `${contract.ios} is registered`);
    for (const [key, value] of Object.entries(contract.cases)) {
      assert.ok(android.includes(`'${key}':'${value}'`), `${contract.name}.${key} Kotlin wire value`);
      assert.ok(ios.includes(`${contract.ios}${key} = @"${value}"`), `${contract.name}.${key} iOS wire value`);
    }
  }
  for (const [module, property, type, iosType] of [
    ['app_ui', 'icon', 'ToastRequestIcon', 'VRToastRequestIcon'],
    ['app_ui', 'mode', 'DatePickerMode', 'VRDatePickerMode'],
    ['permissions', 'result', 'PermissionGrantResult', 'VRPermissionGrantResult'],
  ]) {
    const output = outputs.get(module)!;
    assert.ok(output.android.includes(`var ${property}: ${type}`), `${module}.${property} Kotlin enum field`);
    assert.ok(output.ios.includes(`${iosType} _Nonnull ${property};`), `${module}.${property} ObjC enum field`);
    assert.ok(output.cpp.includes(`${type} _${property};`), `${module}.${property} C++ enum field`);
  }
  const ui = outputs.get('app_ui')!;
  assert.ok(ui.android.includes('fun pickAttachments(source: AttachmentSource, limit: Double,'));
  assert.ok(ui.ios.includes('pickAttachmentsWithSource:(VRAttachmentSource _Nonnull)source'));
  assert.ok(ui.cpp.includes('pickAttachments(AttachmentSource source,'));
});

test('actual bridge contracts and public string option facades typecheck without enum casts', () => {
  const appProgram = compiler.program();
  const program = ts.createProgram(
    [...appProgram.getRootFileNames(), source('app_ui/src/index')], appProgram.getCompilerOptions(),
  );
  for (const name of [
    'app_ui/src/AppUIHost', 'app_ui/src/api', 'app_ui/src/index',
    'permissions/src/PermissionHost', 'permissions/src/index',
  ]) {
    const file = program.getSourceFile(source(name))!;
    assert.ok(file, name);
    assert.deepEqual([
      ...program.getSyntacticDiagnostics(file), ...program.getSemanticDiagnostics(file),
    ].map(diagnostic => ts.flattenDiagnosticMessageText(diagnostic.messageText, '\n')), [], name);
  }
});

test('public toast icons and date modes map every valid string and default to the native enum contract', async () => {
  const { api, calls, bridge } = runtime();
  for (const contract of contracts.slice(0, 2)) {
    assert.ok(bridge[contract.name], `${contract.name} is exported by the bridge`);
    assert.deepEqual(plain(bridge[contract.name]), contract.cases);
  }
  for (const [key, icon] of Object.entries(contracts[0].cases)) {
    await api.showToast({ title: 'done', icon });
    assert.equal(calls.at(-1)!.args[0].icon, bridge.ToastRequestIcon[key]);
  }
  await api.showToast({ title: 'default' });
  assert.equal(calls.at(-1)!.args[0].icon, bridge.ToastRequestIcon.Success);
  for (const [key, mode] of Object.entries(contracts[1].cases)) {
    await api.showDatePicker({ mode });
    assert.equal(calls.at(-1)!.args[0].mode, bridge.DatePickerMode[key]);
  }
  await api.showDatePicker();
  assert.equal(calls.at(-1)!.args[0].mode, bridge.DatePickerMode.Date);
});

test('public album/camera options and chooseFile map to native attachment sources with preserved limits', async () => {
  const { api, calls, bridge } = runtime();
  assert.ok(bridge.AttachmentSource, 'AttachmentSource is exported by the bridge');
  assert.deepEqual(plain(bridge.AttachmentSource), contracts[2].cases);
  await api.chooseImage({ sourceType: ['album'], count: 4 });
  assert.deepEqual(plain(calls.at(-1)), {
    method: 'pickAttachments', args: [bridge.AttachmentSource.Photos, 4, ['image/*']],
  });
  await api.chooseImage({ sourceType: ['camera'], count: 7 });
  assert.deepEqual(plain(calls.at(-1)), {
    method: 'pickAttachments', args: [bridge.AttachmentSource.Camera, 1, ['image/*']],
  });
  await api.chooseImage({ sourceType: ['album', 'camera'], count: 7 });
  assert.equal(calls.at(-2)!.method, 'showActionSheet');
  assert.equal(calls.at(-1)!.args[0], bridge.AttachmentSource.Camera);
  await api.chooseFile({ count: 3, mimeTypes: ['application/pdf'] });
  assert.deepEqual(plain(calls.at(-1)), {
    method: 'pickAttachments', args: [bridge.AttachmentSource.Files, 3, ['application/pdf']],
  });
});

test('invalid public finite string values reject with the existing errors before any native invocation', async () => {
  const { api, calls } = runtime();
  for (const icon of ['SUCCESS', 'unknown', '', '__proto__', 0])
    await assert.rejects(api.showToast({ title: 'done', icon }), /showToast:fail unsupported icon/);
  for (const mode of ['month', 'DATE', '', '__proto__', 0])
    await assert.rejects(api.showDatePicker({ mode }), /showDatePicker:fail unsupported picker mode/);
  for (const sourceType of [['photos'], ['files'], ['CAMERA'], ['album', 'album'], ['__proto__']])
    await assert.rejects(api.chooseImage({ sourceType }), /chooseImage:fail sourceType must be unique album\/camera values/);
  assert.deepEqual(calls, []);
});

test('native permission enum results retain granted, denied and blocked behavior and reject malformed results', async () => {
  const check = async (result: string, status: string, canAskAgain: boolean) => {
    const f = runtime();
    assert.ok(f.permissionBridge.PermissionGrantResult, 'PermissionGrantResult is exported by the bridge');
    assert.deepEqual(plain(f.permissionBridge.PermissionGrantResult), contracts[3].cases);
    if (result !== 'granted') f.permissionHost.requestMultiple = async permissions =>
      permissions.map(permission => ({ permission, result }));
    assert.deepEqual(plain(await f.permissions.requestAndroidPermissions(['test.permission'])), { status, canAskAgain });
  };
  await check('granted', 'granted', true);
  await check('denied', 'denied', true);
  await check('never_ask_again', 'blocked', false);
  for (const result of ['GRANTED', 'restricted', '', undefined, 0]) {
    const f = runtime();
    f.permissionHost.requestMultiple = async permissions =>
      permissions.map(permission => ({ permission, result: result as any }));
    await assert.rejects(f.permissions.requestAndroidPermissions(['test.permission']), /invalid grant result/);
    f.permissionHost.requestMultiple = async () => [];
    await assert.rejects(f.permissions.requestAndroidPermissions(['test.permission']), /omitted a grant result/);
  }
});
