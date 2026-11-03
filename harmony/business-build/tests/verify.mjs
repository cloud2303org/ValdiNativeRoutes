#!/usr/bin/env node
// Reproducible native-only validation. No device, Hvigor, Bazel, or remote steps.
import { createHash } from 'node:crypto';
import { createWriteStream } from 'node:fs';
import { mkdir, readFile, stat, writeFile } from 'node:fs/promises';
import { execFileSync, spawn } from 'node:child_process';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const business = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const root = path.resolve(business, '../..');
const args = process.argv.slice(2);
const skipHost = args.includes('--skip-host');
if (skipHost) args.splice(args.indexOf('--skip-host'), 1);
const options = {};
for (let i = 0; i < args.length; i += 2) {
  if (!['--ndk', '--output', '--runtime-root', '--host-cmake'].includes(args[i]) || !args[i + 1]) {
    throw new Error('Usage: verify.mjs --ndk OHOS_NDK [--output DIR] [--runtime-root DIR] [--host-cmake FILE] [--skip-host]');
  }
  options[args[i].slice(2)] = path.resolve(args[i + 1]);
}
const ndk = options.ndk ?? process.env.OHOS_NDK_HOME;
if (!ndk) throw new Error('Pass --ndk or set OHOS_NDK_HOME');
const cmake = path.join(ndk, 'build-tools/cmake/bin/cmake');
const artifacts = options.output ?? path.join(business, '.artifacts');
const runtimeRoot = options['runtime-root'] ?? path.join(root, '.tools/harmony');
const sha = data => createHash('sha256').update(data).digest('hex');
const inspect = (tool, flags) => execFileSync(path.join(ndk, 'llvm/bin', tool), flags, { encoding: 'utf8', maxBuffer: 8 * 1024 * 1024 });
async function artifact(filename) {
  return { path: filename, bytes: (await stat(filename)).size, sha256: sha(await readFile(filename)) };
}
async function run(command, parameters, logfile) {
  const stream = createWriteStream(logfile);
  const child = spawn(command, parameters, { stdio: ['ignore', 'pipe', 'pipe'] });
  child.stdout.pipe(stream, { end: false });
  child.stderr.pipe(stream, { end: false });
  await new Promise((resolve, reject) => {
    child.once('error', reject);
    child.once('close', code => stream.end(() => code === 0 ? resolve() : reject(new Error(`${command} exited ${code}; see ${logfile}`))));
  });
}
const inputs = path.join(root, '.tools/harmony/business-inputs');
const provenanceFile = path.join(inputs, 'provenance.json');
const provenance = JSON.parse(await readFile(provenanceFile, 'utf8'));
for (const [name, record] of Object.entries(provenance.generated)) {
  if (sha(await readFile(path.join(inputs, 'generated', name))) !== record.sha256) {
    throw new Error(`Prepared generated source was changed: ${name}`);
  }
}
for (const [name, digest] of Object.entries(provenance.sqlite.files)) {
  if (sha(await readFile(path.join(inputs, 'sqlite', name))) !== digest) {
    throw new Error(`Prepared SQLite source was changed: ${name}`);
  }
}
for (const [name, digest] of Object.entries(provenance.files)) {
  if (!name.includes('/native/')) continue;
  if (sha(await readFile(path.join(inputs, 'native', path.basename(name)))) !== digest) {
    throw new Error(`Prepared native source was changed: ${name}`);
  }
}
const proof = {
  commit: provenance.commit, ndk: path.resolve(ndk),
  compiler: inspect('clang++', ['--version']).trim(),
  inputProvenance: await artifact(provenanceFile),
  generated: provenance.generated, sqlite: provenance.sqlite,
  execution: { ohos: false, host: false },
  linkFlags: ['--whole-archive (ClientSQL)', '--no-undefined', '--no-gc-sections'],
  runtimeLinkage: 'Existing OHOS static runtime and exact dependency archive closure from its strict Ninja link',
  abis: {},
};
await Promise.all(['x86_64', 'arm64-v8a'].map(async abi => {
  const directory = path.join(artifacts, abi);
  const runtime = path.join(runtimeRoot, `runtime-${abi}`);
  await mkdir(directory, { recursive: true });
  const configure = ['-S', path.join(business, 'tests/ohos'), '-B', directory, '-G', 'Ninja',
    `-DCMAKE_MAKE_PROGRAM=${path.join(ndk, 'build-tools/cmake/bin/ninja')}`,
    `-DCMAKE_TOOLCHAIN_FILE=${path.join(ndk, 'build/cmake/ohos.toolchain.cmake')}`,
    `-DOHOS_ARCH=${abi}`, '-DOHOS_PLATFORM_LEVEL=26', '-DCMAKE_BUILD_TYPE=Release',
    '-DCMAKE_EXPORT_COMPILE_COMMANDS=ON', `-DVALDI_CLIENTSQL_RUNTIME_BUILD_DIR=${runtime}`];
  await run(cmake, configure, path.join(directory, 'configure.log'));
  await run(cmake, ['--build', directory, '--parallel', '3'], path.join(directory, 'build.log'));
  const library = path.join(directory, 'business/libvaldi_clientsql_ohos_link_check.so');
  const elf = inspect('llvm-readelf', ['-h', '-d', library]);
  const symbols = inspect('llvm-nm', ['--defined-only', '-C', library]);
  const machine = elf.match(/Machine:\s+([^\n]+)/)?.[1];
  if (!(abi === 'x86_64' ? machine?.includes('X86-64') : machine === 'AArch64')) throw new Error(`Wrong ELF ABI: ${machine}`);
  if (elf.includes('TEXTREL')) throw new Error(`TEXTREL in ${library}`);
  const needed = [...elf.matchAll(/\(NEEDED\).*?\[([^\]]+)\]/g)].map(match => match[1]);
  if (needed.some(name => /valdi|sqlite/.test(name))) throw new Error(`Expected static runtime/SQLite closure, got ${needed}`);
  for (const required of ['Valdi::ClientSQLNativeModuleFactory::onLoadModule', 'ClientSQLNativeConnectionProxy::getRegisteredClass',
    'sqlite3_open_v2', 'sqlite3_sourceid', 'valdi_clientsql_ohos_registration_build_probe']) {
    if (!symbols.includes(required)) throw new Error(`Missing actual linked symbol: ${required}`);
  }
  await writeFile(path.join(directory, 'elf.txt'), elf);
  await writeFile(path.join(directory, 'symbols.txt'), symbols);
  const commands = JSON.parse(await readFile(path.join(directory, 'compile_commands.json'), 'utf8'));
  proof.abis[abi] = {
    machine, needed, textRelocations: false, configureCommand: [cmake, ...configure],
    compileCommands: await artifact(path.join(directory, 'compile_commands.json')),
    translationUnits: commands.map(entry => entry.file),
    runtime: await artifact(path.join(runtime, 'libvaldi_runtime_ohos.a')),
    artifacts: await Promise.all(['libvaldi_clientsql_ohos.a', 'libvaldi_clientsql_sqlite_ohos.a', 'libvaldi_clientsql_ohos_link_check.so']
      .map(name => artifact(path.join(directory, 'business', name)))),
    buildLog: (await readFile(path.join(directory, 'build.log'), 'utf8')).trim(),
  };
  console.log(`${abi}: strict static-closure link passed (${machine})`);
}));
if (!skipHost && process.platform === 'darwin') {
  const directory = path.join(artifacts, 'host');
  await mkdir(directory, { recursive: true });
  const hostCmake = options['host-cmake'] ?? 'cmake';
  await run(hostCmake, ['-S', path.join(business, 'tests/host'), '-B', directory, '-G', 'Ninja', '-DCMAKE_BUILD_TYPE=Release'],
    path.join(directory, 'configure.log'));
  await run(hostCmake, ['--build', directory, '--parallel', '4'], path.join(directory, 'build.log'));
  const executable = path.join(directory, 'clientsql_native_tests');
  await run(executable, [`--gtest_output=xml:${path.join(directory, 'results.xml')}`], path.join(directory, 'tests.log'));
  const results = await readFile(path.join(directory, 'results.xml'), 'utf8');
  const tests = Number(results.match(/<testsuites tests="(\d+)"/)?.[1]);
  if (!tests || !results.includes('failures="0"')) throw new Error('Host test result missing or failed');
  proof.execution.host = true;
  proof.host = { tests, failures: 0, executable: await artifact(executable), results: await artifact(path.join(directory, 'results.xml')),
    gtestSource: path.join(root, '.tools/harmony/runtime-inputs/external/boringssl/third_party/googletest'),
    testsSource: await artifact(path.join(inputs, 'native/ClientSQLNativeModuleFactory_tests.cpp')) };
  console.log(`macOS: ${tests} real pinned ClientSQL tests passed`);
}
const proofFile = path.join(artifacts, 'proof.json');
await writeFile(proofFile, JSON.stringify(proof, null, 2) + '\n');
console.log(`Proof: ${proofFile}`);
