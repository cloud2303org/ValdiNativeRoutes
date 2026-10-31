// Creates an app module, valdi/modules/<name>, in place of `valdi new_module` (Bazel): src/<Name>Component.tsx, from
// Valdi's ui_component template; every module's tsconfig.json (tsconfig.ts), so they can import each other; and the
// module's native bindings, as codegen.ts writes them for the apps' builds. The builds pick the module up from there:
// it becomes <name>.valdimodule next to app_pages', which other modules import as `<name>/src/…`.
//
//   pnpm new-module <name>
//
// The name is snake_case: it names the module's Kotlin package (com.snap.modules.<name>), its Objective-C directory and
// its C++ namespace, and starts its import paths.
import { execFileSync } from 'node:child_process';
import { existsSync, mkdirSync, writeFileSync } from 'node:fs';
import path from 'node:path';
import { appModule, appModules, root, writeTsconfig } from './pipeline';

const name = process.argv[2];
if (!name || process.argv.length > 3) {
  console.error('Usage: pnpm new-module <name>');
  process.exit(2);
}
const fail = (message: string): never => {
  console.error(message);
  process.exit(1);
};
if (!/^[a-z][a-z0-9_]*$/.test(name)) fail(`${name}: a module name is snake_case: a-z, 0-9 and _, starting with a letter`);
const module = appModule(name);
if (existsSync(module.dir)) fail(`${path.relative(process.cwd(), module.dir)} exists`);
// An import of `<name>/…` would resolve to the npm package or to Valdi's module instead.
if (existsSync(path.join(module.nodeModules!, name))) fail(`${name} is an npm package in valdi/node_modules`);
if (['client_sql', 'coreutils', 'jasmine', 'source_map', 'valdi_core', 'valdi_tsx'].includes(name)) fail(`${name} is a Valdi module`);

const component = `${name.replace(/(^|_)([a-z0-9])/g, (_, _sep, c: string) => c.toUpperCase())}Component`;
mkdirSync(path.join(module.dir, 'src'), { recursive: true });
writeFileSync(
  path.join(module.dir, 'src', `${component}.tsx`),
  `import { Component } from 'valdi_core/src/Component';
import { Style } from 'valdi_core/src/Style';
import { systemFont } from 'valdi_core/src/SystemFont';
import { Label, View } from 'valdi_tsx/src/NativeTemplateElements';

export interface ${component}ViewModel {
  title: string;
}

/** Import it from another module as \`import { ${component} } from '${name}/src/${component}';\`. */
export class ${component} extends Component<${component}ViewModel> {
  onRender(): void {
    <view style={styles.root}>
      <label style={styles.label} value={this.viewModel.title} />
    </view>;
  }
}

const styles = {
  root: new Style<View>({ padding: 16 }),
  label: new Style<Label>({ font: systemFont(17), color: '#111827' }),
};
`,
);

const modules = appModules();
for (const each of modules) writeTsconfig(each, modules);
// Spawning `npx` fails on Windows (a .cmd shim) and would bypass the pinned tsx; run the
// installed tsx launcher with Node on every host.
const tsx = path.join(import.meta.dirname, 'node_modules/tsx/dist/cli.mjs');
execFileSync(
  process.execPath,
  [
    tsx, 'codegen.ts', name,
    '--kotlin-out', path.join(root, 'android/app/generated/valdi'),
    '--objc-out', path.join(root, 'ios/Generated/valdi'), '--objc-framework', 'ValdiRuntime',
    '--cpp-out', path.join(root, 'valdi/native/generated'),
  ],
  { cwd: import.meta.dirname, stdio: 'inherit' },
);
console.log(`Created ${path.relative(process.cwd(), module.dir)}: src/${component}.tsx, tsconfig.json`);
