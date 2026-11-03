#!/usr/bin/env python3
"""Real OHOS CMake app + C++17 external-consumer configuration; no runtime builds.

Optional host-object compilation is sequential and must be coordinated with the
parent's compiler slot. Configuration itself runs the toolchain's small probes.
No source patches, preparation, downloads, HAPs, exports or rawfile writes.
"""
import argparse
import hashlib
import json
from pathlib import Path
import shlex
import subprocess

APP = Path(__file__).resolve().parents[3]
CONSUMER_CMAKE = '''cmake_minimum_required(VERSION 3.22)
project(app_profile_external_consumer LANGUAGES C CXX ASM)
set(CMAKE_CXX_STANDARD 17)
set(CMAKE_CXX_STANDARD_REQUIRED ON)
set(CMAKE_CXX_EXTENSIONS OFF)
set(CMAKE_EXPORT_COMPILE_COMMANDS ON)
add_subdirectory("${FORK_RUNTIME}" runtime)
add_library(external_consumer OBJECT consumer.cpp)
target_link_libraries(external_consumer PRIVATE Valdi::HarmonyRuntime)
add_subdirectory("${APP_ROOT}/harmony/business-build" business)
# Compile the actual host TU without building/linking any runtime archives.
# This is an API compile probe; it deliberately does not waive the app gate.
add_library(app_host_probe OBJECT "${APP_ROOT}/harmony/entry/src/main/cpp/host/HarmonyRuntimeHost.cpp")
target_compile_features(app_host_probe PRIVATE cxx_std_20)
target_link_libraries(app_host_probe PRIVATE Valdi::HarmonyRuntime valdi_clientsql_ohos)
get_filename_component(hms_sysroot "${CMAKE_SYSROOT}/../../../hms/native/sysroot" ABSOLUTE)
target_include_directories(app_host_probe PRIVATE
  "${APP_ROOT}/harmony/entry/src/main/cpp" "${APP_ROOT}/valdi/native/generated"
  "${APP_ROOT}/.tools/harmony/business-bindings" "${hms_sysroot}/usr/include")
set(VALDI_HARMONY_APP_FULL_DEVELOPMENT 0)
if(VALDI_HARMONY_PROFILE STREQUAL "full-development")
  set(VALDI_HARMONY_APP_FULL_DEVELOPMENT 1)
endif()
set(VALDI_PROJECT_ROOT "${APP_ROOT}")
include("${APP_ROOT}/harmony/runtime-build/app-development.cmake")
valdi_harmony_configure_app_development(app_host_probe)
file(GENERATE OUTPUT "${CMAKE_BINARY_DIR}/consumer-properties.txt" CONTENT
"parent_standard=${CMAKE_CXX_STANDARD}
outer_features=$<TARGET_PROPERTY:valdi_harmony_runtime,INTERFACE_COMPILE_FEATURES>
vm_standard=$<TARGET_PROPERTY:valdi_ohos_hermes,CXX_STANDARD>
websocket_standard=$<TARGET_PROPERTY:valdi_ohos_websocket,CXX_STANDARD>
links=$<TARGET_PROPERTY:valdi_harmony_runtime,INTERFACE_LINK_LIBRARIES>
")
'''
CONSUMER = '''#include "valdi/runtime/Interfaces/IJavaScriptBridge.hpp"
#include "valdi/runtime/RuntimeManager.hpp"
#include <type_traits>
static_assert(__cplusplus >= 202002L);
using HeapDump = Valdi::BytesView (Valdi::IJavaScriptBridge::*)(
    std::span<Valdi::IJavaScriptContext*>, Valdi::JSExceptionTracker&);
static_assert(std::is_same_v<decltype(&Valdi::IJavaScriptBridge::dumpHeap), HeapDump>);
void developmentAPIs(Valdi::RuntimeManager& manager, const Valdi::Ref<Valdi::Runtime>& runtime) {
    manager.setApplicationId(Valdi::StringBox::fromCString("io.valdiroutes.harmony"));
    manager.attachHotReloader(runtime);
}
'''


def require(condition, message):
    if not condition:
        raise RuntimeError(message)


def configure(args, source, build, extra, label):
    command = [str(args.sdk / 'build-tools/cmake/bin/cmake'), '-S', str(source), '-B', str(build),
               '-G', 'Ninja',
               f'-DCMAKE_TOOLCHAIN_FILE={args.sdk}/build/cmake/ohos.toolchain.cmake',
               f'-DCMAKE_MAKE_PROGRAM={args.sdk}/build-tools/cmake/bin/ninja',
               f'-DOHOS_ARCH={args.arch}', '-DCMAKE_BUILD_TYPE=Debug',
               '-DCMAKE_EXPORT_COMPILE_COMMANDS=ON', *extra]
    log = args.output / (label + '.log')
    with log.open('w') as output:
        result = subprocess.run(command, stdout=output, stderr=subprocess.STDOUT)
    return {'command': command, 'exit': result.returncode, 'log': str(log)}


def compile_object(entry, build, log):
    command = entry.get('arguments') or shlex.split(entry['command'])
    output = build / command[command.index('-o') + 1]
    output.parent.mkdir(parents=True, exist_ok=True)
    with log.open('w') as stream:
        result = subprocess.run(command, cwd=entry['directory'], stdout=stream, stderr=subprocess.STDOUT)
    require(result.returncode == 0, f'Object compile failed: {log}')
    return {'command': command, 'exit': result.returncode, 'log': str(log),
            'object': str(output), 'sha256': hashlib.sha256(output.read_bytes()).hexdigest()}


def check_runtime_closure(args, build, profile, rows):
    manifest_path = build / 'runtime/generated/inputs/manifest.json'
    manifest = json.loads(manifest_path.read_text())
    full = profile == 'full-development'
    groups = {
        'valdi_ohos_hermes': ['VM_SRCS', 'COMPILER_SRCS' if full else 'LEAN_BACKEND_SRCS'],
        'valdi_ohos_hermes_api': ['API_SRCS', 'JSI_SRCS', *(['CDP_SRCS'] if full else [])],
        'valdi_ohos_llvh': ['LLVH_SRCS'], 'valdi_ohos_zip': ['ZIP_SRCS'],
        'valdi_ohos_dtoa': ['DTOA_SRCS'],
    }
    counts = {}
    for target, selected in groups.items():
        entries = [row for row in rows if f'CMakeFiles/{target}.dir/' in row['command']]
        actual = {Path(row['file']).resolve() for row in entries}
        expected = {(args.external / 'hermes' / file).resolve()
                    for group in selected for file in manifest['hermes'][group]}
        require(actual == expected, f'Wrong actual source closure for {target} in {profile}')
        counts[target] = len(actual)
    for target, group in (('valdi_ohos_hermes_adapter', 'VALDI_HERMES_SRCS'),
                          ('valdi_ohos_websocket', 'VALDI_WEBSOCKET_SRCS')):
        entries = [row for row in rows if f'CMakeFiles/{target}.dir/' in row['command']]
        require({Path(row['file']).resolve() for row in entries} ==
                {(args.fork_root / file).resolve() for file in manifest['valdi'][group]},
                f'Wrong Valdi adapter/transport source closure for {profile}')
        require(all(('-DVALDI_HAS_WEBSOCKET_SERVER' in shlex.split(row['command'])) == full for row in entries),
                f'Wrong WebSocket transport flag on {target}')
        if target == 'valdi_ohos_hermes_adapter':
            require(all(('-DHERMES_API' in shlex.split(row['command'])) == full for row in entries),
                    'Wrong Hermes adapter API flag')
        counts[target] = len(entries)
    options = (build / 'runtime/generated/build_options/BuildOptionsGenerated.hpp').read_text()
    boolean = 'true' if full else 'false'
    for name in ('kIsDevBuild', 'kTracingEnabled'):
        require(f'{name} = {boolean};' in options, f'Wrong runtime-owned {name} for {profile}')
    return {'manifest': str(manifest_path), 'sha256': hashlib.sha256(manifest_path.read_bytes()).hexdigest(),
            'sourceCounts': counts, 'development': full, 'tracing': full}


def run(args):
    args.output = args.output.resolve()
    require(not args.output.exists(), 'Use a fresh output directory to preserve old evidence')
    args.output.mkdir(parents=True)
    for name in ('fork_root', 'sdk', 'external', 'proto', 'websocketpp'):
        setattr(args, name, getattr(args, name).resolve())
    inputs = [f'-DVALDI_HARMONY_EXTERNAL_DIR={args.external}',
              f'-DVALDI_HARMONY_PROTO_DIR={args.proto}',
              f'-DVALDI_HARMONY_WEBSOCKETPP_DIR={args.websocketpp}']
    records = []
    app_source = APP / 'harmony/entry/src/main/cpp'
    legacy_build = args.output / 'legacy'
    legacy = configure(args, app_source, legacy_build, [], 'legacy')
    require(legacy['exit'] == 0, f"Legacy app configuration failed: {legacy['log']}")
    legacy_rows = json.loads((legacy_build / 'compile_commands.json').read_text())
    host_path = app_source / 'host/HarmonyRuntimeHost.cpp'
    legacy_host = next(row for row in legacy_rows if Path(row['file']).resolve() == host_path.resolve())
    require('-DVALDI_HARMONY_FULL_DEVELOPMENT=0' in legacy_host['command'], 'Legacy enabled development')
    require('-DHERMESVM_LEAN' in legacy_host['command'], 'Legacy lost its lean heap config')
    legacy['hostCommand'] = legacy_host
    if args.compile_host_objects:
        legacy['object'] = compile_object(legacy_host, legacy_build, args.output / 'legacy-host-object.log')
    records.append({'mode': 'legacy', **legacy})
    # Deliberately request full without opting in, even if all runtime inputs exist.
    rejection = configure(args, app_source, args.output / 'implicit-full',
                          ['-DVALDI_HARMONY_PROFILE=full-development'], 'implicit-full')
    require(rejection['exit'] != 0 and 'refusing legacy fallback' in Path(rejection['log']).read_text(),
            'Implicit full development did not fail closed')
    records.append({'mode': 'implicit-full-rejection', **rejection})
    parent = args.output / 'external-parent'
    parent.mkdir()
    (parent / 'CMakeLists.txt').write_text(CONSUMER_CMAKE)
    (parent / 'consumer.cpp').write_text(CONSUMER)
    for profile in ('lean-release', 'full-development'):
        external_build = args.output / ('external-' + profile)
        external = configure(args, parent, external_build,
                             [*inputs, f'-DFORK_RUNTIME={args.fork_root}/valdi/harmony/runtime', f'-DAPP_ROOT={APP}',
                              f'-DVALDI_HARMONY_SOURCE_DIR={args.fork_root}',
                              f'-DVALDI_HARMONY_PROFILE={profile}', '-DVALDI_HARMONY_LINK_CHECK=OFF'],
                             'external-' + profile)
        require(external['exit'] == 0, f"Real external consumer failed: {external['log']}")
        rows = json.loads((external_build / 'compile_commands.json').read_text())
        consumer = next(row for row in rows if Path(row['file']).resolve() == (parent / 'consumer.cpp').resolve())
        require('-std=c++20' in shlex.split(consumer['command']), 'Public C++20 requirement did not propagate')
        for target in ('valdi_ohos_websocket', 'valdi_ohos_hermes'):
            internal = [row for row in rows if f'CMakeFiles/{target}.dir/' in row['command']]
            require(internal and all('-std=c++17' in shlex.split(row['command']) for row in internal),
                    f'{target} no longer compiles in C++17')
        properties = (external_build / 'consumer-properties.txt').read_text()
        require('parent_standard=17' in properties and 'links=valdi_ohos_hermes_adapter' in properties,
                'Parent default changed or adapter missing')
        external['properties'] = properties
        external['consumerCommand'] = consumer
        external['closure'] = check_runtime_closure(args, external_build, profile, rows)
        flags = shlex.split(consumer['command'])
        full = profile == 'full-development'
        require(('-DHERMES_ENABLE_DEBUGGER' in flags) == full and
                ('-DHERMES_MEMORY_INSTRUMENTATION' in flags) == full and
                ('-DHERMESVM_LEAN' in flags) != full, 'Consumer heap/debugger features mismatch runtime')
        host_probe = next(row for row in rows if Path(row['file']).resolve() == host_path.resolve())
        host_flags = shlex.split(host_probe['command'])
        require(f'-DVALDI_HARMONY_FULL_DEVELOPMENT={int(full)}' in host_flags,
                'Host API probe development flag mismatches runtime')
        identity_flags = [flag for flag in host_flags if flag.startswith('-DVALDI_HARMONY_APPLICATION_ID=')]
        expected_identity = json.loads((APP / 'harmony/AppScope/app.json5').read_text())['app']['bundleName']
        require(identity_flags == ([f'-DVALDI_HARMONY_APPLICATION_ID="{expected_identity}"'] if full else []),
                'Actual app CMake identity differs from AppScope or leaked to lean')
        external['hostAPIProbeCommand'] = host_probe
        if args.compile_host_objects:
            external['object'] = compile_object(consumer, external_build,
                                                args.output / (profile + '-consumer-object.log'))
            external['hostAPIProbe'] = compile_object(host_probe, external_build,
                                                      args.output / (profile + '-host-api-probe.log'))
        records.append({'mode': 'external-consumer', 'profile': profile, **external})
        app_build = args.output / ('app-' + profile)
        app = configure(args, app_source, app_build,
                        [*inputs, '-DVALDI_HARMONY_RUNTIME_MODE=fork',
                         f'-DVALDI_HARMONY_FORK_ROOT={args.fork_root}',
                         f'-DVALDI_HARMONY_PROFILE={profile}'], 'app-' + profile)
        if app['exit'] != 0:
            require('Maintained fork is not app-compatible' in Path(app['log']).read_text(),
                    f"App failed outside the known source gate: {app['log']}")
            app['prerequisitesBlocked'] = True
        else:
            app_rows = json.loads((app_build / 'compile_commands.json').read_text())
            host = next(row for row in app_rows if Path(row['file']).resolve() == host_path.resolve())
            full = profile == 'full-development'
            require(f'-DVALDI_HARMONY_FULL_DEVELOPMENT={int(full)}' in host['command'],
                    'Host development flag mismatches runtime profile')
            if full:
                require('io.valdiroutes.harmony' in host['command'] and '-DHERMES_ENABLE_DEBUGGER' in host['command'],
                        'Full host lost app identity or debugger ABI feature')
            app['hostCommand'] = host
            if args.compile_host_objects:
                app['object'] = compile_object(host, app_build, args.output / (profile + '-host-object.log'))
        records.append({'mode': 'app', 'profile': profile, **app})
    (args.output / 'results.json').write_text(json.dumps(records, indent=2) + '\n')
    for record in records:
        print(record['mode'], record.get('profile', ''), 'exit=' + str(record['exit']),
              'PREREQUISITES BLOCKED' if record.get('prerequisitesBlocked') else '')


if __name__ == '__main__':
    parser = argparse.ArgumentParser(description=__doc__)
    for name in ('fork-root', 'sdk', 'external', 'proto', 'websocketpp', 'output'):
        parser.add_argument('--' + name, type=Path, required=True)
    parser.add_argument('--arch', choices=('x86_64', 'arm64-v8a'), default='x86_64')
    parser.add_argument('--compile-host-objects', action='store_true')
    run(parser.parse_args())
