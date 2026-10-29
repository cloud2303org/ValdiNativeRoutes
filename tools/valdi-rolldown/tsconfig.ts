// Writes every app module's tsconfig.json (pipeline.ts writeTsconfig), in place of `valdi projectsync`: each module
// sees the runtime's Valdi modules and every app module. new-module.ts runs it; run it after removing a module.
//
//   pnpm tsconfig
import path from 'node:path';
import { appModules, writeTsconfig } from './pipeline';

const modules = appModules();
for (const module of modules) {
  if (writeTsconfig(module, modules)) console.log(`wrote ${path.relative(process.cwd(), path.join(module.dir, 'tsconfig.json'))}`);
}
