#!/usr/bin/env python3
"""Prepare focused UIKit tests; --run requires an authorized native build slot."""
import argparse
import json
from pathlib import Path
import subprocess
import tempfile


def main():
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument("--run", action="store_true", help="Generate, build and run on the named simulator")
    parser.add_argument("--udid", help="Simulator already booted through Argent")
    parser.add_argument("--output", type=Path, help="New evidence directory")
    args = parser.parse_args()
    if args.run and not args.udid:
        parser.error("--run requires --udid")
    root = Path(__file__).resolve().parents[2]
    output = args.output.resolve() if args.output else Path(tempfile.mkdtemp(prefix="sheet-host-tests-"))
    if args.output:
        output.mkdir(parents=True, exist_ok=False)
    ui = root / "valdi/modules/app_ui/ios/ui"
    sources = [root / "ios/Tests/SheetHostMigrationTests.swift",
               root / "ios/Tests/ActionSheetMigrationTests.swift"]
    sources += [ui / (name + ".swift") for name in (
        "BottomSheet", "OverlayScope", "OverlayActions", "PopupActionButtons",
        "ActionButton", "UiTheme", "UiDesign", "Picker", "MenuControls", "AppUISheetHostView")]
    # UIKit control dispatch needs UIApplicationMain, even though the test bundle
    # compiles the production UI sources directly and does not need Valdi.
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
        '        SWIFT_VERSION: "5.0"', "        CODE_SIGNING_ALLOWED: NO",
        "  SheetHostMigration:", "    type: bundle.unit-test", "    platform: iOS",
        "    sources:", *["      - path: " + json.dumps(str(path)) for path in sources],
        "    dependencies:", "      - target: SheetHostTestApp",
        "    settings:", "      base:", "        PRODUCT_BUNDLE_IDENTIFIER: io.valdiroutes.sheet.tests",
        "        GENERATE_INFOPLIST_FILE: YES", '        SWIFT_VERSION: "5.0"',
        '        TEST_HOST: "$(BUILT_PRODUCTS_DIR)/SheetHostTestApp.app/SheetHostTestApp"',
        '        BUNDLE_LOADER: "$(TEST_HOST)"',
        "        CODE_SIGNING_ALLOWED: NO", "schemes:", "  SheetHostMigration:",
        "    build:", "      targets:", "        SheetHostTestApp: all", "        SheetHostMigration: all",
        "    test:", "      targets:", "        - SheetHostMigration",
    ]
    (output / "project.yml").write_text("\n".join(spec) + "\n")
    commands = [
        ["xcodegen", "generate", "--spec", str(output / "project.yml")],
        ["xcodebuild", "-project", str(output / "SheetHostMigration.xcodeproj"),
         "-scheme", "SheetHostMigration", "-configuration", "Debug", "-sdk", "iphonesimulator",
         "-destination", "id=" + (args.udid or "<BOOTED_SIMULATOR_UDID>"),
         "-derivedDataPath", str(output / "build"), "-resultBundlePath", str(output / "results.xcresult"),
         "CODE_SIGNING_ALLOWED=NO", "test"],
    ]
    (output / "commands.json").write_text(json.dumps(commands, indent=2) + "\n")
    print(f"Prepared: {output}", flush=True)
    if args.run:
        for index, command in enumerate(commands):
            with (output / f"command-{index}.log").open("w") as log:
                subprocess.run(command, cwd=root, stdout=log, stderr=subprocess.STDOUT, check=True)


if __name__ == "__main__":
    main()
