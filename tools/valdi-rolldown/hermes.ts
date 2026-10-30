// Compile with Meta's pinned, prebuilt hermesc. Valdi's module protocol stays the same.
import { execFile, execFileSync } from 'node:child_process';
import { existsSync, mkdtempSync, readFileSync, rmSync, writeFileSync } from 'node:fs';
import { createRequire } from 'node:module';
import { availableParallelism, tmpdir } from 'node:os';
import path from 'node:path';
import { promisify } from 'node:util';
import type { ArchiveEntries } from './archive';

const run = promisify(execFile);
const require = createRequire(import.meta.url);
const root = path.resolve(import.meta.dirname, '../..');
const MODULE_MAGIC = 0x0100c634;
const HBC_MAGIC = 0x1f1903c103bc1fc6n;
const PREFIX = '(function(require, module, exports) { ';
const SUFFIX = '\n})';
const PREAMBLE = 'if (module) module.sourceMapLineOffset = 1;\n';

export function formatJsModule(source: string): string {
  return PREFIX + (source.startsWith('"use strict";\n') ? '' : PREAMBLE) + source + SUFFIX;
}

/** Fail explicitly when an upstream upgrade changes the protocol this adapter implements. */
export function validateRuntimeContract(directory = root): string {
  const sources = process.env.VALDI_SOURCE_ROOT ?? path.join(directory, 'valdi/bazel-valdi/external/valdi+');
  const config = readFileSync(path.join(sources, 'third-party/hermes_v1/hermes.BUILD'), 'utf8');
  const version = /HERMES_RELEASE_VERSION=.*?(\d+\.\d+\.\d+)/.exec(config)?.[1];
  if (!version) throw new Error('Cannot read the runtime Hermes version from the fork third-party/hermes_v1/hermes.BUILD');
  const source = readFileSync(path.join(sources, 'valdi/src/valdi/runtime/JavaScript/JavaScriptUtils.cpp'), 'utf8');
  const stringValue = (name: string) => {
    const value = new RegExp(`${name}\\s*=\\s*("(?:\\\\.|[^"\\\\])*")`).exec(source)?.[1];
    return value ? JSON.parse(value) : undefined;
  };
  const magic = /kPreCompiledJsModuleMagic\s*=\s*(0x[\da-f]+)/i.exec(source)?.[1];
  if (!magic || Number(magic) !== MODULE_MAGIC || stringValue('modulePrefix') !== PREFIX
    || stringValue('moduleSuffix') !== SUFFIX || stringValue('preamble') !== PREAMBLE) {
    throw new Error('Valdi precompiled-module protocol changed. Update hermes.ts against JavaScriptUtils.cpp before compiling Release modules.');
  }
  return version;
}

export function compilerBytecodeVersion(info: string, expectedRelease: string, platform = process.platform): number {
  const release = /Hermes release version:\s*(\S+)/.exec(info)?.[1];
  const bytecodeVersion = Number(/HBC bytecode version:\s*(\d+)/.exec(info)?.[1]);
  // This exact pinned npm release ships Linux and Windows binaries with the upstream banner.
  // Package/runtime version equality is still checked by hermesCompiler(); do
  // not silently accept other mismatches when upgrading the compiler.
  const knownPinnedBanner = ['linux', 'win32'].includes(platform) && expectedRelease === '260318099.0.4'
    && release === '1.0.0' && bytecodeVersion === 99;
  if ((release !== expectedRelease && !knownPinnedBanner)
    || !Number.isSafeInteger(bytecodeVersion) || bytecodeVersion <= 0) {
    throw new Error(`Unexpected Hermes compiler version: ${info.trim()}`);
  }
  return bytecodeVersion;
}

export function hermesCompiler(directory = root): { executable: string; bytecodeVersion: number } {
  const packageFile = require.resolve('hermes-compiler/package.json');
  const version = JSON.parse(readFileSync(packageFile, 'utf8')).version;
  const expected = validateRuntimeContract(directory);
  if (version !== expected) throw new Error(`Hermes compiler ${version} does not match runtime ${expected}. Pin hermes-compiler to ${expected} and reinstall.`);
  const platform = process.platform === 'darwin' && ['arm64', 'x64'].includes(process.arch) ? 'osx-bin'
    : process.platform === 'linux' && process.arch === 'x64' ? 'linux64-bin'
      : process.platform === 'win32' && process.arch === 'x64' ? 'win64-bin' : undefined;
  if (!platform) throw new Error(`hermes-compiler ${version} has no prebuilt binary for ${process.platform}/${process.arch}`);
  const executable = path.join(path.dirname(packageFile), 'hermesc', platform, process.platform === 'win32' ? 'hermesc.exe' : 'hermesc');
  if (!existsSync(executable)) throw new Error(`Missing prebuilt Hermes compiler: ${executable}. Run pnpm install.`);
  const info = execFileSync(executable, ['-version'], { encoding: 'utf8' });
  const bytecodeVersion = compilerBytecodeVersion(info, expected);
  return { executable, bytecodeVersion };
}

export async function precompile(entries: ArchiveEntries): Promise<void> {
  const pending = [...entries].filter(([name, data]) => name.endsWith('.js')
    && !(data.length >= 4 && data.readUInt32LE(0) === MODULE_MAGIC));
  if (!pending.length) return;
  const { executable, bytecodeVersion } = hermesCompiler();
  const dir = mkdtempSync(path.join(tmpdir(), 'valdi-hermes-'));
  try {
    let next = 0;
    const results = await Promise.allSettled(Array.from({ length: Math.min(4, availableParallelism(), pending.length) }, async () => {
      while (next < pending.length) {
        const index = next++;
        const [name, source] = pending[index];
        const input = path.join(dir, `${index}.js`);
        const output = path.join(dir, `${index}.hbc`);
        writeFileSync(input, formatJsModule(source.toString('utf8')));
        // Same strict/block-scoping/optimization and stripping settings as HermesJavaScriptCompiler.cpp.
        await run(executable, ['-emit-binary', '-O', '-strict', '-Xes6-block-scoping', '-fno-static-builtins',
          '-fstrip-function-names', '-g0', '-emit-async-break-check', '-out', output, input]);
        const bytecode = readFileSync(output);
        if (bytecode.length < 12 || bytecode.readBigUInt64LE(0) !== HBC_MAGIC || bytecode.readUInt32LE(8) !== bytecodeVersion) {
          throw new Error(`Unexpected Hermes bytecode format for ${name}`);
        }
        const header = Buffer.alloc(4);
        header.writeUInt32LE(MODULE_MAGIC);
        entries.set(name, Buffer.concat([header, bytecode]));
      }
    }));
    for (const result of results) if (result.status === 'rejected') throw result.reason;
  } finally {
    rmSync(dir, { recursive: true, force: true });
  }
}
