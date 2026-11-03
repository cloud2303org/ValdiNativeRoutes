import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { createRequire } from 'node:module';

const root = fileURLToPath(new URL('../../../../../../../', import.meta.url));
const require = createRequire(path.join(root, 'tools/valdi-rolldown/package.json'));
const sdk = process.env.HARMONY_ETS_SDK ??
  '/Users/cloud/Library/Huawei/26.0.0.865/command-line-tools/sdk/default/openharmony/ets';
const arkts = process.argv.includes('--arkts');
const ts = arkts ? createRequire(path.join(sdk, 'build-tools/ets-loader/package.json'))('typescript') : require('typescript');
const source = fileURLToPath(new URL('../', import.meta.url));
const temp = fs.mkdtempSync(path.join(os.tmpdir(), 'harmony-system-services-check-'));
try {
  const names = ['PlatformServiceTypes', 'HarmonyPermissionService', 'HarmonyWifiService',
    'HarmonyWifiCandidateCoordinator', 'HarmonyNfcService'];
  if (fs.existsSync(path.join(source, 'HarmonyBleService.ets'))) names.push('HarmonyBleService', 'HarmonyBleHelpers', 'HarmonyBleExecutionCore', 'HarmonySystemServices');
  const extension = arkts ? 'ets' : 'ts';
  for (const name of names) fs.copyFileSync(path.join(source, `${name}.ets`), path.join(temp, `${name}.${extension}`));
  const options = {
    noEmit: true, strict: true, skipLibCheck: true, target: ts.ScriptTarget.ES2021,
    module: ts.ModuleKind.ESNext, moduleResolution: ts.ModuleResolutionKind.NodeJs,
    types: [], baseUrl: temp,
    paths: {
      '@kit.*': [path.join(sdk, 'kits/@kit.*.d.ts')],
      '@ohos.*': [path.join(sdk, 'api/@ohos.*.d.ts')],
      '@system.*': [path.join(sdk, 'api/@system.*.d.ts')]
    }
  };
  const roots = names.map(name => path.join(temp, `${name}.${extension}`));
  const builder = arkts ? ts.createIncrementalProgram({
    rootNames: roots, options: { ...options, incremental: true, tsBuildInfoFile: path.join(temp, 'check.tsbuildinfo') }
  }) : undefined;
  const program = builder ? builder.getProgram() : ts.createProgram(roots, options);
  const diagnostics = ts.getPreEmitDiagnostics(program);
  if (builder) diagnostics.push(...ts.ArkTSLinter_1_1.runArkTSLinter(builder, undefined, undefined, 'ArkTS_1_1'));
  const errors = diagnostics.filter(item => item.category === ts.DiagnosticCategory.Error);
  const warnings = diagnostics.filter(item => item.category === ts.DiagnosticCategory.Warning);
  if (errors.length) {
    console.error(ts.formatDiagnosticsWithColorAndContext(errors, {
      getCanonicalFileName: file => file, getCurrentDirectory: () => temp, getNewLine: () => '\n'
    }));
    process.exitCode = 1;
  } else console.log(`Strict ${arkts ? 'SDK ArkTS 1.1 linter and type' : 'TypeScript source'} check passed for ${names.length} .ets files against real SDK declarations at ${sdk}; ${warnings.length} SDK warnings`);
} finally {
  fs.rmSync(temp, { recursive: true, force: true });
}
