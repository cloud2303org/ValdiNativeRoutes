import { realpath } from 'node:fs/promises';
import path from 'node:path';

// An execroot exposes only repositories needed by the latest Bazel target.
// Header-only exports can remove its dependency links while the cache is intact.
export async function bazelExternalDirectory(root) {
  const execroot = await realpath(path.join(root, 'valdi/bazel-valdi'));
  if (path.basename(path.dirname(execroot)) !== 'execroot') {
    throw new Error(`Expected a Bazel execroot at valdi/bazel-valdi: ${execroot}`);
  }
  return path.resolve(execroot, '../..', 'external');
}
