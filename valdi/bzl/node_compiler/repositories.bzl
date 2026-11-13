"""Expose authored compiler inputs; Node/npm are resolved separately by Bzlmod."""

_BUILTINS = ["valdi_core", "valdi_tsx", "coreutils", "source_map", "jasmine", "drawing", "native_web"]

def _tools_impl(ctx):
    root = ctx.path(ctx.attr.project).dirname.dirname
    tools = root.get_child("tools/valdi-rolldown")
    # Expose only authored inputs, never the installed pnpm store, generated
    # configs or machine-local outputs. Each file becomes a hashed Bazel input.
    for entry in tools.readdir():
        if entry.basename in ["codegen", "vendor"] or entry.basename.endswith(".ts") or entry.basename.endswith(".mjs") or entry.basename in ["package.json", "pnpm-lock.yaml"]:
            ctx.symlink(entry, entry.basename)
    # All native compiler dependencies ship prebuilt platform packages.
    # rules_js requires an explicit pnpm 10 lifecycle allowlist.
    ctx.file("pnpm-workspace.yaml", "onlyBuiltDependencies: []\n")
    # The frontend reads original dependency declarations and validates the VM
    # protocol. Expose their complete, immutable source closure without crossing
    # the fork's native BUILD package visibility or adding native dependencies.
    framework = ctx.path(ctx.attr.framework).dirname
    for relative in [
        "modules/_configs/base.tsconfig.json",
        "modules/types/Long.d.ts",
        "modules/types/globals.d.ts",
        "third-party/hermes_v1/hermes.BUILD",
        "valdi/src/valdi/runtime/JavaScript/JavaScriptUtils.cpp",
    ]:
        ctx.symlink(framework.get_child(relative), "framework/" + relative)
    for name in _BUILTINS:
        for folder in ["src", "types"]:
            relative = "src/valdi_modules/src/valdi/" + name + "/" + folder
            source = framework.get_child(relative)
            if source.exists:
                ctx.symlink(source, "framework/" + relative)
    ctx.file("BUILD.bazel", """
load("@aspect_rules_js//js:defs.bzl", "js_library")
load("@runtime_compiler_npm//:defs.bzl", "npm_link_all_packages")

package(default_visibility = ["//visibility:public"])
exports_files(["pnpm-lock.yaml"])
filegroup(name = "framework_inputs", srcs = glob(["framework/**"]))
npm_link_all_packages(name = "node_modules")
js_library(
    name = "compiler",
    srcs = glob(["*.ts", "*.mjs", "codegen/**/*.ts", "vendor/**"],
                exclude = ["*.test.ts", "codegen/goldens.ts"]) + ["package.json", "pnpm-lock.yaml"],
    deps = [":node_modules"],
)
""")

node_compiler_tools = repository_rule(
    implementation = _tools_impl,
    attrs = {
        "project": attr.label(allow_single_file = True, mandatory = True),
        "framework": attr.label(default = Label("@valdi//:MODULE.bazel"), allow_single_file = True),
    },
    local = True,
    configure = True,
)
