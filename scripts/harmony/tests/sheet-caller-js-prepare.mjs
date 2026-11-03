#!/usr/bin/env node
// SOURCE RECIPE ONLY. Parent runs this after reclaiming its serial native slot.
// Transpile a bounded module set; never run the app's TSX/Valdi compiler/build.
import fs from 'node:fs';
import path from 'node:path';
import { createRequire } from 'node:module';
import { fileURLToPath } from 'node:url';
import crypto from 'node:crypto';

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '../../..');
const output = process.argv[2];
if (!output) throw new Error('usage: node sheet-caller-js-prepare.mjs OUTPUT.js');
const require = createRequire(path.join(root, 'tools/valdi-rolldown/package.json'));
const ts = require('typescript');
const appRequire = createRequire(path.join(root, 'valdi/package.json'));
const app = 'valdi/modules/app_pages/src/';
const entry = 'scripts/harmony/tests/sheet-caller-js.ts';
const names = [
  entry, `${app}NavigationHost.ts`, `${app}navigation/index.ts`,
  `${app}navigation/config.ts`, `${app}navigation/data.ts`, `${app}navigation/options.ts`,
];
const sources = Object.fromEntries(names.map(name => [name, fs.readFileSync(path.join(root, name), 'utf8')]));
const devicePath = '.tools/harmony/upstream/src/valdi_modules/src/valdi/valdi_core/src/Device.ts';
const deviceBridgePath = devicePath.replace('Device.ts', 'DeviceBridge.d.ts');
const valibotPath = appRequire.resolve('valibot');
sources['valdi_core/src/Device.ts'] = fs.readFileSync(path.join(root, devicePath), 'utf8');
// Device's public implementation is real. These are explicit platform inputs,
// outside caller attribution; no device services or observers run in this host.
sources['valdi_core/src/DeviceBridge.ts'] = `
export const DeviceSystemType = { IOS: 'ios', ANDROID: 'android', HARMONY: 'harmony' };
export function getSystemType() { return 'harmony'; }
export function observeDisplayInsetChange() { return { cancel() {} }; }
export function observeDisplaySizeChange() { return { cancel() {} }; }
export function observeDarkMode() { return { cancel() {} }; }
`;
// Route metadata is fixture input. No production router behavior is replaced.
sources[`${app}routes.ts`] = `
import { defineRoutes, nativePage } from './navigation/config';
export const routes = defineRoutes({
  pages: { sheet: nativePage({ name: 'picker', title: 'caller fixture' }) },
  initial: 'sheet'
});`;
const modules = Object.entries(sources).map(([name, source]) => {
  const result = ts.transpileModule(source, {
    fileName: name, reportDiagnostics: true,
    compilerOptions: { module: ts.ModuleKind.CommonJS, target: ts.ScriptTarget.ES2020,
      useDefineForClassFields: false },
  });
  const errors = (result.diagnostics ?? []).filter(d => d.category === ts.DiagnosticCategory.Error);
  if (errors.length) throw new Error(ts.formatDiagnosticsWithColorAndContext(errors, {
    getCanonicalFileName: f => f, getCurrentDirectory: () => root, getNewLine: () => '\n',
  }));
  return `${JSON.stringify(name)}: function(module, exports, require) {\n${result.outputText}\n}`;
});
const valibot = fs.readFileSync(valibotPath, 'utf8');
modules.push(`${JSON.stringify('valibot')}: function(module, exports, require) {\n${valibot}\n}`);
const loader = `(function() {
const modules = {${modules.join(',\n')}}, cache = {};
function load(name) {
  if (cache[name]) return cache[name].exports;
  if (!modules[name]) throw new Error('Unbounded fixture import: ' + name);
  const module = cache[name] = { exports: {} };
  modules[name](module, module.exports, function(relative) {
    if (modules[relative]) return load(relative);
    if (modules[relative + '.ts']) return load(relative + '.ts');
    if (!relative.startsWith('.')) throw new Error('Unexpected runtime import: ' + relative);
    const parts = name.split('/'); parts.pop();
    for (const part of relative.split('/')) {
      if (part === '..') parts.pop(); else if (part !== '.') parts.push(part);
    }
    const target = parts.join('/');
    return load(modules[target + '.ts'] ? target + '.ts' : target + '/index.ts');
  });
  return module.exports;
}
load(${JSON.stringify(entry)});
})();`;
fs.writeFileSync(output, loader);
fs.writeFileSync(`${output}.sources.json`, JSON.stringify({
  engineBoundary: 'official Valdi JS adapter, not Node execution of business JS',
  redirectedModule: `${app}routes.ts`,
  platformInputCollaborator: 'DeviceBridge systemType=harmony and inert observation handles; real Device.ts',
  fileInputs: Object.fromEntries([...names.map(name => path.join(root, name)),
    path.join(root, devicePath), path.join(root, deviceBridgePath), valibotPath].map(name => [
    name, crypto.createHash('sha256').update(fs.readFileSync(name)).digest('hex')])),
  sources: Object.fromEntries(Object.entries(sources).map(([name, source]) => [name,
    crypto.createHash('sha256').update(source).digest('hex')])),
}, null, 2) + '\n');
