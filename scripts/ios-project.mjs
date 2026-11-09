import { spawnSync } from 'node:child_process';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { iosProjectEnvironment, readAppConfig } from './app-config.mjs';
import { syncNativeModuleRegistration } from './native-modules.mjs';
import { prepareNativeDependencies } from './native-dependencies.mjs';

export function generateIosProject(root = path.resolve(import.meta.dirname, '..')) {
  readAppConfig(root);
  syncNativeModuleRegistration(root);
  // XcodeGen validates local framework paths before Xcode's build phases can run.
  prepareNativeDependencies(root, 'ios');
  const result = spawnSync('xcodegen', ['generate', '--spec', 'project.yml'], {
    cwd: path.join(root, 'ios'), env: iosProjectEnvironment(root), stdio: 'inherit',
  });
  if (result.error) throw result.error;
  if (result.status !== 0) throw new Error(`XcodeGen failed (${result.status ?? result.signal})`);
}

if (process.argv[1] && path.resolve(process.argv[1]) === fileURLToPath(import.meta.url)) {
  try { generateIosProject(); }
  catch (error) { console.error(error.message); process.exitCode = 1; }
}
