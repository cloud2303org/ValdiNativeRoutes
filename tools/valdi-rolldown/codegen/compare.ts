// Generates a module's native bindings into a temporary directory and compares them with what the Valdi compiler
// generated, built by Bazel with the export's flags (scripts/ota.mjs): the Kotlin of the module's android.debug.srcjar
// and android.release.srcjar, and the Objective-C of its ios.<debug|release>.<hdrs|srcs|api.hdrs|api.srcs>, with the
// iOS dependency metadata the same compile writes beside them (ios/metadata/dependencyData.json, shown relative to
// ios/<config>/src). --golden's file or directory replaces Bazel's Kotlin, --objc-golden's directory (an
// ios/<config>/src) Bazel's Objective-C. Prints each file as identical or different, with the start of a unified diff,
// and fails if any differ.
//
//   npx tsx codegen/compare.ts [module] [--golden <.kt, .srcjar or directory>] [--objc-golden <directory>]
import { execFileSync, spawnSync } from 'node:child_process';
import {
  existsSync,
  mkdirSync,
  mkdtempSync,
  readdirSync,
  readFileSync,
  rmSync,
  statSync,
  writeFileSync,
} from 'node:fs';
import { tmpdir } from 'node:os';
import path from 'node:path';
import { root } from '../pipeline';
import { codegenModules, generateNativeCode, nativeSourceFiles } from './index';

const EXPORT_FLAGS = ['--config=stable_exec', '--snap_flavor=production', '-c', 'opt'];
const CONFIGS = ['debug', 'release'];
const OBJC_TARGET_KINDS = ['hdrs', 'srcs', 'api.hdrs', 'api.srcs'];
const DIFF_LINES = 80;

const args = process.argv.slice(2);
const option = (name: string) => {
  const index = args.indexOf(name);
  return index >= 0 ? path.resolve(args.splice(index, 2)[1]) : undefined;
};
const kotlinGoldenOption = option('--golden');
const objcGoldenOption = option('--objc-golden');
const name = args[0] ?? 'app_pages';
const modules = codegenModules();
const target = modules[name];
if (!target) throw new Error(`Unknown module ${name}; modules: ${Object.keys(modules).join(', ')}`);

const work = mkdtempSync(path.join(tmpdir(), 'valdi-codegen-compare-'));

/** A golden: its files by path, as named in the generated output. */
interface Golden {
  label: string;
  language: 'kotlin' | 'objc';
  files: Map<string, string>;
}

const shown = (file: string) => {
  const relative = path.relative(root, file);
  return relative.startsWith('..') ? file : relative;
};

/** A directory's files, by path in it, those `include` accepts. */
function readDir(dir: string, include: (file: string) => boolean, files = new Map<string, string>(), prefix = '') {
  for (const entry of readdirSync(dir)) {
    const file = path.join(dir, entry);
    if (statSync(file).isDirectory()) readDir(file, include, files, `${prefix}${entry}/`);
    else if (include(entry)) files.set(`${prefix}${entry}`, readFileSync(file, 'utf8'));
  }
  return files;
}

const isKotlin = (file: string) => file.endsWith('.kt');
const isObjC = (file: string) => file.endsWith('.h') || file.endsWith('.m');

/** Where the generated output has the iOS dependency metadata: relative to ios/<config>/src, in ios/metadata. */
const IOS_METADATA = '../../metadata/dependencyData.json';

/** The ObjC files, with the module's iOS dependency metadata the same compile writes when it has some. */
function withIOSMetadata(files: Map<string, string>, srcDir: string): Map<string, string> {
  const metadata = path.join(srcDir, IOS_METADATA);
  if (existsSync(metadata)) files.set(IOS_METADATA, readFileSync(metadata, 'utf8'));
  return files;
}

/** A Kotlin golden's files by path in the srcjar: a srcjar's entries, a directory's files, or a lone .kt file. */
function kotlinGolden(golden: string): Golden {
  const label = shown(golden);
  if (statSync(golden).isDirectory()) return { label, language: 'kotlin', files: readDir(golden, isKotlin) };
  if (readFileSync(golden).subarray(0, 2).toString() === 'PK') {
    const dir = mkdtempSync(path.join(work, 'golden-'));
    execFileSync('unzip', ['-q', golden, '-d', dir]);
    return { label, language: 'kotlin', files: readDir(dir, isKotlin) };
  }
  return { label, language: 'kotlin', files: new Map([[path.basename(golden), readFileSync(golden, 'utf8')]]) };
}

const bazel = (bazelArgs: string[]) =>
  execFileSync('bazel', bazelArgs, {
    cwd: path.join(root, 'valdi'),
    encoding: 'utf8',
    stdio: ['ignore', 'pipe', 'pipe'],
  });

/** The files a target builds, by cquery with the export's flags. */
const targetFiles = (label: string) =>
  bazel(['cquery', ...EXPORT_FLAGS, '--output=files', label])
    .split('\n')
    .filter(Boolean)
    .map(file => path.join(root, 'valdi', file));

/** The goldens Bazel builds for the languages without one given, each configuration (they may be the same files). */
function bazelGoldens(): Golden[] {
  const kotlinTargets = kotlinGoldenOption ? [] : CONFIGS.map(config => `//modules/${name}:android.${config}.srcjar`);
  const objcTargets = (config: string) => OBJC_TARGET_KINDS.map(kind => `//modules/${name}:ios.${config}.${kind}`);
  const allObjcTargets = objcGoldenOption ? [] : CONFIGS.flatMap(objcTargets);
  if (!kotlinTargets.length && !allObjcTargets.length) return [];
  bazel(['build', ...EXPORT_FLAGS, ...kotlinTargets, ...allObjcTargets]);

  const goldens: Golden[] = [];
  if (kotlinTargets.length) {
    const srcjars = new Set(targetFiles(`set(${kotlinTargets.join(' ')})`));
    goldens.push(...[...srcjars].map(kotlinGolden));
  }
  if (allObjcTargets.length) {
    for (const config of CONFIGS) {
      // Each target is one file of ios/<config>/src, named there as in the generated output.
      const files = new Map<string, string>();
      let srcDir: string | undefined;
      for (const label of objcTargets(config)) {
        for (const file of targetFiles(label)) {
          const match = /^(.*\/ios\/[^/]+\/src)\/(.*)$/.exec(file);
          if (!match) throw new Error(`${label}: ${file} is not in an ios/<config>/src directory`);
          srcDir = match[1];
          files.set(match[2], readFileSync(file, 'utf8'));
        }
      }
      if (!srcDir) throw new Error(`No Objective-C outputs for ${name} (${config})`);
      goldens.push({ label: `${shown(srcDir)} (${config})`, language: 'objc', files: withIOSMetadata(files, srcDir) });
    }
  }
  return goldens;
}

const code = generateNativeCode(target);
const generatedDir = path.join(work, 'generated');
const write = (file: string, content: string) => {
  mkdirSync(path.dirname(path.join(generatedDir, file)), { recursive: true });
  writeFileSync(path.join(generatedDir, file), content);
};
// The generated files by language, each in its own directory of generatedDir (named as in its goldens).
const generated = {
  kotlin: { dir: 'android', files: nativeSourceFiles(target, code, 'android') },
  objc: { dir: 'ios/config/src', files: nativeSourceFiles(target, code, 'ios') },
};
if (code.iosDependencyMetadata !== undefined) generated.objc.files.set(IOS_METADATA, code.iosDependencyMetadata);
for (const { dir, files } of Object.values(generated)) {
  for (const [file, content] of files) write(path.join(dir, file), content);
}

const goldens = bazelGoldens();
if (kotlinGoldenOption) goldens.unshift(kotlinGolden(kotlinGoldenOption));
if (objcGoldenOption) {
  goldens.push({
    label: shown(objcGoldenOption),
    language: 'objc',
    files: withIOSMetadata(readDir(objcGoldenOption, isObjC), objcGoldenOption),
  });
}

let different = 0;
for (const golden of goldens) {
  console.log(`${golden.label}:`);
  const language = generated[golden.language];
  for (const file of [...new Set([...golden.files.keys(), ...language.files.keys()])].sort()) {
    // Not every golden has the metadata (a copied src directory).
    if (file === IOS_METADATA && !golden.files.has(file)) continue;
    const want = golden.files.get(file);
    const got = language.files.get(file);
    if (want === got) {
      console.log(`  identical  ${file}`);
      continue;
    }
    different++;
    if (want === undefined || got === undefined) {
      console.log(`  ${want === undefined ? 'extra    ' : 'missing  '}  ${file}`);
      continue;
    }
    console.log(`  different  ${file}`);
    const wantFile = path.join(work, 'want');
    writeFileSync(wantFile, want);
    const diff = spawnSync(
      'diff',
      [
        '-u',
        '--label',
        `valdi/${file}`,
        '--label',
        `codegen/${file}`,
        wantFile,
        path.join(generatedDir, language.dir, file),
      ],
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
}

rmSync(work, { recursive: true, force: true });
if (different) process.exit(1);
