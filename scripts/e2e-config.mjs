import { cpSync, existsSync, mkdirSync, mkdtempSync, readFileSync, readdirSync, writeFileSync } from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { parse } from 'yaml';
import { readAppConfig } from './app-config.mjs';

const repository = path.resolve(import.meta.dirname, '..');
// Historical recordings stay unchanged; only their executable application selectors are rebound.
const recordedAppId = 'io.valdiroutes.app';

export function stageE2EFlows(root, platform, input = '.argent/e2e') {
  if (!['android', 'ios'].includes(platform)) throw new Error('E2E platform must be android or ios');
  const app = readAppConfig(root);
  const appId = platform === 'android' ? app.android.applicationId : app.ios.bundleIdentifier;
  const directories = ['.argent/e2e', '.argent/flows'];
  let source = path.resolve(root, input);
  if (!existsSync(source)) {
    source = directories.map(directory => path.join(root, directory, `${input.replace(/\.yaml$/, '')}.yaml`))
      .find(candidate => existsSync(candidate));
  }
  if (!source || !directories.some(directory => {
    const relative = path.relative(path.join(root, directory), source);
    return !relative.startsWith('..') && !path.isAbsolute(relative);
  })) throw new Error('E2E flow must be a name or path under this project .argent/e2e or .argent/flows');
  const generated = path.join(root, '.argent/generated');
  mkdirSync(generated, { recursive: true });
  const stage = mkdtempSync(path.join(generated, `identity-${platform}-`));
  let visited;
  const rebind = value => {
    if (!value || typeof value !== 'object') return;
    if (visited.has(value)) throw new Error('E2E identity staging does not support cyclic YAML aliases');
    visited.add(value);
    if (Array.isArray(value)) { value.forEach(rebind); visited.delete(value); return; }
    if (value.launch === recordedAppId) value.launch = appId;
    else if (value.launch?.native === recordedAppId) value.launch.native = appId;
    if (value.tool && value.args) {
      for (const key of ['bundleId', 'appId']) {
        if (value.args[key] === recordedAppId) value.args[key] = appId;
      }
      if (value.tool === 'e2e-execute' && value.args.name) value.args.project_root = stage;
    }
    Object.values(value).forEach(rebind);
    visited.delete(value);
  };
  const visit = directory => {
    for (const entry of readdirSync(directory, { withFileTypes: true })) {
      const target = path.join(directory, entry.name);
      if (entry.isDirectory()) visit(target);
      else if (entry.isFile() && /\.ya?ml$/.test(entry.name)) {
        const document = parse(readFileSync(target, 'utf8'));
        visited = new WeakSet();
        rebind(document);
        writeFileSync(target, JSON.stringify(document, null, 2) + '\n');
      }
    }
  };
  for (const directory of directories) {
    if (!existsSync(path.join(root, directory))) continue;
    const destination = path.join(stage, directory);
    cpSync(path.join(root, directory), destination, { recursive: true });
    visit(destination);
  }
  return path.join(stage, path.relative(root, source));
}

if (process.argv[1] && path.resolve(process.argv[1]) === fileURLToPath(import.meta.url)) {
  try { console.log(stageE2EFlows(repository, process.argv[2], process.argv[3])); }
  catch (error) { console.error(error.message); process.exitCode = 1; }
}
