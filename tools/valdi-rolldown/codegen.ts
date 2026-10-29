// Generates the app modules' native bindings from their annotated TypeScript, as the Valdi compiler does (codegen/),
// each module's laid out as in its outputs: the Kotlin of its srcjar (`app_pages.kt`), the Objective-C of ios/<debug|release>/src
// (`app_pages/app_pages.h`, `.m`, and the API `app_pagesTypes/app_pagesTypes.h`, `.m`), and the C++ of
// cpp/<debug|release>/src (`valdi_modules/app_pages/app_pages.hpp`, `.cpp`).
//
//   npx tsx codegen.ts [module] [--kotlin-out <dir>] [--objc-out <dir> [--objc-framework <name>]]
//                      [--cpp-out <dir> [--cpp-class-prefix <prefix>]] [--check]
//
// --objc-framework: the Objective-C imports Valdi's runtime as from that framework (<valdi_core/X.h> becomes
// <ValdiRuntime/X.h>), as Valdi rewrites them when it packages an xcframework; the module's own headers stay as they
// are, found through the app's header search path.
// --cpp-class-prefix: what inferred C++ type names start with (`app::` names Greeting app::Greeting), as module.yaml's
// cpp.class_prefix does; valdi_module() has no attribute for it, so Bazel builds use the project's
// `snap::valdi_modules::<module>::`.
// Without a module, every app module (valdi/modules/<module>); their files don't overlap, so they share the output
// directories. At least one output is needed. Files are written only when their content changes.
// --check writes nothing and fails, listing them, when files would change: the build runs it, developers run the
// generator when they change a native interface.
import { existsSync, mkdirSync, readFileSync, writeFileSync } from 'node:fs';
import path from 'node:path';
import { codegenModules, generateNativeCode, nativeSourceFiles } from './codegen/index';

const args = process.argv.slice(2);
const option = (name: string) => {
  const index = args.indexOf(name);
  if (index < 0) return undefined;
  const value = args[index + 1];
  if (value === undefined || value.startsWith('--')) throw new Error(`${name} needs a value`);
  args.splice(index, 2);
  return value;
};
const outputs = {
  android: option('--kotlin-out'),
  ios: option('--objc-out'),
  cpp: option('--cpp-out'),
};
const objcFramework = option('--objc-framework');
const cppClassPrefix = option('--cpp-class-prefix');
const check = args.includes('--check');
const positional = args.filter(arg => arg !== '--check');
const unknown = positional.filter(arg => arg.startsWith('--'));
const name = positional.find(arg => !arg.startsWith('--'));
const modules = codegenModules();
if (
  unknown.length ||
  positional.length > 1 ||
  (name && !modules[name]) ||
  (!outputs.android && !outputs.ios && !outputs.cpp) ||
  (objcFramework && !outputs.ios) ||
  (cppClassPrefix && !outputs.cpp)
) {
  console.error(
    'Usage: npx tsx codegen.ts [module] [--kotlin-out <dir>] [--objc-out <dir> [--objc-framework <name>]] [--cpp-out <dir> [--cpp-class-prefix <prefix>]] [--check]',
  );
  if (name && !modules[name]) console.error(`Modules: ${Object.keys(modules).join(', ')}`);
  process.exit(2);
}
const targets = (name ? [modules[name]] : Object.values(modules)).map(configured =>
  cppClassPrefix ? { ...configured, bundleInfo: { ...configured.bundleInfo, cppClassPrefix } } : configured,
);

/** Relative to the working directory when inside it. */
const shown = (file: string) => {
  const relative = path.relative(process.cwd(), file);
  return relative.startsWith('..') ? file : relative;
};

const changed: string[] = [];
for (const target of targets) {
  const code = generateNativeCode(target);
  for (const platform of ['android', 'ios', 'cpp'] as const) {
    const outDir = outputs[platform];
    if (!outDir) continue;
    for (const [file, generated] of nativeSourceFiles(target, code, platform)) {
      const content =
        platform === 'ios' && objcFramework ? generated.replaceAll('#import <valdi_core/', `#import <${objcFramework}/`) : generated;
      const output = path.join(path.resolve(outDir), file);
      // A module without C++ declarations gets empty C++ files, as from Valdi; they aren't written: the C++ is linked
      // into the exported runtime, and a new file would ask for an export (scripts/ota.mjs check-export).
      if (platform === 'cpp' && !content && !existsSync(output)) continue;
      if (existsSync(output) && readFileSync(output, 'utf8') === content) continue;
      changed.push(shown(output));
      if (check) continue;
      mkdirSync(path.dirname(output), { recursive: true });
      writeFileSync(output, content);
    }
  }
}

if (check && changed.length) {
  const outArgs = [
    ...(outputs.android ? ['--kotlin-out', outputs.android] : []),
    ...(outputs.ios ? ['--objc-out', outputs.ios] : []),
    ...(objcFramework ? ['--objc-framework', objcFramework] : []),
    ...(outputs.cpp ? ['--cpp-out', outputs.cpp] : []),
    ...(cppClassPrefix ? ['--cpp-class-prefix', cppClassPrefix] : []),
  ];
  console.error(`The native bindings are out of date; run: npx tsx codegen.ts ${name ? `${name} ` : ''}${outArgs.join(' ')}`);
  for (const file of changed) console.error(`  ${file}`);
  process.exit(1);
}
for (const file of changed) console.log(`wrote ${file}`);
