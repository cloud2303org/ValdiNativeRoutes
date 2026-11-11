import assert from 'node:assert/strict';
import { existsSync, mkdirSync, mkdtempSync, readFileSync, rmSync, statSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import path from 'node:path';
import test from 'node:test';
import vm from 'node:vm';
import ts from 'typescript';
import { addStringEntries, prepareStrings, type LocalizedStrings } from './localization';
import { valdiSourceRoot } from './pipeline';
import type { ValdiModule } from './valdiTs';

function fixture(t: test.TestContext) {
  const dir = mkdtempSync(path.join(tmpdir(), 'valdi-localization-'));
  t.after(() => rmSync(dir, { recursive: true, force: true, maxRetries: 10, retryDelay: 200 }));
  const generated = path.join(dir, '.gen');
  const module: ValdiModule = { name: 'feature_strings', dir, generatedDirs: [generated] };
  const put = (language: string, json: unknown) => {
    mkdirSync(path.join(dir, 'strings'), { recursive: true });
    writeFileSync(path.join(dir, `strings/strings-${language}.json`), JSON.stringify(json));
  };
  const prepare = () => prepareStrings(module, generated);
  return { dir, module, generated, put, prepare };
}

function record(defaultMessage: string) {
  return { defaultMessage };
}

function compile(source: string): string {
  return ts.transpileModule(source, {
    compilerOptions: { module: ts.ModuleKind.CommonJS, target: ts.ScriptTarget.ES2020, removeComments: true },
  }).outputText;
}

// Execute pinned buildInlineModule, locale selection, JSON resolver, camelCasing,
// LocalizableString parsing, and NumberUtils. Only native host boundaries are
// supplied by this fixture; no resolver, parser, or formatting logic is replaced.
function runtime(strings: LocalizedStrings, moduleName: string, locales: string[], enableIntl = false) {
  const upstream = valdiSourceRoot();
  assert.ok(upstream, 'prepared pinned Valdi sources are required');
  const framework = path.join(upstream, 'src/valdi_modules/src/valdi');
  const reads: string[] = [];
  const context = vm.createContext({
    // Exercise the runtime's no-locale fallback deterministically rather than
    // inheriting the test machine's Intl locale when Device returns no locales.
    Intl: enableIntl ? Intl : undefined,
    runtime: {
      getModuleEntry(name: string, file: string, utf8: boolean) {
        assert.equal(name, moduleName);
        assert.equal(utf8, true);
        reads.push(file);
        assert.ok(strings.entries.has(file), `missing archive path ${file}`);
        return strings.entries.get(file)!.toString('utf8');
      },
    },
  });
  const cache = new Map<string, any>();
  const load = (id: string): any => {
    if (id === 'valdi_core/src/Device') return { Device: { getDeviceLocales: () => locales } };
    if (id === 'valdi_core/src/Strings') {
      return { getLocalizedString() { throw new Error('external localization must not be used'); } };
    }
    if (cache.has(id)) return cache.get(id);
    const file = path.join(framework, `${id}.ts`);
    const code = compile(readFileSync(file, 'utf8'));
    const module = { exports: {} as any };
    cache.set(id, module.exports);
    vm.runInContext(`(function(require, module, exports) {\n${code}\n})`, context, { filename: file })(
      (dependency: string) => load(dependency.startsWith('.')
        ? path.posix.normalize(path.posix.join(path.posix.dirname(id), dependency)) : dependency),
      module, module.exports,
    );
    return module.exports;
  };
  const module = { exports: {} as any };
  vm.runInContext(`(function(require, module, exports) {\n${compile(readFileSync(strings.generatedFile, 'utf8'))}\n})`,
    context, { filename: strings.generatedFile })(load, module, module.exports);
  return { api: module.exports.default, reads, load };
}

test('generates sorted typed accessors and module-relative JSON entries without source mutations', t => {
  const f = fixture(t);
  f.put('fr', { hello_world: record('Bonjour {person%s}, {count%d}!') });
  f.put('en-US', { hello_world: record('Howdy {person}, {count%d}!') });
  f.put('en', {
    l10nsvc: 'sourcefile',
    hello_world: record('Hello {person}, {count%d}!'),
    alreadyCamel: record('Already camel'),
    trailing__: record('Trailing'),
    repeated__separators: record('Repeated'),
  });
  const strings = f.prepare()!;
  assert.equal(strings.generatedFile, path.join(f.generated, 'src/Strings.ts'));
  assert.deepEqual([...strings.entries.keys()], [
    'strings/strings-en.json', 'strings/strings-en-US.json', 'strings/strings-fr.json',
  ]);
  const source = readFileSync(strings.generatedFile, 'utf8');
  assert.match(source, /"helloWorld"\(arg0: string, arg1: number\): string/);
  assert.match(source, /"alreadyCamel"\(\): string/);
  assert.doesNotMatch(source, /"l10nsvc"\(/);
  assert.match(source, /export default strings/);
  assert.ok(!existsSync(path.join(f.dir, 'src/Strings.ts')));
  const before = statSync(strings.generatedFile).mtimeMs;
  assert.equal(f.prepare()!.hash, strings.hash);
  assert.equal(statSync(strings.generatedFile).mtimeMs, before);
  const host = runtime(strings, f.module.name, ['en']);
  assert.equal(host.api.repeatedSeparators(), 'Repeated');
  assert.equal(host.api.trailing(), 'Trailing');
});

test('real pinned runtime selects locale by region and priority, falls back to English, and formats typed arguments', t => {
  const f = fixture(t);
  f.put('en', { welcome_person: record('Hello {person}, {count%d}!') });
  f.put('en-US', { welcome_person: record('Howdy {person%s}, {count%d}!') });
  f.put('fr', { welcome_person: record('Bonjour {person}, {count%d}!') });
  f.put('fr-CA', { welcome_person: record('Salut {person}, {count%d}!') });
  const strings = f.prepare()!;
  const cases = [
    { locales: ['fr-CA'], greeting: 'Salut' },
    { locales: ['fr-FR'], greeting: 'Bonjour' },
    { locales: ['fr-CA', 'en-US'], greeting: 'Salut' },
    { locales: ['en-US', 'fr-CA'], greeting: 'Howdy' },
    { locales: ['ja-JP'], greeting: 'Hello' },
    { locales: [], greeting: 'Hello' },
  ];
  for (const { locales, greeting } of cases) {
    const host = runtime(strings, f.module.name, locales);
    assert.deepEqual(host.reads, [], 'JSON must remain lazy');
    assert.equal(host.api.welcomePerson('Ada', 1234), `${greeting} Ada, ${(1234).toLocaleString()}!`);
    host.api.welcomePerson('Grace', 2);
    assert.equal(host.reads.length, 1, 'official resolver caches its selected JSON');
  }
});

test('retains official selected-locale missing-key and empty-message behavior', t => {
  const f = fixture(t);
  f.put('en', {
    missing_translation: record('English text'),
    empty_translation: record('English nonempty'),
    present: record('Present'),
  });
  f.put('fr', { empty_translation: record(''), present: record('Présent'), extra_key: record('Extra') });
  const strings = f.prepare()!;
  const host = runtime(strings, f.module.name, ['fr']);
  assert.equal(host.api.missingTranslation(), 'missing_translation');
  assert.equal(host.api.emptyTranslation(), 'empty_translation');
  assert.equal(host.api.present(), 'Présent');
  assert.equal(host.api.extraKey, undefined, 'English is the accessor inventory');
});

test('real LocaleResolver uses Intl when the native host supplies no locales', t => {
  const f = fixture(t);
  f.put('en', { plain: record('Text') });
  const host = runtime(f.prepare()!, f.module.name, [], true);
  const current = host.load('valdi_core/src/localization/LocaleResolver').getCurrentLocales();
  const expected = host.load('valdi_core/src/localization/Locale').Locale.parse(
    Intl.DateTimeFormat().resolvedOptions().locale,
  ).toString();
  assert.equal(current[0].toString(), expected);
  assert.equal(host.api.plain(), 'Text');
});

test('occurrence parameters are not deduplicated and types follow the English sequence', t => {
  const f = fixture(t);
  f.put('en', { echo: record('{person%s}: {person} ({count%d})') });
  f.put('fr', { echo: record('{person}: {person%s} [{count%d}]') });
  const strings = f.prepare()!;
  const host = runtime(strings, f.module.name, ['fr']);
  assert.equal(host.api.echo('one', 'two', 3), 'one: two [3]');
  assert.match(readFileSync(strings.generatedFile, 'utf8'), /arg0: string, arg1: string, arg2: number/);
});

test('generated default accessor is checked against real runtime types and rejects invalid consumer calls', t => {
  const f = fixture(t);
  f.put('en', { hello_world: record('Hello {person}, {count%d}'), plain_text: record('Text') });
  const strings = f.prepare()!;
  const consumer = path.join(f.dir, 'consumer.ts');
  writeFileSync(consumer, `
import Strings from './.gen/src/Strings';
const result: string = Strings.helloWorld('Ada', 2);
const plain: string = Strings.plainText();
// @ts-expect-error the first argument is a string
Strings.helloWorld(2, 2);
// @ts-expect-error the second argument is a number
Strings.helloWorld('Ada', '2');
// @ts-expect-error missing arguments are errors
Strings.helloWorld('Ada');
// @ts-expect-error plain accessors take no arguments
Strings.plainText('extra');
// @ts-expect-error only English keys are available
Strings.unknownKey();
`);
  const upstream = valdiSourceRoot();
  assert.ok(upstream);
  const program = ts.createProgram([consumer, strings.generatedFile], {
    noEmit: true, strict: true, skipLibCheck: true, types: [],
    target: ts.ScriptTarget.ES2020, moduleResolution: ts.ModuleResolutionKind.Node10,
    baseUrl: f.dir,
    paths: { '*': [path.join(upstream, 'src/valdi_modules/src/valdi/*')] },
  });
  const diagnostics = [
    ...program.getSyntacticDiagnostics(program.getSourceFile(strings.generatedFile)!),
    ...program.getSemanticDiagnostics(program.getSourceFile(strings.generatedFile)!),
    ...program.getSyntacticDiagnostics(program.getSourceFile(consumer)!),
    ...program.getSemanticDiagnostics(program.getSourceFile(consumer)!),
  ];
  assert.deepEqual(diagnostics.map(d => ts.flattenDiagnosticMessageText(d.messageText, '\n')), []);
});

test('JSON-only edits change final JS bytes independently of TS comment preservation and are idempotent', t => {
  const f = fixture(t);
  f.put('en', { hello_world: record('Hello') });
  const before = f.prepare()!;
  const source = readFileSync(before.generatedFile, 'utf8');
  const javascript = compile(source);
  const entries = new Map([['src/Strings.js', Buffer.from(javascript)]]);
  addStringEntries(entries, before);
  const first = entries.get('src/Strings.js')!;
  assert.deepEqual(entries.get('strings/strings-en.json'), before.entries.get('strings/strings-en.json'));
  f.put('en', { hello_world: record('Hello again') });
  const after = f.prepare()!;
  assert.equal(readFileSync(after.generatedFile, 'utf8'), source);
  assert.notEqual(after.hash, before.hash);
  addStringEntries(entries, after);
  const updated = entries.get('src/Strings.js')!;
  assert.notDeepEqual(updated, first);
  assert.equal(updated.toString().match(/valdi-localization-sha256/g)?.length, 1);
  addStringEntries(entries, after);
  assert.deepEqual(entries.get('src/Strings.js'), updated);
  assert.deepEqual(f.prepare()!.entries, after.entries);
});

test('no-strings modules are unchanged and only helper-owned stale sources are removed', t => {
  const f = fixture(t);
  assert.equal(f.prepare(), undefined);
  assert.ok(!existsSync(f.generated));
  const entries = new Map([['src/index.js', Buffer.from('unchanged')]]);
  addStringEntries(entries, undefined);
  assert.deepEqual([...entries.keys()], ['src/index.js']);
  f.put('en', {});
  const strings = f.prepare()!;
  rmSync(path.join(f.dir, 'strings'), { recursive: true });
  assert.equal(f.prepare(), undefined);
  assert.ok(!existsSync(strings.generatedFile));
  writeFileSync(strings.generatedFile, 'export const authored = true;\n');
  assert.equal(f.prepare(), undefined);
  assert.equal(readFileSync(strings.generatedFile, 'utf8'), 'export const authored = true;\n');
});

test('rejects authored Strings.ts / Strings.d.ts and foreign generated files without overwriting them', t => {
  for (const relative of ['src/Strings.ts', 'src/Strings.d.ts', '.gen/src/Strings.ts']) {
    const f = fixture(t);
    f.put('en', {});
    const file = path.join(f.dir, relative);
    mkdirSync(path.dirname(file), { recursive: true });
    writeFileSync(file, 'authored content');
    assert.throws(f.prepare, /conflicts with module-owned|refuses to overwrite/);
    assert.equal(readFileSync(file, 'utf8'), 'authored content');
  }
});

test('reports files and keys for malformed inputs, duplicate names, and invalid templates', t => {
  const cases: { json: unknown; error: RegExp }[] = [
    { json: [], error: /strings-en\.json: expected a JSON object/ },
    { json: null, error: /strings-en\.json: expected a JSON object/ },
    { json: { bad: null }, error: /strings-en\.json: key "bad": expected a record/ },
    { json: { bad: 'Hello' }, error: /strings-en\.json: key "bad": expected a record/ },
    { json: { bad: { defaultMessage: 2 } }, error: /strings-en\.json: key "bad": expected a record/ },
    { json: { hello_world: record('a'), helloWorld: record('b') }, error: /duplicate camelCase accessor "helloWorld"/ },
    { json: { ___: record('a') }, error: /nonempty camelCase accessor/ },
    { json: { bad: record('{value%f}') }, error: /strings-en\.json: key "bad": unsupported template format "%f"/ },
    { json: { bad: record('value {who') }, error: /strings-en\.json: key "bad": invalid template/ },
    { json: { bad: record('value }who{') }, error: /strings-en\.json: key "bad": invalid template/ },
    { json: { bad: record('{not a name}') }, error: /strings-en\.json: key "bad": invalid template/ },
  ];
  for (const { json, error } of cases) {
    const f = fixture(t);
    f.put('en', json);
    assert.throws(f.prepare, error);
    assert.ok(!existsSync(path.join(f.generated, 'src/Strings.ts')));
  }
  const f = fixture(t);
  f.put('en', {});
  writeFileSync(path.join(f.dir, 'strings/strings-en.json'), '{"bad":');
  assert.throws(f.prepare, /strings-en\.json: invalid JSON/);
});

test('requires exact English fallback and rejects malformed locale filenames', t => {
  const f = fixture(t);
  f.put('en-US', {});
  assert.throws(f.prepare, /missing required English fallback strings-en\.json/);
  f.put('en', {});
  f.put('fr_FR', {});
  assert.throws(f.prepare, /strings-fr_FR\.json: invalid locale filename/);
});

test('translation parameter count, name, type, and ordering errors identify the translation and key', t => {
  for (const message of ['{person}', '{other} {count%d}', '{person} {count}', '{count%d} {person}', '{person%f} {count%d}']) {
    const f = fixture(t);
    f.put('en', { greeting: record('{person} {count%d}') });
    f.put('fr', { greeting: record(message) });
    assert.throws(f.prepare, /strings-fr\.json: key "greeting": (template parameters must match|unsupported template format)/);
  }
});

test('archive injection requires a compiled Strings entry and does not partially mutate on failure', t => {
  const f = fixture(t);
  f.put('en', {});
  const strings = f.prepare()!;
  const entries = new Map<string, Buffer>();
  assert.throws(() => addStringEntries(entries, strings), /compiled src\/Strings\.js is missing/);
  assert.equal(entries.size, 0);
});
