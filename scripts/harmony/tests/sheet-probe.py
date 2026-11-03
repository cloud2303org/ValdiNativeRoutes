#!/usr/bin/env python3
"""Bounded serial sheet native proof. No app/runtime build, HAP or device access.

Requires the caller to hold the parent's single native slot. Each invocation
uses a fresh output directory and records exact commands, failures and consumed
headers; no prebuilt Context archive is linked.
"""
import argparse
import hashlib
import json
import os
from pathlib import Path
import shlex
import subprocess
import sys

ROOT = Path(__file__).resolve().parents[3]
HOST = ROOT / 'harmony/entry/src/main/cpp/host'
SDK = Path('/Users/cloud/Library/Huawei/26.0.0.865/command-line-tools/sdk/default/openharmony/native')


def digest(path):
    return hashlib.sha256(Path(path).read_bytes()).hexdigest()


class Proof:
    def __init__(self, output):
        self.output = output.resolve()
        self.output.mkdir(parents=True, exist_ok=False)
        self.commands, self.inputs, self.outputs = [], {}, {}
        self.record_input(Path(__file__).resolve())

    def record_input(self, path):
        path = Path(path).resolve()
        current = digest(path)
        previous = self.inputs.get(str(path))
        if previous is not None and previous != current:
            raise RuntimeError('Consumed input changed during proof: '+str(path))
        self.inputs[str(path)] = current

    def save(self):
        (self.output / 'receipt.json').write_text(json.dumps({
            'commands': self.commands, 'inputSHA256': self.inputs,
            'outputSHA256': self.outputs, 'serialNativeInvocations': True,
            'maxJobs': 1, 'oldContextArchiveLinked': False,
            'applicationOrFullRuntimeLinked': False, 'HAP': False, 'device': False,
        }, indent=2) + '\n')

    def run(self, command, label, expected_failure=False, cwd=ROOT):
        listing = subprocess.check_output(['ps', '-axo', 'pid=,comm='], text=True)
        names = {'clang', 'clang++', 'cc1', 'cc1plus', 'ninja', 'make', 'cmake', 'hvigorw', 'ld.lld', 'ld'}
        conflicts = [row for row in listing.splitlines()
                     if Path(row.strip().split(maxsplit=1)[-1]).name in names]
        if conflicts:
            raise RuntimeError('Native slot occupied: ' + repr(conflicts))
        (self.output / (label + '-processes.log')).write_text(listing)
        command = list(map(str, command))
        print(label, flush=True)
        log = self.output / (label + '.log')
        with log.open('w') as stream:
            completed = subprocess.run(command, cwd=cwd, stdout=stream, stderr=subprocess.STDOUT,
                env={**os.environ, 'ASAN_OPTIONS': 'halt_on_error=1', 'UBSAN_OPTIONS': 'halt_on_error=1'})
        record = {'command': command, 'cwd': str(cwd), 'exit': completed.returncode,
                  'log': str(log), 'expectedFailure': expected_failure}
        self.commands.append(record)
        self.save()
        if (completed.returncode != 0) != expected_failure:
            print(log.read_text()[-18000:], file=sys.stderr)
            raise RuntimeError('Unexpected result: ' + label)
        return record

    def compile(self, flags, source, label):
        return self.compile_with('/usr/bin/clang++', flags, source, label)

    def compile_with(self, compiler, flags, source, label, cwd=ROOT):
        obj = self.output / (label + '.o')
        deps = self.output / (label + '.d')
        self.run([compiler, *flags, '-MMD', '-MF', deps, '-c', source, '-o', obj], label, cwd=cwd)
        for name in shlex.split(deps.read_text().replace('\\\n', '').split(': ', 1)[1]):
            path = Path(name)
            if not path.is_absolute(): path = Path(cwd) / path
            if path.is_file(): self.record_input(path)
        self.outputs[str(obj)] = digest(obj)
        self.save()
        return obj


def surface(args, proof):
    source = args.surface_source or HOST / 'HarmonySheetSurface.cpp'
    header = args.surface_header or source.with_suffix('.hpp')
    fixture = args.fixture or ROOT / 'scripts/harmony/tests/sheet-surface-native.cpp'
    flags = ['-std=c++20', '-O1', '-g', '-UNDEBUG', '-fsanitize=address,undefined',
             '-fno-omit-frame-pointer', '-idirafter', str(SDK / 'sysroot/usr/include'),
             '-Wno-deprecated-declarations', '-Wno-nullability-completeness',
             '-DSHEET_SURFACE_HEADER="' + str(header.resolve()) + '"']
    if args.baseline: flags.append('-DSHEET_SURFACE_TEST_INTERACTION_NODE=0')
    if args.surface_nav_bodies:
        flags.append('-DSHEET_SURFACE_NAVIGATOR_BODIES="' + str(args.surface_nav_bodies.resolve()) + '"')
    objects = [proof.compile(flags, source, 'surface'), proof.compile(flags, fixture, 'fixture')]
    binary = proof.output / 'surface-fixture'
    proof.run(['/usr/bin/clang++', *flags, *objects, '-o', binary], 'surface-link')
    proof.outputs[str(binary)] = digest(binary)
    proof.run([binary], 'surface-run', expected_failure=args.expect_failure)

def backend(args, proof):
    directory = args.backend_root or ROOT/'harmony/entry/src/main/cpp/backend'
    selected = directory
    if args.backend_p2:
        selected = proof.output/'selected'
        support = args.backend_support_root or directory
        proof.run([sys.executable, ROOT/'scripts/harmony/tests/sheet-backend-p2-extract.py',
                   '--backend-root', directory, '--support-root', support, '--out', selected],
                  'backend-extract')
        extraction = selected/'extraction.json'
        metadata = json.loads(extraction.read_text())
        for name, expected in metadata['inputs'].items():
            assert digest(name) == expected, 'Backend input changed: ' + name
            proof.record_input(name)
        for name, expected in metadata['outputs'].items():
            assert digest(name) == expected
            proof.outputs[name] = expected
        proof.outputs[str(extraction)] = digest(extraction)
    flags = ['-std=c++20','-O1','-g','-UNDEBUG','-fsanitize=address,undefined',
             '-fno-omit-frame-pointer','-idirafter',str(SDK/'sysroot/usr/include'),
             '-I'+str(selected),
             '-I'+str(ROOT/'.tools/harmony/upstream/valdi_core/src'),
             '-I'+str(ROOT/'.tools/harmony/upstream/libs/utils/src'),
             '-Wno-deprecated-declarations','-Wno-nullability-completeness']
    fixture = args.fixture or ROOT/'scripts/harmony/tests'/(
        'sheet-backend-p2-native.cpp' if args.backend_p2 else 'sheet-backend-native.cpp')
    obj = proof.compile(flags,fixture,'backend-fixture')
    binary = proof.output/'backend-fixture'
    proof.run(['/usr/bin/clang++',*flags,obj,'-o',binary],'backend-link')
    proof.outputs[str(binary)] = digest(binary)
    for case in args.case or ['all']:
        proof.run([binary, case], 'backend-run-'+case, expected_failure=args.expect_failure)

def sdk_units(args, proof):
    # Fresh configure/commands only; never build a target or link the app.
    parent = proof.output / 'parent'
    parent.mkdir()
    (parent / 'CMakeLists.txt').write_text(
        'cmake_minimum_required(VERSION 3.22)\nproject(sheet_probe LANGUAGES C CXX ASM)\n'
        'set(CMAKE_EXPORT_COMPILE_COMMANDS ON)\n'
        f'add_subdirectory("{ROOT}/harmony/entry/src/main/cpp" app)\n')
    fork = Path('/Users/cloud/.config/superpowers/worktrees/Valdi-node-only/harmony-platform-20261102')
    for arch in ('x86_64', 'arm64-v8a'):
        for mode in ('legacy', 'fork'):
            label = arch + '-' + mode
            build = proof.output / label
            flags = []
            if mode == 'fork':
                flags = ['-DVALDI_HARMONY_USE_FORK_UI_ASSETS=ON', f'-DVALDI_HARMONY_FORK_ROOT={fork}',
                    '-DVALDI_HARMONY_PROFILE=full-development',
                    f'-DVALDI_HARMONY_EXTERNAL_DIR={ROOT}/.tools/harmony/runtime-inputs/external',
                    f'-DVALDI_HARMONY_PROTO_DIR={ROOT}/.tools/harmony/runtime-inputs/generated/proto',
                    '-DVALDI_HARMONY_WEBSOCKETPP_DIR=/private/tmp/valdi-harmony-runtime-7hl3ei7w/websocketpp']
            proof.run([SDK / 'build-tools/cmake/bin/cmake', '-S', parent, '-B', build, '-G', 'Ninja',
                f'-DCMAKE_TOOLCHAIN_FILE={SDK}/build/cmake/ohos.toolchain.cmake',
                f'-DCMAKE_MAKE_PROGRAM={SDK}/build-tools/cmake/bin/ninja', f'-DOHOS_ARCH={arch}',
                '-DCMAKE_BUILD_TYPE=Debug', f'-DVALDI_HARMONY_RUNTIME_MODE={mode}', *flags], label+'-configure')
            rows = json.loads((build/'compile_commands.json').read_text())
            sources = [HOST/name for name in ('HarmonySheetSurface.cpp', 'HarmonyNavigator.cpp',
                                               'HarmonyRuntimeHost.cpp', 'NapiModule.cpp')]
            sources.append((ROOT/'harmony/entry/src/main/cpp/backend' if mode == 'legacy'
                            else fork/'valdi/harmony/arkui')/'ArkUIViewManager.cpp')
            for source in sources:
                row = next(row for row in rows if Path(row['file']).resolve() == source.resolve())
                command = list(row.get('arguments') or shlex.split(row['command']))
                for flag in ('-o', '-c'):
                    index = command.index(flag)
                    del command[index:index+2]
                proof.compile_with(command[0], command[1:], source, label+'-'+source.name, row['directory'])
            abi = proof.output/(label+'-abi.cpp')
            abi.write_text('#include "valdi/runtime/Interfaces/IJavaScriptContext.hpp"\n'
                           'static_assert(sizeof(Valdi::IJavaScriptContext)==616);\n')
            proof.compile_with(command[0], command[1:], abi, label+'-abi', row['directory'])

def navigator(args, proof):
    recipe_path = Path('/tmp/valdi-native-route-20261103/navigator-final/support-recipe.json')
    recipe = json.loads(recipe_path.read_text())
    proof.inputs[str(recipe_path)] = digest(recipe_path)
    flags = [flag for flag in recipe['flags'] if not flag.startswith('-I/private/tmp/valdi-appui-media')]
    flags += ['-I'+str(HOST), '-I'+str(ROOT/'scripts/harmony/tests')]
    extraction = proof.output/'navigator.cpp'
    command = [sys.executable, ROOT/'scripts/harmony/tests/sheet-navigator-extract.py',
               args.navigator_source or HOST/'HarmonyNavigator.cpp', extraction]
    if args.negative: command.append(args.negative)
    proof.run(command, 'extract-navigator')
    extraction_manifest = extraction.with_suffix('.extraction.json')
    for name, expected in json.loads(extraction_manifest.read_text())['sourceInputs'].items():
        assert digest(name) == expected, 'Extracted input changed: ' + name
        proof.record_input(name)
    proof.outputs[str(extraction_manifest)] = digest(extraction_manifest)
    # Core/generated DTO data only. The extracted runtime/context collaborators
    # do not need Runtime.cpp/Context.cpp or a prebuilt context/runtime archive.
    sources = [Path(source) for source in recipe['sources']
               if '/valdi/src/' not in source or source.endswith('/app_pages.cpp')]
    (proof.output/'support-recipe.json').write_text(json.dumps({'flags':flags, 'sources':list(map(str,sources)),
        'currentSourceRecompile':True, 'oldArchiveReuse':False},indent=2))
    archive = proof.output/'libsheet-data-support.a'
    if args.data_support_from:
        prior_dir = args.data_support_from.resolve()
        prior = json.loads((prior_dir/'receipt.json').read_text())
        prior_recipe = json.loads((prior_dir/'support-recipe.json').read_text())
        assert prior_recipe == json.loads((proof.output/'support-recipe.json').read_text())
        for deps in prior_dir.glob('support-*.d'):
            for name in shlex.split(deps.read_text().replace('\\\n','').split(': ',1)[1]):
                path = Path(name)
                if not path.is_absolute(): path = ROOT/path
                assert digest(path) == prior['inputSHA256'][str(path.resolve())], 'Support input drift: '+str(path)
                proof.record_input(path)
        original = prior_dir/archive.name
        assert digest(original) == prior['outputSHA256'][str(original)]
        archive.write_bytes(original.read_bytes())
        (proof.output/'data-support-reuse.json').write_text(json.dumps({
            'archive':str(original),'sha256':digest(original),'currentInputsVerified':True,
            'runtimeOrContextObjectsIncluded':False},indent=2))
    else:
        objects = []
        for i, source in enumerate(sources):
            objects.append(proof.compile(flags, source, f'support-{i}'))
        proof.run(['/usr/bin/ar','rcs',archive,*objects],'data-support-archive')
    proof.outputs[str(archive)] = digest(archive)
    targets = [proof.compile(flags, source, f'navigator-{i}') for i,source in enumerate(
        [HOST/'HarmonyNativeRouteSurface.cpp',HOST/'HarmonyNativeScreens.cpp',extraction])]
    native = ROOT/'harmony/business-build/.artifacts/host'
    libraries = [native/'deps/fmt/libfmt.a',native/'deps/jsoncpp/src/lib_json/libjsoncpp.a']
    for library in libraries: proof.inputs[str(library)] = digest(library)
    binary = proof.output/'navigator'
    proof.run(['/usr/bin/clang++',*flags,'-Wl,-dead_strip',*targets,archive,*libraries,'-o',binary],
              'navigator-link')
    proof.outputs[str(binary)] = digest(binary)
    proof.run([binary], 'navigator-run', expected_failure=args.expect_failure)


def main():
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument('output', type=Path)
    parser.add_argument('--surface', action='store_true')
    parser.add_argument('--sdk', action='store_true')
    parser.add_argument('--navigator', action='store_true')
    parser.add_argument('--backend', action='store_true')
    parser.add_argument('--backend-p2', action='store_true')
    parser.add_argument('--backend-root', type=Path)
    parser.add_argument('--backend-support-root', type=Path)
    parser.add_argument('--case', action='append', help='Named backend fixture case; repeat to retain separate runs')
    parser.add_argument('--navigator-source', type=Path)
    parser.add_argument('--negative', choices=('legacy-presentation', 'result-before-detach', 'base-hidden',
                                              'native-cancel-open'))
    parser.add_argument('--data-support-from', type=Path, help='Only this probe fresh core/data archive; verifies recipe and every dependency')
    parser.add_argument('--surface-source', type=Path)
    parser.add_argument('--surface-header', type=Path)
    parser.add_argument('--surface-nav-bodies', type=Path,
                        help='Exact unchanged production Navigator include for actual-surface integration')
    parser.add_argument('--fixture', type=Path)
    parser.add_argument('--baseline', action='store_true')
    parser.add_argument('--expect-failure', action='store_true')
    args = parser.parse_args()
    proof = Proof(args.output)
    try:
        if args.surface: surface(args, proof)
        elif args.sdk: sdk_units(args, proof)
        elif args.navigator: navigator(args, proof)
        elif args.backend or args.backend_p2: backend(args, proof)
        else: parser.error('choose one bounded proof target')
    finally:
        for path in (SDK / 'sysroot/usr/include/arkui').rglob('*.h'):
            proof.inputs[str(path)] = digest(path)
        proof.save()


if __name__ == '__main__':
    main()
