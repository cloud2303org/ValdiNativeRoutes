import assert from 'node:assert/strict';
import { existsSync, mkdirSync, mkdtempSync, readFileSync, rmSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import path from 'node:path';
import test from 'node:test';
import sharp from 'sharp';
import { unpack } from './archive';
import { compileNodeModule } from './module-build';
import { root } from './pipeline';

function fixture(t: { after: (fn: () => void) => void }) {
  const dir = mkdtempSync(path.join(tmpdir(), 'node-valdi-fixture-'));
  t.after(() => rmSync(dir, { recursive: true, force: true }));
  mkdirSync(path.join(dir, 'src'));
  const module = { name: 'fixture', dir, generatedDirs: [], nodeModules: path.join(root, 'valdi/node_modules') };
  writeFileSync(
    path.join(dir, 'src/Calculator.d.ts'),
    '/** @ExportModule */\nexport declare function multiply(left: number, right: number): number;\n',
  );
  return { dir, module, out: path.join(dir, 'output') };
}

test('real module compilation bundles npm/resources and generates native bindings without source mutations', async t => {
  const { dir, module, out } = fixture(t);
  writeFileSync(
    path.join(dir, 'src/index.ts'),
    `import dayjs from 'dayjs';
import res from 'fixture/res';
import { multiply } from './Calculator';
export const date = dayjs('2026-10-29').format('YYYY-MM-DD');
export const icon = res.mark;
export const result = () => multiply(6, 7);
`,
  );
  mkdirSync(path.join(dir, 'res'));
  await sharp({ create: { width: 12, height: 12, channels: 4, background: '#2563eb' } })
    .png()
    .toFile(path.join(dir, 'res/mark@3x.png'));
  await compileNodeModule(module, out, 'Fixture', 'debug');
  const entries = unpack(readFileSync(path.join(out, 'fixture.valdimodule')));
  assert.ok(entries.has('src/index.js'));
  assert.ok(entries.has('res.assetcatalog'));
  assert.ok(!entries.has('src/Calculator.js'), 'native implementation must not be replaced by JS');
  const javascript = entries.get('src/index.js')!.toString();
  assert.match(javascript, /require\(["']fixture\/src\/Calculator["']\)/);
  assert.doesNotMatch(javascript, /require\(["']dayjs["']\)/);
  assert.match(readFileSync(path.join(out, 'android/fixture.kt'), 'utf8'), /interface CalculatorModule/);
  assert.match(readFileSync(path.join(out, 'ios/FixtureTypes/FixtureTypes.h'), 'utf8'), /multiplyWithLeft:/);
  assert.doesNotMatch(readFileSync(path.join(out, 'ios/Fixture/Fixture.h'), 'utf8'), /#import "FixtureTypes.h"/);
  assert.ok(existsSync(path.join(out, 'resources/android/drawable-mdpi/fixture_mark.webp')));
  assert.ok(existsSync(path.join(out, 'resources/ios/fixture.bundle/mark@3x.png')));
  assert.ok(existsSync(path.join(out, 'resources/ts/res.ts')));
  assert.ok(!existsSync(path.join(dir, 'tsconfig.json')));
  assert.ok(!existsSync(path.join(dir, '.gen')));
});

test('real Release module compilation emits Valdi-wrapped Hermes bytecode and separate source maps', async t => {
  const { dir, module, out } = fixture(t);
  writeFileSync(path.join(dir, 'src/index.ts'), 'export const answer = 42;\n');
  await compileNodeModule(module, out, 'Fixture', 'release');
  const entries = unpack(readFileSync(path.join(out, 'fixture.valdimodule')));
  assert.equal(entries.get('src/index.js')!.readUInt32LE(0), 0x0100c634);
  const maps = JSON.parse(readFileSync(path.join(out, 'fixture.map.json'), 'utf8'));
  assert.ok(maps['fixture/src/index.js']);
});

test('a bridge with only the official template declaration still produces all declared outputs', async t => {
  const { module, out } = fixture(t);
  await compileNodeModule(module, out, 'Fixture', 'debug');
  assert.deepEqual([...unpack(readFileSync(path.join(out, 'fixture.valdimodule'))).keys()], ['hash']);
  assert.ok(existsSync(path.join(out, 'cpp/valdi_modules/fixture/fixture.hpp')));
  assert.ok(existsSync(path.join(out, 'ios/Fixture/Fixture.m')));
});

test('a TypeScript error fails before publishing an archive', async t => {
  const { dir, module, out } = fixture(t);
  writeFileSync(path.join(dir, 'src/index.ts'), 'export const answer: number = "wrong";\n');
  await assert.rejects(compileNodeModule(module, out, 'Fixture', 'debug'), /not assignable/);
  assert.ok(!existsSync(path.join(out, 'fixture.valdimodule')));
});

test('declared module dependencies supply resource types while undeclared imports fail', async t => {
  const dep = fixture(t);
  const module = { ...dep.module, name: 'math' };
  mkdirSync(path.join(dep.dir, 'res'));
  await sharp({ create: { width: 6, height: 6, channels: 4, background: '#2563eb' } })
    .png()
    .toFile(path.join(dep.dir, 'res/mark@3x.png'));
  writeFileSync(path.join(dep.dir, 'src/index.ts'), "import res from 'math/res';\nexport const icon = res.mark;\n");
  await compileNodeModule(module, dep.out, 'Math', 'debug');
  const consumer = fixture(t);
  writeFileSync(
    path.join(consumer.dir, 'src/index.ts'),
    "import { icon } from 'math/src/index';\nexport const mark = icon;\n",
  );
  await assert.rejects(compileNodeModule(consumer.module, consumer.out, 'Fixture', 'debug'), /Cannot find module/);
  await compileNodeModule(consumer.module, consumer.out, 'Fixture', 'debug', [
    { ...module, generatedDirs: [path.join(dep.out, 'resources/ts')] },
  ]);
  const entries = unpack(readFileSync(path.join(consumer.out, 'fixture.valdimodule')));
  assert.match(entries.get('src/index.js')!.toString(), /require\(["']math\/src\/index["']\)/);
  assert.ok(!entries.has('src/Calculator.js'));
});
