import { execFileSync } from 'node:child_process';
import { createInterface } from 'node:readline/promises';
import path from 'node:path';
import { syncNativeModuleRegistration } from '../../scripts/native-modules.mjs';
import { appModules, root, valdiSourceRoot, writeTsconfig } from './pipeline';
import { createModule, MODULE_TEMPLATES, type ModuleTemplate } from './scaffold';

const help = `Usage: pnpm new-module [name] [--template <template>] [--skip-checks]

Templates (from the pinned official Valdi CLI):
  ui_component             Valdi TSX component
  polyglot_bridge_module   TypeScript API + Kotlin/Objective-C implementations
  polyglot_view_module     custom-view + Kotlin/Objective-C native views

With no --template, an interactive terminal offers the official template choices.
Without a terminal, the default remains ui_component.
Web/macOS template sources are preserved; native App integration is Android/iOS.
`;

async function main() {
  const args = process.argv.slice(2);
  if (args.includes('--help') || args.includes('-h')) { console.log(help); return; }
  let name: string | undefined;
  let template: string | undefined;
  for (let i = 0; i < args.length; i++) {
    if (args[i] === '--template') {
      template = args[++i];
      if (!template) throw new Error('--template needs a value');
    } else if (args[i].startsWith('--template=')) template = args[i].slice('--template='.length);
    else if (args[i] === '--skip-checks') continue;
    else if (args[i].startsWith('-') || name) throw new Error(`Unexpected argument: ${args[i]}`);
    else name = args[i];
  }
  if (template && !MODULE_TEMPLATES.includes(template as ModuleTemplate)) throw new Error(`Unknown template: ${template}`);
  if (process.stdin.isTTY && (!name || !template)) {
    const prompt = createInterface({ input: process.stdin, output: process.stdout });
    try {
      name ||= (await prompt.question('Module name: ')).trim();
      if (!template) {
        MODULE_TEMPLATES.forEach((value, index) => console.log(`  ${index + 1}. ${value}`));
        const value = (await prompt.question('Module template [1]: ')).trim() || '1';
        template = MODULE_TEMPLATES[Number(value) - 1];
        if (!template) throw new Error('Choose a listed template number');
      }
    } finally { prompt.close(); }
  }
  if (!name) throw new Error(help);
  const sources = valdiSourceRoot();
  if (!sources) throw new Error('Pinned Valdi sources are missing. Run: node scripts/prepare-valdi.mjs');
  const created = createModule({ root, sources, name, template: (template ?? 'ui_component') as ModuleTemplate });
  const modules = appModules();
  for (const module of modules) writeTsconfig(module, modules);
  syncNativeModuleRegistration(root);
  if ((template ?? 'ui_component') === 'ui_component') {
    execFileSync(process.execPath, [
      path.join(import.meta.dirname, 'node_modules/tsx/dist/cli.mjs'), 'codegen.ts', created.name,
      '--kotlin-out', path.join(root, 'android/app/generated/valdi'),
      '--objc-out', path.join(root, 'ios/Generated/valdi'), '--objc-framework', 'ValdiRuntime',
      '--cpp-out', path.join(root, 'valdi/native/generated'),
    ], { cwd: import.meta.dirname, stdio: 'inherit' });
  }
  console.log(`Created ${path.relative(root, created.directory)} (${template ?? 'ui_component'})`);
  console.log('Import its TS entry by module name, then run pnpm android or pnpm ios.');
}

main().catch(error => { console.error(error.message); process.exitCode = 1; });
