#!/usr/bin/env python3
"""Existing Scroll/Refresh/input assertions with inactive wheel boundary fields.

Only a scratch copy of the legacy host seam changes; production bodies and
existing expectations/negative controls remain verbatim.
"""
import argparse
import hashlib
import json
from pathlib import Path
import runpy
import shutil
import subprocess
import sys


def main():
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument("--output", required=True, type=Path)
    parser.add_argument("--sdk-includes", required=True, type=Path)
    args = parser.parse_args()
    backend = Path(__file__).resolve().parents[1]
    output = args.output.resolve()
    output.mkdir(parents=True, exist_ok=False)
    shadow = output / "adapted-backend"
    shutil.copytree(backend, shadow)
    seam = shadow / "tests/mount-reentry.cpp"
    before = seam.read_text()
    text = before.replace("#include <arkui/native_node.h>", "#include <arkui/native_node.h>\n#include <arkui/native_gesture.h>")
    text = text.replace("static void cancelSubtreeInput(Node&) {}",
        "static void cancelSubtreeInput(Node&) {}\nstatic void stopSubtreeWheels(Node&) {}\n"
        "static ArkUI_GestureInterruptResult interruptWheelAncestor(ArkUI_GestureInterruptInfo*) { return GESTURE_INTERRUPT_RESULT_CONTINUE; }")
    text = text.replace("    ArkUI_NativeNodeAPI_1* api = nullptr;",
        "    ArkUI_NativeNodeAPI_1* api = nullptr;\n"
        "    ArkUI_NativeGestureAPI_2 gestureApi {};\n"
        "    ArkUI_NativeGestureAPI_2* gestures2 = &gestureApi;\n"
        "    Backend() { gestureApi.setGestureInterrupterToNode = [](ArkUI_NodeHandle, void*, "
        "ArkUI_GestureInterruptResult (*)(ArkUI_GestureInterruptInfo*)) -> int32_t { return 0; }; }\n")
    text = text.replace("    void stop() {}", "    void stop() {}\n    void stop(bool) {}")
    text = text.replace("struct Node : std::enable_shared_from_this<Node> {",
        "struct Node : std::enable_shared_from_this<Node> {\n"
        "    std::function<bool()> scrollBlurCurrent;\n"
        "    std::shared_ptr<InactiveSubsystem> wheel;\n")
    seam.write_text(text)
    scan = runpy.run_path(str(backend / "tests/verify-scroll-dismiss-regressions.py"))["scan_native"]
    commands = []

    def run(command, label):
        scan()
        with (output / (label + ".log")).open("w") as stream:
            result = subprocess.run(list(map(str, command)), stdout=stream, stderr=subprocess.STDOUT)
        commands.append({"command": list(map(str, command)), "exit": result.returncode})
        (output / "commands.json").write_text(json.dumps(commands, indent=2))
        if result.returncode:
            raise RuntimeError(label + "\n" + (output / (label + ".log")).read_text()[-9000:])
        print(label, flush=True)

    for name in ("verify-refresh-native.py", "verify-refresh-scroll.py", "verify-scroll-dismiss-keyboard.py"):
        command = [sys.executable, shadow / "tests" / name,
                   "--sdk-includes", args.sdk_includes, "--output", output / name.removesuffix(".py")]
        if name == "verify-scroll-dismiss-keyboard.py":
            command.append("--negative-controls")
        run(command, name)
    for name in ("scroll-state", "input-state"):
        binary = output / name
        run(["/usr/bin/clang++", "-std=c++20", "-Wall", "-Wextra", "-Werror",
             "-fsanitize=address,undefined", "-fno-omit-frame-pointer",
             backend / "tests" / (name + ".cpp"), "-o", binary], name + "-compile")
        run([binary], name + "-run")
    (output / "receipt.json").write_text(json.dumps({
        "commands": commands, "originalBoundarySHA256": hashlib.sha256(before.encode()).hexdigest(),
        "adaptedBoundarySHA256": hashlib.sha256(text.encode()).hexdigest(),
        "adaptation": "Inactive wheel field, stop helper and gesture registration boundary only, plus existing scrollBlurCurrent seam; original production code and assertions retained",
        "testSourceSHA256": {str(file): hashlib.sha256(file.read_bytes()).hexdigest()
                            for file in backend.joinpath("tests").glob("*") if file.is_file()},
    }, indent=2))


if __name__ == "__main__":
    main()
