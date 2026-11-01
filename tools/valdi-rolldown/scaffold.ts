import { existsSync, mkdirSync, readdirSync, readFileSync, rmSync, writeFileSync } from 'node:fs';
import path from 'node:path';

export const MODULE_TEMPLATES = ['ui_component', 'polyglot_bridge_module', 'polyglot_view_module'] as const;
export type ModuleTemplate = typeof MODULE_TEMPLATES[number];

// The pinned CLI's reserved project names, also invalid as generated package identifiers.
const reservedNames = new Set(`test tests build workspace native rule package glob select repository external bazel
class function var let const if else for while return import export module require main lib src bin data config`.split(/\s+/));

function write(file: string, content: string) {
  mkdirSync(path.dirname(file), { recursive: true });
  writeFileSync(file, content);
}

export function createModule({
  root, sources, name, template,
}: { root: string; sources: string; name: string; template: ModuleTemplate }): { name: string; directory: string } {
  if (!/^[A-Za-z][A-Za-z0-9_.-]*$/.test(name)) throw new Error('Module names must start with a letter and contain letters, digits, _, - or .');
  name = name.replace(/[-.]/g, '_').replace(/([a-z0-9])([A-Z])/g, '$1_$2').toLowerCase();
  if (reservedNames.has(name)) throw new Error(`Module name is reserved: ${name}`);
  const pascal = name.split('_').filter(Boolean).map(word => word[0].toUpperCase() + word.slice(1)).join('');
  if (!MODULE_TEMPLATES.includes(template)) throw new Error(`Unknown template: ${template}`);
  if (['client_sql', 'coreutils', 'drawing', 'jasmine', 'source_map', 'valdi_core', 'valdi_tsx'].includes(name)) throw new Error(`${name} is a runtime module`);
  if (existsSync(path.join(root, 'valdi/node_modules', name))) throw new Error(`${name} conflicts with an installed npm package`);
  const directory = path.join(root, 'valdi/modules', name);
  if (existsSync(directory)) throw new Error(`Path already exists: ${directory}`);
  const modules = path.dirname(directory);
  if (existsSync(modules)) {
    for (const other of readdirSync(modules)) {
      const config = path.join(modules, other, 'module.json');
      if (existsSync(config) && JSON.parse(readFileSync(config, 'utf8')).iosModuleName === pascal) {
        throw new Error(`Native module name ${pascal} is already used by ${other}`);
      }
    }
  }
  const original = path.join(sources, 'npm_modules/cli/.bootstrap/modules', template);
  if (!existsSync(original)) throw new Error(`Pinned Valdi template missing: ${original}`);
  const license = readFileSync(path.join(sources, 'LICENSE'), 'utf8');
  const copied = new Map<string, string>();
  const copy = (from: string, prefix = '') => {
    for (const entry of readdirSync(from, { withFileTypes: true })) {
      const relative = path.posix.join(prefix, entry.name);
      if (entry.isDirectory()) copy(path.join(from, entry.name), relative);
      else copied.set(relative.replace(/\.template$/, ''), readFileSync(path.join(from, entry.name), 'utf8')
        .replaceAll('{{MODULE_NAME}}', name).replaceAll('{{MODULE_NAME_PASCAL_CASED}}', pascal));
    }
  };
  copy(original);
  const config: Record<string, string> = { template, iosModuleName: pascal };
  if (template !== 'ui_component') config.nativeBuild = 'bazel';
  if (template === 'polyglot_bridge_module') {
    config.androidModuleFactory = `com.snap.modules.${name}.CalculatorModuleFactoryImpl`;
    config.iosModuleFactory = `${pascal}CreateModuleFactory`;
    const header = `SCC${pascal}ModuleFactory.h`;
    const factory = `SCC${pascal}CalculatorModuleFactoryImpl`;
    const code = copied.get('ios/SCCCalculatorModuleFactory.m')!
      .replaceAll('SCCCalculatorModule', `SCC${pascal}CalculatorModule`)
      .replace('#import "valdi_core/SCValdiModuleFactoryRegistry.h"', `#import "${header}"`)
      .replace('VALDI_REGISTER_MODULE()', '');
    copied.delete('ios/SCCCalculatorModuleFactory.m');
    copied.set(`ios/SCC${pascal}ModuleFactory.m`, `${code}

id<SCNValdiCoreModuleFactory> ${config.iosModuleFactory}(void) {
    return [${factory} new];
}
`);
    copied.set(`ios/${header}`, `#import <Foundation/Foundation.h>
#import <ValdiRuntime/SCNValdiCoreModuleFactory.h>
FOUNDATION_EXPORT id<SCNValdiCoreModuleFactory> _Nonnull ${config.iosModuleFactory}(void);
`);
  }
  if (template === 'polyglot_view_module') {
    config.androidViewBinder = `com.snap.modules.${name}.PolyglotNativeViewAttributesBinder`;
    // Upstream's fixed ObjC name collides when two view modules share a binary.
    const nativeName = `SC${pascal}NativeView`;
    for (const [file, text] of [...copied]) {
      copied.delete(file);
      copied.set(file.replaceAll('SCPolyglotView', nativeName), text.replaceAll('SCPolyglotView', nativeName));
    }
    const view = 'android/PolyglotNativeView.kt';
    copied.set(view, copied.get(view)!.replace('class PolyglotNativeView(', '@androidx.annotation.Keep\nclass PolyglotNativeView('));
  }
  if (template !== 'ui_component') {
    copied.set('BUILD.bazel', `load("//bzl/node_module:module.bzl", "node_valdi_module")

node_valdi_module(
    name = "${name}",
    srcs = glob(["src/**/*.ts", "src/**/*.tsx"]),
    config = "module.json",
    ios_module_name = "${pascal}",
    res = glob(["res/**"]),
    android_srcs = glob(["android/**/*.kt"]),
    ios_srcs = glob(["ios/**/*.m"]),
    ios_hdrs = glob(["ios/**/*.h"]),
)
`);
  } else copied.delete('BUILD.bazel');
  copied.set('module.json', JSON.stringify(config, null, 2) + '\n');
  copied.set('LICENSE', license);
  copied.set('TEMPLATE.md', `# ${name}

Generated from the pinned Valdi CLI's \`${template}\` template.
Template sources: \`npm_modules/cli/.bootstrap/modules/${template}\`.

TS/TSX and resources use the repository's Node pipeline.
Android/iOS libraries and registration are discovered from module.json.
Web/macOS sources are retained from upstream; this App has Android/iOS hosts.
Changing native implementations requires rebuilding the application.
`);
  try {
    for (const [file, text] of copied) write(path.join(directory, file), text);
  } catch (error) {
    rmSync(directory, { recursive: true, force: true });
    throw error;
  }
  return { name, directory };
}
