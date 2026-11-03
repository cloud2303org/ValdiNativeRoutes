#!/usr/bin/env python3
"""Compile/run portable production admission lifetime checks in a scheduled slot.

--prepare-only writes fixtures/commands without invoking any compiler or linker.
The RED fixture uses the pre-fix production host's admission declaration. GREEN
uses the current declaration and actual lease implementation; neither is a Valdi
runtime simulation or a device debugger test.
"""
import argparse
import hashlib
import json
from pathlib import Path
import re
import subprocess

ROOT = Path(__file__).resolve().parents[3]
HOST = ROOT / 'harmony/entry/src/main/cpp/host'
TESTS = Path(__file__).resolve().parent


def admission_member(header):
    source = header.read_text()
    match = re.search(r'private:\s*(#if VALDI_HARMONY_FULL_DEVELOPMENT\s+'
                      r'[\s\S]*?HarmonyDevelopmentHostLease _developmentLease;\s*#endif)\s*napi_env _env;',
                      source)
    if match:
        return match.group(1) + '\n'
    if '_developmentLease' in source:
        raise RuntimeError('Production admission exists but is not first; refusing a substitute fixture')
    return '// This production host revision has no development admission member.\n'


def run(args):
    out = args.output.resolve()
    if out.exists():
        raise RuntimeError('Use a fresh output directory to preserve previous evidence')
    out.mkdir(parents=True)
    records = []
    cases = [('full-green', HOST / 'HarmonyRuntimeHost.hpp', 1, 0),
             ('lean-green', HOST / 'HarmonyRuntimeHost.hpp', 0, 0)]
    if args.baseline_header:
        cases.insert(0, ('baseline-red', args.baseline_header.resolve(), 1, 1))
    for label, header, full, expected_exit in cases:
        build = out / label
        build.mkdir()
        member = admission_member(header)
        (build / 'host-admission-member.inc').write_text(member)
        executable = build / 'admission-lifetime'
        command = [str(args.compiler), '-std=c++20', '-pthread', '-Wall', '-Wextra', '-Werror',
                   f'-DVALDI_HARMONY_FULL_DEVELOPMENT={full}', '-I', str(HOST), '-I', str(build),
                   str(TESTS / 'development-host-lease.cpp'),
                   str(TESTS / 'development-host-lease-peer.cpp'), '-o', str(executable)]
        record = {'case': label, 'header': str(header),
                  'headerSha256': hashlib.sha256(header.read_bytes()).hexdigest(),
                  'admissionMember': member, 'command': command, 'expectedExit': expected_exit,
                  'prepareOnly': args.prepare_only}
        if not args.prepare_only:
            with (build / 'compile.log').open('w') as log:
                subprocess.run(command, stdout=log, stderr=subprocess.STDOUT, check=True)
            with (build / 'run.log').open('w') as log:
                result = subprocess.run([str(executable)], stdout=log, stderr=subprocess.STDOUT, timeout=15)
            record['exit'] = result.returncode
            record['executableSha256'] = hashlib.sha256(executable.read_bytes()).hexdigest()
            diagnostic = (build / 'run.log').read_text()
            if expected_exit:
                if result.returncode == 0 or 'second full-development live host was admitted' not in diagnostic:
                    raise RuntimeError(f'RED did not reproduce overlapping production admission: {build}')
            elif result.returncode != 0 or 'PASS production admission lifetime' not in diagnostic:
                raise RuntimeError(f'Production admission regression failed: {build}')
        records.append(record)
        print(label, 'PREPARED ONLY' if args.prepare_only else 'PASS')
    (out / 'results.json').write_text(json.dumps(records, indent=2) + '\n')


if __name__ == '__main__':
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument('--compiler', type=Path, required=True)
    parser.add_argument('--baseline-header', type=Path)
    parser.add_argument('--output', type=Path, required=True)
    parser.add_argument('--prepare-only', action='store_true')
    run(parser.parse_args())
