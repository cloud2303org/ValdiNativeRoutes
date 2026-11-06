import assert from 'node:assert/strict';
import { mkdirSync, mkdtempSync, rmSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import path from 'node:path';
import test from 'node:test';
import ts from 'typescript';
import { codegenModules, generateNativeCode, nativeSourceFiles, type CodegenModule } from './codegen/index';
import { valdiTs } from './valdiTs';

const baseImport = 'app_foundation/src/host/AppContext';
const navigationImport = 'app_foundation/src/navigation/NavigationHost';

const explicitContract = `
import type { NavigationHost } from '${navigationImport}';
/** @ExportModule({ios: 'VRBusinessFixtureModule', android: 'io.valdiroutes.fixture.BusinessFixtureModule', cpp: 'business_fixture::AppHostModule'}) */
export declare function getHost(): AppHost;
/** @ExportProxy({ios: 'VRBusinessFixtureHost', android: 'io.valdiroutes.fixture.BusinessFixtureHost', cpp: 'business_fixture::AppHost'}) */
export interface AppHost {
  getNavigationHost(): NavigationHost;
  getBuildLabel(): string;
}
`;

test('application-owned explicit host contract: strict types and native generation', async t => {
  const directory = mkdtempSync(path.join(tmpdir(), 'valdi-host-extension-'));
  t.after(() => rmSync(directory, { recursive: true, force: true }));
  const foundation = codegenModules().app_foundation;
  assert.ok(foundation, 'use the real configured foundation module');
  const compiler = valdiTs(foundation.module);
  t.after(() => compiler.dispose());
  const baseProgram = compiler.program();
  const baseline = generateNativeCode({ ...foundation, program: () => baseProgram });
  const paths = { ...baseProgram.getCompilerOptions().paths };
  const fixtures = [
    ['business_host_explicit_fixture', explicitContract],
  ].map(([name, source]) => {
    const dir = path.join(directory, name);
    mkdirSync(path.join(dir, 'src'), { recursive: true });
    const file = path.join(dir, 'src/AppHost.d.ts');
    writeFileSync(file, source);
    paths[`${name}/*`] = [`${dir}/*`];
    return {
      module: { name, dir, generatedDirs: [] },
      bundleInfo: { ...foundation.bundleInfo, name, iosModuleName: name },
      nativeDependencies: [{ module: foundation.module, bundleInfo: foundation.bundleInfo }],
      file,
    };
  });
  const [explicit] = fixtures;
  const consumer = path.join(directory, 'consumer.ts');
  writeFileSync(consumer, `
import { getHost as getBaseHost } from '${baseImport}';
import type { AppContextHost } from '${baseImport}';
import { getHost } from '${explicit.module.name}/src/AppHost';
import type { AppHost } from '${explicit.module.name}/src/AppHost';
const application: AppHost = getHost();
const label: string = application.getBuildLabel();
const base: AppContextHost = application;
const navigation: ReturnType<AppContextHost['getNavigationHost']> = application.getNavigationHost();
const baseResult: AppContextHost = getBaseHost();
export { application, label, base, navigation, baseResult };
`);
  const options: ts.CompilerOptions = {
    ...baseProgram.getCompilerOptions(), paths, strict: true, noEmit: true,
  };
  const roots = [...baseProgram.getRootFileNames(), ...fixtures.map(fixture => fixture.file), consumer];
  const program = ts.createProgram(roots, options);
  const diagnostics = (candidate: ts.Program, file: string) => {
    const source = candidate.getSourceFile(file);
    assert.ok(source, `fixture must be part of the actual program: ${file}`);
    return [...candidate.getSyntacticDiagnostics(source), ...candidate.getSemanticDiagnostics(source)];
  };
  const format = (errors: readonly ts.Diagnostic[]) => ts.formatDiagnostics(errors, {
    getCanonicalFileName: file => file, getCurrentDirectory: () => directory, getNewLine: () => '\n',
  });
  const target = (fixture: typeof explicit): CodegenModule => ({ ...fixture, program: () => program });

  await t.test('explicit application contract works in TS; the base getter is neither any nor generic', () => {
    assert.equal(program.getCompilerOptions().strict, true);
    assert.deepEqual(program.getOptionsDiagnostics(), []);
    for (const file of [consumer, ...fixtures.map(fixture => fixture.file)]) {
      const errors = diagnostics(program, file);
      assert.equal(errors.length, 0, format(errors));
    }
    const source = program.getSourceFile(consumer)!;
    const checker = program.getTypeChecker();
    const variable = (name: string) => {
      const declaration = source.statements.filter(ts.isVariableStatement)
        .flatMap(statement => [...statement.declarationList.declarations])
        .find(item => ts.isIdentifier(item.name) && item.name.text === name);
      assert.ok(declaration);
      return checker.getTypeAtLocation(declaration.name);
    };
    const base = variable('baseResult');
    assert.equal(base.flags & (ts.TypeFlags.Any | ts.TypeFlags.Unknown), 0);
    assert.ok(checker.getPropertyOfType(base, 'getNavigationHost'));
    assert.equal(checker.getPropertyOfType(base, 'getBuildLabel'), undefined);
    assert.ok(checker.getPropertyOfType(variable('application'), 'getBuildLabel'));
    const declarationFiles = base.getSymbol()!.declarations!.map(declaration => declaration.getSourceFile().fileName);
    assert.deepEqual(declarationFiles, [path.join(foundation.module.dir, 'src/host/AppContext.d.ts')],
      'the base type must resolve to the real foundation declaration, not a fixture stub or augmentation');

    const invalid = path.join(directory, 'invalid.ts');
    writeFileSync(invalid, `
import { getHost } from '${baseImport}';
import type { AppHost } from '${explicit.module.name}/src/AppHost';
getHost().getBuildLabel();
const application: AppHost = getHost();
getHost<AppHost>();
`);
    const invalidProgram = ts.createProgram([...roots, invalid], options);
    const errors = diagnostics(invalidProgram, invalid);
    assert.deepEqual(errors.map(error => error.code).sort(), [2339, 2558, 2741],
      format(errors));
    assert.match(format(errors), /getBuildLabel/);
    assert.match(format(errors), /Expected 0 type arguments, but got 1/);
  });

  await t.test('explicit app interface generates both methods and real dependency types on all three platforms', () => {
    const warnings: string[] = [];
    const code = generateNativeCode(target(explicit), message => warnings.push(message));
    assert.deepEqual(warnings, []);
    const output = (platform: 'android' | 'ios' | 'cpp') => {
      const files = nativeSourceFiles(target(explicit), code, platform);
      assert.ok(files.size > 0, `${platform} must actually generate sources`);
      return [...files.values()].join('\n');
    };
    const kotlin = output('android');
    assert.match(kotlin, /interface BusinessFixtureHost: ValdiMarshallable/);
    assert.match(kotlin, /class BusinessFixtureHost_Proxy: BusinessFixtureHost/);
    assert.match(kotlin, /import io\.valdiroutes\.pages\.NavigationHost/);
    assert.match(kotlin, /fun getNavigationHost\(\): NavigationHost/);
    assert.match(kotlin, /fun getBuildLabel\(\): String/);
    assert.match(kotlin, /return _getNavigationHost\(\)/);
    assert.match(kotlin, /return _getBuildLabel\(\)/);
    assert.match(kotlin, /schema = "[^"\n]*'getNavigationHost':f\|m\|\(\): [^"\n]*'getBuildLabel':f\|m\|\(\): s/);
    assert.match(kotlin, /fun getHost\(\): BusinessFixtureHost/);
    assert.match(kotlin, /return "business_host_explicit_fixture\/src\/AppHost"/);

    const objc = output('ios');
    assert.match(objc, /@protocol VRBusinessFixtureHost <NSObject, SCValdiMarshallable>/);
    assert.match(objc, /@interface VRBusinessFixtureHost: SCValdiProxyMarshallableObject/);
    assert.match(objc, /-\s*\(VRNavigationHost \* _Nonnull\)\s*getNavigationHost/);
    assert.match(objc, /-\s*\(NSString \* _Nonnull\)\s*getBuildLabel/);
    assert.match(objc, /\.name = "getNavigationHost", \.selName = "getNavigationHost", \.type = "f\|m\|\(\): /);
    assert.match(objc, /\.name = "getBuildLabel", \.selName = "getBuildLabel", \.type = "f\|m\|\(\): s"/);
    assert.match(objc, /-\s*\(id<VRBusinessFixtureHost> _Nonnull\s*\)\s*getHost/);
    assert.match(objc, /return @"business_host_explicit_fixture\/src\/AppHost"/);

    const cpp = output('cpp');
    assert.match(cpp, /class AppHost: public Valdi::CppGeneratedInterface/);
    assert.match(cpp, /class AppHostProxy/);
    assert.match(cpp, /virtual snap::valdi_modules::app_foundation::NavigationHost getNavigationHost\(\) = 0/);
    assert.match(cpp, /virtual Valdi::StringBox getBuildLabel\(\) = 0/);
    assert.match(cpp, /return _getNavigationHost\(\)/);
    assert.match(cpp, /return _getBuildLabel\(\)/);
    assert.match(cpp, /registerSchema\("c\+ '[^"]*'getNavigationHost':f\|m\|\(\): [^"]*'getBuildLabel':f\|m\|\(\): s/);
    assert.match(cpp, /virtual Valdi::Ref<AppHost> getHost\(\) = 0/);
    assert.match(cpp, /fromCString\("business_host_explicit_fixture\/src\/AppHost"\)/);
    assert.match(cpp, /#include "valdi_modules\/app_foundation\/app_foundation.hpp"/);
    for (const source of [kotlin, objc, cpp]) {
      assert.doesNotMatch(source, /class NavigationHost[: {]|@interface VRNavigationHost:/,
        'dependency models must be referenced rather than re-emitted into the app module');
    }
  });

  await t.test('adding business contracts to the program leaves foundation generation byte-identical', () => {
    const after = generateNativeCode({ ...foundation, program: () => program });
    assert.deepEqual(after, baseline);
    for (const { source } of after.sources) {
      assert.doesNotMatch(source.content, /getBuildLabel|business_host_|BusinessFixture|business_fixture/,
        'foundation must acquire neither business methods nor business native dependencies');
    }
  });
});
