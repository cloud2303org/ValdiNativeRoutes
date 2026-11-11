import assert from 'node:assert/strict';
import { existsSync, mkdirSync, mkdtempSync, readFileSync, realpathSync, rmSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import path from 'node:path';
import test, { type TestContext } from 'node:test';
import vm from 'node:vm';
import ts from 'typescript';
import { DevBuild, ModuleBuild, recordChange, type Pending } from './dev-build';
import { DevPacketReader, encodeDevPacket, updatedResources, type DevResource } from './dev-protocol';
import { root, valdiSourceRoot } from './pipeline';
import type { ValdiModule } from './valdiTs';

const upstream = process.env.VALDI_SOURCE_ROOT ?? valdiSourceRoot()
  ?? path.join(root, 'valdi/.valdi-sources/external/valdi+');
const upstreamModules = path.join(upstream, 'src/valdi_modules/src/valdi');

function write(directory: string, file: string, content: string) {
  const destination = path.join(directory, file);
  mkdirSync(path.dirname(destination), { recursive: true });
  writeFileSync(destination, content);
}

function strings(module: ValdiModule, language: string, messages: Record<string, string>) {
  write(module.dir, `strings/strings-${language}.json`, JSON.stringify(
    Object.fromEntries(Object.entries(messages).map(([key, defaultMessage]) => [key, { defaultMessage }])),
  ));
}

function fixture(t: TestContext, names = ['fixture']) {
  assert.ok(existsSync(path.join(upstreamModules, 'valdi_core/src/ModuleLoader.ts')),
    'prepare the pinned Valdi sources or set VALDI_SOURCE_ROOT');
  const temporary = realpathSync(mkdtempSync(path.join(tmpdir(), 'valdi-dev-strings-')));
  t.after(() => rmSync(temporary, { recursive: true, force: true, maxRetries: 10, retryDelay: 200 }));
  const directory = path.join(temporary, 'modules');
  const modules = names.map(name => ({
    name, dir: path.join(directory, name), generatedDirs: [path.join(temporary, '.gen', name)],
  } satisfies ValdiModule));
  const paths = Object.fromEntries(['valdi_core', 'valdi_tsx', 'coreutils', 'source_map']
    .map(name => [`${name}/*`, [path.join(upstreamModules, name, '*')]]));
  paths['tslib'] = [path.join(upstreamModules, 'valdi_core/src/tslib')];
  for (const module of modules) paths[`${module.name}/*`] = [path.join(module.dir, '*'), path.join(module.generatedDirs[0], '*')];
  for (const module of modules) {
    write(module.dir, 'tsconfig.json', JSON.stringify({
      extends: path.join(upstream, 'modules/_configs/base.tsconfig.json'),
      compilerOptions: {
        paths,
        types: [path.join(upstream, 'modules/types/Long'), path.join(upstream, 'modules/types/globals')],
      },
      include: ['src/**/*.ts', path.join(module.generatedDirs[0], '**/*.ts')],
    }));
    write(module.dir, 'src/index.ts', 'export const ready = true;\n');
  }
  const builds = new Map<string, ModuleBuild>();
  const session = new DevBuild(builds);
  t.after(() => { for (const build of builds.values()) build.plugin.dispose(); });
  return {
    directory, modules, session,
    async start() {
      for (const module of modules) builds.set(module.name, await ModuleBuild.create(module, module.generatedDirs[0]));
      return session.build();
    },
    batch(...files: string[]) {
      const batch = new Map<string, Pending>();
      for (const file of files) assert.equal(recordChange(batch, builds, directory, file), true, file);
      return batch;
    },
  };
}

type Require = (id: string, disableProxy?: boolean) => any;
interface Loader {
  load: Require;
  unload(ids: string[], isHotReloading: boolean, disableHotReloadDenyList: boolean): string[];
}

/** Real pinned ModuleLoader and Inline resolver; only the native host boundary is supplied here. */
function runtimeHost(initial: DevResource[]) {
  const entries = new Map<string, Buffer>();
  const jsonReads: string[] = [];
  const context = vm.createContext({
    runtime: {
      getCurrentPlatform: () => 1,
      getModuleEntry(bundle: string, file: string) {
        jsonReads.push(`${bundle}/${file}`);
        const bytes = entries.get(`${bundle}/${file}`);
        assert.ok(bytes, `missing runtime archive entry ${bundle}/${file}`);
        return bytes.toString('utf8');
      },
    },
  });
  const compiled = new Map<string, string>();
  const transpile = (id: string) => {
    if (!compiled.has(id)) {
      const file = path.join(upstreamModules, `${id}.ts`);
      assert.ok(existsSync(file), `unexpected native dependency ${id}`);
      const options = { module: ts.ModuleKind.CommonJS, target: ts.ScriptTarget.ES2020 };
      if (id === 'valdi_core/src/ModuleLoader') {
        // A whole program elides its type reexports, as the real bootstrap build does.
        const program = ts.createProgram([file], options);
        program.emit(program.getSourceFile(file), (name, text) => {
          if (name.endsWith('.js')) compiled.set(id, text);
        });
      } else {
        compiled.set(id, ts.transpileModule(readFileSync(file, 'utf8'), {
          fileName: file, compilerOptions: options,
        }).outputText);
      }
    }
    return compiled.get(id)!;
  };
  const evaluate = (code: string, id: string, require: Require, module: object, exports: object) => {
    vm.runInContext(`(function(require, module, exports) {\n${code}\n})`, context, { filename: `${id}.js` })
      (require, module, exports);
  };
  const bootstrap: Record<string, any> = {};
  evaluate(transpile('valdi_core/src/ModuleLoader'), 'ModuleLoader', id => {
    assert.fail(`unexpected bootstrap import ${id}`);
  }, { exports: bootstrap }, bootstrap);
  const loader: Loader = bootstrap.create(
    (id: string, require: Require, module: object, exports: object) => {
      if (id === 'valdi_core/src/Device') {
        // A device locale supplied by the host; locale selection itself stays official.
        (exports as any).Device = { getDeviceLocales: () => ['fr-FR'] };
        return undefined;
      }
      const code = entries.get(`${id}.js`)?.toString('utf8') ?? transpile(id);
      evaluate(code, id, require, module, exports);
      return undefined;
    },
    undefined, undefined, false,
  );
  context.moduleLoader = loader;
  const apply = (resources: DevResource[], unload = true) => {
    // Pass through the same framing and changed-resource payload as DeviceConnection.
    const reader = new DevPacketReader();
    let unloaded: string[] = [];
    reader.receive(encodeDevPacket(updatedResources(resources)), payload => {
      const ids: string[] = [];
      for (const resource of payload.event.updated_resources.resources) {
        const id = `${resource.bundle_name}/${resource.file_path_within_bundle}`;
        entries.set(id, resource.data_string === undefined
          ? Buffer.from(resource.data_base64, 'base64') : Buffer.from(resource.data_string));
        if (id.endsWith('.js')) ids.push(id.slice(0, -3));
      }
      if (unload) unloaded = loader.unload(ids, true, false);
    });
    return unloaded;
  };
  apply(initial, false);
  return { loader, entries, jsonReads, apply };
}

test('watch notifications collect JSON edits/additions/removals and directory removal alongside src/res', () => {
  const names = new Map([['fixture', {}]]);
  const pending = new Map<string, Pending>();
  const directory = path.join(tmpdir(), 'modules');
  for (const file of ['fixture/strings/strings-fr.json', 'fixture/strings', 'fixture/src/Page.tsx', 'fixture/res/icon.png']) {
    assert.equal(recordChange(pending, names, directory, file.split('/').join(path.sep)), true);
  }
  assert.equal(recordChange(pending, names, directory, 'fixture/module.json'), false);
  assert.equal(recordChange(pending, names, directory, 'disabled/strings/strings-en.json'), false);
  assert.equal(pending.size, 1);
  assert.deepEqual(pending.get('fixture'), {
    strings: true, res: true, files: new Set([path.join(directory, 'fixture/src/Page.tsx')]),
  });
});

test('translation-only changes refresh cached Inline strings through updated_resources and normal module unloading', async t => {
  const f = fixture(t);
  const [module] = f.modules;
  strings(module, 'en', { greeting: 'Hello' });
  strings(module, 'fr', { greeting: 'Bonjour' });
  write(module.dir, 'src/index.ts', "import strings from 'fixture/src/Strings';\nexport function message() { return strings.greeting(); }\n");
  const initial = await f.start();
  const h = runtimeHost(initial);
  assert.equal(h.loader.load('fixture/src/index', true).message(), 'Bonjour');
  assert.equal(h.loader.load('fixture/src/index', true).message(), 'Bonjour');
  assert.equal(h.jsonReads.filter(file => file.endsWith('strings-fr.json')).length, 1, 'the official resolver caches JSON');
  const generatedFile = path.join(module.generatedDirs[0], 'src/Strings.ts');
  const declaration = readFileSync(generatedFile, 'utf8');
  strings(module, 'fr', { greeting: 'Salut' });
  const changed = await f.session.rebuild(f.batch('fixture/strings/strings-fr.json'));
  assert.equal(readFileSync(generatedFile, 'utf8'), declaration, 'message text alone does not change the accessor');
  assert.deepEqual(changed.map(resource => resource.file).sort(), ['src/Strings.js', 'strings/strings-fr.json']);
  const unloaded = h.apply(changed);
  assert.ok(unloaded.includes('fixture/src/Strings'));
  assert.ok(unloaded.includes('fixture/src/index'), 'ModuleLoader unloads callers of the changed Strings module');
  assert.equal(h.loader.load('fixture/src/index', true).message(), 'Salut');
  assert.equal(h.jsonReads.filter(file => file.endsWith('strings-fr.json')).length, 2);
  assert.deepEqual(await f.session.rebuild(f.batch('fixture/strings/strings-fr.json')), [], 'unchanged saves send nothing');

  strings(module, 'de', { greeting: 'Hallo' });
  const added = await f.session.rebuild(f.batch('fixture/strings/strings-de.json'));
  assert.deepEqual(added.map(resource => resource.file).sort(), ['src/Strings.js', 'strings/strings-de.json']);
  h.apply(added);
  assert.equal(h.loader.load('fixture/src/index', true).message(), 'Salut');
  rmSync(path.join(module.dir, 'strings/strings-fr.json'));
  const removed = await f.session.rebuild(f.batch('fixture/strings/strings-fr.json'));
  assert.deepEqual(removed.map(resource => resource.file), ['src/Strings.js']);
  h.apply(removed);
  assert.ok(h.entries.has('fixture/strings/strings-fr.json'), 'debugger protocol leaves old bytes on the client');
  assert.equal(h.loader.load('fixture/src/index', true).message(), 'Hello', 'new accessor stops referencing the removed language');
  assert.equal(f.session.allResources().some(resource => resource.file === 'strings/strings-fr.json'), false,
    'new connections receive only current languages');
});

test('key and parameter edits refresh dependent diagnostics, retaining failed producer changes until the consumer is fixed', async t => {
  const f = fixture(t, ['shared', 'consumer']);
  const [shared, consumer] = f.modules;
  strings(shared, 'en', { greeting: 'Hello' });
  write(consumer.dir, 'src/index.ts', "import strings from 'shared/src/Strings';\nexport const message = strings.greeting();\n");
  await f.start();
  const before = f.session.allResources();
  strings(shared, 'en', { welcome: 'Welcome {count%d}' });
  await assert.rejects(f.session.rebuild(f.batch('shared/strings/strings-en.json')), /greeting/);
  assert.deepEqual(f.session.allResources(), before, 'failed diagnostics publish no partial output');
  write(consumer.dir, 'src/index.ts', "import strings from 'shared/src/Strings';\nexport const message = strings.welcome('wrong');\n");
  await assert.rejects(f.session.rebuild(f.batch('consumer/src/index.ts')), /not assignable to parameter of type 'number'/);
  write(consumer.dir, 'src/index.ts', "import strings from 'shared/src/Strings';\nexport const message = strings.welcome(2);\n");
  const changed = await f.session.rebuild(f.batch('consumer/src/index.ts'));
  assert.ok(changed.some(resource => resource.bundle === 'shared' && resource.file === 'src/Strings.js'));
  assert.ok(changed.some(resource => resource.bundle === 'shared' && resource.file === 'strings/strings-en.json'));
  assert.ok(changed.some(resource => resource.bundle === 'consumer' && resource.file === 'src/index.js'));
});

test('adding the first strings directory resolves a previously missing generated import in a consumer', async t => {
  const f = fixture(t, ['shared', 'consumer']);
  const [shared, consumer] = f.modules;
  write(consumer.dir, 'src/index.ts', "import strings from 'shared/src/Strings';\nexport const message = strings.greeting();\n");
  await assert.rejects(f.start(), /Cannot find module 'shared\/src\/Strings'/);
  strings(shared, 'en', { greeting: 'Hello' });
  const changed = await f.session.rebuild(f.batch('shared/strings'));
  assert.ok(changed.some(resource => resource.bundle === 'shared' && resource.file === 'src/Strings.js'));
  assert.ok(changed.some(resource => resource.bundle === 'consumer' && resource.file === 'src/index.js'));
});

test('invalid JSON preserves published outputs and can be fixed in a later batch', async t => {
  const f = fixture(t);
  const [module] = f.modules;
  strings(module, 'en', { greeting: 'Hello' });
  await f.start();
  const before = f.session.allResources();
  write(module.dir, 'strings/strings-en.json', '{');
  await assert.rejects(f.session.rebuild(f.batch('fixture/strings/strings-en.json')), /invalid JSON/);
  assert.deepEqual(f.session.allResources(), before);
  strings(module, 'en', { greeting: 'Fixed' });
  const changed = await f.session.rebuild(f.batch('fixture/strings/strings-en.json'));
  assert.deepEqual(changed.map(resource => resource.file).sort(), ['src/Strings.js', 'strings/strings-en.json']);
});

test('invalid JSON on the initial build can be corrected through the watcher without recreating the session', async t => {
  const f = fixture(t, ['consumer', 'shared']);
  const [consumer, shared] = f.modules;
  write(shared.dir, 'strings/strings-en.json', '{');
  write(consumer.dir, 'src/index.ts', "import strings from 'shared/src/Strings';\nexport const message = strings.greeting();\n");
  await assert.rejects(f.start(), /invalid JSON/);
  strings(shared, 'en', { greeting: 'Fixed' });
  const changed = await f.session.rebuild(f.batch('shared/strings/strings-en.json'));
  assert.ok(changed.some(resource => resource.bundle === 'shared' && resource.file === 'src/Strings.js'));
  assert.ok(changed.some(resource => resource.bundle === 'consumer' && resource.file === 'src/index.js'));
});

test('removing strings/ removes generated accessors and current archive entries, and re-adding it recovers', async t => {
  const f = fixture(t);
  const [module] = f.modules;
  strings(module, 'en', { greeting: 'Hello' });
  write(module.dir, 'src/index.ts', "import strings from 'fixture/src/Strings';\nexport const message = strings.greeting();\n");
  await f.start();
  rmSync(path.join(module.dir, 'strings'), { recursive: true });
  await assert.rejects(f.session.rebuild(f.batch('fixture/strings')), /Cannot find module 'fixture\/src\/Strings'/);
  assert.equal(existsSync(path.join(module.generatedDirs[0], 'src/Strings.ts')), false);
  write(module.dir, 'src/index.ts', "export const message = 'No strings';\n");
  const changed = await f.session.rebuild(f.batch('fixture/src/index.ts'));
  assert.deepEqual(changed.map(resource => resource.file), ['src/index.js']);
  assert.equal(f.session.allResources().some(resource => resource.file === 'src/Strings.js' || resource.file.startsWith('strings/')), false);
  strings(module, 'en', { greeting: 'Restored' });
  write(module.dir, 'src/index.ts', "import strings from 'fixture/src/Strings';\nexport const message = strings.greeting();\n");
  const restored = await f.session.rebuild(f.batch('fixture/strings', 'fixture/src/index.ts'));
  assert.ok(restored.some(resource => resource.file === 'src/Strings.js'));
  assert.ok(restored.some(resource => resource.file === 'strings/strings-en.json'));
});

test('source edits and font resource rebuilds retain existing changed-resource behavior', async t => {
  const f = fixture(t);
  const [module] = f.modules;
  // The builder transports font bytes; it does not parse or register the native font here.
  write(module.dir, 'res/Test.ttf', 'initial font bytes');
  await f.start();
  write(module.dir, 'src/index.ts', 'export const ready = false;\n');
  const source = await f.session.rebuild(f.batch('fixture/src/index.ts'));
  assert.deepEqual(source.map(resource => resource.file), ['src/index.js']);
  assert.match(source[0].data.toString(), /false/);
  write(module.dir, 'res/Test.ttf', 'changed font bytes');
  const font = await f.session.rebuild(f.batch('fixture/res/Test.ttf'));
  assert.deepEqual(font.map(resource => resource.file), ['res/test.ttf']);
  assert.equal(font[0].data.toString(), 'changed font bytes');
  write(module.dir, 'res/Second.ttf', 'second font bytes');
  const added = await f.session.rebuild(f.batch('fixture/res/Second.ttf'));
  assert.ok(added.some(resource => resource.file === 'res.assetcatalog'));
  assert.equal(added.find(resource => resource.file === 'res/second.ttf')?.data.toString(), 'second font bytes');
});
