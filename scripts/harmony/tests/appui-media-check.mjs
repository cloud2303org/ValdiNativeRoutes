import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { createRequire } from 'node:module';

const root = fileURLToPath(new URL('../../../', import.meta.url));
const sdkRoot = process.env.HARMONY_SDK_ROOT ??
  '/Users/cloud/Library/Huawei/26.0.0.865/command-line-tools/sdk/default';
const sdk = path.join(sdkRoot, 'openharmony/ets'), hms = path.join(sdkRoot, 'hms/ets');
const ts = createRequire(path.join(sdk, 'build-tools/ets-loader/package.json'))('typescript');
const temp = fs.mkdtempSync(path.join(os.tmpdir(), 'appui-media-arkts-'));
try {
  const source = path.join(root, 'harmony/entry/src/main/ets/platform/HarmonyAppUIMediaService.ets');
  const target = path.join(temp, 'HarmonyAppUIMediaService.ets');
  fs.copyFileSync(source, target);
  const declarations = path.join(root, 'harmony/entry/src/main/cpp/types/libvaldi_harmony/index.d.ts');
  fs.copyFileSync(declarations, path.join(temp, 'index.d.ts'));
  const integration = path.join(temp, 'MediaMountIntegration.ets');
  fs.writeFileSync(integration, `import { common } from '@kit.AbilityKit';
import { AppUIFeedbackHost } from './index';
import { HarmonyAppUIMediaService } from './HarmonyAppUIMediaService';
export function mountMedia(context: common.UIAbilityContext): AppUIFeedbackHost {
  const feedback: AppUIFeedbackHost = {
    media: new HarmonyAppUIMediaService(context),
    showLoading: async (): Promise<void> => {},
    hideLoading: async (): Promise<void> => {},
    showToast: async (): Promise<void> => {},
    hideToast: async (): Promise<void> => {}
  };
  return feedback;
}
`);
  const options = {
    noEmit: true, strict: true, skipLibCheck: true, etsAnnotationsEnable: true, target: ts.ScriptTarget.ES2021,
    module: ts.ModuleKind.ESNext, moduleResolution: ts.ModuleResolutionKind.NodeJs,
    types: [], baseUrl: temp, incremental: true, tsBuildInfoFile: path.join(temp, 'check.tsbuildinfo'),
    paths: {
      '@kit.*': [path.join(sdk, 'kits/@kit.*.d.ts'), path.join(hms, 'kits/@kit.*.d.ts')],
      '@ohos.*': [path.join(sdk, 'api/@ohos.*.d.ts')],
      '@hms.*': [path.join(hms, 'api/@hms.*.d.ts')],
      '@system.*': [path.join(sdk, 'api/@system.*.d.ts')]
    }
  };
  const builder = ts.createIncrementalProgram({ rootNames: [target, integration], options });
  const diagnostics = ts.getPreEmitDiagnostics(builder.getProgram());
  diagnostics.push(...ts.ArkTSLinter_1_1.runArkTSLinter(builder, undefined, undefined, 'ArkTS_1_1'));
  const errors = diagnostics.filter(item => item.category === ts.DiagnosticCategory.Error);
  if (errors.length) {
    console.error(ts.formatDiagnosticsWithColorAndContext(errors, {
      getCanonicalFileName: file => file, getCurrentDirectory: () => temp, getNewLine: () => '\n'
    }));
    process.exitCode = 1;
  } else console.log(`PASS SDK26 strict types and ArkTS 1.1: ${source} and actual native mount declarations (${diagnostics.length} SDK warnings)`);
} finally { fs.rmSync(temp, { recursive: true, force: true }); }
