// @ts-check
import { spawnSync } from 'node:child_process';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { writeNodeFrameworkConfig } from './modules.mjs';

const tools = fileURLToPath(new URL('.', import.meta.url));
writeNodeFrameworkConfig(path.resolve(tools, '../..'));
const checker = fileURLToPath(new URL('node_modules/typescript/lib/tsc.js', import.meta.url));
const projects = [
  'tsconfig.json',
  'tsconfig.tests.json',
  '../../valdi/modules/native_common/tests/tsconfig.json',
];

let failed = false;
for (const project of projects) {
  console.log(`Node typecheck: ${project}`);
  const result = spawnSync(process.execPath, [checker, '--project', project, '--pretty', 'false'], {
    cwd: tools,
    stdio: 'inherit',
  });
  if (result.error) console.error(result.error.message);
  if (result.status !== 0) failed = true;
}
process.exitCode = failed ? 1 : 0;
