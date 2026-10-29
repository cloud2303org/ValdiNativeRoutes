// Generates the native bindings of Valdi's compiler test corpus (valdi/testdata/resources/modules) and compares them
// with the outputs the Valdi compiler checked in for it (tools/ci/compiler_goldens, see the README there): the release
// Kotlin (android/release/src/<module>.kt), Objective-C (ios/release/src/**/*.{h,m}) and C++
// (cpp/release/src/valdi_modules/<module>/<module>.{hpp,cpp}). Each module is configured from its BUILD.bazel's
// valdi_module() and the project config every valdi_module() build has (VALDI_PROJECT_CONFIG); its TypeScript sees
// its dependencies, the corpus' and Valdi's own modules (valdi_core…), as Valdi lays them out. Prints each file as
// identical or different, with the start of a unified diff, and fails if any differ.
//
//   npx tsx codegen/goldens.ts [module…] [--valdi <dir>]
//
// The modules default to every one with goldens. --valdi is Valdi's source, by default the one the build pins
// (valdi/bazel-valdi/external/valdi+).
import { spawnSync } from 'node:child_process';
import { existsSync, mkdtempSync, readdirSync, readFileSync, rmSync, statSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import path from 'node:path';
import ts from 'typescript';
import { root } from '../pipeline';
import type { ValdiModule } from '../valdiTs';
import { generateNativeCode, nativeSourceFiles, VALDI_PROJECT_CONFIG, type CodegenModule } from './index';
import type { BundleInfo, IOSLanguage, Platform } from './Models';

const DIFF_LINES = 40;

const args = process.argv.slice(2);
const valdiIndex = args.indexOf('--valdi');
const valdiDir = path.resolve(
  valdiIndex >= 0 ? args.splice(valdiIndex, 2)[1] : path.join(root, 'valdi/bazel-valdi/external/valdi+'),
);
const goldensDir = path.join(valdiDir, 'tools/ci/compiler_goldens');
const corpusDir = path.join(valdiDir, 'valdi/testdata/resources/modules');
/** Valdi's own modules: valdi_core, valdi_tsx, worker… */
const valdiModulesDir = path.join(valdiDir, 'src/valdi_modules/src/valdi');

const allModules = readdirSync(goldensDir).filter(entry => statSync(path.join(goldensDir, entry)).isDirectory());
if (!allModules.length) throw new Error(`No upstream compiler goldens found in ${goldensDir}; review the upstream test layout before accepting this version.`);
const modules = args.length ? args : allModules;
const unknown = modules.filter(module => !allModules.includes(module));
if (unknown.length) {
  console.error(`No goldens for ${unknown.join(', ')}; modules: ${allModules.join(', ')}`);
  process.exit(2);
}

/** A BUILD.bazel value: a string, a list of strings (globs evaluated), a boolean. */
type StarlarkValue = string | string[] | boolean;

/**
 * The attributes of the file's valdi_module() call, as far as the corpus writes them: strings, booleans, lists of
 * strings, glob() calls and their sums.
 */
function parseValdiModule(buildFile: string): Record<string, StarlarkValue> {
  const source = readFileSync(buildFile, 'utf8');
  const tokens: string[] = [];
  const tokenRegex = /\s+|#[^\n]*|"((?:[^"\\]|\\.)*)"|'((?:[^'\\]|\\.)*)'|([A-Za-z_][A-Za-z0-9_]*)|(.)/gs;
  for (const match of source.matchAll(tokenRegex)) {
    if (match[1] !== undefined || match[2] !== undefined) tokens.push(JSON.stringify(match[1] ?? match[2]));
    else if (match[3] !== undefined || match[4] !== undefined) tokens.push(match[3] ?? match[4]);
  }
  let position = tokens.indexOf('valdi_module');
  if (position < 0 || tokens[position + 1] !== '(') throw new Error(`${buildFile}: no valdi_module()`);
  position += 2;
  const moduleDir = path.dirname(buildFile);

  const expect = (token: string) => {
    if (tokens[position++] !== token) throw new Error(`${buildFile}: expected ${token}, got ${tokens[position - 1]}`);
  };
  const parseList = (): string[] => {
    expect('[');
    const items: string[] = [];
    while (tokens[position] !== ']') {
      const item = parseExpression();
      if (typeof item !== 'string') throw new Error(`${buildFile}: lists of strings only`);
      items.push(item);
      if (tokens[position] === ',') position++;
    }
    expect(']');
    return items;
  };
  const parseTerm = (): StarlarkValue => {
    const token = tokens[position];
    if (token.startsWith('"')) {
      position++;
      return JSON.parse(token) as string;
    }
    if (token === '[') return parseList();
    if (token === 'True' || token === 'False') {
      position++;
      return token === 'True';
    }
    if (token === 'glob') {
      position++;
      expect('(');
      const patterns = parseList();
      expect(')');
      return glob(moduleDir, patterns);
    }
    throw new Error(`${buildFile}: unsupported ${token}`);
  };
  function parseExpression(): StarlarkValue {
    let value = parseTerm();
    while (tokens[position] === '+') {
      position++;
      const term = parseTerm();
      if (!Array.isArray(value) || !Array.isArray(term)) throw new Error(`${buildFile}: + of lists only`);
      value = [...value, ...term];
    }
    return value;
  }

  const attributes: Record<string, StarlarkValue> = {};
  while (tokens[position] !== ')') {
    const name = tokens[position++];
    expect('=');
    attributes[name] = parseExpression();
    if (tokens[position] === ',') position++;
  }
  return attributes;
}

/** The module's files (relative to its directory) a glob()'s patterns match. */
function glob(dir: string, patterns: string[]): string[] {
  const regexes = patterns.map(
    pattern =>
      new RegExp(
        `^${pattern
          .split('**/')
          .map(part => part.replace(/[.+^${}()|[\]\\]/g, '\\$&').replaceAll('*', '[^/]*'))
          .join('(?:.*/)?')}$`,
      ),
  );
  const files: string[] = [];
  const walk = (relative: string) => {
    for (const entry of readdirSync(path.join(dir, relative))) {
      const file = relative ? `${relative}/${entry}` : entry;
      if (statSync(path.join(dir, file)).isDirectory()) walk(file);
      else if (regexes.some(regex => regex.test(file))) files.push(file);
    }
  };
  walk('');
  return files.sort();
}

const stringAttribute = (attributes: Record<string, StarlarkValue>, name: string) => {
  const value = attributes[name];
  return typeof value === 'string' ? value : undefined;
};

const listAttribute = (attributes: Record<string, StarlarkValue>, name: string): string[] => {
  const value = attributes[name];
  if (value === undefined) return [];
  return typeof value === 'string' ? [value] : Array.isArray(value) ? value : [];
};

/** IOSLanguage.parse of valdi_module(ios_language): a language or a list of them. */
function iosLanguage(languages: string[]): IOSLanguage {
  const sorted = [...languages].sort().join(',');
  if (sorted === 'objc' || sorted === '') return 'objc';
  if (sorted === 'swift') return 'swift';
  if (sorted === 'objc,swift') return 'both';
  throw new Error(`Unsupported ios language '${languages.join(', ')}'`);
}

/** The corpus modules a module depends on, itself first, each once. */
function corpusModules(name: string, seen = new Set<string>()): string[] {
  if (seen.has(name)) return [];
  seen.add(name);
  const attributes = parseValdiModule(path.join(corpusDir, name, 'BUILD.bazel'));
  const deps = listAttribute(attributes, 'deps')
    .filter(dep => dep.startsWith('//valdi/testdata/resources/modules/'))
    .map(dep => path.posix.basename(dep));
  return [name, ...deps.flatMap(dep => corpusModules(dep, seen))];
}

/** The module's configuration, as valdi_module() writes its module.yaml, and its program. */
function codegenModule(name: string): CodegenModule {
  const dir = path.join(corpusDir, name);
  const attributes = parseValdiModule(path.join(dir, 'BUILD.bazel'));
  const bundleInfo: BundleInfo = {
    ...VALDI_PROJECT_CONFIG,
    name,
    asyncStrictMode: attributes.async_strict_mode === true,
    androidClassPath: stringAttribute(attributes, 'android_class_path'),
    iosClassPrefix: stringAttribute(attributes, 'ios_class_prefix'),
    iosModuleName: stringAttribute(attributes, 'ios_module_name') ?? name,
    iosLanguage: iosLanguage(listAttribute(attributes, 'ios_language')),
  };
  const module: ValdiModule = { name, dir, generatedDirs: [] };

  const program = () => {
    // Valdi's module tsconfig, the modules mapped where they are: `<module>/*` imports, and the compilation paths of
    // the files in them.
    const configPath = path.join(valdiDir, 'modules/_configs/base.tsconfig.json');
    const config = ts.parseJsonConfigFileContent(
      ts.readConfigFile(configPath, ts.sys.readFile).config,
      ts.sys,
      path.dirname(configPath),
      { noEmit: true },
      configPath,
    );
    const paths: Record<string, string[]> = { ...config.options.paths };
    for (const valdiModule of readdirSync(valdiModulesDir)) {
      if (statSync(path.join(valdiModulesDir, valdiModule)).isDirectory()) {
        paths[`${valdiModule}/*`] = [path.join(valdiModulesDir, valdiModule, '*')];
      }
    }
    for (const corpusModule of corpusModules(name))
      paths[`${corpusModule}/*`] = [path.join(corpusDir, corpusModule, '*')];
    // The module's TypeScript sources (srcs), .d.ts included.
    const rootNames = listAttribute(attributes, 'srcs')
      .filter(file => /\.tsx?$/.test(file))
      .map(file => path.join(dir, file));
    return ts.createProgram(rootNames, { ...config.options, paths });
  };
  return { module, bundleInfo, program };
}

/** A directory's files, by path in it, those `include` accepts, without their `.golden` suffix. */
function readGoldens(dir: string, include: (file: string) => boolean, files = new Map<string, string>(), prefix = '') {
  if (!existsSync(dir)) return files;
  for (const entry of readdirSync(dir)) {
    const file = path.join(dir, entry);
    if (statSync(file).isDirectory()) readGoldens(file, include, files, `${prefix}${entry}/`);
    else if (entry.endsWith('.golden') && include(entry.slice(0, -'.golden'.length))) {
      files.set(`${prefix}${entry.slice(0, -'.golden'.length)}`, readFileSync(file, 'utf8'));
    }
  }
  return files;
}

const LANGUAGES: { label: string; platform: Platform; dir: string; include: (file: string) => boolean }[] = [
  { label: 'kotlin', platform: 'android', dir: 'android/release/src', include: file => file.endsWith('.kt') },
  { label: 'objc', platform: 'ios', dir: 'ios/release/src', include: file => /\.[hm]$/.test(file) },
  { label: 'c++', platform: 'cpp', dir: 'cpp/release/src', include: file => /\.(hpp|cpp)$/.test(file) },
];

const work = mkdtempSync(path.join(tmpdir(), 'valdi-codegen-goldens-'));
const summary: string[] = [];
let different = 0;
for (const name of modules) {
  console.log(`${name}:`);
  const target = codegenModule(name);
  let code: ReturnType<typeof generateNativeCode>;
  try {
    code = generateNativeCode(target, message => console.log(`  warning: ${message}`));
  } catch (error) {
    different++;
    console.log(`  failed: ${(error as Error).message.replaceAll('\n', '\n  ')}`);
    summary.push(`${name}: generation failed`);
    continue;
  }
  const results: string[] = [];
  for (const { label, platform, dir, include } of LANGUAGES) {
    const goldens = readGoldens(path.join(goldensDir, name, dir), include);
    const generated = nativeSourceFiles(target, code, platform);
    let languageDifferent = 0;
    for (const file of [...new Set([...goldens.keys(), ...generated.keys()])].sort()) {
      const want = goldens.get(file);
      const got = generated.get(file);
      if (want === got) {
        console.log(`  identical  ${label} ${file}`);
        continue;
      }
      languageDifferent++;
      if (want === undefined || got === undefined) {
        console.log(`  ${want === undefined ? 'extra    ' : 'missing  '}  ${label} ${file}`);
        continue;
      }
      console.log(`  different  ${label} ${file}`);
      const wantFile = path.join(work, 'want');
      const gotFile = path.join(work, 'got');
      writeFileSync(wantFile, want);
      writeFileSync(gotFile, got);
      const diff = spawnSync(
        'diff',
        ['-u', '--label', `golden/${file}`, '--label', `codegen/${file}`, wantFile, gotFile],
        { encoding: 'utf8' },
      ).stdout.split('\n');
      console.log(
        diff
          .slice(0, DIFF_LINES)
          .map(line => `    ${line}`)
          .join('\n'),
      );
      if (diff.length > DIFF_LINES) console.log(`    … ${diff.length - DIFF_LINES} more diff lines`);
    }
    different += languageDifferent;
    const count = new Set([...goldens.keys(), ...generated.keys()]).size;
    results.push(`${label} ${languageDifferent ? `${languageDifferent} of ${count} different` : `${count} identical`}`);
  }
  summary.push(`${name}: ${results.join(', ')}`);
}
rmSync(work, { recursive: true, force: true });

console.log(`\n${summary.join('\n')}`);
if (different) process.exit(1);
