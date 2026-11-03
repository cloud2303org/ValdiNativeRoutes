#!/usr/bin/env python3
"""Run native Promise tests against the exported runtime on a booted iOS simulator."""

import argparse
import hashlib
import json
from pathlib import Path
import subprocess
import tempfile


def main():
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument("--udid", required=True, help="Simulator already booted through Argent")
    parser.add_argument("--output", type=Path, help="New directory for project, logs and result bundle")
    args = parser.parse_args()
    root = Path(__file__).resolve().parents[2]
    output = args.output.resolve() if args.output else Path(tempfile.mkdtemp(prefix="valdi-appui-promise-"))
    if args.output:
        output.mkdir(parents=True, exist_ok=False)
    sources = [
        root / "ios/ValdiRoutes/AppUIPromise.swift",
        root / "ios/Tests/AppUIPromiseTests.swift",
        root / "ios/ValdiRoutes/AppUI/ValdiImageBridge.h",
        root / "ios/ValdiRoutes/AppUI/ValdiImageBridge.m",
        root / "ios/Generated/valdi/app_pages",
        root / "ios/Generated/valdi/app_pagesTypes",
    ]
    framework = root / "ios/Frameworks/ValdiRuntime.xcframework"
    if not framework.exists():
        parser.error("Export the iOS runtime before running these tests")
    bridge = output / "Bridge.h"
    bridge.write_text(
        '#import <ValdiRuntime/ValdiObjC.h>\n'
        f'#import "{sources[2]}"\n'
        '#import <app_pages/app_pages.h>\n'
        '#import <app_pagesTypes/app_pagesTypes.h>\n'
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
            "-destination", f"id={args.udid}", "-derivedDataPath", str(output / "build"),
            "-resultBundlePath", str(output / "results.xcresult"), "CODE_SIGNING_ALLOWED=NO", "test",
        ],
    ]
    inputs = []
    for source in sources:
        if source.is_dir():
            inputs.extend(path for path in source.rglob("*") if path.is_file())
        else:
            inputs.append(source)
    binary = framework / "ios-arm64_x86_64-simulator/ValdiRuntime.framework/ValdiRuntime"
    inputs.append(binary)
    hashes = {str(path.relative_to(root)): hashlib.sha256(path.read_bytes()).hexdigest() for path in inputs}
    (output / "inputs.json").write_text(json.dumps(hashes, indent=2) + "\n")
    (output / "commands.json").write_text(json.dumps(commands, indent=2) + "\n")
    print(f"Evidence: {output}", flush=True)
    for index, command in enumerate(commands):
        with (output / f"command-{index}.log").open("w") as log:
            subprocess.run(command, cwd=root, stdout=log, stderr=subprocess.STDOUT, check=True)


if __name__ == "__main__":
    main()
