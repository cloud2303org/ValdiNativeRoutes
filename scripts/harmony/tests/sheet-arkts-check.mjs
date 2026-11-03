// Source checker for the actual shell metric methods and real native module
// declarations. Full ArkUI builder compilation is deliberately a separate gate.
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { createHash } from 'node:crypto';
import { createRequire } from 'node:module';
import { fileURLToPath } from 'node:url';

const root = fileURLToPath(new URL('../../../', import.meta.url));
const sdkRoot = process.env.HARMONY_SDK_ROOT ?? '/Users/cloud/Library/Huawei/26.0.0.865/command-line-tools/sdk/default';
const sdk = path.join(sdkRoot, 'openharmony/ets'), hms = path.join(sdkRoot, 'hms/ets');
const ts = createRequire(path.join(sdk, 'build-tools/ets-loader/package.json'))('typescript');
const sourcePath = path.join(root, 'harmony/entry/src/main/ets/pages/Index.ets');
const declarationsPath = path.join(root, 'harmony/entry/src/main/cpp/types/libvaldi_harmony/index.d.ts');
const source = fs.readFileSync(sourcePath, 'utf8');
const fullShell = process.argv.includes('--full-shell');
const receiptArg = process.argv.find(value => value.startsWith('--receipt='));
const digest = file => createHash('sha256').update(fs.readFileSync(file)).digest('hex');
function method(name) {
  const start = source.indexOf(`  private ${name}(`);
  if (start < 0) throw new Error(`Missing production method ${name}`);
  const brace = source.indexOf('{', start);
  let depth = 1, end = brace + 1;
  while (depth) { if (source[end] === '{') ++depth; if (source[end] === '}') --depth; ++end; }
  return source.slice(start, end);
}
const temp = fs.mkdtempSync(path.join(os.tmpdir(), 'sheet-arkts-'));
try {
  fs.copyFileSync(declarationsPath, path.join(temp, 'index.d.ts'));
  const target = path.join(temp, 'SheetShellIntegration.ets');
  const calls = ['valdi.registerSheetSurface(this.hostId, this.sheetNodeContent);'];
  for (const call of calls) if (!source.includes(call)) throw new Error(`Missing production integration ${call}`);
  fs.writeFileSync(target, `import { NodeContent, window, UIContext } from '@kit.ArkUI';
import valdi, { NavigationState } from './index';
export class SheetShellIntegration {
  private hostId: number = 0;
  private viewportHeight: number = 0;
  private keyboardHeight: number = 0;
  private systemTop: number = 0;
  private systemBottom: number = 0;
  private systemLeft: number = 0;
  private systemRight: number = 0;
  private foreground: boolean = true;
  private officialTabBarHeight: number = 48;
  private keyboardWindow: window.Window | undefined = undefined;
  private sheetNodeContent: NodeContent = new NodeContent();
  private navigation: NavigationState;
  private ui: UIContext;
  constructor(handle: number, snapshot: NavigationState, ui: UIContext) {
    this.ui = ui;
    this.hostId = handle;
    this.navigation = snapshot;
    ${calls.join('\n    ')}
  }
  private getUIContext(): UIContext { return this.ui; }
${['updateKeyboardHeight', 'publishInsets', 'publishSheetMetrics'].map(method).join('\n')}
}
`);
  const options = {
    noEmit: true, strict: true, skipLibCheck: true, etsAnnotationsEnable: true,
    allowSyntheticDefaultImports: true, target: ts.ScriptTarget.ES2021,
    module: ts.ModuleKind.ESNext, moduleResolution: ts.ModuleResolutionKind.NodeJs,
    types: [], baseUrl: temp, incremental: true, tsBuildInfoFile: path.join(temp, 'check.tsbuildinfo'),
    paths: {
      '@kit.*': [path.join(sdk, 'kits/@kit.*.d.ts'), path.join(hms, 'kits/@kit.*.d.ts')],
      '@ohos.*': [path.join(sdk, 'api/@ohos.*.d.ts')],
      '@hms.*': [path.join(hms, 'api/@hms.*.d.ts')],
      '@system.*': [path.join(sdk, 'api/@system.*.d.ts')],
      'libvaldi_harmony.so': [declarationsPath],
    },
  };
  let rootNames = [target];
  if (fullShell) {
    // Use the installed compiler's real ArkUI syntax/decorator configuration,
    // not ambient replacement declarations for Stack/ContentSlot/etc.
    const loader = path.join(sdk, 'build-tools/ets-loader');
    const sdkOptions = JSON.parse(fs.readFileSync(path.join(loader, 'tsconfig.json'), 'utf8')).compilerOptions;
    options.ets = sdkOptions.ets;
    options.experimentalDecorators = true;
    options.lib = ['lib.es2021.d.ts'];
    rootNames = [sourcePath, ...fs.readdirSync(path.join(loader, 'declarations'))
      .filter(name => name.endsWith('.d.ts')).map(name => path.join(loader, 'declarations', name))];
  }
  const builder = ts.createIncrementalProgram({ rootNames, options });
  const diagnostics = ts.getPreEmitDiagnostics(builder.getProgram());
  diagnostics.push(...ts.ArkTSLinter_1_1.runArkTSLinter(builder, undefined, undefined, 'ArkTS_1_1'));
  const errors = diagnostics.filter(item => item.category === ts.DiagnosticCategory.Error);
  const report = { kind: fullShell ?
    'SDK26 full actual Index.ets builder source, real ArkUI compiler syntax/declarations + ArkTS1.1' :
    'SDK26 strict types + ArkTS1.1, exact production shell metric bodies + native mount declarations',
    sources: [sourcePath, declarationsPath].map(file => ({ path: file, sha256: digest(file) })),
    fullArkUIBuilderTypeChecked: fullShell, fullArkUIBuilderCompiled: false,
    arkUITransformExecuted: false, noEmit: true,
    errors: errors.length, sdkWarnings: diagnostics.length - errors.length,
    consumedSources: builder.getProgram().getSourceFiles()
      .filter(file => fs.existsSync(file.fileName)).map(file => ({
        path: file.fileName, sha256: digest(file.fileName),
      })) };
  if (receiptArg) fs.writeFileSync(receiptArg.slice('--receipt='.length), JSON.stringify(report, null, 2) + '\n', { flag: 'wx' });
  console.log(JSON.stringify({ ...report, consumedSources: report.consumedSources.length }, null, 2));
  if (errors.length) {
    console.error(ts.formatDiagnosticsWithColorAndContext(errors, {
      getCanonicalFileName: file => file, getCurrentDirectory: () => temp, getNewLine: () => '\n',
    }));
    process.exitCode = 1;
  }
} finally { fs.rmSync(temp, { recursive: true, force: true }); }
