import assert from 'node:assert/strict';
import { mkdirSync, writeFileSync } from 'node:fs';
import { createRequire } from 'node:module';
import path from 'node:path';
import ts from 'typescript';
import { allowedOutput, DEFAULT_OUTPUT } from './build';
import { createSourceCompiler, makeProgramLoader, moduleGraph, nativeMappings } from './compiler';

const framework = path.resolve(process.argv[2] || '');
if (!process.argv[2]) throw new Error('Usage: node --import tsx web/test.ts FRAMEWORK_ROOT [OUTPUT]');
const output = allowedOutput(process.argv[3] || DEFAULT_OUTPUT);
const moduleRoot = path.join(framework, 'src/valdi_modules/src/valdi');
const modules = moduleGraph(framework, [path.join(moduleRoot, 'persistence')]);
const specs = ts.sys.readDirectory(path.join(moduleRoot, 'web_renderer/test'), ['.ts'])
  .filter(file => file.endsWith('.spec.ts')).sort();
assert(specs.length > 0, 'No upstream renderer spec files found');
const compiler = createSourceCompiler(framework, modules, specs);
const load = makeProgramLoader(compiler.program, framework, compiler, nativeMappings(modules));
const require = createRequire(import.meta.url);
const jasmineRequire = require(path.join(moduleRoot, 'jasmine/src/jasmine.js'));
const jasmine = jasmineRequire.core(jasmineRequire);
const env = jasmine.getEnv();
Object.assign(globalThis, jasmineRequire.interface(jasmine, env));
env.configure({ random: false });
let executed = 0;
let failed = 0;
const failures: unknown[] = [];
const suites: unknown[] = [];
env.addReporter({
  specDone(result: any) {
    executed++;
    if (result.status === 'failed') {
      failed++;
      failures.push({ fullName: result.fullName, failures: result.failedExpectations });
    }
  },
  suiteDone(result: any) {
    if (result.failedExpectations.length) suites.push(result);
  },
});
let loaded = 0;
try {
  // Assert real declaration enums were inlined, not synthesized as runtime
  // imports. This specifically covers the original transpileModule failure.
  const deviceBridge = compiler.emit(path.join(moduleRoot, 'valdi_core/web/DeviceBridge.ts'));
  assert(!/require\(["']\.\.\/src\/DeviceBridge["']\)/.test(deviceBridge), 'const enum declaration import survived Program emission');
  assert(deviceBridge.includes('/* DeviceSystemType.IOS */'), 'official declaration const enum was not inlined');
  assert.equal(nativeMappings(modules).get('coreutils/src/Base64Native'), path.join(moduleRoot, 'coreutils/web/Base64Native.ts'));
  const { Base64 } = load(path.join(moduleRoot, 'coreutils/src/Base64.ts'));
  assert.equal(Base64.fromByteArray(new Uint8Array([0, 255, 127])), 'AP9/');
  assert.deepEqual([...Base64.toByteArray('AP9/')], [0, 255, 127]);
  for (const spec of specs) {
    load(spec);
    loaded++;
  }
} catch (error) {
  console.error(`Renderer spec load failed after ${loaded}/${specs.length} files`);
  console.error(error);
  mkdirSync(output, { recursive: true });
  writeFileSync(path.join(output, 'renderer-tests.json'), JSON.stringify({
    specFiles: specs, loaded, executed: 0, overallStatus: 'load-failed', error: String(error),
  }, null, 2));
  // Jasmine owns uncaught-exception listeners; throwing here alone can be
  // swallowed before env.execute() and produce exit 0 with no specs run.
  process.exit(1);
}
await new Promise<void>(resolve => {
  env.addReporter({
    jasmineDone(result: any) {
      try {
        mkdirSync(output, { recursive: true });
        writeFileSync(path.join(output, 'renderer-tests.json'), JSON.stringify({
          specFiles: specs, loaded, executed, failed, failures, suites, overallStatus: result.overallStatus,
          failedExpectations: result.failedExpectations,
        }, null, 2));
        console.log(`Official web_renderer: ${loaded} files, ${executed} specs, ${failed} failed, status ${result.overallStatus}`);
        if (executed === 0 || failed || suites.length || result.overallStatus !== 'passed' || result.failedExpectations.length) {
          console.error(JSON.stringify({ failures, suites, failedExpectations: result.failedExpectations }, null, 2));
          process.exitCode = 1;
        }
      } catch (error) {
        console.error(error);
        process.exitCode = 1;
      } finally {
        resolve();
      }
    },
  });
  env.execute();
});
