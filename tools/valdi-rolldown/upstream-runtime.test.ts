import assert from 'node:assert/strict';
import { existsSync, readFileSync } from 'node:fs';
import path from 'node:path';
import test from 'node:test';
import vm from 'node:vm';
import ts from 'typescript';
import { root, valdiSourceRoot } from './pipeline';

// Executes upstream source in Node, not a native engine, generated bundle, or
// replica of the renderer. No emitted files or changes to the checkout are needed.
const upstream = process.env.VALDI_SOURCE_ROOT
  ?? valdiSourceRoot()
  ?? path.join(root, 'valdi/.valdi-sources/external/valdi+');
const modulesRoot = path.join(upstream, 'src/valdi_modules/src/valdi');
const suites = [
  ['valdi_core/test/ElementLayoutDispatcher.spec.ts', 'valdi_core/src/ElementLayoutDispatcher.ts'],
  ['valdi_core/test/PropertyList.spec.ts', 'valdi_core/src/utils/PropertyList.ts'],
  ['valdi_test/test/Renderer.spec.ts', 'valdi_core/src/Renderer.ts'],
  ['valdi_test/test/ModuleLoader.spec.ts', 'valdi_core/src/ModuleLoader.ts'],
  ['valdi_core/test/ModuleLoaderUnloadTest.ts', 'valdi_core/src/ModuleLoader.ts'],
  ['valdi_test/test/DebuggerInputMessageHandler.spec.ts', 'valdi_core/src/debugging/DebuggerInputMessageHandler.ts'],
] as const;

type JasmineResult = {
  fullName?: string;
  status?: string;
  overallStatus?: string;
  pendingReason?: string;
  failedExpectations?: { message: string; stack?: string }[];
};

function sandbox(globals: Record<string, unknown> = {}) {
  const timers = new Set<ReturnType<typeof setTimeout>>();
  const schedule = (callback: (...args: any[]) => void, delay?: number, ...args: any[]) => {
    const timer = setTimeout(() => {
      timers.delete(timer);
      callback(...args);
    }, delay);
    timers.add(timer);
    return timer;
  };
  const cancel = (timer: ReturnType<typeof setTimeout>) => {
    timers.delete(timer);
    clearTimeout(timer);
  };
  const context = vm.createContext({
    console,
    setTimeout: schedule,
    clearTimeout: cancel,
    // Only host metadata is supplied. Tracing is optional upstream; rendering,
    // layout dispatch, callbacks, and module unloading all use real source.
    runtime: {
      getCurrentPlatform: () => 1, // Native path normalization (not Web's './').
      getCurrentContext: () => 'node-upstream-test',
    },
    ...globals,
  });
  // Deliberately do not inject process: Jasmine must not remove node:test's
  // uncaughtException/unhandledRejection listeners. Node's runner fails on both.
  vm.runInContext('global = globalThis;', context);
  const cache = new Map<string, { exports: any }>();

  function load(specifier: string, from = path.join(modulesRoot, '__entry__.js')): any {
    const base = specifier.startsWith('.')
      ? path.resolve(path.dirname(from), specifier)
      : path.resolve(modulesRoot, specifier);
    assert.ok(base.startsWith(modulesRoot + path.sep), `Import escapes upstream modules: ${specifier}`);
    const filename = [base, `${base}.ts`, `${base}.js`, `${base}.d.ts`, path.join(base, 'index.ts')]
      .find(candidate => /\.(ts|js)$/.test(candidate) && existsSync(candidate));
    assert.ok(filename, `Missing upstream implementation: ${specifier} (from ${from})`);
    if (cache.has(filename)) return cache.get(filename)!.exports;
    const source = readFileSync(filename, 'utf8');
    let code = source;
    if (filename.endsWith('.ts')) {
      const result = ts.transpileModule(source, {
        // Upstream also defines const enums in .d.ts files. Single-file
        // transpilation cannot inline cross-file enums: emit their actual
        // declarations as TS here. Interfaces/types still erase to no code.
        fileName: filename.replace(/\.d\.ts$/, '.ts'),
        reportDiagnostics: true,
        compilerOptions: {
          target: ts.ScriptTarget.ES2020,
          module: ts.ModuleKind.CommonJS,
          experimentalDecorators: true,
          useDefineForClassFields: false,
        },
      });
      const errors = result.diagnostics?.filter(d => d.category === ts.DiagnosticCategory.Error) ?? [];
      assert.equal(errors.length, 0, ts.formatDiagnosticsWithColorAndContext(errors, {
        getCanonicalFileName: name => name,
        getCurrentDirectory: () => upstream,
        getNewLine: () => '\n',
      }));
      code = result.outputText;
    }
    const module = { exports: {} };
    cache.set(filename, module); // CommonJS circular dependencies use this identity.
    // Invoke inside runInContext too, so synchronous hangs have a VM deadline.
    context.__moduleArgs = [(id: string) => load(id, filename), module, module.exports];
    try {
      new vm.Script(`(function(require, module, exports) {\n${code}\n})(...__moduleArgs);`, {
        filename,
      }).runInContext(context, { timeout: 10_000 });
    } catch (error) {
      cache.delete(filename);
      throw error;
    } finally {
      delete context.__moduleArgs;
    }
    return module.exports;
  }

  return {
    context, load, cache,
    dispose() {
      for (const timer of timers) clearTimeout(timer);
      timers.clear();
    },
  };
}

for (const { name, globals, expected } of [
  { name: 'native bootstrap', globals: { runtime: undefined }, expected: 'fixture/src/value' },
  { name: 'native worker location', globals: { location: { href: 'worker://fixture' } }, expected: 'fixture/src/value' },
  { name: 'browser page', globals: { runtime: undefined, window: { document: {} } }, expected: 'fixture/./src/value' },
  { name: 'browser worker', globals: { runtime: undefined, importScripts() {} }, expected: 'fixture/./src/value' },
]) {
  test(`actual ModuleLoader resolves ${name} paths before platform runtime initialization`, t => {
    const host = sandbox(globals);
    t.after(() => host.dispose());
    const { ModuleLoader } = host.load('valdi_core/src/ModuleLoader');
    const requested: string[] = [];
    const loader = new ModuleLoader((path: string) => { requested.push(path); }, undefined, undefined, true);
    loader.load('fixture/./src/value');
    assert.deepEqual(requested, [expected]);
  });
}

for (const [spec, algorithm] of suites) {
  test(`actual upstream Jasmine: ${spec}`, { timeout: 45_000 }, async t => {
    assert.ok(existsSync(path.join(modulesRoot, spec)),
      `Set VALDI_SOURCE_ROOT to the full upstream checkout; missing ${path.join(modulesRoot, spec)}`);
    const host = sandbox();
    t.after(() => host.dispose());
    const jasmineRequire = host.load('jasmine/src/jasmine.js');
    const jasmine = jasmineRequire.core(jasmineRequire);
    jasmine.DEFAULT_TIMEOUT_INTERVAL = 2_000;
    const env = jasmine.getEnv();
    Object.assign(host.context, jasmineRequire.interface(jasmine, env));
    env.configure({ random: false, stopOnSpecFailure: false, failSpecWithNoExpectations: true });

    let declared = 0;
    let passed = 0;
    const results: JasmineResult[] = [];
    const failures: string[] = [];
    const report = (result: JasmineResult) => {
      for (const failure of result.failedExpectations ?? []) {
        failures.push(`${result.fullName ?? spec}: ${failure.stack ?? failure.message}`);
      }
    };
    let finish!: (result: JasmineResult) => void;
    const completed = new Promise<JasmineResult>(resolve => { finish = resolve; });
    env.addReporter({
      jasmineStarted(info: { totalSpecsDefined: number }) { declared = info.totalSpecsDefined; },
      specDone(result: JasmineResult) {
        results.push(result);
        report(result);
        if (result.status === 'passed') passed++;
        else failures.push(`${result.fullName}: ${result.status} ${result.pendingReason ?? ''}`);
      },
      suiteDone: report,
      jasmineDone(result: JasmineResult) { report(result); finish(result); },
    });

    host.load(spec); // Read and execute unmodified specs, never copied assertions.
    assert.ok(host.cache.has(path.join(modulesRoot, algorithm)), `Did not load actual ${algorithm}`);
    if (spec.includes('Renderer.spec')) {
      assert.ok(host.cache.has(path.join(modulesRoot, 'valdi_test/test/RendererTestDelegate.ts')));
    }
    host.context.__env = env;
    let deadline: ReturnType<typeof setTimeout> | undefined;
    try {
      const timedOut = new Promise<never>((_, reject) => {
        deadline = setTimeout(() => reject(new Error(`Jasmine timed out: ${spec}`)), 30_000);
      });
      vm.runInContext('__env.execute();', host.context, { timeout: 30_000 });
      const result = await Promise.race([completed, timedOut]);
      // Drain immediate asynchronous errors before declaring this suite complete.
      await new Promise(resolve => setImmediate(resolve));
      assert.ok(declared > 0, 'Jasmine discovered no specs');
      assert.equal(results.length, declared, 'Some discovered specs were not executed');
      assert.equal(failures.length, 0, failures.join('\n\n'));
      assert.equal(result.overallStatus, 'passed', JSON.stringify(result));
      assert.equal(passed, declared, 'Pending, disabled, excluded, or failed specs are not success');
      t.diagnostic(`${passed}/${declared} upstream specs passed; ${host.cache.size} real source modules executed; root=${upstream}`);
    } finally {
      clearTimeout(deadline);
      delete host.context.__env;
    }
  });
}
