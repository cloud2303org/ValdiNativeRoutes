#!/usr/bin/env python3
"""Prepare wheel object-binding tests against real models, ThemeBridge and the exported SDK."""
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
    parser.add_argument("--output", type=Path, help="New evidence directory")
    args = parser.parse_args()
    if args.run and not args.udid:
        parser.error("--run requires --udid")
    tests = Path(__file__).resolve().parent
    root = tests.parents[4]
    modules = root / "module-build/out/ios"
    theme_library = modules / "theme_bridge/libtheme_bridge_ios.a"
    if not (modules / "swift/ThemeBridge.swiftmodule").is_file() or not theme_library.is_file():
        parser.error("Prepare the iOS modules first: node scripts/node-modules.mjs ios")
    output = args.output.resolve() if args.output else Path(tempfile.mkdtemp(prefix="wheel-object-binding-tests-"))
    if args.output:
        output.mkdir(parents=True, exist_ok=False)
    ui = root / "valdi/modules/app_ui/ios/ui"
    framework = root / "ios/Frameworks/ValdiRuntime.xcframework"
    if not framework.exists():
        parser.error("Export the iOS runtime before preparing these tests")
    wheels = root / "valdi/modules/app_ui/ios/wheels"
    sources = [wheels / "WheelViews.swift",
               wheels / "WheelObjectBinding.h",
               wheels / "WheelObjectBinding.m",
               tests / "WheelObjectBindingTests.swift",
               tests / "WheelBindingRecorder.h",
               tests / "WheelBindingRecorder.m",
               root / "ios/Generated/valdi/AppUI",
               root / "ios/Generated/valdi/AppUITypes"]
    sources += [ui / (name + ".swift") for name in (
        "BottomSheet", "OverlayScope", "OverlayActions", "PopupActionButtons",
        "ActionButton", "UiTheme", "UiDesign", "Picker", "MenuControls", "AppUISheetHostView")]
    bridge = output / "Bridge.h"
    bridge.write_text(
        '#import <ValdiRuntime/ValdiObjC.h>\n'
        '#import <AppUI/AppUI.h>\n'
        '#import <AppUITypes/AppUITypes.h>\n'
        f'#import "{wheels / "WheelObjectBinding.h"}"\n'
        f'#import "{tests / "WheelBindingRecorder.h"}"\n'
    )
    # UIKit control dispatch needs UIApplicationMain, even though the test bundle
    # compiles the production UI sources directly and links the real Valdi framework.
    host_source = output / "WheelBindingTestApp.swift"
    host_source.write_text("""import UIKit

@main
final class WheelBindingTestApp: UIResponder, UIApplicationDelegate {
    var window: UIWindow?

    func application(_ application: UIApplication,
                     didFinishLaunchingWithOptions launchOptions: [UIApplication.LaunchOptionsKey: Any]?) -> Bool {
        let window = UIWindow(frame: UIScreen.main.bounds)
        window.rootViewController = UIViewController()
        window.makeKeyAndVisible()
        self.window = window
        return true
    }
}
""")
    spec = [
        "name: WheelObjectBinding", "options:", "  deploymentTarget:", '    iOS: "16.0"',
        "targets:", "  WheelBindingTestApp:", "    type: application", "    platform: iOS",
        "    sources:", "      - path: " + json.dumps(str(host_source)),
        "    settings:", "      base:",
        "        PRODUCT_BUNDLE_IDENTIFIER: io.valdiroutes.wheel.binding.testhost",
        "        GENERATE_INFOPLIST_FILE: YES",
        "        INFOPLIST_KEY_UILaunchScreen_Generation: YES",
        '        SWIFT_VERSION: "5.0"', "        CODE_SIGNING_ALLOWED: NO", "        ARCHS: arm64",
        "  WheelObjectBinding:", "    type: bundle.unit-test", "    platform: iOS",
        "    sources:", *["      - path: " + json.dumps(str(path)) for path in sources],
        "    dependencies:", "      - target: WheelBindingTestApp",
        "      - framework: " + json.dumps(str(framework)), "        embed: true",
        "      - framework: " + json.dumps(str(theme_library)),
        "        embed: false", "        link: false",
        "    settings:", "      base:", "        PRODUCT_BUNDLE_IDENTIFIER: io.valdiroutes.wheel.binding.tests",
        "        GENERATE_INFOPLIST_FILE: YES", '        SWIFT_VERSION: "5.0"',
        '        TEST_HOST: "$(BUILT_PRODUCTS_DIR)/WheelBindingTestApp.app/WheelBindingTestApp"',
        '        BUNDLE_LOADER: "$(TEST_HOST)"',
        "        SWIFT_OBJC_BRIDGING_HEADER: " + json.dumps(str(bridge)),
        '        HEADER_SEARCH_PATHS: ["$(inherited)", '
        + json.dumps(str(root / "ios/Generated/valdi")) + ", "
        + json.dumps(str(modules / "include")) + "]",
        '        SWIFT_INCLUDE_PATHS: ["$(inherited)", ' + json.dumps(str(modules / "swift")) + "]",
        '        OTHER_LDFLAGS: ["$(inherited)", "-force_load", ' + json.dumps(str(theme_library)) + "]",
        '        OTHER_SWIFT_FLAGS: ["$(inherited)", "-Xcc", '
        '"-fmodule-map-file=$(BUILT_PRODUCTS_DIR)/ValdiRuntime.framework/Modules/module.modulemap"]',
        '        LD_RUNPATH_SEARCH_PATHS: ["$(inherited)", "@loader_path/Frameworks", '
        '"@executable_path/Frameworks"]',
        "        ARCHS: arm64",
        "        CODE_SIGNING_ALLOWED: NO", "schemes:", "  WheelObjectBinding:",
        "    build:", "      targets:", "        WheelBindingTestApp: all", "        WheelObjectBinding: all",
        "    test:", "      targets:", "        - WheelObjectBinding",
    ]
    (output / "project.yml").write_text("\n".join(spec) + "\n")
    commands = [
        ["xcodegen", "generate", "--spec", str(output / "project.yml")],
        ["xcodebuild", "-project", str(output / "WheelObjectBinding.xcodeproj"),
         "-scheme", "WheelObjectBinding", "-configuration", "Debug", "-sdk", "iphonesimulator",
         "-destination", "generic/platform=iOS Simulator" if args.build_only else
         "id=" + (args.udid or "<BOOTED_SIMULATOR_UDID>"),
         "-derivedDataPath", str(output / "build"), "-resultBundlePath", str(output / "results.xcresult"),
         "CODE_SIGNING_ALLOWED=NO", "build-for-testing" if args.build_only else "test"],
    ]
    (output / "commands.json").write_text(json.dumps(commands, indent=2) + "\n")
    with (framework / "Info.plist").open("rb") as metadata:
        slices = plistlib.load(metadata)["AvailableLibraries"]
    simulator = next(item for item in slices if item.get("SupportedPlatformVariant") == "simulator"
                     and "arm64" in item["SupportedArchitectures"])
    runtime_binary = framework / simulator["LibraryIdentifier"] / simulator["LibraryPath"] / "ValdiRuntime"
    inputs = [p for source in sources for p in (source.rglob("*") if source.is_dir() else [source]) if p.is_file()]
    inputs.append(runtime_binary)
    inputs += [theme_library, modules / "swift/ThemeBridge.swiftmodule"]
    inputs += [path for path in (modules / "include").rglob("*") if path.is_file()]
    hashes = {str(path.relative_to(root)): hashlib.sha256(path.read_bytes()).hexdigest() for path in inputs}
    (output / "inputs.json").write_text(json.dumps(hashes, indent=2) + "\n")
    print(f"Prepared: {output}", flush=True)
    if args.run or args.build_only:
        for index, command in enumerate(commands):
            with (output / f"command-{index}.log").open("w") as log:
                subprocess.run(command, cwd=root, stdout=log, stderr=subprocess.STDOUT, check=True)


if __name__ == "__main__":
    main()
