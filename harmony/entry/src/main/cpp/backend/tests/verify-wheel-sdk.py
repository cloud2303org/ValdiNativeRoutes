#!/usr/bin/env python3
"""Current-header managers/consumer objects and strict SDK wheel import links."""
import argparse
import hashlib
import json
from pathlib import Path
import runpy
import subprocess
import sys

BACKEND = Path(__file__).resolve().parents[1]
FORK_BACKEND = Path("/Users/cloud/.config/superpowers/worktrees/Valdi-node-only/harmony-platform-20261102/valdi/harmony/arkui")


def sha(path):
    return hashlib.sha256(Path(path).read_bytes()).hexdigest()


def main():
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument("--output", type=Path, required=True)
    args = parser.parse_args()
    output = args.output.resolve()
    output.mkdir(parents=True, exist_ok=False)
    scan = runpy.run_path(str(BACKEND / "tests/verify-scroll-dismiss-regressions.py"))["scan_native"]
    commands, artifacts = [], []

    def run(command, label):
        (output / (label + "-scan.json")).write_text(json.dumps(scan()))
        command = list(map(str, command))
        with (output / (label + ".log")).open("w") as stream:
            result = subprocess.run(command, stdout=stream, stderr=subprocess.STDOUT)
        commands.append({"command": command, "exit": result.returncode})
        (output / "commands.json").write_text(json.dumps(commands, indent=2))
        if result.returncode:
            raise RuntimeError(label + "\n" + (output / (label + ".log")).read_text()[-12000:])
        print(label, flush=True)

    run([sys.executable, BACKEND / "tests/compile-scroll-dismiss-managers.py",
         "--invocations", "/private/tmp/valdi-fork-ui-assets-adoption-proof-r3/invocations.jsonl",
         "--app-backend", BACKEND, "--fork-backend", FORK_BACKEND, "--output", output / "managers"], "managers")
    verification = json.loads((output / "managers/verification.json").read_text())
    imports = {}
    for row in verification["runs"]:
        abi, kind = row["abi"], row["kind"]
        label = abi + "-" + kind
        command = row["command"][:]
        compiler = command[0]
        obj = output / (label + "-consumer.o")
        command[command.index("-c") + 1] = str(BACKEND / "tests/wheel-sdk-consumer.cpp")
        command[command.index("-o") + 1] = str(obj)
        command[command.index("-MF") + 1] = str(obj.with_suffix(".d"))
        run(command, label + "-consumer")
        artifacts.append(obj)
        tool = Path(compiler).parent
        combined = output / (label + "-manager-consumer.o")
        run([tool / "ld.lld", "-r", row["object"], obj, "-o", combined], label + "-closure")
        artifacts.append(combined)
        unresolved = subprocess.check_output([tool / "llvm-nm", "--undefined-only", str(combined)], text=True)
        assert "_ZN5Valdi7Harmony16ArkUIViewManager26supportsClassNameNatively" not in unresolved
        required = {line.split()[-1] for line in unresolved.splitlines() if line.split()
                    and line.split()[-1].startswith("OH_ArkUI_")}
        wheel = {
            "OH_ArkUI_TextPickerRangeContentArray_Create", "OH_ArkUI_TextPickerRangeContentArray_SetTextAtIndex",
            "OH_ArkUI_TextPickerRangeContentArray_Destroy", "OH_ArkUI_NodeEvent_GetNodeComponentEvent",
            "OH_ArkUI_GestureInterruptInfo_GetTouchRecognizers", "OH_ArkUI_TouchRecognizer_GetNodeHandle",
            "OH_ArkUI_TouchRecognizer_IsHostBelongsTo", "OH_ArkUI_GetGestureBindNodeUniqueId",
            "OH_ArkUI_NodeUtils_GetNodeUniqueId",
        }
        assert wheel <= required, "Missing real wheel imports: " + repr(wheel - required)
        target = next(value.split("=", 1)[1] for value in command if value.startswith("--target="))
        sysroot = Path(next(value.split("=", 1)[1] for value in command if value.startswith("--sysroot=")))
        library = sysroot / "usr/lib" / target / "libace_ndk.z.so"
        exports = subprocess.check_output([tool / "llvm-nm", "--dynamic", "--defined-only", library], text=True)
        exported = {line.split()[-1].split("@")[0] for line in exports.splitlines() if line.split()}
        assert wheel <= exported, "SDK does not export wheel API"
        probe = output / (label + "-sdk.cpp")
        probe.write_text(
            "#include <arkui/native_node.h>\n#include <arkui/native_gesture.h>\n"
            "#include <arkui/node_attributes/picker.h>\n"
            + "\n".join(f"decltype(&{symbol}) volatile wheel_import_{i} = &{symbol};"
                        for i, symbol in enumerate(sorted(wheel))) + "\n")
        strict = output / (label + "-sdk.so")
        run([compiler, f"--target={target}", f"--sysroot={sysroot}", "-std=c++20", "-fPIC",
             "-shared", "-Werror", probe, "-Wl,--no-undefined", "-lace_ndk.z", "-o", strict], label + "-strict-sdk")
        artifacts.append(strict)
        imports[label] = {"allArkUIImports": sorted(required), "wheelImports": sorted(wheel),
                          "libaceNDKSHA256": sha(library), "strictProbe": str(strict)}
    (output / "receipt.json").write_text(json.dumps({
        "commands": commands, "managerReceiptSHA256": sha(output / "managers/verification.json"),
        "consumerSHA256": sha(BACKEND / "tests/wheel-sdk-consumer.cpp"),
        "outputs": {str(file): sha(file) for file in artifacts}, "imports": imports,
        "oldContextArchives": False, "fullRuntimeOrAppLink": False, "HAP": False, "device": False,
    }, indent=2))


if __name__ == "__main__":
    main()
