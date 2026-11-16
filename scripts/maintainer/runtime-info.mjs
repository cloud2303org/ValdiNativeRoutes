import { realpathSync } from 'node:fs';
import { fileURLToPath } from 'node:url';

/** Export identity used by OTA configuration. Runtime rebuilds are explicitly owned by the developer. */
export function runtimeInfo(platform, config) {
  if (!['android', 'ios'].includes(platform) || !['debug', 'release'].includes(config))
    throw new Error('Expected android|ios and debug|release');
  return { platform, config };
}

if (process.argv[1] && realpathSync(process.argv[1]) === fileURLToPath(import.meta.url)) {
  try { console.log(JSON.stringify(runtimeInfo(...process.argv.slice(2)))); }
  catch (error) { console.error(error.message); process.exitCode = 1; }
}
