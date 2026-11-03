#!/usr/bin/env node
// Stage writable inputs; never configure CMake inside the Bazel external cache.
import { constants } from 'node:fs';
import { cp, mkdir, readFile, readdir, realpath, stat, writeFile } from 'node:fs/promises';
import { createHash } from 'node:crypto';
import { execFileSync, spawn } from 'node:child_process';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { runtimePatchFiles } from '../upstream-runtime-patches.mjs';
import { bazelExternalDirectory } from './bazel-cache.mjs';

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '../..');
const pin = '15feb6530ceecb971f4c8519ea8ab77474b959db';
const args = process.argv.slice(2);
const options = {};
for (let i = 0; i < args.length; i += 2) {
  if (!['--source', '--external', '--output', '--git-source', '--bazel-out'].includes(args[i]) || !args[i + 1]) {
    throw new Error('Usage: prepare-runtime.mjs [--source DIR] [--external DIR] [--output DIR] [--git-source DIR] [--bazel-out DIR]');
  }
  options[args[i].slice(2)] = path.resolve(args[i + 1]);
}
const source = options.source ?? path.join(root, '.tools/harmony/upstream');
const external = options.external ?? await bazelExternalDirectory(root);
const output = options.output ?? path.join(root, '.tools/harmony/runtime-inputs');
const gitSource = options['git-source'] ?? process.env.VALDI_FORK_SOURCE ?? path.resolve(root, '../Valdi-node-only');
const bazelOut = options['bazel-out'] ?? path.join(root, 'valdi/bazel-out');
const generated = path.join(output, 'generated');
await mkdir(generated, { recursive: true });
const sha = (data) => createHash('sha256').update(data).digest('hex');
async function writeIfChanged(filename, data) {
  const content = Buffer.from(data);
  try { if ((await readFile(filename)).equals(content)) return; } catch {}
  await writeFile(filename, content);
}
const platformOverlayFiles = new Set([
  ...runtimePatchFiles,
  'valdi_core/src/valdi_core/cpp/Context/PlatformType.hpp',
  'valdi_core/generated-src/cpp/valdi_core/Platform.hpp',
  'valdi_core/generated-src/cpp/valdi_core/AssetOutputType.hpp',
  'valdi/src/valdi/runtime/JavaScript/JavaScriptRuntime.cpp',
  'valdi/src/valdi/runtime/Context/ViewNodeAssetHandler.cpp',
  'valdi/src/valdi/runtime/RuntimeManager.cpp',
  'valdi/src/valdi/runtime/Attributes/DefaultAttributes.cpp',
  'valdi/src/valdi/runtime/Views/GlobalViewFactories.cpp',
  'valdi/src/valdi/runtime/Context/ViewManagerContext.cpp',
  'valdi/src/valdi/runtime/Views/ViewPreloader.cpp',
  'valdi/src/valdi/runtime/Views/ViewPreloader.hpp',
]);

try {
  await stat(path.join(source, 'MODULE.bazel'));
} catch {
  await mkdir(source, { recursive: true });
  const archive = spawn('git', ['-C', gitSource, 'archive', pin], { stdio: ['ignore', 'pipe', 'inherit'] });
  const extract = spawn('tar', ['-xf', '-', '-C', source], { stdio: ['pipe', 'inherit', 'inherit'] });
  const exited = (child) => new Promise((resolve, reject) => {
    child.once('error', reject);
    child.once('close', (code) => code === 0 ? resolve() : reject(new Error(`Archive process exited ${code}`)));
  });
  archive.stdout.pipe(extract.stdin);
  await Promise.all([exited(archive), exited(extract)]);
}

// Check the actual exported build inputs against the git object, never HEAD.
const checks = [
  'valdi/BUILD.bazel', 'valdi_core/BUILD.bazel', 'MODULE.bazel',
  'third-party/hermes_v1/sources.bzl', 'third-party/hermes_v1/hermes.BUILD',
  'third-party/hermes_v1/prepared_include/linux/libhermesvm-config.h',
  'third-party/hermes_v1/prepared_include/internal_js/InternalBytecode.inc',
];
for (const name of checks) {
  const expected = execFileSync('git', ['-C', gitSource, 'show', `${pin}:${name}`], { maxBuffer: 16 * 1024 * 1024 });
  if (sha(await readFile(path.join(source, name))) !== sha(expected)) {
    throw new Error(`Source does not match ${pin}: ${name}`);
  }
}
const tree = execFileSync('git', ['-C', gitSource, 'ls-tree', '-rz', pin, '--',
  'valdi/src/valdi/runtime', 'valdi/src/valdi/hermes', 'valdi/src/valdi/jsbridge',
  'valdi/generated-src/cpp', 'valdi_core/src', 'valdi_core/generated-src/cpp',
  'valdi_protobuf/src', 'libs/utils/src', 'third-party/yoga/src',
  'third-party/djinni-support-lib/src', 'third-party/hermes_v1',
], { maxBuffer: 16 * 1024 * 1024 }).toString().split('\0').filter(Boolean);
for (const entry of tree) {
  const [, mode, hash, name] = entry.match(/^(\d+) blob ([a-f0-9]+)\t(.+)$/) ?? [];
  if (!name || mode === '120000') throw new Error(`Unsupported source tree entry: ${entry}`);
  const data = await readFile(path.join(source, name));
  const actual = createHash('sha1').update(`blob ${data.length}\0`).update(data).digest('hex');
  if (actual !== hash && !platformOverlayFiles.has(name)) {
    throw new Error(`Source does not match ${pin}: ${name}`);
  }
}
execFileSync(process.execPath, [path.join(root, 'scripts/harmony/apply-platform.mjs'), source], { stdio: 'inherit' });

const dependencies = {
  hermes: 'valdi++_repo_rules+hermes',
  boost: 'valdi++_repo_rules+boost',
  boringssl: 'boringssl+',
  protobuf: 'protobuf+',
  abseil: 'abseil-cpp+',
  harfbuzz: 'valdi++_repo_rules+harfbuzz',
  fmt: 'valdi++_repo_rules+fmt',
  jsoncpp: 'jsoncpp+',
  phmap: 'valdi++_repo_rules+phmap',
  zoo: 'valdi++_repo_rules+zoo',
  zstd: 'zstd+',
  xxhash: 'xxhash+',
};
const provenance = { commit: pin, source, external: await realpath(external), dependencies: {} };
provenance.platformOverlay = Object.fromEntries(await Promise.all(
  [...platformOverlayFiles].map(async (name) => [name, sha(await readFile(path.join(source, name)))]),
));
for (const [name, cacheName] of Object.entries(dependencies)) {
  const original = await realpath(path.join(external, cacheName));
  const destination = path.join(output, 'external', name);
  const marker = path.join(destination, '.harmony-copy.json');
  let ready = false;
  try {
    const previous = JSON.parse(await readFile(marker, 'utf8'));
    ready = previous.original === original && previous.pin === pin;
  } catch {}
  if (!ready) {
    console.log(`Staging ${name}`);
    await cp(original, destination, {
      recursive: true, dereference: true, mode: constants.COPYFILE_FICLONE,
      filter: (entry) => !['.git', 'node_modules'].includes(path.basename(entry)),
    });
    await writeFile(marker, JSON.stringify({ original, pin }) + '\n');
  }
  provenance.dependencies[name] = { original, staged: destination };
}

function manifest(text, name) {
  const list = text.match(new RegExp(`^${name}\\s*=\\s*\\[([\\s\\S]*?)^\\]`, 'm'));
  if (!list) throw new Error(`Missing manifest ${name}`);
  return [...list[1].matchAll(/"([^"]+)"/g)].map((match) => match[1]);
}
const hermesManifest = await readFile(path.join(source, 'third-party/hermes_v1/sources.bzl'), 'utf8');
let cmake = '# Generated by prepare-runtime.mjs from the pinned source manifests.\n';
for (const name of ['VM_SRCS', 'LEAN_BACKEND_SRCS', 'LLVH_SRCS', 'DTOA_SRCS']) {
  const files = manifest(hermesManifest, name);
  for (const file of files) await stat(path.join(output, 'external/hermes', file));
  cmake += `set(HERMES_${name}\n${files.map((file) => `  "\${HERMES_SOURCE_DIR}/${file}"`).join('\n')}\n)\n`;
}
const hbManifest = await readFile(path.join(source, 'third-party/harfbuzz/harfbuzz.BUILD'), 'utf8');
cmake += `set(HARFBUZZ_SRCS\n${manifest(hbManifest, 'SOURCES').map((file) => `  "\${VALDI_HARMONY_EXTERNAL_DIR}/harfbuzz/${file}"`).join('\n')}\n)\n`;
await writeIfChanged(path.join(generated, 'sources.cmake'), cmake);

// Generated protobuf files are platform independent, but must match this runtime's protoc.
const pairs = [
  ['compiler/compiler/_virtual_imports/valdi_proto', 'valdi/valdi'],
  ['valdi_protobuf/_virtual_imports/descriptor_index_proto', 'valdi_protobuf/protos/DescriptorIndex'],
];
const configurations = (await readdir(bazelOut)).sort();
for (const [prefix, name] of pairs) {
  const protoSource = name === 'valdi/valdi' ? 'compiler/compiler/valdi.proto'
    : 'valdi_protobuf/src/valdi_protobuf/protos/DescriptorIndex.proto';
  if (sha(await readFile(path.join(external, 'valdi+', protoSource))) !==
      sha(await readFile(path.join(source, protoSource)))) {
    throw new Error(`Cached proto input differs from pinned source: ${protoSource}`);
  }
  let found;
  for (const configuration of configurations) {
    const candidate = path.join(bazelOut, configuration, 'bin/external/valdi+', prefix, `${name}.pb.h`);
    try {
      const header = await readFile(candidate, 'utf8');
      if (header.includes('PROTOBUF_VERSION != 5029003')) { found = path.dirname(candidate); break; }
    } catch {}
  }
  if (!found) throw new Error(`No protoc 29.3 generated pair for ${name}; populate the pinned Bazel output first`);
  for (const extension of ['h', 'cc']) {
    const destination = path.join(generated, 'proto', `${name}.pb.${extension}`);
    await mkdir(path.dirname(destination), { recursive: true });
    await writeIfChanged(destination, await readFile(path.join(found, `${path.basename(name)}.pb.${extension}`)));
  }
}
const hermes = path.join(output, 'external/hermes');
const jsInputs = (await readdir(path.join(hermes, 'lib/InternalJavaScript'))).filter((name) => name.endsWith('.js')).sort();
execFileSync('python3', [
  path.join(source, 'third-party/hermes_v1/check_internal_bytecode.py'),
  '--inc', path.join(source, 'third-party/hermes_v1/prepared_include/internal_js/InternalBytecode.inc'),
  '--bytecode-version-header', path.join(hermes, 'include/hermes/BCGen/HBC/BytecodeVersion.h'),
  ...jsInputs.flatMap((name) => ['--source', path.join(hermes, 'lib/InternalJavaScript', name)]),
], { stdio: 'inherit' });
provenance.manifestSha256 = sha(hermesManifest);
await writeIfChanged(path.join(output, 'provenance.json'), JSON.stringify(provenance, null, 2) + '\n');
console.log(`Prepared ${pin}\nSource: ${source}\nExternal: ${path.join(output, 'external')}\nGenerated: ${generated}`);
