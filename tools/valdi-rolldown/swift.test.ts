import assert from 'node:assert/strict';
import { spawnSync } from 'node:child_process';
import { mkdirSync, mkdtempSync, readFileSync, rmSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import path from 'node:path';
import test from 'node:test';
import { compileNodeModule } from './module-build';
import { root, writeTsconfig } from './pipeline';
import { SwiftSourceFileGenerator } from './codegen/swift/SwiftCodeGenerator';
import { generateNativeCode, nativeSourceFiles, VALDI_PROJECT_CONFIG } from './codegen/index';
import { valdiTs } from './valdiTs';

// Real annotations, normal pipeline and (when requested) the actual exported
// Swift runtime. No handwritten ABI stubs.
export const swiftFixture = `
import { Component } from 'valdi_core/src/Component';
import 'valdi_tsx/src/JSX';
/** @ExportEnum */
export enum State { Idle = 0, Ready = 1 }
/** @ExportEnum */
export enum Flavor { Apple = 'apple', Banana = 'banana', 就绪 = 'ready', Escaped = '\\u0000\\b\\f\\n\\\\(literal)' }
export class Long {}
/** @ExportModel */
export interface Payload {
  name: string;
  enabled: boolean;
  count: number;
  sequence: Long;
  unknown: any;
  bytes: Uint8Array;
  values: number[];
  labels: Map<string, string>;
  state: State;
  flavor: Flavor;
  optional?: string;
  callback: (value: string) => number;
  optionalCallback?: (value: string) => void;
  promise: Promise<string>;
  optionalPayload?: Payload;
  peers?: Service[];
  nullableEntries: (string | undefined)[];
  getter: () => void;
  factory: (callback: (value: number) => string) => ((text: string) => number);
}
/** @ExportProxy */
export interface Service {
  transform(value: Payload, notify: (value: string) => void): Payload;
  maybe?: (value?: string) => void;
  readonly ready: boolean;
}
/** @ExportModel */
export interface Box<T> { value: T; }
/** @ExportModel */
export interface GenericConsumer { box: Box<string>; }
/** @ExportFunction */
export function echo(value: Payload, service: Service): Payload { return service.transform(value, () => {}); }
/** @ViewModel @ExportModel */
export interface ScreenModel { title: string; }
/** @Context @ExportModel */
export interface ScreenContext { onClose: () => void; }
/** @Component @ExportModel */
export class Screen extends Component<ScreenModel, ScreenContext> {
  onRender() { <label value={this.viewModel.title} />; }
}
`;

test('Swift-only and dual bindings cover official schemas and compile against the exported runtime', async t => {
  const dir = mkdtempSync(path.join(tmpdir(), 'valdi-swift-'));
  t.after(() => rmSync(dir, { recursive: true, force: true, maxRetries: 10, retryDelay: 200 }));
  mkdirSync(path.join(dir, 'src'));
  writeFileSync(path.join(dir, 'src/index.tsx'), swiftFixture);
  writeFileSync(path.join(dir, 'src/Calculator.d.ts'), '/** @ExportModule */\nexport declare function multiply(left: number, right: number): number;\n');
  const module = { name: 'swift_fixture', dir, generatedDirs: [], nodeModules: path.join(root, 'valdi/node_modules') };
  for (const language of ['swift', 'both'] as const) {
    const out = path.join(dir, language);
    await compileNodeModule(module, out, 'SwiftFixture', 'debug', [], language);
    const types = readFileSync(path.join(out, 'ios/SwiftFixtureTypes/SwiftFixtureTypes.swift'), 'utf8');
    const main = readFileSync(path.join(out, 'ios/SwiftFixture/SwiftFixture.swift'), 'utf8');
    assert.match(types, /ValdiMarshallableObject/);
    assert.match(types, /protocol Service: ValdiMarshallableInterface/);
    assert.match(types, /register_Payload/);
    assert.match(types, /ValdiPromise<String>/);
    assert.match(types, /case 就绪 = "ready"/);
    assert.match(types, /class Box<T>/);
    assert.match(main, /class CalculatorModuleFactory/);
    assert.match(main, /ValdiBridgeFunction/);
    assert.match(main, /SwiftComponentBase/);
    if (language === 'both') assert.match(readFileSync(path.join(out, 'ios/SwiftFixtureTypes/SwiftFixtureTypes.h'), 'utf8'), /@protocol/);
    if (process.env.VALDI_SWIFT_TYPECHECK === '1') {
      const framework = path.join(root, 'ios/Frameworks/ValdiRuntime.xcframework/ios-arm64_x86_64-simulator');
      const result = spawnSync('xcrun', ['--sdk', 'iphonesimulator', 'swiftc', '-typecheck', '-target', 'arm64-apple-ios16.0-simulator',
        '-F', framework, '-Xcc', `-fmodule-map-file=${framework}/ValdiRuntime.framework/Modules/module.modulemap`,
        path.join(out, 'ios/SwiftFixtureTypes/SwiftFixtureTypes.swift'), path.join(out, 'ios/SwiftFixture/SwiftFixture.swift')], { encoding: 'utf8' });
      assert.equal(result.status, 0, result.stdout + result.stderr);
    }
  }
});

test('Swift rejects unsupported map keys and overlong function signatures', () => {
  const generator = new SwiftSourceFileGenerator({
    ...VALDI_PROJECT_CONFIG, name: 'fixture', iosModuleName: 'Fixture', iosLanguage: 'swift', asyncStrictMode: false,
  });
  assert.throws(() => generator.type({ kind: 'map', keyType: { kind: 'double' }, valueType: { kind: 'string' } }, 'map'), /non-string/);
  assert.throws(() => generator.type({
    kind: 'function', parameters: Array.from({ length: 17 }, (_, i) => ({
      name: `p${i}`, type: { kind: 'string' }, injectableParams: { ios: false, android: false },
    })), returnType: { kind: 'void' }, isSingleCall: false, shouldCallOnWorkerThread: false, allowSyncCall: true,
  }, 'tooMany'), /16 parameters/);
});

test('native types from declared module dependencies keep their Swift module identity', t => {
  const dir = mkdtempSync(path.join(tmpdir(), 'valdi-swift-dependency-'));
  t.after(() => rmSync(dir, { recursive: true, force: true }));
  const make = (name: string) => {
    const directory = path.join(dir, name);
    mkdirSync(path.join(directory, 'src'), { recursive: true });
    return { name, dir: directory, generatedDirs: [], nodeModules: path.join(root, 'valdi/node_modules') };
  };
  const dependency = make('swift_contract');
  const module = make('swift_consumer');
  writeFileSync(path.join(dependency.dir, 'src/index.ts'), '/** @ExportModel */\nexport interface ExternalPayload { title: string; }\n');
  writeFileSync(path.join(module.dir, 'src/index.ts'), "import { ExternalPayload } from 'swift_contract/src/index';\n/** @ExportModel */\nexport interface Envelope { payload: ExternalPayload; }\n");
  writeTsconfig(module, [module, dependency]);
  const settings = (name: string, iosModuleName: string) => ({
    ...VALDI_PROJECT_CONFIG, name, iosModuleName, iosLanguage: 'swift' as const, asyncStrictMode: false,
  });
  const target = {
    module, program: () => valdiTs(module).program(), bundleInfo: settings(module.name, 'SwiftConsumer'),
    nativeDependencies: [{ module: dependency, bundleInfo: settings(dependency.name, 'SwiftContract') }],
  };
  const code = generateNativeCode(target);
  const consumer = [...nativeSourceFiles(target, code, 'ios').values()].join('\n');
  assert.match(consumer, /import SwiftContract/);
  assert.match(consumer, /register_ExternalPayload/);
  assert.doesNotMatch(consumer, /class ExternalPayload/);
  if (process.env.VALDI_SWIFT_TYPECHECK === '1') {
    const framework = path.join(root, 'ios/Frameworks/ValdiRuntime.xcframework/ios-arm64_x86_64-simulator');
    const flags = ['--sdk', 'iphonesimulator', 'swiftc', '-target', 'arm64-apple-ios16.0-simulator', '-F', framework,
      '-Xcc', `-fmodule-map-file=${framework}/ValdiRuntime.framework/Modules/module.modulemap`];
    const depTarget = { module: dependency, program: target.program, bundleInfo: target.nativeDependencies[0].bundleInfo };
    const depCode = [...nativeSourceFiles(depTarget, generateNativeCode(depTarget), 'ios').values()].join('\n');
    const write = (name: string, content: string) => {
      const file = path.join(dir, name + '.swift');
      writeFileSync(file, content.replaceAll('import ValdiCoreSwift', 'import ValdiRuntime'));
      return file;
    };
    const depFile = write('SwiftContract', depCode);
    const mainFile = write('SwiftConsumer', consumer);
    const emitted = spawnSync('xcrun', [...flags, '-emit-module', '-module-name', 'SwiftContract',
      '-emit-module-path', path.join(dir, 'SwiftContract.swiftmodule'), depFile], { encoding: 'utf8' });
    assert.equal(emitted.status, 0, emitted.stdout + emitted.stderr);
    const checked = spawnSync('xcrun', [...flags, '-typecheck', '-I', dir, mainFile], { encoding: 'utf8' });
    assert.equal(checked.status, 0, checked.stdout + checked.stderr);
  }
});
