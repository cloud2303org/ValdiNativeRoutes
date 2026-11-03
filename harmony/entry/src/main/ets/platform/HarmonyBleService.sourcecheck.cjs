// Source-only check using the installed SDK's own patched compiler and ArkTS 1.1
// linter. Does not invoke Hvigor, package a HAP, contact a device, or load BLE.
const fs = require('node:fs');
const path = require('node:path');
const os = require('node:os');
const sdk = path.join(process.env.DEVECO_SDK_HOME ||
  '/Users/cloud/Library/Huawei/26.0.0.865/command-line-tools/sdk', 'default/openharmony/ets');
const loader = path.join(sdk, 'build-tools/ets-loader');
const ts = require(path.join(loader, 'node_modules/typescript'));
const config = ts.readConfigFile(path.join(loader, 'tsconfig.json'), ts.sys.readFile).config;
const parsed = ts.convertCompilerOptionsFromJson(config.compilerOptions, loader);
const scratch = fs.mkdtempSync(path.join(os.tmpdir(), 'harmony-ble-sourcecheck-'));
const files = ['HarmonyBleService.ets', 'HarmonyBleHelpers.ets', 'HarmonyBleExecutionCore.ets', 'PlatformServiceTypes.ets']
  .map(f => path.join(__dirname, f));
try {
  const options = {
    ...parsed.options, noEmit: true, allowNonTsExtensions: true, baseUrl: __dirname,
    paths: { '@kit.*': [sdk + '/kits/@kit.*.d.ts'], '@ohos.*': [sdk + '/api/@ohos.*.d.ts'] },
    incremental: true, tsBuildInfoFile: path.join(scratch, 'check.tsbuildinfo')
  };
  const decl = fs.readdirSync(path.join(loader, 'declarations')).filter(f => f.endsWith('.d.ts'))
    .map(f => path.join(loader, 'declarations', f));
  const builder = ts.createIncrementalProgram({ rootNames: [...files, ...decl], options });
  const program = builder.getProgram();
  const diagnostics = [];
  for (const file of files) {
    const source = program.getSourceFile(file);
    diagnostics.push(...program.getSyntacticDiagnostics(source), ...program.getSemanticDiagnostics(source));
    diagnostics.push(...ts.ArkTSLinter_1_1.runArkTSLinter(builder, source, undefined, 'ArkTS_1_1'));
  }
  for (const d of diagnostics) {
    const pos = d.file && d.start !== undefined ? d.file.getLineAndCharacterOfPosition(d.start) : undefined;
    console.log(`${d.category === ts.DiagnosticCategory.Error ? 'ERROR' : 'WARN'} ${d.code} ` +
      `${pos ? `${d.file.fileName}:${pos.line + 1}:${pos.character + 1} ` : ''}` +
      ts.flattenDiagnosticMessageText(d.messageText, ' '));
  }
  const errors = diagnostics.filter(d => d.category === ts.DiagnosticCategory.Error).length;
  console.log(`SDK ArkTS source check: ${errors} errors; ${diagnostics.length - errors} warnings`);
  process.exitCode = errors ? 1 : 0;
} finally {
  fs.rmSync(scratch, { recursive: true, force: true });
}
