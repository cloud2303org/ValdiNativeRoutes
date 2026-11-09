#!/usr/bin/env python3
"""Prepare native Promise tests against the exported runtime; optionally build or run."""

import argparse
import hashlib
import json
import plistlib
from pathlib import Path
import subprocess
import tempfile


def main():
    parser = argparse.ArgumentParser(description=__doc__)
    mode = parser.add_mutually_exclusive_group()
    mode.add_argument("--run", action="store_true", help="Generate, build and run on the named simulator")
    mode.add_argument("--build-only", action="store_true", help="Generate and build for a generic simulator without running tests")
    parser.add_argument("--udid", help="Simulator already booted through Argent")
    parser.add_argument("--output", type=Path, help="New directory for project, logs and result bundle")
    args = parser.parse_args()
    if args.run and not args.udid:
        parser.error("--run requires --udid")
    tests = Path(__file__).resolve().parent
    root = tests.parents[4]
    output = args.output.resolve() if args.output else Path(tempfile.mkdtemp(prefix="valdi-appui-promise-"))
    if args.output:
        output.mkdir(parents=True, exist_ok=False)
    sources = [
        root / "valdi/modules/app_ui/ios/AppUIPromise.swift",
        tests / "AppUIPromiseTests.swift",
        root / "valdi/modules/app_ui/ios/VRAppUIVoidPromise.h",
        root / "valdi/modules/app_ui/ios/VRAppUIVoidPromise.m",
        root / "ios/Generated/valdi/AppUI",
        root / "ios/Generated/valdi/AppUITypes",
    ]
    framework = root / "ios/Frameworks/ValdiRuntime.xcframework"
    if not framework.exists():
        parser.error("Export the iOS runtime before running these tests")
    bridge = output / "Bridge.h"
    bridge.write_text(
        '#import <ValdiRuntime/ValdiObjC.h>\n'
        f'#import "{sources[2]}"\n'
        '#import <AppUI/AppUI.h>\n'
        '#import <AppUITypes/AppUITypes.h>\n'
    )
    lines = [
        "name: AppUIPromiseRuntime", "options:", "  deploymentTarget:", '    iOS: "16.0"',
        "targets:", "  AppUIPromiseRuntime:", "    type: bundle.unit-test", "    platform: iOS",
        "    sources:",
        *["      - path: " + json.dumps(str(path)) for path in sources],
        "    dependencies:", "      - framework: " + json.dumps(str(framework)), "        embed: true",
        "    settings:", "      base:",
        "        PRODUCT_BUNDLE_IDENTIFIER: io.valdiroutes.appui.promise.tests",
        "        GENERATE_INFOPLIST_FILE: YES", '        SWIFT_VERSION: "5.0"',
        "        CODE_SIGNING_ALLOWED: NO",
        "        SWIFT_OBJC_BRIDGING_HEADER: " + json.dumps(str(bridge)),
        '        HEADER_SEARCH_PATHS: ["$(inherited)", '
        + json.dumps(str(root / "ios/Generated/valdi")) + "]",
        '        OTHER_SWIFT_FLAGS: ["$(inherited)", "-Xcc", '
        '"-fmodule-map-file=$(BUILT_PRODUCTS_DIR)/ValdiRuntime.framework/Modules/module.modulemap"]',
        '        LD_RUNPATH_SEARCH_PATHS: ["$(inherited)", "@loader_path/Frameworks", '
        '"@executable_path/Frameworks"]',
        "        ARCHS: arm64", "schemes:", "  AppUIPromiseRuntime:", "    build:", "      targets:",
        "        AppUIPromiseRuntime: all", "    test:", "      targets:", "        - AppUIPromiseRuntime",
    ]
    (output / "project.yml").write_text("\n".join(lines) + "\n")
    commands = [
        ["xcodegen", "generate", "--spec", str(output / "project.yml")],
        [
            "xcodebuild", "-project", str(output / "AppUIPromiseRuntime.xcodeproj"),
            "-scheme", "AppUIPromiseRuntime", "-configuration", "Debug", "-sdk", "iphonesimulator",
            "-destination", "generic/platform=iOS Simulator" if args.build_only else
            "id=" + (args.udid or "<BOOTED_SIMULATOR_UDID>"), "-derivedDataPath", str(output / "build"),
            "-resultBundlePath", str(output / "results.xcresult"), "CODE_SIGNING_ALLOWED=NO",
            "build-for-testing" if args.build_only else "test",
        ],
    ]
    with (framework / "Info.plist").open("rb") as metadata:
        slices = plistlib.load(metadata)["AvailableLibraries"]
    simulator = next(item for item in slices if item.get("SupportedPlatformVariant") == "simulator"
                     and "arm64" in item["SupportedArchitectures"])
    runtime_binary = framework / simulator["LibraryIdentifier"] / simulator["LibraryPath"] / "ValdiRuntime"
    inputs = []
    for source in sources:
        if source.is_dir():
            inputs.extend(path for path in source.rglob("*") if path.is_file())
        else:
            inputs.append(source)
    binary = runtime_binary
    inputs.append(binary)
    hashes = {str(path.relative_to(root)): hashlib.sha256(path.read_bytes()).hexdigest() for path in inputs}
    (output / "inputs.json").write_text(json.dumps(hashes, indent=2) + "\n")
    (output / "commands.json").write_text(json.dumps(commands, indent=2) + "\n")
    print(f"Evidence: {output}", flush=True)
    if args.run or args.build_only:
        for index, command in enumerate(commands):
            with (output / f"command-{index}.log").open("w") as log:
                subprocess.run(command, cwd=root, stdout=log, stderr=subprocess.STDOUT, check=True)


if __name__ == "__main__":
    main()
