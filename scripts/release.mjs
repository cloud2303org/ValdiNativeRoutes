// Package an immutable Git snapshot, not the developer's working directory.
import { execFileSync } from 'node:child_process';
import { createHash } from 'node:crypto';
import { existsSync, mkdirSync, mkdtempSync, readFileSync, renameSync, rmSync, writeFileSync } from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

export function packRelease({ root = path.resolve(import.meta.dirname, '..'), ref = 'HEAD',
  out = path.join(root, '.release') } = {}) {
  const git = (...args) => execFileSync('git', args, { cwd: root, encoding: 'utf8' }).trim();
  const sourceCommit = git('rev-parse', '--verify', '--end-of-options', `${ref}^{commit}`);
  const read = file => git('show', `${sourceCommit}:${file}`);
  const config = JSON.parse(read('package.json'));
  const version = config.version;
  if (typeof version !== 'string' || !/^\d+\.\d+\.\d+$/.test(version) ||
      (ref.startsWith('v') && ref !== `v${version}`)) {
    throw new Error('Release tag must match the template version in package.json (vMAJOR.MINOR.PATCH).');
  }
  const pins = ['valdi', 'module-build'].map(directory => {
    const source = read(`${directory}/MODULE.bazel`);
    return {
      repository: /^VALDI_REPOSITORY = "([^"]+)"$/m.exec(source)?.[1],
      commit: /^VALDI_COMMIT = "([a-f0-9]{40})"$/m.exec(source)?.[1],
    };
  });
  if (!pins[0].repository || !pins[0].commit || JSON.stringify(pins[0]) !== JSON.stringify(pins[1])) {
    throw new Error('Framework pins must match in both Bazel workspaces.');
  }
  const tracked = git('ls-tree', '-r', '--name-only', sourceCommit).split('\n');
  if (tracked.some(file => file === 'ota/private.pem' || file === '.argent/secrets.env' ||
      /(^|\/)(node_modules|\.git|\.tools)(\/|$)/.test(file))) {
    throw new Error('Refusing to publish tracked private keys, secrets or dependency caches.');
  }
  const compiler = JSON.parse(read('tools/valdi-rolldown/package.json'));
  const manifest = {
    formatVersion: 1,
    template: 'ValdiNativeRoutes',
    version,
    sourceCommit,
    framework: pins[0],
    toolchain: {
      nodeMajor: 24,
      packageManager: config.packageManager,
      hermesCompiler: compiler.devDependencies['hermes-compiler'],
    },
    distribution: 'source-template',
  };
  out = path.resolve(root, out);
  if (existsSync(out)) throw new Error(`Release output already exists: ${out}. Use a new output directory.`);
  mkdirSync(path.dirname(out), { recursive: true });
  const work = mkdtempSync(`${out}-`);
  try {
    const metadata = path.join(work, 'TEMPLATE_RELEASE.json');
    writeFileSync(metadata, `${JSON.stringify(manifest, null, 2)}\n`);
    const basename = `ValdiNativeRoutes-v${version}`;
    for (const [format, suffix] of [['zip', 'zip'], ['tar.gz', 'tar.gz']]) {
      git('archive', `--format=${format}`, `--prefix=${basename}/`,
        `--output=${path.join(work, `${basename}.${suffix}`)}`, `--add-file=${metadata}`, sourceCommit);
    }
    const files = [`${basename}.zip`, `${basename}.tar.gz`, 'TEMPLATE_RELEASE.json'];
    writeFileSync(path.join(work, 'SHA256SUMS'), files.map(name =>
      `${createHash('sha256').update(readFileSync(path.join(work, name))).digest('hex')}  ${name}\n`).join(''));
    renameSync(work, out);
    return manifest;
  } finally { rmSync(work, { recursive: true, force: true }); }
}

if (process.argv[1] && path.resolve(process.argv[1]) === fileURLToPath(import.meta.url)) {
  try {
    const options = {};
    const args = process.argv.slice(2);
    for (let index = 0; index < args.length; index += 2) {
      const [flag, value] = args.slice(index, index + 2);
      if (!['--ref', '--out'].includes(flag) || !value || value.startsWith('--') || options[flag.slice(2)]) {
        throw new Error('Usage: node scripts/release.mjs [--ref TAG|COMMIT] [--out DIRECTORY]');
      }
      options[flag.slice(2)] = value;
    }
    console.log(JSON.stringify(packRelease(options), null, 2));
  } catch (error) {
    console.error(error.message);
    process.exitCode = 1;
  }
}
