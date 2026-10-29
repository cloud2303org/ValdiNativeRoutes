// Current native ABI for independently compiled modules. OTA hashes generated
// declarations, so changing JS UI code alone does not require a new binary.
import { codegenModules, generateNativeCode, nativeSourceFiles } from './codegen/index';
import { moduleConfig } from './pipeline';

const platform = process.argv[2];
if (platform !== 'android' && platform !== 'ios') throw new Error('Expected android or ios');
const entries: [string, string][] = [];
for (const target of Object.values(codegenModules())) {
  if (moduleConfig(target.module.name).nativeBuild !== 'bazel') continue;
  for (const [file, content] of nativeSourceFiles(target, generateNativeCode(target), platform)) {
    entries.push([`bazel/${target.module.name}/${file}`, content]);
  }
}
process.stdout.write(JSON.stringify(entries));
