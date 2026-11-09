import { spawnSync } from 'node:child_process';
import { realpathSync } from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { nativeModules } from './native-modules.mjs';
import { moduleNativePath } from './module-native-config.mjs';

const defaultRoot = path.resolve(import.meta.dirname, '..');

function invoke(root, module, action, platform) {
  const script = moduleNativePath(root, module.name, module.nativeDependencies.script);
  const result = spawnSync(process.execPath, [script, action, platform], {
    cwd: root, encoding: 'utf8', ...(action === 'prepare' ? { stdio: 'inherit' } : {}),
  });
  if (result.error || result.status !== 0)
    throw new Error(`${module.name} native dependencies (${platform}): ${result.error?.message ?? ((result.stderr || result.stdout || '').trim() || `exit ${result.status}`)}`);
}

function dependencyModules(root, platform, phase) {
  if (!['android', 'ios'].includes(platform)) throw new Error('Expected android or ios');
  if (!['app', 'runtime'].includes(phase)) throw new Error('Expected app or runtime phase');
  return nativeModules(root).filter(module => module.nativeDependencies &&
    (phase === 'runtime' ? module.nativeBuild === 'cpp' : module.nativeBuild !== 'cpp'));
}

export function inspectNativeDependencies(root = defaultRoot, platform, phase = 'app') {
  return dependencyModules(root, platform, phase).map(module => {
    try { invoke(root, module, 'check', platform); return { name: module.name, current: true }; }
    catch (error) { return { name: module.name, current: false, reason: error.message }; }
  });
}

export function checkNativeDependencies(root = defaultRoot, platform, phase = 'app') {
  const failures = inspectNativeDependencies(root, platform, phase).filter(item => !item.current);
  if (failures.length) throw new Error(failures.map(item => item.reason).join('\n'));
}

export function prepareNativeDependencies(root = defaultRoot, platform, phase = 'app') {
  const prepared = [];
  for (const module of dependencyModules(root, platform, phase)) {
    try { invoke(root, module, 'check', platform); continue; } catch {}
    console.log(`Preparing ${module.name} native dependencies (${platform})...`);
    invoke(root, module, 'prepare', platform);
    invoke(root, module, 'check', platform);
    prepared.push(module.name);
  }
  return prepared;
}

if (process.argv[1] && realpathSync(process.argv[1]) === fileURLToPath(import.meta.url)) {
  const [action, platform] = process.argv.slice(2);
  try {
    if (action === 'check') checkNativeDependencies(defaultRoot, platform);
    else if (action === 'prepare') prepareNativeDependencies(defaultRoot, platform);
    else if (action === 'check-runtime') checkNativeDependencies(defaultRoot, platform, 'runtime');
    else if (action === 'prepare-runtime') prepareNativeDependencies(defaultRoot, platform, 'runtime');
    else throw new Error('Usage: node scripts/native-dependencies.mjs check|prepare|check-runtime|prepare-runtime android|ios');
  } catch (error) {
    console.error(error.message);
    process.exitCode = 1;
  }
}
