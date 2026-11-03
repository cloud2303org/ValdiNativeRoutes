#!/usr/bin/env node
// Standalone SDK parser/type check. Does not invoke Hvigor or export a bundle.
const fs = require('node:fs');
const path = require('node:path');
const sdk = process.env.HARMONY_ETS_SDK ||
  '/Users/cloud/Library/Huawei/26.0.0.865/command-line-tools/sdk/default/openharmony/ets';
const loader = path.join(sdk, 'build-tools/ets-loader');
const ts = require(path.join(loader, 'node_modules/typescript'));
const root = path.resolve(__dirname, '../../../../../../..');
const nativeTypes = path.join(root, 'harmony/entry/src/main/cpp/types/libvaldi_harmony/index.d.ts');
const files = [path.join(root, 'harmony/entry/src/main/ets/pages/Index.ets'), nativeTypes];
const config = ts.readConfigFile(path.join(loader, 'tsconfig.json'), ts.sys.readFile).config;
const parsed = ts.parseJsonConfigFileContent(config, ts.sys, loader);
const options = { ...parsed.options, noEmit: true, strictNullChecks: true, noImplicitAny: true,
  baseUrl: sdk, paths: { '@ohos.*': ['api/@ohos.*'], '@kit.*': ['kits/@kit.*'],
    '@internal/*': ['api/@internal/*'], 'libvaldi_harmony.so': [nativeTypes] } };
const declarations = fs.readdirSync(path.join(loader, 'declarations'))
  .filter(name => name.endsWith('.d.ts')).map(name => path.join(loader, 'declarations', name));
const host = ts.createCompilerHost(options);
// The SDK compiler accepts .ets roots and ArkUI DSL. Its ordinary node resolver
// needs an explicit .ets resolution for local imports outside a Hvigor project.
host.resolveModuleNames = (names, containingFile) => names.map(name => {
  if (name.startsWith('.')) {
    const target = path.resolve(path.dirname(containingFile), `${name}.ets`);
    if (fs.existsSync(target)) return { resolvedFileName: target, extension: ts.Extension.Ets };
  }
  return ts.resolveModuleName(name, containingFile, options, host).resolvedModule;
});
const program = ts.createProgram([...files, ...declarations], options, host);
const diagnostics = [...program.getOptionsDiagnostics(), ...program.getSyntacticDiagnostics(),
  ...program.getSemanticDiagnostics()].filter(d => d.category === ts.DiagnosticCategory.Error &&
    (!d.file || files.includes(d.file.fileName)));
if (diagnostics.length) {
  console.error(ts.formatDiagnosticsWithColorAndContext(diagnostics, {
    getCurrentDirectory: () => root, getCanonicalFileName: f => f, getNewLine: () => '\n'
  }));
  process.exit(1);
}
console.log('PASS: production Index.ets and typed feedback mount ABI checked against real SDK26 declarations');
