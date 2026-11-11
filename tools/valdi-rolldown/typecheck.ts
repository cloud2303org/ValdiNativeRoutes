import { appModules, prepareEditorProject, valdiSourceRoot } from './pipeline';
import { valdiTs } from './valdiTs';

if (!valdiSourceRoot()) {
  throw new Error('Prepare Valdi sources before checking runtime types: node scripts/prepare-valdi.mjs');
}
const modules = appModules();
for (const module of modules) await prepareEditorProject(module, modules);
for (const module of modules) {
  const plugin = valdiTs(module);
  try {
    const diagnostics = plugin.diagnostics();
    if (diagnostics) {
      console.error(diagnostics);
      process.exitCode = 1;
    } else {
      console.log(`${module.name}: runtime types passed`);
    }
  } finally {
    plugin.dispose();
  }
}
