import assert from 'node:assert/strict';
import { spawnSync } from 'node:child_process';
import { existsSync, mkdirSync, mkdtempSync, readFileSync, realpathSync, rmSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import path from 'node:path';
import test from 'node:test';
import { fileURLToPath } from 'node:url';
import { applyRuntimePatches, runtimePatch, runtimePatchFiles } from '../upstream-runtime-patches.mjs';

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '../..');
const pin = '15feb6530ceecb971f4c8519ea8ab77474b959db';
const gitSource = process.env.VALDI_FORK_SOURCE ?? path.resolve(root, '../Valdi-node-only');
const objc = runtimePatchFiles[0];

function run(command, args, options = {}) {
  const result = spawnSync(command, args, { encoding: 'utf8', maxBuffer: 16 * 1024 * 1024, ...options });
  if (result.error) throw result.error;
  return result;
}
function success(command, args, options) {
  const result = run(command, args, options);
  assert.equal(result.status, 0, `${command} failed (${result.signal ?? result.status}):\n${result.stderr.slice(-8000)}`);
  return result.stdout;
}
function temporary(t) {
  const directory = mkdtempSync(path.join(tmpdir(), 'valdi-lossless-'));
  t.after(() => rmSync(directory, { recursive: true, force: true }));
  return directory;
}
function pinnedFixture(directory) {
  for (const name of runtimePatchFiles) {
    mkdirSync(path.dirname(path.join(directory, name)), { recursive: true });
    writeFileSync(path.join(directory, name), success('git', ['-C', gitSource, 'show', `${pin}:${name}`]));
  }
}

test('the canonical lossless patch applies to the exact pin and stages byte-idempotently', t => {
  const fixture = temporary(t);
  pinnedFixture(fixture);
  const patch = readFileSync(runtimePatch, 'utf8');
  assert.deepEqual([...patch.matchAll(/^diff --git a\/(.+) b\/(.+)$/gm)].map(match => {
    assert.equal(match[1], match[2]);
    return match[1];
  }), runtimePatchFiles);
  const registration = readFileSync(path.join(root, 'valdi/MODULE.bazel'), 'utf8')
    .match(/archive_override\(\s+module_name = "valdi",([\s\S]*?)\n\)/)?.[1];
  assert.ok(registration);
  assert.equal([...registration.matchAll(/"\/\/patches:lossless-map-transport\.patch"/g)].length, 1);
  assert.match(registration, /patch_strip = 1/);
  assert.equal(applyRuntimePatches(fixture), true);
  const after = runtimePatchFiles.map(name => readFileSync(path.join(fixture, name)));
  assert.equal(applyRuntimePatches(fixture), false);
  runtimePatchFiles.forEach((name, i) => assert.deepEqual(readFileSync(path.join(fixture, name)), after[i]));
  success('git', ['apply', '--reverse', '--check', runtimePatch], { cwd: fixture });
});

test('source drift rejects the entire patch before any staged file changes', t => {
  const fixture = temporary(t);
  pinnedFixture(fixture);
  const filename = path.join(fixture, objc);
  writeFileSync(filename, readFileSync(filename, 'utf8').replace('return Valdi::Value([object doubleValue]);',
    'return Valdi::Value(static_cast<double>(123));'));
  const before = runtimePatchFiles.map(name => readFileSync(path.join(fixture, name)));
  assert.throws(() => applyRuntimePatches(fixture), /Runtime patch does not match/);
  runtimePatchFiles.forEach((name, i) => assert.deepEqual(readFileSync(path.join(fixture, name)), before[i]));
});

// Opt in separately because this starts an isolated Bazel invocation. Never run
// this while another owner is exporting the shared runtime.
test('Bazel native repository_ctx.patch consumes every canonical file', {
  skip: process.env.VALDI_TEST_BAZEL_NATIVE_PATCHER !== '1', timeout: 120000,
}, t => {
  const fixture = temporary(t);
  const source = path.join(fixture, 'source');
  pinnedFixture(source);
  const workspace = path.join(fixture, 'workspace');
  mkdirSync(workspace);
  writeFileSync(path.join(workspace, 'lossless.patch'), readFileSync(runtimePatch));
  writeFileSync(path.join(workspace, 'BUILD.bazel'), 'exports_files(["lossless.patch"])\n');
  writeFileSync(path.join(workspace, 'MODULE.bazel'), [
    'module(name = "lossless_patch_check")',
    'fixture = use_repo_rule("//:patch.bzl", "fixture")',
    `fixture(name = "patched", src = ${JSON.stringify(source)}, patch = "//:lossless.patch")`,
  ].join('\n') + '\n');
  writeFileSync(path.join(workspace, 'patch.bzl'), `
def _impl(ctx):
    result = ctx.execute(["/bin/cp", "-R", ctx.attr.src + "/.", str(ctx.path("."))])
    if result.return_code:
        fail(result.stderr)
    ctx.patch(ctx.path(ctx.attr.patch), strip = 1)
    ctx.file("BUILD.bazel", 'filegroup(name = "patched", srcs = glob(["**/*"]))\\n')
fixture = repository_rule(implementation = _impl, attrs = {"src": attr.string(), "patch": attr.label()}, local = True)
`);
  const output = path.join(fixture, 'output');
  success('bazel', ['--batch', `--output_base=${output}`, 'query', '@patched//:patched', '--noshow_progress'],
    { cwd: workspace, timeout: 110000 });
  const staged = path.join(output, 'external/+fixture+patched');
  assert.ok(existsSync(staged));
  applyRuntimePatches(source);
  for (const name of runtimePatchFiles) {
    assert.deepEqual(readFileSync(path.join(staged, name)), readFileSync(path.join(source, name)), name);
  }
});

function nativePrerequisites(t) {
  if (process.platform !== 'darwin' || process.arch !== 'arm64') {
    t.skip('The linked native fixture requires existing macOS arm64 host archives');
    return;
  }
  const host = process.env.VALDI_NATIVE_TEST_HOST ?? path.join(root, 'harmony/business-build/.artifacts/host');
  const cached = process.env.VALDI_NATIVE_TEST_EXECROOT ?? '/private/var/tmp/vnr-hermes-boundary-links/valdi';
  if (!existsSync(path.join(host, 'compile_commands.json')) || !existsSync(cached)) {
    t.skip('Set VALDI_NATIVE_TEST_HOST and VALDI_NATIVE_TEST_EXECROOT to existing pinned host builds');
    return;
  }
  return { host, execroot: realpathSync(cached), source: path.join(root, '.tools/harmony/upstream') };
}
function nativeFlags({ host, execroot, source }, fixture) {
  const rows = JSON.parse(readFileSync(path.join(host, 'compile_commands.json'), 'utf8'));
  const row = rows.find(row => row.file.endsWith('/runtime/Runtime.cpp'));
  assert.ok(row, 'Missing real host runtime compiler command');
  const base = row.arguments ?? row.command.match(/(?:[^\s"]+|"[^"]*")+/g).map(arg => arg.replace(/^"|"$/g, ''));
  const flags = base.slice(1, base.indexOf('-o'));
  const hermes = path.join(root, '.tools/harmony/runtime-inputs/external/hermes');
  return {
    compiler: base[0],
    flags: [`-I${fixture}/valdi/src`, ...flags,
      ...[
        `${source}/third-party/hermes_v1/prepared_include/apple`,
        `${source}/third-party/hermes_v1/prepared_include`,
        `${execroot}/bazel-out/darwin_arm64-fastbuild/bin/external/valdi++_repo_rules+hermes`,
        ...['include', 'public', 'API', 'API/jsi', 'external', 'external/llvh/include',
          'external/llvh/gen/include'].map(name => path.join(hermes, name)),
      ].map(name => `-I${name}`),
      '-DNDEBUG', '-DHERMESVM_ALLOW_CONCURRENT_GC', '-DHERMESVM_ALLOW_INLINE_ASM',
      '-DHERMESVM_INDIRECT_THREADING', '-DHERMES_CHECK_NATIVE_STACK',
      '-DHERMES_ENABLE_UNICODE_REGEXP_PROPERTY_ESCAPES', '-DHERMES_USE_BOOST_CONTEXT=0',
      '-DSTATIC_HERMES', '-DHERMES_PLATFORM_UNICODE=HERMES_PLATFORM_UNICODE_LITE',
    ],
  };
}
function linkFlags(execroot, mode, fixture) {
  const params = path.join(execroot, 'bazel-out/darwin_arm64-fastbuild/bin/external/valdi+/valdi',
    mode === 'full' ? 'test_hermes_boundary-0.params' : 'test_hermes_jsi_lean-0.params');
  const original = readFileSync(params, 'utf8').trim().split('\n');
  const flags = [];
  for (let i = 0; i < original.length; i++) {
    let flag = original[i];
    if (flag === '-o') { i++; continue; }
    if (flag.includes('force_load') && (flag.includes('test_') || flag.includes('djinni'))) continue;
    if (flag.endsWith('libgtest_main.a')) continue;
    // Bazel can leave the constituent objects and archive response file after
    // removing an unrequested archive. Reassemble ONLY a temporary archive.
    if (flag.endsWith('.a') && !existsSync(path.join(execroot, flag))) {
      const objects = readFileSync(path.join(execroot, `${flag}-0.params`), 'utf8')
        .split('\n').filter(name => name.endsWith('.o')).map(name => path.join(execroot, name));
      const archive = path.join(fixture, path.basename(flag));
      success('/usr/bin/libtool', ['-static', '-o', archive, ...objects]);
      flag = archive;
    }
    flags.push(flag);
  }
  return flags;
}

test('real full and LEAN Hermes consume both native map paths; reverting either path fails', { timeout: 120000 }, t => {
  const native = nativePrerequisites(t);
  if (!native) return;
  const fixture = temporary(t);
  pinnedFixture(fixture);
  applyRuntimePatches(fixture);
  const { compiler, flags } = nativeFlags(native, fixture);
  const full = [...flags, '-DHERMES_ENABLE_DEBUGGER', '-DHERMES_MEMORY_INSTRUMENTATION',
    '-DHERMES_API', '-DVALDI_HAS_WEBSOCKET_SERVER'];
  const lean = [...flags, '-DHERMESVM_LEAN'];
  const consumer = path.join(root, 'scripts/tests/lossless-map-consumer.cpp');
  const programs = [...readFileSync(consumer, 'utf8').matchAll(/R"JS\(([\s\S]*?)\)JS"/g)];
  assert.equal(programs.length, 3);
  const hermesc = path.join(root, 'tools/valdi-rolldown/node_modules/hermes-compiler/hermesc/osx-bin/hermesc');
  programs.forEach((program, i) => {
    const input = path.join(fixture, `${i}.js`);
    writeFileSync(input, program[1]);
    success(hermesc, ['-emit-binary', '-O', '-strict', '-Xes6-block-scoping', '-fno-static-builtins',
      '-out', path.join(fixture, `${i}.hbc`), input]);
  });
  const compile = (name, source, options = full) => {
    const object = path.join(fixture, `${name}.o`);
    success(compiler, [...options, '-c', source, '-o', object]);
    return object;
  };
  const units = [
    ['IJavaScriptContext', 'Interfaces/IJavaScriptContext.cpp'],
    ['JavaScriptUtils', 'JavaScript/JavaScriptUtils.cpp'],
    ['JavaScriptValueDelegate', 'JavaScript/JavaScriptValueDelegate.cpp'],
  ];
  const objects = units.map(([name, file]) => compile(name, path.join(fixture, 'valdi/src/valdi/runtime', file)));
  for (const mode of ['full', 'lean']) {
    const options = mode === 'full' ? full : lean;
    // Recompile the actual derived engine with the new base-class layout.
    const engine = compile(`HermesContext-${mode}`,
      path.join(native.source, 'valdi/src/valdi/hermes/HermesJavaScriptContext.cpp'), options);
    const main = compile(`consumer-${mode}`, consumer, options);
    const compilerObjects = mode === 'full' ? [compile('HermesCompiler',
      path.join(native.source, 'valdi/src/valdi/hermes/HermesJavaScriptCompiler.cpp'), options)] : [];
    const libraries = linkFlags(native.execroot, mode, fixture);
    const link = (suffix, runtimeObjects) => {
      const executable = path.join(fixture, `consumer-${mode}-${suffix}`);
      success(compiler, ['-Wl,-dead_strip', main, engine, ...compilerObjects, ...runtimeObjects, ...libraries,
        '-o', executable], { cwd: native.execroot });
      return executable;
    };
    const passed = success(link('patched', objects), [fixture], { timeout: 15000 });
    assert.match(passed, mode === 'lean' ? /PASS real LEAN Hermes initialize/ : /PASS real full Hermes initialize/);
    console.log(passed.trim());
    if (mode === 'lean') {
      for (const [index, expected] of [[1, 'untyped'], [2, 'delegate']]) {
        const [name, file] = units[index];
        const original = path.join(fixture, `original-${name}.cpp`);
        writeFileSync(original, success('git', ['-C', gitSource, 'show', `${pin}:valdi/src/valdi/runtime/${file}`]));
        const oldObject = compile(`original-${name}`, original);
        const changed = [...objects];
        changed[index] = oldObject;
        const rejected = run(link(`negative-${name}`, changed), [fixture], { timeout: 15000 });
        assert.notEqual(rejected.status, 0, `Reverting ${name} must fail the JS consumer`);
        assert.match(rejected.stderr, new RegExp(`${expected}: (prototype|keys)`));
      }
    }
  }
});

test('Foundation NSNumber branch preserves CFBoolean and numeric 0/1; old production branch fails', {
  timeout: 60000,
}, t => {
  const native = nativePrerequisites(t);
  if (!native) return;
  const fixture = temporary(t);
  pinnedFixture(fixture);
  const original = readFileSync(path.join(fixture, objc), 'utf8');
  applyRuntimePatches(fixture);
  const { compiler, flags } = nativeFlags(native, fixture);
  const objcFlags = [...flags, '-fobjc-arc', `-I${fixture}`,
    `-I${native.source}/valdi_core/src/valdi_core/ios`, `-I${native.source}/valdi_core/generated-src/objc`];
  // Compile the full official production unit too; no invented ABI declarations.
  success(compiler, [...objcFlags, '-c', path.join(fixture, objc), '-o', path.join(fixture, 'full-conversion.o')]);
  for (const [name, source] of [['patched', readFileSync(path.join(fixture, objc), 'utf8')], ['original', original]]) {
    const branch = source.split('} else if ([object isKindOfClass:[NSNumber class]]) {')[1]
      .split('} else if ([object isKindOfClass:[NSDictionary class]])')[0];
    assert.ok(branch.includes('[object doubleValue]'));
    writeFileSync(path.join(fixture, 'NSNumberBranch.inc'), `if ([object isKindOfClass:[NSNumber class]]) {${branch}}\n`);
    const executable = path.join(fixture, `foundation-${name}`);
    success(compiler, [...objcFlags, path.join(root, 'scripts/tests/foundation-number-consumer.mm'),
      path.join(native.host, 'libreal_valdi_host.a'), path.join(native.host, 'deps/fmt/libfmt.a'),
      path.join(native.host, 'deps/jsoncpp/src/lib_json/libjsoncpp.a'),
      '-framework', 'Foundation', '-framework', 'CoreFoundation', '-Wl,-dead_strip', '-o', executable]);
    const result = run(executable, [], { timeout: 15000 });
    if (name === 'patched') {
      assert.equal(result.status, 0, result.stderr);
      assert.match(result.stdout, /PASS Foundation CFBoolean and numeric NSNumber production branch/);
      console.log(result.stdout.trim());
    } else {
      assert.notEqual(result.status, 0, 'The old NSNumber-to-double branch must fail on CFBoolean');
      assert.match(result.stderr, /CFBoolean lost its boolean type/);
    }
  }
});
