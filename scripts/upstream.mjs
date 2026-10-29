// Explicit version changes only; reports never overwrite our vendored sources or patches.
import { spawnSync } from 'node:child_process';
import { mkdirSync, readFileSync, readdirSync, writeFileSync } from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

export const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');

export function pinValdi(directory, tag, widgetsTag) {
  for (const value of [tag, widgetsTag].filter(value => value !== undefined)) {
    if (!/^[A-Za-z0-9][A-Za-z0-9._-]*$/.test(value)) throw new Error('Use an explicit upstream tag (letters, digits, dot, underscore, dash).');
  }
  const moduleFile = path.join(directory, 'valdi/MODULE.bazel');
  const rcFile = path.join(directory, 'valdi/.bazelrc');
  let module = readFileSync(moduleFile, 'utf8');
  const rc = readFileSync(rcFile, 'utf8');
  if ((module.match(/^VALDI_TAG = "[^"]+"$/gm) ?? []).length !== 1
    || (rc.match(/^common --registry=https:\/\/raw\.githubusercontent\.com\/Snapchat\/Valdi\/[^/]+\/registry$/gm) ?? []).length !== 1) {
    throw new Error('Cannot locate the unique Valdi tag and registry pin; update them together manually.');
  }
  module = module.replace(/^VALDI_TAG = "[^"]+"$/m, `VALDI_TAG = "${tag}"`);
  if (widgetsTag !== undefined) {
    if ((module.match(/^WIDGETS_TAG = "[^"]+"$/gm) ?? []).length !== 1) throw new Error('Cannot locate the Widgets tag.');
    module = module.replace(/^WIDGETS_TAG = "[^"]+"$/m, `WIDGETS_TAG = "${widgetsTag}"`);
  }
  // Validate both files before writing either. Leave dependency resolution/lock changes to Bazel.
  writeFileSync(moduleFile, module);
  writeFileSync(rcFile, rc.replace(/^(common --registry=https:\/\/raw\.githubusercontent\.com\/Snapchat\/Valdi\/)[^/]+(\/registry)$/m, `$1${tag}$2`));
}

function sourceFiles(directory, prefix = '') {
  return readdirSync(path.join(directory, prefix), { withFileTypes: true }).flatMap(entry => {
    const name = path.posix.join(prefix, entry.name);
    if (entry.isDirectory()) return entry.name.startsWith('.') || entry.name === '__pycache__' ? [] : sourceFiles(directory, name);
    return /\.(ts|py)$/.test(name) && !name.endsWith('.d.ts') ? [name] : [];
  }).sort();
}

export function vendorReport(directory, upstream, output) {
  mkdirSync(output, { recursive: true });
  const lines = ['# Vendored Valdi source comparison', '',
    'Compares the files we use. TypeScript/source-map default-import adaptation is normalized.',
    'New upstream files and changes to the locally ported code generator still require source review.', ''];
  let changed = 0;
  for (const group of ['companion']) {
    const local = path.join(directory, 'tools/valdi-rolldown/vendor', group);
    const remote = path.join(upstream, 'compiler', group, 'src');
    for (const name of sourceFiles(local)) {
      const localFile = path.join(local, name);
      const remoteFile = path.join(remote, name);
      const ours = readFileSync(localFile, 'utf8');
      let theirs;
      try { theirs = readFileSync(remoteFile, 'utf8'); } catch (error) {
        if (error.code !== 'ENOENT') throw error;
        lines.push(`- MISSING upstream: ${group}/${name}`);
        changed++;
        continue;
      }
      if (group === 'companion') theirs = theirs.replace(/import \* as (\w+) from (['"])(typescript|source-map)\2/g, 'import $1 from $2$3$2');
      if (ours === theirs) continue;
      changed++;
      lines.push(`- CHANGED: ${group}/${name}`);
      const normalized = path.join(output, 'upstream', group, name);
      mkdirSync(path.dirname(normalized), { recursive: true });
      writeFileSync(normalized, theirs);
      const diff = spawnSync('git', ['diff', '--no-index', '--no-ext-diff', '--', localFile, normalized], { encoding: 'utf8' });
      if (diff.error || ![0, 1].includes(diff.status)) throw new Error(`Cannot compare ${name}: ${diff.error?.message ?? diff.stderr}`);
      writeFileSync(`${normalized}.diff`, diff.stdout);
    }
  }
  lines.push('', `${changed} file(s) require review. This report does not copy or accept upstream changes.`, '');
  writeFileSync(path.join(output, 'vendor.md'), lines.join('\n'));
  return changed;
}

if (process.argv[1] && path.resolve(process.argv[1]) === fileURLToPath(import.meta.url)) {
  const [command, ...args] = process.argv.slice(2);
  if (command === 'pin' && args.length >= 1 && args.length <= 2) {
    pinValdi(root, args[0], args[1]);
    console.log(`Pinned Valdi to ${args[0]}. Next: node scripts/prepare-valdi.mjs, then pnpm test.`);
  } else if (command === 'report' && args.length <= 1) {
    const output = path.resolve(args[0] ?? '.ci/upstream');
    const changed = vendorReport(root, path.join(root, 'valdi/bazel-valdi/external/valdi+'), output);
    console.log(`${changed} vendored file(s) differ; see ${path.join(output, 'vendor.md')}`);
    if (changed && process.env.GITHUB_ACTIONS) console.log('::warning::Vendored Valdi sources differ. Review the upstream report artifact before accepting this upgrade.');
  } else throw new Error('Usage: node scripts/upstream.mjs pin TAG [WIDGETS_TAG] | report [OUTPUT_DIR]');
}
