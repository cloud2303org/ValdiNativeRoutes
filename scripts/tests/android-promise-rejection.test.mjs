import assert from 'node:assert/strict';
import { spawn, spawnSync } from 'node:child_process';
import { createHash } from 'node:crypto';
import { existsSync, mkdirSync, mkdtempSync, readFileSync, readdirSync, rmSync, writeFileSync } from 'node:fs';
import { homedir, tmpdir } from 'node:os';
import path from 'node:path';
import test from 'node:test';
import { fileURLToPath } from 'node:url';

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '../..');
const pin = '15feb6530ceecb971f4c8519ea8ab77474b959db';
const gitSource = process.env.VALDI_FORK_SOURCE ?? path.resolve(root, '../Valdi-node-only');
const patch = path.join(root, 'valdi/patches/promise-rejection-message.patch');
const helpers = path.join(root, 'scripts/tests/android-promise-rejection');
const javaRoot = 'valdi/src/java/com/snap/valdi';
const marker = `${javaRoot}/exceptions/PromiseRejectionException.kt`;
const callback = `${javaRoot}/promise/CppPromiseCallback.kt`;
const productionFiles = [
  'exceptions/ValdiException.kt', 'exceptions/ExceptionUtils.kt',
  'promise/CppPromiseCallback.kt', 'promise/Promise.kt', 'promise/PromiseCallback.kt',
  'promise/ResolvablePromise.kt', 'promise/CancelableResolvablePromise.kt',
  'promise/ResolvedPromise.kt', 'promise/RejectedPromise.kt',
  'utils/CppNativeHandlePair.kt', 'utils/Disposable.kt', 'utils/DisposablePrivate.kt',
  'utils/DisposableUtils.kt',
].map(name => `${javaRoot}/${name}`);

function run(command, args, options = {}) {
  const result = spawnSync(command, args, { encoding: 'utf8', maxBuffer: 8 * 1024 * 1024, ...options });
  if (result.error) throw result.error;
  return result;
}
function success(command, args, options) {
  const result = run(command, args, options);
  assert.equal(result.status, 0,
    `${command} failed (${result.signal ?? result.status}):\n${result.stdout}\n${result.stderr}`);
  return result.stdout;
}
function temporary(t) {
  const directory = mkdtempSync(path.join(tmpdir(), 'valdi-promise-rejection-'));
  t.after(() => rmSync(directory, { recursive: true, force: true }));
  return directory;
}
function pinned(name) {
  return success('git', ['-C', gitSource, 'show', `${pin}:${name}`]);
}
function write(directory, name, text) {
  const filename = path.join(directory, name);
  mkdirSync(path.dirname(filename), { recursive: true });
  writeFileSync(filename, text);
}
function fixture(directory) {
  for (const name of productionFiles) write(directory, name, pinned(name));
}
function patchPaths(filename) {
  return [...readFileSync(filename, 'utf8').matchAll(/^diff --git a\/(.+) b\/(.+)$/gm)].map(match => {
    assert.equal(match[1], match[2]);
    return match[1];
  });
}

test('canonical Android-only patch applies at the unchanged pin and is registered beside lossless', t => {
  const directory = temporary(t);
  fixture(directory);
  assert.deepEqual(patchPaths(patch), [marker, callback]);
  assert.match(readFileSync(patch, 'utf8'), /new file mode 100644\nindex 0000000\.\.[0-9a-f]+/);
  assert.doesNotMatch(readFileSync(patch, 'utf8'), /\\ No newline at end of file/);
  success('git', ['apply', '--check', patch], { cwd: directory });
  success('git', ['apply', patch], { cwd: directory });
  success('git', ['apply', '--reverse', '--check', patch], { cwd: directory });
  // Existing exception/cancellation and Promise state semantics must stay byte-identical.
  for (const name of productionFiles.filter(name => name !== callback)) {
    assert.equal(readFileSync(path.join(directory, name), 'utf8'), pinned(name), name);
  }
  const module = readFileSync(path.join(root, 'valdi/MODULE.bazel'), 'utf8');
  assert.match(module, new RegExp(`VALDI_COMMIT = "${pin}"`));
  const archive = module.match(/archive_override\(\s+module_name = "valdi",([\s\S]*?)\n\)/)?.[1];
  assert.ok(archive);
  assert.deepEqual([...archive.matchAll(/"\/\/patches:([^"]+)"/g)].map(match => match[1]),
    ['lossless-map-transport.patch', 'promise-rejection-message.patch']);
  assert.match(archive, /patch_strip = 1/);
  const exported = readFileSync(path.join(root, 'valdi/patches/BUILD.bazel'), 'utf8');
  for (const name of ['lossless-map-transport.patch', 'promise-rejection-message.patch']) {
    assert.ok(exported.includes(`"${name}"`));
  }
  const build = pinned('valdi/BUILD.bazel');
  assert.match(build, /name = "valdi_java",\s+srcs = glob\(\[\s+"src\/java\/\*\*\/\*\.java",\s+"src\/java\/\*\*\/\*\.kt",\s+\]\)/);
  assert.ok(marker.startsWith('valdi/src/java/') && marker.endsWith('.kt'));
  const nestedBuilds = success('git', ['-C', gitSource, 'ls-tree', '-r', '--name-only',
    pin, 'valdi/src/java']).split('\n').filter(name => /\/BUILD(?:\.bazel)?$/.test(name));
  assert.ok(!nestedBuilds.some(name => marker.startsWith(`${path.posix.dirname(name)}/`)),
    'A nested Bazel package would exclude the marker from the valdi_java glob');
  assert.match(readFileSync(path.join(directory, marker), 'utf8'),
    /@Keep\s+class PromiseRejectionException @JvmOverloads constructor/);
  // Harmony writable staging deliberately consumes only its lossless Hermes patch.
  const staging = readFileSync(path.join(root, 'scripts/upstream-runtime-patches.mjs'), 'utf8');
  assert.ok(staging.includes('valdi/patches/lossless-map-transport.patch'));
  assert.ok(!staging.includes('promise-rejection-message.patch'));
});

function toolchain() {
  const gradle = path.join(homedir(), '.gradle');
  let lib = process.env.VALDI_TEST_KOTLIN_LIB;
  if (!lib) {
    const jars = success('rg', ['--files', path.join(gradle, 'wrapper/dists')]).trim().split('\n');
    const compiler = jars.filter(name => /\/kotlin-compiler-embeddable-[^/]+\.jar$/.test(name)).sort().at(-1);
    lib = compiler && path.dirname(compiler);
  }
  assert.ok(lib, 'Set VALDI_TEST_KOTLIN_LIB to an existing Kotlin compiler/Gradle lib directory');
  const stdlib = readdirSync(lib).find(name => /^kotlin-stdlib-[\d.]+\.jar$/.test(name));
  assert.ok(stdlib, `Missing kotlin-stdlib in ${lib}`);
  const annotations = process.env.VALDI_TEST_ANDROIDX_ANNOTATION ?? success('rg', ['--files',
    path.join(gradle, 'caches/modules-2/files-2.1/androidx.annotation')]).trim().split('\n')
    .find(name => /\/annotation(?:-jvm)?-[\d.]+\.jar$/.test(name));
  assert.ok(annotations, 'Set VALDI_TEST_ANDROIDX_ANNOTATION to an existing AndroidX annotation jar');
  const settings = run('java', ['-XshowSettings:properties', '-version']);
  assert.equal(settings.status, 0, settings.stderr);
  const javaHome = settings.stderr.match(/^\s*java\.home = (.+)$/m)?.[1];
  assert.ok(javaHome, 'Cannot determine JDK home from java');
  return { lib, stdlib: path.join(lib, stdlib), annotations, javaHome };
}

test('actual Kotlin Promise callback crosses JNI: baseline is red, opt-in patch is green', { timeout: 120000 }, t => {
  const directory = temporary(t);
  fixture(directory);
  success('git', ['apply', patch], { cwd: directory });
  const tools = toolchain();
  const classes = path.join(directory, 'classes');
  mkdirSync(classes);
  const library = path.join(directory, process.platform === 'darwin' ? 'capture.dylib' : 'capture.so');
  success(process.env.CC ?? 'cc', [
    process.platform === 'darwin' ? '-dynamiclib' : '-shared', '-fPIC', '-Wall', '-Wextra',
    '-Wno-unused-parameter', '-Werror',
    `-I${tools.javaHome}/include`, `-I${tools.javaHome}/include/${process.platform === 'darwin' ? 'darwin' : 'linux'}`,
    path.join(helpers, 'capture.c'), '-o', library,
  ]);
  success(path.join(tools.javaHome, 'bin/javac'), ['-d', classes, path.join(helpers, 'NativeBridge.java')]);
  const classpath = [classes, tools.stdlib, tools.annotations].join(path.delimiter);
  const compile = () => success('java', [
    '-cp', path.join(tools.lib, '*'), 'org.jetbrains.kotlin.cli.jvm.K2JVMCompiler',
    '-no-stdlib', '-no-reflect', '-jvm-target', '17', '-classpath', classpath, '-d', classes,
    ...[...productionFiles, marker].map(name => path.join(directory, name)),
    path.join(helpers, 'PromiseRejectionConsumer.kt'),
  ], { timeout: 45000 });
  const consume = () => run('java', [
    '-Xcheck:jni', '-cp', classpath, 'PromiseRejectionConsumerKt', library,
  ], { timeout: 15000 });
  // Give the old callback the new marker API only. This isolates the behavioral
  // regression rather than treating an unresolved class as a useful red result.
  write(directory, callback, pinned(callback));
  compile();
  const red = consume();
  assert.equal(red.status, 1, red.stderr);
  assert.deepEqual([...red.stdout.matchAll(/^FAIL ([^:]+):/gm)].map(match => match[1]), [
    'public-cancel', 'public-error', 'explicit-empty-failure', 'explicit-whitespace-failure',
    'explicit-coded-cancel', 'explicit-other-code', 'pending-resolvable-cancel',
    'late-resolvable-empty-failure', 'producer-settles-during-cancel',
  ], red.stdout);
  assert.match(red.stdout, /Expected message <cancel>, got <PromiseRejectionException: 'cancel'>/);
  t.diagnostic('RED: old callback fails 9 raw-message cases; existing diagnostics/cancellation cases pass.');
  success('git', ['apply', '--include', callback, patch], { cwd: directory });
  compile();
  const green = consume();
  assert.equal(green.status, 0, `${green.stdout}\n${green.stderr}`);
  assert.equal([...green.stdout.matchAll(/^PASS /gm)].length, 19, green.stdout);
  assert.ok(!green.stderr.includes('WARNING in native method'), green.stderr);
  t.diagnostic(green.stdout.trim());
  // Trace compatibility with the actual pinned Android native registration.
  const jni = pinned('valdi/src/valdi/android/CppPromiseCallbackJNI.hpp');
  assert.match(jni, /jstring error,\s+jint errorCode/);
  assert.match(jni, /Valdi::Error\(toInternedString\(JavaEnv\(\), error\), errorCode\)/);
  assert.match(jni, /makeNativeMethod\("nativeOnFailure", CppPromiseCallbackJNI::nativeOnFailure\)/);
  const bytecode = success(path.join(tools.javaHome, 'bin/javap'),
    ['-classpath', classes, '-s', '-p', 'com.snap.valdi.promise.CppPromiseCallback']);
  assert.match(bytecode, /native void nativeOnFailure\(long, long, java.lang.String, int\);\s+descriptor: \(JJLjava\/lang\/String;I\)V/);
});

function bazelProbe(directory) {
  // Bazelisk otherwise selects its default (9.3.1 at the original test run),
  // whose parser accepts the EOF marker rejected by the project's Bazel 8.2.1.
  const version = readFileSync(path.join(root, 'valdi/.bazelversion'), 'utf8').trim();
  const env = { ...process.env, USE_BAZEL_VERSION: version };
  const startup = ['--batch', `--output_user_root=${directory}/bazel-user-root`];
  const options = {
    env, timeout: 110000,
  };
  return {
    version,
    startup,
    options,
    query(cwd, output, label) {
      return run('bazel', [...startup, `--output_base=${output}`, 'query', label,
        '--noshow_progress', '--lockfile_mode=off', `--repository_cache=${directory}/repo-cache`],
      { ...options, cwd });
    },
  };
}

function comparePatchedFiles(staged, source, names) {
  for (const name of names) {
    let expected = readFileSync(path.join(source, name));
    if (name === callback) {
      // Bazel 8's patcher writes a final newline; git preserves the pinned
      // callback's missing newline when the patch does not touch EOF. Account
      // for this one known byte only, rather than normalizing whole files.
      assert.ok(!expected.toString().endsWith('\n'));
      expected = Buffer.concat([expected, Buffer.from('\n')]);
    }
    assert.deepEqual(readFileSync(path.join(staged, name)), expected, name);
  }
}

// Exercise the same archive_override -> http_archive -> utils.patch -> ctx.patch
// path as the main project, with its exact Bazel version, in independent roots.
test('Bazel archive_override rejects the preserved EOF patch and accepts the canonical patch', {
  skip: process.env.VALDI_TEST_BAZEL_NATIVE_PATCHER !== '1', timeout: 120000,
}, t => {
  const directory = temporary(t);
  const probe = bazelProbe(directory);
  const prefix = `Valdi-${pin}`;
  const source = path.join(directory, 'archive', prefix);
  fixture(source);
  const lossless = path.join(root, 'valdi/patches/lossless-map-transport.patch');
  for (const name of patchPaths(lossless)) write(source, name, pinned(name));
  write(source, 'MODULE.bazel', 'module(name = "valdi", version = "0.1")\n');
  write(source, 'BUILD.bazel', 'filegroup(name = "patched", srcs = glob(["**/*"]))\n');
  const archive = path.join(directory, 'pinned-fixture.tar.gz');
  success('tar', ['-czf', archive, '-C', path.dirname(source), prefix]);
  const rejected = readFileSync(path.join(helpers, 'rejected-eof-marker.patch'));
  assert.equal(createHash('sha256').update(rejected).digest('hex'),
    'e2f0d15c50bb4be9aebf72e53a45a2e7c4156482a16dc6822942d57574c12178');
  const configure = (workspace, promisePatch) => {
    write(workspace, 'patches/promise-rejection-message.patch', promisePatch);
    write(workspace, 'patches/lossless-map-transport.patch', readFileSync(lossless));
    write(workspace, 'patches/BUILD.bazel', readFileSync(path.join(root, 'valdi/patches/BUILD.bazel')));
    write(workspace, '.bazelversion', `${probe.version}\n`);
    write(workspace, 'MODULE.bazel', [
      'module(name = "promise_patch_check")',
      'bazel_dep(name = "valdi", version = "0.1")',
      'archive_override(',
      '    module_name = "valdi",',
      `    urls = [${JSON.stringify(`file://${archive}`)}],`,
      `    strip_prefix = "${prefix}",`,
      '    patches = ["//patches:lossless-map-transport.patch", "//patches:promise-rejection-message.patch"],',
      '    patch_strip = 1,',
      ')',
    ].join('\n') + '\n');
  };
  const rejectedWorkspace = path.join(directory, 'rejected');
  configure(rejectedWorkspace, rejected);
  const red = probe.query(rejectedWorkspace, path.join(directory, 'rejected-output'), '@valdi//:patched');
  assert.notEqual(red.status, 0, `${red.stdout}\n${red.stderr}`);
  assert.match(red.stderr, /Expecting more chunk line at line 50/);
  assert.match(red.stderr, /http\.bzl/);
  assert.match(red.stderr, /utils\.bzl/);
  t.diagnostic(`RED: Bazel ${probe.version} http_archive rejects preserved SHA e2f0d15c... at line 50.`);
  const workspace = path.join(directory, 'accepted');
  configure(workspace, readFileSync(patch));
  const output = path.join(directory, 'output');
  const green = probe.query(workspace, output, '@valdi//:patched');
  assert.equal(green.status, 0, `${green.stdout}\n${green.stderr}`);
  const staged = path.join(output, 'external/valdi+');
  assert.ok(existsSync(staged));
  success('git', ['apply', lossless], { cwd: source });
  success('git', ['apply', patch], { cwd: source });
  comparePatchedFiles(staged, source, [...patchPaths(lossless), marker, callback]);
  t.diagnostic(`GREEN: Bazel ${probe.version} archive_override applies both patches at strip=1.`);
});

test('main Valdi workspace parser accepts the registered archive patches in an independent output root', {
  skip: process.env.VALDI_TEST_BAZEL_MAIN_REPO_PARSER !== '1', timeout: 240000,
}, async t => {
  const directory = temporary(t);
  const probe = bazelProbe(directory);
  const workspace = path.join(root, 'valdi');
  const output = path.join(directory, 'main-output');
  const watched = ['MODULE.bazel', 'MODULE.bazel.lock', '.bazelrc', '.bazelversion',
    'patches/BUILD.bazel', 'patches/lossless-map-transport.patch', 'patches/promise-rejection-message.patch'];
  const before = watched.map(name => readFileSync(path.join(workspace, name)));
  const seed = process.env.VALDI_TEST_BAZEL_REPOSITORY_SEED;
  if (seed) {
    // Clone/copy existing downloads into the private cache. Never pass the
    // shared seed itself as Bazel's writable repository_cache.
    success('cp', [process.platform === 'darwin' ? '-cR' : '-R', seed, path.join(directory, 'repo-cache')]);
  }
  try {
    let downloaderConfig = process.env.VALDI_TEST_BAZEL_DOWNLOADER_CONFIG;
    const archive = process.env.VALDI_TEST_BAZEL_VALDI_ARCHIVE;
    if (archive) {
      assert.ok(path.basename(archive).endsWith('.tar.gz'));
      const mirror = spawn('python3', ['-u', path.join(helpers, 'archive-mirror.py'), path.dirname(archive)], {
        stdio: ['ignore', 'pipe', 'pipe'],
      });
      t.after(() => mirror.kill());
      const port = await new Promise((resolve, reject) => {
        const timer = setTimeout(() => reject(new Error('Archive mirror startup timed out')), 10000);
        mirror.once('error', error => { clearTimeout(timer); reject(error); });
        mirror.once('exit', code => { clearTimeout(timer); reject(new Error(`Archive mirror exited: ${code}`)); });
        mirror.stdout.once('data', data => {
          clearTimeout(timer);
          const value = Number(data.toString().trim());
          if (!Number.isInteger(value) || value <= 0) reject(new Error(`Invalid mirror port: ${data}`));
          else resolve(value);
        });
      });
      downloaderConfig = path.join(directory, 'downloader.config');
      writeFileSync(downloaderConfig,
        `rewrite github.com/cloud2303org/Valdi/archive/(${pin})\\.tar\\.gz http://127.0.0.1:${port}/${path.basename(archive)}\n`);
      t.diagnostic(`Archive transport: local mirror of supplied ${path.basename(archive)}; original MODULE URL unchanged.`);
    }
    const fetched = run('bazel', [...probe.startup, `--output_base=${output}`, 'fetch',
      '--repo=@valdi', '--lockfile_mode=off', '--noshow_progress',
      `--repository_cache=${directory}/repo-cache`,
      ...(downloaderConfig ? [`--downloader_config=${downloaderConfig}`] : [])], {
      ...probe.options, timeout: 180000, cwd: workspace,
    });
    assert.equal(fetched.status, 0, `${fetched.stdout}\n${fetched.stderr}`);
    const staged = path.join(output, 'external/valdi+');
    assert.ok(existsSync(staged));
    const source = path.join(directory, 'expected');
    fixture(source);
    const lossless = path.join(root, 'valdi/patches/lossless-map-transport.patch');
    for (const name of patchPaths(lossless)) write(source, name, pinned(name));
    success('git', ['apply', lossless], { cwd: source });
    success('git', ['apply', patch], { cwd: source });
    comparePatchedFiles(staged, source, [...patchPaths(lossless), marker, callback]);
    assert.match(readFileSync(path.join(staged, 'valdi/BUILD.bazel'), 'utf8'),
      /name = "valdi_java",\s+srcs = glob\(\[\s+"src\/java\/\*\*\/\*\.java",\s+"src\/java\/\*\*\/\*\.kt"/);
    t.diagnostic(`GREEN: actual valdi/MODULE.bazel, Bazel ${probe.version}, fetch --repo=@valdi; isolated roots/cache, lockfile writes disabled.`);
    t.diagnostic(fetched.stderr.trim());
  } finally {
    watched.forEach((name, i) => assert.deepEqual(readFileSync(path.join(workspace, name)), before[i], name));
  }
});
