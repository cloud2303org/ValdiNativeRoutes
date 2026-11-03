import assert from 'node:assert/strict';
import { mkdtemp, mkdir, symlink, writeFile, readFile, rm } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import path from 'node:path';
import test from 'node:test';
import { bazelExternalDirectory } from '../bazel-cache.mjs';

test('uses cached repositories after an export prunes execroot dependency links', async () => {
  const root = await mkdtemp(path.join(tmpdir(), 'valdi-bazel-cache-'));
  try {
    const output = path.join(root, 'output');
    const execroot = path.join(output, 'execroot/_main');
    await mkdir(path.join(execroot, 'external'), { recursive: true });
    await mkdir(path.join(output, 'external/hermes'), { recursive: true });
    await mkdir(path.join(root, 'valdi'));
    await symlink(execroot, path.join(root, 'valdi/bazel-valdi'));
    await writeFile(path.join(output, 'external/hermes/pin'), 'verified-input');
    const cache = await bazelExternalDirectory(root);
    assert.equal(await readFile(path.join(cache, 'hermes/pin'), 'utf8'), 'verified-input');
    await symlink(path.join(output, 'external/hermes'), path.join(execroot, 'external/hermes'));
    assert.equal(await bazelExternalDirectory(root), cache);
    await rm(path.join(execroot, 'external/hermes'));
    assert.equal(await readFile(path.join(await bazelExternalDirectory(root), 'hermes/pin'), 'utf8'),
      'verified-input');
  } finally {
    await rm(root, { recursive: true, force: true });
  }
});
