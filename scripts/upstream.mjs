// Explicit version changes only; reports never overwrite our vendored sources or patches.
import { spawnSync } from 'node:child_process';
import { mkdirSync, readFileSync, readdirSync, writeFileSync } from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

export const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');

export function pinValdi(directory, commit, widgetsTag) {
  if (!/^[0-9a-f]{40}$/.test(commit)) throw new Error('Use an immutable 40-character lowercase Valdi fork commit SHA.');
  if (widgetsTag !== undefined && !/^[A-Za-z0-9][A-Za-z0-9._-]*$/.test(widgetsTag)) {
    throw new Error('Use an explicit Widgets tag (letters, digits, dot, underscore, dash).');
  }
  const moduleDirectories = ['valdi', 'module-build'];
  const modulePattern = /^VALDI_REPOSITORY = "([A-Za-z0-9_.-]+\/[A-Za-z0-9_.-]+)"$/gm;
  const commitPattern = /^VALDI_COMMIT = "([0-9a-f]{40})"$/gm;
  const registryPattern = /^(common(?::[A-Za-z0-9_-]+)?) --registry=https:\/\/raw\.githubusercontent\.com\/([^/\s]+\/[^/\s]+)\/([0-9a-f]{40})\/registry$/gm;
  const pins = moduleDirectories.map(name => {
    const moduleFile = path.join(directory, name, 'MODULE.bazel');
    const rcFile = path.join(directory, name, '.bazelrc');
    const module = readFileSync(moduleFile, 'utf8');
    const rc = readFileSync(rcFile, 'utf8');
    const repositories = [...module.matchAll(modulePattern)];
    const commits = [...module.matchAll(commitPattern)];
    const registries = [...rc.matchAll(registryPattern)];
    if (repositories.length !== 1 || commits.length !== 1 || registries.length === 0) {
      throw new Error(`Cannot locate unique Valdi fork pins in ${name}; update them together manually.`);
    }
    return { name, moduleFile, rcFile, module, rc, repository: repositories[0][1], commit: commits[0][1], registries };
  });
  const repository = pins[0].repository;
  const currentCommit = pins[0].commit;
  if (pins.some(pin => pin.repository !== repository || pin.commit !== currentCommit)) {
    throw new Error('valdi and module-build must use the same Valdi fork repository and commit.');
  }
  for (const pin of pins) {
    if (pin.registries.some(entry => entry[2] !== repository || entry[3] !== currentCommit)) {
      throw new Error(`Valdi registry pins in ${pin.name}/.bazelrc do not match MODULE.bazel.`);
    }
  }

  const updated = pins.map(pin => {
    let module = pin.module.replace(/^VALDI_COMMIT = "[0-9a-f]{40}"$/m, `VALDI_COMMIT = "${commit}"`);
    if (pin.name === 'valdi' && widgetsTag !== undefined) {
      if ((module.match(/^WIDGETS_TAG = "[^"]+"$/gm) ?? []).length !== 1) throw new Error('Cannot locate the Widgets tag.');
      module = module.replace(/^WIDGETS_TAG = "[^"]+"$/m, `WIDGETS_TAG = "${widgetsTag}"`);
    }
    const rc = pin.rc.replace(registryPattern, (_line, config) =>
      `${config} --registry=https://raw.githubusercontent.com/${repository}/${commit}/registry`);
    return { moduleFile: pin.moduleFile, rcFile: pin.rcFile, module, rc };
  });

  // All module and platform registry pins are validated before any file is written.
  for (const pin of updated) {
    writeFileSync(pin.moduleFile, pin.module);
    writeFileSync(pin.rcFile, pin.rc);
  }
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
    console.log(`Pinned Valdi fork to ${args[0]}. Next: node scripts/prepare-valdi.mjs, then pnpm test.`);
  } else if (command === 'report' && args.length <= 1) {
    const output = path.resolve(args[0] ?? '.ci/upstream');
    const changed = vendorReport(root, path.join(root, 'valdi/bazel-valdi/external/valdi+'), output);
    console.log(`${changed} vendored file(s) differ; see ${path.join(output, 'vendor.md')}`);
    if (changed && process.env.GITHUB_ACTIONS) console.log('::warning::Vendored Valdi sources differ. Review the upstream report artifact before accepting this upgrade.');
  } else throw new Error('Usage: node scripts/upstream.mjs pin COMMIT [WIDGETS_TAG] | report [OUTPUT_DIR]');
}
