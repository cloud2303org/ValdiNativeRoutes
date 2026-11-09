#!/usr/bin/env python3
"""Prepare focused UIKit tests using the real built ThemeBridge dependency."""
import argparse
import json
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
    framework = root / "ios/Frameworks/ValdiRuntime.xcframework"
    if not framework.exists():
        parser.error("Export the iOS runtime before preparing these tests")
    output = args.output.resolve() if args.output else Path(tempfile.mkdtemp(prefix="sheet-host-tests-"))
    if args.output:
        output.mkdir(parents=True, exist_ok=False)
    ui = root / "valdi/modules/app_ui/ios/ui"
    sources = [tests / "SheetHostMigrationTests.swift",
               tests / "ActionSheetMigrationTests.swift"]
    sources += [ui / (name + ".swift") for name in (
        "BottomSheet", "OverlayScope", "OverlayActions", "PopupActionButtons",
        "ActionButton", "UiTheme", "UiDesign", "Picker", "MenuControls", "AppUISheetHostView")]
    # UIKit control dispatch needs UIApplicationMain, even though the test bundle
    # compiles production UI sources and links ThemeBridge plus its Valdi dependency.
    host_source = output / "SheetHostTestApp.swift"
    host_source.write_text("""import UIKit

@main
final class SheetHostTestApp: UIResponder, UIApplicationDelegate {
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
        "name: SheetHostMigration", "options:", "  deploymentTarget:", '    iOS: "16.0"',
        "targets:", "  SheetHostTestApp:", "    type: application", "    platform: iOS",
        "    sources:", "      - path: " + json.dumps(str(host_source)),
        "    settings:", "      base:",
        "        PRODUCT_BUNDLE_IDENTIFIER: io.valdiroutes.sheet.testhost",
        "        GENERATE_INFOPLIST_FILE: YES",
        "        INFOPLIST_KEY_UILaunchScreen_Generation: YES",
        '        SWIFT_VERSION: "5.0"', "        CODE_SIGNING_ALLOWED: NO", "        ARCHS: arm64",
        "  SheetHostMigration:", "    type: bundle.unit-test", "    platform: iOS",
        "    sources:", *["      - path: " + json.dumps(str(path)) for path in sources],
        "    dependencies:", "      - target: SheetHostTestApp",
        "      - framework: " + json.dumps(str(framework)), "        embed: true",
        "      - framework: " + json.dumps(str(theme_library)),
        "        embed: false", "        link: false",
        "    settings:", "      base:", "        PRODUCT_BUNDLE_IDENTIFIER: io.valdiroutes.sheet.tests",
        "        GENERATE_INFOPLIST_FILE: YES", '        SWIFT_VERSION: "5.0"',
        '        TEST_HOST: "$(BUILT_PRODUCTS_DIR)/SheetHostTestApp.app/SheetHostTestApp"',
        '        BUNDLE_LOADER: "$(TEST_HOST)"',
        '        SWIFT_INCLUDE_PATHS: ["$(inherited)", ' + json.dumps(str(modules / "swift")) + "]",
        '        HEADER_SEARCH_PATHS: ["$(inherited)", ' + json.dumps(str(modules / "include")) + "]",
        '        OTHER_SWIFT_FLAGS: ["$(inherited)", "-Xcc", '
        '"-fmodule-map-file=$(BUILT_PRODUCTS_DIR)/ValdiRuntime.framework/Modules/module.modulemap"]',
        '        OTHER_LDFLAGS: ["$(inherited)", "-force_load", ' + json.dumps(str(theme_library)) + "]",
        '        LD_RUNPATH_SEARCH_PATHS: ["$(inherited)", "@loader_path/Frameworks", '
        '"@executable_path/Frameworks"]',
        "        ARCHS: arm64",
        "        CODE_SIGNING_ALLOWED: NO", "schemes:", "  SheetHostMigration:",
        "    build:", "      targets:", "        SheetHostTestApp: all", "        SheetHostMigration: all",
        "    test:", "      targets:", "        - SheetHostMigration",
    ]
    (output / "project.yml").write_text("\n".join(spec) + "\n")
    commands = [
        ["xcodegen", "generate", "--spec", str(output / "project.yml")],
        ["xcodebuild", "-project", str(output / "SheetHostMigration.xcodeproj"),
         "-scheme", "SheetHostMigration", "-configuration", "Debug", "-sdk", "iphonesimulator",
         "-destination", "generic/platform=iOS Simulator" if args.build_only else
         "id=" + (args.udid or "<BOOTED_SIMULATOR_UDID>"),
         "-derivedDataPath", str(output / "build"), "-resultBundlePath", str(output / "results.xcresult"),
         "CODE_SIGNING_ALLOWED=NO", "build-for-testing" if args.build_only else "test"],
    ]
    (output / "commands.json").write_text(json.dumps(commands, indent=2) + "\n")
    print(f"Prepared: {output}", flush=True)
    if args.run or args.build_only:
        for index, command in enumerate(commands):
            with (output / f"command-{index}.log").open("w") as log:
                subprocess.run(command, cwd=root, stdout=log, stderr=subprocess.STDOUT, check=True)


if __name__ == "__main__":
    main()
