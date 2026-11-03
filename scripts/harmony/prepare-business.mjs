#!/usr/bin/env node
// Prepare only business inputs. Never run Bazel, mutate runtime sources, or use Apple archives.
import { createHash } from 'node:crypto';
import { execFileSync } from 'node:child_process';
import { mkdir, readFile, readdir, realpath, writeFile } from 'node:fs/promises';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { bazelExternalDirectory } from './bazel-cache.mjs';

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '../..');
const pin = '15feb6530ceecb971f4c8519ea8ab77474b959db';
const options = {};
const args = process.argv.slice(2);
for (let i = 0; i < args.length; i += 2) {
  if (!['--source', '--git-source', '--external', '--bazel-out', '--output', '--sqlite-archive', '--repository-cache'].includes(args[i]) || !args[i + 1]) {
    throw new Error('Usage: prepare-business.mjs [--source DIR] [--git-source DIR] [--external DIR] [--bazel-out DIR] [--output DIR] [--sqlite-archive FILE] [--repository-cache DIR]');
  }
  options[args[i].slice(2)] = path.resolve(args[i + 1]);
}
const source = options.source ?? path.join(root, '.tools/harmony/upstream');
const gitSource = options['git-source'] ?? process.env.VALDI_FORK_SOURCE ?? path.resolve(root, '../Valdi-node-only');
const external = options.external ?? await bazelExternalDirectory(root);
const bazelOut = options['bazel-out'] ?? path.join(root, 'valdi/bazel-out');
const output = options.output ?? path.join(root, '.tools/harmony/business-inputs');
const sha = data => createHash('sha256').update(data).digest('hex');
const moduleDir = 'src/valdi_modules/src/valdi/client_sql';
const provenance = { commit: pin, source, files: {}, generated: {}, sqlite: {} };
async function writeIfChanged(filename, data) {
  const content = Buffer.from(data);
  try { if ((await readFile(filename)).equals(content)) return; } catch {}
  await mkdir(path.dirname(filename), { recursive: true });
  await writeFile(filename, content);
}
async function pinned(name) {
  const expected = execFileSync('git', ['-C', gitSource, 'show', `${pin}:${name}`], { maxBuffer: 16 * 1024 * 1024 });
  const actual = await readFile(path.join(source, name));
  if (sha(actual) !== sha(expected)) throw new Error(`Source does not match ${pin}: ${name}`);
  provenance.files[name] = sha(actual);
  return actual;
}
const manifest = (await pinned('MODULE.bazel')).toString();
await pinned(`${moduleDir}/BUILD.bazel`);
await pinned('bzl/valdi/BUILD.bazel');
await pinned('third-party/sqlite/sqlite.BUILD');
await pinned(`${moduleDir}/module.yaml`);
await pinned(`${moduleDir}/src/ClientSQLNative.d.ts`);
for (const name of ['ClientSQLNativeModuleFactory.cpp', 'ClientSQLNativeModuleFactory.hpp', 'ClientSQLNativeModuleFactory_tests.cpp']) {
  await writeIfChanged(path.join(output, 'native', name), await pinned(`${moduleDir}/native/${name}`));
}

// Generate afresh from the verified .d.ts, even when the Bazel C++ output exists.
// This avoids silently accepting stale native contracts from another cache pin.
const codegenRoot = path.join(root, 'tools/valdi-rolldown');
execFileSync(path.join(codegenRoot, 'node_modules/.bin/tsx'), [
  path.join(root, 'harmony/business-build/generate-bindings.ts'), source, path.join(output, 'generated'),
], { stdio: 'inherit' });
const generatorInputs = {};
async function fingerprint(directory) {
  for (const entry of (await readdir(directory, { withFileTypes: true })).sort((a, b) => a.name.localeCompare(b.name))) {
    const filename = path.join(directory, entry.name);
    if (entry.isDirectory()) await fingerprint(filename);
    else if (/\.(ts|json)$/.test(entry.name)) generatorInputs[path.relative(root, filename)] = sha(await readFile(filename));
  }
}
await fingerprint(path.join(codegenRoot, 'codegen'));
await fingerprint(path.join(codegenRoot, 'vendor/companion'));
for (const filename of ['package.json', 'pnpm-lock.yaml']) {
  generatorInputs[`tools/valdi-rolldown/${filename}`] = sha(await readFile(path.join(codegenRoot, filename)));
}
for (const filename of ['tools/valdi-rolldown/pipeline.ts', 'tools/valdi-rolldown/valdiTs.ts',
  'harmony/business-build/generate-bindings.ts', 'scripts/harmony/prepare-business.mjs']) {
  generatorInputs[filename] = sha(await readFile(path.join(root, filename)));
}
provenance.codegen = {
  method: 'existing Node dumpAllSymbols/processAnnotations/generateModels/combineNativeSources',
  node: process.version, typescript: JSON.parse(await readFile(path.join(codegenRoot, 'node_modules/typescript/package.json'))).version,
  inputs: generatorInputs,
};
let configurations = [];
try { configurations = (await readdir(bazelOut)).sort(); } catch {}
for (const filename of ['client_sql.hpp', 'client_sql.cpp']) {
  const relative = `valdi_modules/client_sql/${filename}`;
  const data = await readFile(path.join(output, 'generated', relative));
  const record = { path: path.join(output, 'generated', relative), sha256: sha(data), matchingBazelOutputs: [] };
  for (const configuration of configurations) {
    const candidate = path.join(bazelOut, configuration, 'bin/external/valdi+', moduleDir, 'cpp/release/src', relative);
    try { if (sha(await readFile(candidate)) === sha(data)) record.matchingBazelOutputs.push(candidate); } catch {}
  }
  provenance.generated[relative] = record;
}

// Derive the immutable dependency from this pin, never from the latest release.
const sqliteRule = manifest.match(/http_archive\(\s*name = "valdi_clientsql_sqlite",([\s\S]*?)\n\)/)?.[1];
const archiveSha = sqliteRule?.match(/sha256 = "([a-f0-9]{64})"/)?.[1];
const prefix = sqliteRule?.match(/strip_prefix = "([^"]+)"/)?.[1];
const url = sqliteRule?.match(/url = "(https:\/\/www\.sqlite\.org\/[^"]+)"/)?.[1];
if (!archiveSha || !prefix || !url) throw new Error('Unrecognized pinned SQLite http_archive');
const cacheCandidates = [
  options['sqlite-archive'],
  options['repository-cache'] && path.join(options['repository-cache'], 'content_addressable/sha256', archiveSha, 'file'),
  path.join(output, 'downloads', `${archiveSha}.tar.gz`),
  `/private/var/tmp/_bazel_${process.env.USER}/cache/repos/v1/content_addressable/sha256/${archiveSha}/file`,
  path.join(process.env.HOME, 'Library/Caches/bazel/_bazel_' + process.env.USER, 'cache/repos/v1/content_addressable/sha256', archiveSha, 'file'),
].filter(Boolean);
let archive, origin;
for (const candidate of cacheCandidates) {
  let data;
  try { data = await readFile(candidate); } catch { continue; }
  if (sha(data) !== archiveSha) throw new Error(`SQLite archive checksum mismatch: ${candidate}`);
  archive = candidate;
  origin = candidate;
  break;
}
if (!archive) {
  console.log(`Fetching pinned SQLite: ${url}`);
  const response = await fetch(url);
  if (!response.ok) throw new Error(`SQLite fetch failed: HTTP ${response.status}`);
  const data = Buffer.from(await response.arrayBuffer());
  if (sha(data) !== archiveSha) throw new Error('SQLite download checksum mismatch');
  archive = path.join(output, 'downloads', `${archiveSha}.tar.gz`);
  await writeIfChanged(archive, data);
  origin = url;
}
provenance.sqlite = { url, archiveSha256: archiveSha, stripPrefix: prefix, archiveOrigin: origin, files: {} };
let cachedSQLite;
try { cachedSQLite = await realpath(path.join(external, 'valdi++_repo_rules+valdi_clientsql_sqlite')); } catch {}
for (const filename of ['sqlite3.c', 'sqlite3.h', 'sqlite3ext.h']) {
  const data = execFileSync('tar', ['-xOf', archive, `${prefix}/${filename}`], { maxBuffer: 24 * 1024 * 1024 });
  // When present, prove the Bazel source is identical to the hash-verified archive.
  if (cachedSQLite && sha(await readFile(path.join(cachedSQLite, filename))) !== sha(data)) {
    throw new Error(`Bazel cached SQLite differs from the immutable archive: ${filename}`);
  }
  await writeIfChanged(path.join(output, 'sqlite', filename), data);
  provenance.sqlite.files[filename] = sha(data);
}
const header = (await readFile(path.join(output, 'sqlite/sqlite3.h'))).toString();
provenance.sqlite.sourceId = header.match(/^#define SQLITE_SOURCE_ID\s+"([^"]+)"/m)?.[1];
provenance.sqlite.version = header.match(/^#define SQLITE_VERSION\s+"([^"]+)"/m)?.[1];
provenance.sqlite.matchingBazelSource = cachedSQLite;
const quote = value => `"${value.replaceAll('\\', '/').replaceAll('"', '\\"').replaceAll(';', '\\;')}"`;
await writeIfChanged(path.join(output, 'inputs.cmake'),
  `# Generated by scripts/harmony/prepare-business.mjs\nset(VALDI_CLIENTSQL_PIN ${quote(pin)})\n` +
  `set(VALDI_CLIENTSQL_SQLITE_VERSION ${quote(provenance.sqlite.version)})\n`);
await writeIfChanged(path.join(output, 'provenance.json'), JSON.stringify(provenance, null, 2) + '\n');
console.log(`Prepared ClientSQL ${pin}\nInputs: ${output}\nSQLite ${provenance.sqlite.version}: ${archiveSha}`);
