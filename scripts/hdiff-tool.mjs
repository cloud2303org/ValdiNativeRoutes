// Publisher-side tool only. Mobile apps compile their existing HPatch C decoder.
import { execFileSync } from 'node:child_process';
import { createHash } from 'node:crypto';
import { accessSync, chmodSync, constants, copyFileSync, mkdirSync, mkdtempSync,
  readFileSync, renameSync, rmSync, statSync, writeFileSync } from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const lock = JSON.parse(readFileSync(new URL('./hdiff-tool.json', import.meta.url), 'utf8'));
const hash = bytes => createHash('sha256').update(bytes).digest('hex');
const repository = path.resolve(import.meta.dirname, '..');
const recipeSha256 = hash(readFileSync(fileURLToPath(import.meta.url)));

export function toolPlan(platform = process.platform, arch = process.arch, source = false) {
  const binary = !source && lock.binaries[`${platform}-${arch}`];
  return { version: lock.version, kind: binary ? 'binary' : 'source', ...(binary || lock.source) };
}

function installDirectory(root, platform, arch) {
  return path.join(root, '.tools/hdiffpatch', lock.version, `${platform}-${arch}`);
}

export function cachedHdiffzPath(root, platform = process.platform, arch = process.arch) {
  return path.join(installDirectory(root, platform, arch), platform === 'win32' ? 'hdiffz.exe' : 'hdiffz');
}

function readCache(root, platform, arch, plan) {
  const file = cachedHdiffzPath(root, platform, arch);
  try {
    const receipt = JSON.parse(readFileSync(path.join(path.dirname(file), 'receipt.json'), 'utf8'));
    accessSync(file, constants.X_OK);
    if (!statSync(file).isFile() || receipt.version !== lock.version ||
        receipt.platform !== platform || receipt.arch !== arch || receipt.inputSha256 !== plan.sha256 ||
        receipt.recipeSha256 !== recipeSha256 ||
        receipt.executableSha256 !== hash(readFileSync(file))) return undefined;
    return file;
  } catch { return undefined; }
}

// Discovery stays offline; only explicit preparation/pack-with-base installs tools.
export function cachedHdiffz(root, platform = process.platform, arch = process.arch) {
  return readCache(root, platform, arch, toolPlan(platform, arch)) ??
    readCache(root, platform, arch, toolPlan(platform, arch, true));
}

async function download(url, destination, expected, fetchImpl) {
  const response = await fetchImpl(url, { signal: AbortSignal.timeout(120_000) });
  if (!response.ok) throw new Error(`HDiff download failed: HTTP ${response.status} (${url})`);
  const bytes = Buffer.from(await response.arrayBuffer());
  if (hash(bytes) !== expected) throw new Error(`HDiff download SHA256 mismatch: ${url}`);
  writeFileSync(destination, bytes);
}

function tarCommand(platform) {
  return platform === 'win32'
    ? path.win32.join(process.env.SystemRoot || process.env.WINDIR || 'C:\\Windows', 'System32', 'tar.exe')
    : 'tar';
}

function extractBinary(archive, work, plan, platform) {
  if (platform === 'win32') {
    execFileSync(tarCommand(platform), ['-xf', archive, '-C', work, plan.member], { stdio: 'pipe' });
    return path.join(work, ...plan.member.split('/'));
  }
  const file = path.join(work, 'hdiffz');
  writeFileSync(file, execFileSync('unzip', ['-p', archive, plan.member], { maxBuffer: 32 * 1024 * 1024 }));
  return file;
}

function buildSource(archive, work, platform) {
  execFileSync(tarCommand(platform), ['-xzf', archive, '-C', work], { stdio: 'pipe' });
  const source = path.join(work, `HDiffPatch-${lock.version}`);
  try {
    execFileSync('make', ['-j2', 'hdiffz', 'DIR_DIFF=0', 'MT=1', 'LDEF=0', 'ZLIB=2',
      'LZMA=0', 'ZSTD=0', 'MD5=0', 'XXH=0', 'VCD=0', 'BSD=0', 'BZIP2=0',
      ...(platform === 'darwin' ? ['CL=1'] : [])], { cwd: source, stdio: 'pipe', maxBuffer: 8 * 1024 * 1024 });
  } catch (cause) {
    throw new Error('HDiff source build failed. Install make, a C/C++ compiler and zlib development headers (MinGW on Windows), or set VALDI_HDIFFZ.', { cause });
  }
  return path.join(source, platform === 'win32' ? 'hdiffz.exe' : 'hdiffz');
}

export async function prepareHdiffz({ root = repository, platform = process.platform, arch = process.arch,
  source = false, plan = toolPlan(platform, arch, source), fetchImpl = fetch } = {}) {
  const cached = readCache(root, platform, arch, plan);
  if (cached) return cached;
  const directory = installDirectory(root, platform, arch);
  mkdirSync(path.dirname(directory), { recursive: true });
  const work = mkdtempSync(`${directory}-prepare-`);
  try {
    const archive = path.join(work, plan.kind === 'binary' ? 'download.zip' : 'source.tar.gz');
    console.error(`Preparing HDiffPatch ${lock.version} (${platform}/${arch}, ${plan.kind})`);
    await download(plan.url, archive, plan.sha256, fetchImpl);
    const executable = plan.kind === 'binary' ? extractBinary(archive, work, plan, platform) : buildSource(archive, work, platform);
    const install = path.join(work, 'install');
    mkdirSync(install);
    const filename = platform === 'win32' ? 'hdiffz.exe' : 'hdiffz';
    copyFileSync(executable, path.join(install, filename));
    chmodSync(path.join(install, filename), 0o755);
    writeFileSync(path.join(install, 'receipt.json'), `${JSON.stringify({
      version: lock.version, platform, arch, kind: plan.kind, inputSha256: plan.sha256, recipeSha256,
      executableSha256: hash(readFileSync(path.join(install, filename))),
    }, null, 2)}\n`);
    // Another installer may have finished while this one downloaded/built.
    const ready = readCache(root, platform, arch, plan);
    if (ready) return ready;
    rmSync(directory, { recursive: true, force: true });
    try { renameSync(install, directory); }
    catch (error) {
      if (!readCache(root, platform, arch, plan)) throw error;
    }
    return cachedHdiffzPath(root, platform, arch);
  } finally { rmSync(work, { recursive: true, force: true }); }
}

if (process.argv[1] && path.resolve(process.argv[1]) === fileURLToPath(import.meta.url)) {
  const args = process.argv.slice(2);
  if (args.some(arg => arg !== '--source')) {
    console.error('Usage: node scripts/hdiff-tool.mjs [--source]');
    process.exitCode = 1;
  } else {
    prepareHdiffz({ source: args.includes('--source') }).then(file => console.log(file)).catch(error => {
      console.error(error.message);
      process.exitCode = 1;
    });
  }
}
