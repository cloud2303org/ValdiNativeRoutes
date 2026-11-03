// Complete the official Swift export with its Clang dependencies. rules_apple's
// Swift framework path omits public_hdrs; the serialized Swift module still
// imports valdi_core and ValdiCoreCPP. Ship both with the same exported headers
// and ABI, rather than requiring consumers to see Bazel's private execroot.
import { spawnSync } from 'node:child_process';
import { chmodSync, copyFileSync, existsSync, mkdirSync, readdirSync, readFileSync, writeFileSync } from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const root = path.resolve(import.meta.dirname, '..');
const split = value => (value ?? '').split(/\s+/).filter(Boolean);

export function packageSwiftRuntime(framework, { headers, sources }) {
  const shim = path.join(sources, 'valdi_core/src/valdi_core/ios/swift/cpp');
  const shimNames = readdirSync(shim).filter(name => name.endsWith('.h')).sort();
  const names = headers.map(file => path.basename(file)).sort();
  for (const slice of readdirSync(framework)) {
    const bundle = path.join(framework, slice, 'ValdiRuntime.framework');
    if (!existsSync(bundle)) continue;
    const directory = path.join(bundle, 'Headers');
    mkdirSync(directory, { recursive: true });
    mkdirSync(path.join(bundle, 'Modules'), { recursive: true });
    for (const file of headers) {
      const destination = path.join(directory, path.basename(file));
      if (existsSync(destination)) chmodSync(destination, 0o644);
      copyFileSync(file, destination);
      chmodSync(destination, 0o644);
    }
    for (const name of shimNames) {
      const text = readFileSync(path.join(shim, name), 'utf8').replace(
        /#include <valdi_core\/ios\/swift\/cpp\/([^>]+)>/g, '#include "$1"',
      );
      writeFileSync(path.join(directory, name), text);
    }
    writeFileSync(path.join(directory, 'ValdiObjC.h'), '#pragma once\n' +
      names.map(name => `#import "${name}"\n`).join(''));
    writeFileSync(path.join(directory, 'ValdiSwiftInterop.h'), '#pragma once\n' +
      shimNames.map(name => `#include "${name}"\n`).join(''));
    writeFileSync(path.join(directory, 'ValdiRuntime.h'), '#pragma once\n@import valdi_core;\n@import ValdiCoreCPP;\n');
    writeFileSync(path.join(bundle, 'Modules/module.modulemap'), `
framework module valdi_core {
  header "ValdiObjC.h"
  export *
}
framework module ValdiCoreCPP {
  header "ValdiSwiftInterop.h"
  export *
}
framework module ValdiRuntime {
  header "ValdiRuntime.h"
  export *
}
`);
  }
}

if (process.argv[1] && path.resolve(process.argv[1]) === fileURLToPath(import.meta.url)) {
  const framework = process.argv[2];
  if (!framework) throw new Error('Expected exported ValdiRuntime.xcframework directory');
  const workspace = path.join(root, 'valdi');
  const startup = split(process.env.VALDI_BAZEL_STARTUP_ARGS);
  if (process.env.VALDI_BAZEL_OUTPUT_BASE_ROOT)
    startup.push(`--output_base=${process.env.VALDI_BAZEL_OUTPUT_BASE_ROOT}/valdi`);
  const flags = ['--config=stable_exec', '--snap_flavor=platform_development',
    '--repo_env=VALDI_PLATFORM_DEPENDENCIES=ios', ...split(process.env.VALDI_BAZEL_ARGS)];
  const command = process.env.BAZEL_BIN ?? 'bazel';
  const build = spawnSync(command, [...startup, 'build', '//:valdi_runtime_ios_hdrs', ...flags], { cwd: workspace, stdio: 'inherit' });
  if (build.status !== 0) throw new Error('Cannot build public Swift/Objective-C runtime headers');
  const query = spawnSync(command, [...startup, 'cquery', '//:valdi_runtime_ios_hdrs', '--output=files', ...flags], { cwd: workspace, encoding: 'utf8' });
  if (query.status !== 0) throw new Error(query.stderr);
  const headers = query.stdout.trim().split(/\r?\n/).map(file => path.resolve(workspace, file));
  if (!headers.length || headers.some(file => !existsSync(file))) throw new Error('Missing runtime public headers');
  const sources = [
    process.env.VALDI_SOURCE_ROOT, path.join(workspace, '.valdi-sources/external/valdi+'),
    path.join(workspace, 'bazel-valdi/external/valdi+'),
  ].find(directory => directory && existsSync(path.join(directory, 'valdi_core/src/valdi_core/ios/swift/cpp')));
  if (!sources) throw new Error('Cannot find pinned Swift runtime sources');
  packageSwiftRuntime(path.resolve(framework), { headers, sources });
}
