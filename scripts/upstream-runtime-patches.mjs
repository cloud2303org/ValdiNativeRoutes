// Share the exact Bazel archive patch with writable platform staging.
import { spawnSync } from 'node:child_process';
import { copyFileSync, mkdirSync, mkdtempSync, readFileSync, rmSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
export const runtimePatch = path.join(root, 'valdi/patches/lossless-map-transport.patch');
export const runtimePatchFiles = [
  'valdi_core/src/valdi_core/ios/valdi_core/SCValdiObjCConversionUtils.mm',
  'valdi/src/valdi/runtime/Interfaces/IJavaScriptContext.hpp',
  'valdi/src/valdi/runtime/Interfaces/IJavaScriptContext.cpp',
  'valdi/src/valdi/runtime/JavaScript/JavaScriptValueDelegate.cpp',
  'valdi/src/valdi/runtime/JavaScript/JavaScriptUtils.cpp',
];

export function applyRuntimePatches(source) {
  // Check/apply outside any enclosing checkout. In particular, git apply from an
  // ignored staging directory must not silently skip the patch's paths.
  const temporary = mkdtempSync(path.join(tmpdir(), 'valdi-runtime-patch-'));
  try {
    for (const name of runtimePatchFiles) {
      mkdirSync(path.dirname(path.join(temporary, name)), { recursive: true });
      copyFileSync(path.join(source, name), path.join(temporary, name));
    }
    const run = args => spawnSync('git', ['apply', ...args, runtimePatch], {
      cwd: temporary, encoding: 'utf8',
    });
    const check = run(['--check']);
    if (check.error) throw check.error;
    if (check.status !== 0) {
      const reverse = run(['--reverse', '--check']);
      if (reverse.status === 0) return false;
      throw new Error(`Runtime patch does not match the pinned source:\n${check.stderr}`);
    }
    const applied = run([]);
    if (applied.error || applied.status !== 0) throw new Error(applied.error?.message ?? applied.stderr);
    // All hunks have been validated before touching any staged source file.
    for (const name of runtimePatchFiles) {
      writeFileSync(path.join(source, name), readFileSync(path.join(temporary, name)));
    }
    return true;
  } finally {
    rmSync(temporary, { recursive: true, force: true });
  }
}
