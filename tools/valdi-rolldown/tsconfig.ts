// Writes every app module's tsconfig.json (pipeline.ts writeTsconfig), in place of `valdi projectsync`: each module
// sees every selected app module, plus runtime types when prepared. new-module.ts runs it;
// run it after removing a module.
//
//   pnpm tsconfig
import path from 'node:path';
import { appModules, prepareEditorProject, root, valdiSourceRoot } from './pipeline';
import { writeNodeFrameworkConfig } from './modules.mjs';

writeNodeFrameworkConfig(root);
const modules = appModules();
for (const module of modules) {
  if (await prepareEditorProject(module, modules)) console.log(`wrote ${path.relative(process.cwd(), path.join(module.dir, 'tsconfig.json'))}`);
}
if (valdiSourceRoot()) {
  console.log('Editor configs use prepared Valdi sources.');
} else {
  console.warn('Bootstrap editor configs include TSX settings and local module paths; full Valdi types are not prepared.');
  console.warn('Prepare framework sources: node scripts/prepare-valdi.mjs');
}
