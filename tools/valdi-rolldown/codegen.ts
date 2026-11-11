// Generates the app modules' native bindings from their annotated TypeScript, as the Valdi compiler does (codegen/),
// each module's laid out as in its outputs: the Kotlin of its srcjar (`app_pages.kt`), the Objective-C of ios/<debug|release>/src
// (`app_pages/app_pages.h`, `.m`, and the API `app_pagesTypes/app_pagesTypes.h`, `.m`), and the C++ of
// cpp/<debug|release>/src (`valdi_modules/app_pages/app_pages.hpp`, `.cpp`).
//
//   npx tsx codegen.ts [module] [--kotlin-out <dir>] [--objc-out <dir> [--objc-framework <name>]]
//                      [--cpp-out <dir>] [--cpp-modules-out <modules-dir>] [--cpp-class-prefix <prefix>] [--check]
//
// --objc-framework: the Objective-C imports Valdi's runtime as from that framework (<valdi_core/X.h> becomes
// <ValdiRuntime/X.h>), as Valdi rewrites them when it packages an xcframework; the module's own headers stay as they
// are, found through the app's header search path.
// --cpp-class-prefix: what inferred C++ type names start with (`app::` names Greeting app::Greeting), as module.yaml's
// cpp.class_prefix does; valdi_module() has no attribute for it, so Bazel builds use the project's
// `snap::valdi_modules::<module>::`.
// --cpp-modules-out: module-owned cpp/generated include roots. Defaults to enabled modules owning cpp/src
// implementations and their transitive generated C++ include dependencies; an explicit module adds its bindings
// to these default roots, preserving complete runtime output when synchronizing a canonical modules directory.
// Also writes runtime-packages.bazelrc excluding exact parent packages for all available modules, including disabled ones.
// Canonical C++ command (from this directory): npx tsx codegen.ts --cpp-modules-out ../../valdi/modules
// Host Kotlin/ObjC sync removes Bazel/CPP-owned root copies; cpp modules emit only C++ even when named explicitly.
// --cpp-out retains the generic flat layout and --cpp-modules-out keeps its independent runtime closure.
// module.json cppSourceRoots optionally narrows only module-owned C++ entry files; imports are still followed.
// At least one output is needed. Files are written only when their content changes.
// --check writes nothing and fails, listing them, when files would change: the build runs it, developers run the
// generator when they change a native interface.
import { existsSync, mkdirSync, readFileSync, rmSync, writeFileSync } from 'node:fs';
import path from 'node:path';
import { codegenModules, generateNativeCode, nativeSourceFiles, type CodegenModule, type NativeCode } from './codegen/index';
import { planCppModules, syncCppModules } from './cpp-modules';
import { cppSourceRootTarget } from './codegen/cpp-source-roots';
import { moduleConfig, root } from './pipeline';
import { availableModuleNames, enabledModuleNames } from './modules.mjs';

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
const cppModulesOut = option('--cpp-modules-out');
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
  (!outputs.android && !outputs.ios && !outputs.cpp && !cppModulesOut) ||
  (objcFramework && !outputs.ios) ||
  (cppClassPrefix && !outputs.cpp && !cppModulesOut)
) {
  console.error(
    'Usage: npx tsx codegen.ts [module] [--kotlin-out <dir>] [--objc-out <dir> [--objc-framework <name>]] [--cpp-out <dir>] [--cpp-modules-out <modules-dir>] [--cpp-class-prefix <prefix>] [--check]',
  );
  if (name && !modules[name]) console.error(`Modules: ${Object.keys(modules).join(', ')}`);
  process.exit(2);
}
const configuredModules = Object.fromEntries(Object.entries(modules).map(([id, configured]) => [id,
  { ...configured, bundleInfo: {
    ...configured.bundleInfo,
    ...(cppClassPrefix ? { cppClassPrefix } : {}),
    ...(moduleConfig(id).nativeBuild === 'cpp' ? { androidCodegenEnabled: false, iosCodegenEnabled: false } : {}),
  } },
]));
// Bazel modules compile their generated Kotlin/ObjC (and generic flat bindings) in their own native libraries.
const targets = name ? [configuredModules[name]] : Object.values(configuredModules)
  .filter(target => moduleConfig(target.module.name).nativeBuild !== 'bazel');
const generated = new Map<string, NativeCode>();
const generate = (target: CodegenModule): NativeCode => {
  let code = generated.get(target.module.name);
  if (!code) {
    code = generateNativeCode(target);
    generated.set(target.module.name, code);
  }
  return code;
};
// Resolve the complete closure before touching any output, so a disabled/missing dependency fails cleanly.
// Validate every configured C++ source-root list first. Host/flat generation keeps the original targets and cache.
const cppTargets = cppModulesOut ? Object.fromEntries(Object.entries(configuredModules).map(([id, target]) =>
  [id, cppSourceRootTarget(target, moduleConfig(id).cppSourceRoots)])) : undefined;
const generatedCpp = new Map<string, NativeCode>();
const cppPlan = cppModulesOut ? planCppModules({
  modules: configuredModules,
  availableModules: availableModuleNames(root),
  roots: name ? [name] : undefined,
  generate: target => {
    let code = generatedCpp.get(target.module.name);
    if (!code) {
      code = generateNativeCode(cppTargets![target.module.name]);
      generatedCpp.set(target.module.name, code);
    }
    return code;
  },
}) : undefined;

/** Relative to the working directory when inside it. */
const shown = (file: string) => {
  const relative = path.relative(process.cwd(), file);
  return relative.startsWith('..') ? file : relative;
};

const changed: string[] = [];
if (cppPlan) changed.push(...syncCppModules(cppPlan, cppModulesOut!, check).map(shown));
if (!name || moduleConfig(name).nativeBuild === 'cpp') {
  const enabled = new Set(enabledModuleNames(root));
  for (const module of availableModuleNames(root)) {
    if (name && module !== name) continue;
    const disabled = !enabled.has(module);
    const config = moduleConfig(module);
    if (!disabled && !['bazel', 'cpp'].includes(config.nativeBuild ?? '')) continue;
    const iosName = config.iosModuleName ?? module;
    const obsolete = {
      android: [`${module}.kt`],
      // Remove canonical host copies; neighboring files in their directories may be handwritten.
      ios: disabled ? [iosName, `${iosName}Types`] : [iosName, `${iosName}Types`]
        .flatMap(name => ['h', 'm', 'swift'].map(extension => `${name}/${name}.${extension}`)),
      cpp: disabled ? [`valdi_modules/${module}`] : [],
    };
    for (const platform of ['android', 'ios', 'cpp'] as const) {
      if (!outputs[platform]) continue;
      for (const file of obsolete[platform]) {
        const output = path.resolve(outputs[platform]!, file);
        if (!existsSync(output)) continue;
        changed.push(`${shown(output)} (${disabled ? 'disabled module' : config.nativeBuild === 'cpp' ? 'CPP-owned module' : 'Bazel-owned module'}; remove)`);
        if (!check) rmSync(output, { recursive: true, force: true });
      }
    }
  }
}
for (const target of outputs.android || outputs.ios || outputs.cpp ? targets : []) {
  const code = generate(target);
  for (const platform of ['android', 'ios', 'cpp'] as const) {
    if (moduleConfig(target.module.name).nativeBuild === 'cpp' && platform !== 'cpp') continue;
    const outDir = outputs[platform];
    if (!outDir) continue;
    for (const [file, generated] of nativeSourceFiles(target, code, platform)) {
      const content =
        platform === 'ios' && objcFramework ? generated
          .replaceAll('#import <valdi_core/', `#import <${objcFramework}/`)
          .replaceAll('import ValdiCoreSwift', `import ${objcFramework}`) : generated;
      const output = path.join(path.resolve(outDir), file);
      // A module without C++ declarations gets empty C++ files, as from Valdi; they aren't written: the C++ is linked
      // into the exported runtime; changing these files requires an explicit runtime export.
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
    ...(cppModulesOut ? ['--cpp-modules-out', cppModulesOut] : []),
    ...(cppClassPrefix ? ['--cpp-class-prefix', cppClassPrefix] : []),
  ];
  console.error(`The native bindings are out of date; run: npx tsx codegen.ts ${name ? `${name} ` : ''}${outArgs.join(' ')}`);
  for (const file of changed) console.error(`  ${file}`);
  process.exit(1);
}
for (const file of changed) console.log(`wrote ${file}`);
