"""Local Node tooling and the host's already exported Valdi runtime.

This adapter intentionally uses the installed pnpm toolchain. Its actions are
local and uncached; it does not claim a hermetic or remote execution environment.
"""

def _environment_impl(ctx):
    root = ctx.path(ctx.attr.project).dirname.dirname
    node = ctx.which("node")
    if not node:
        fail("node is required; install the project's Node/pnpm dependencies first")
    tools = root.get_child("tools/valdi-rolldown")
    valdi_sources = ctx.path(ctx.attr.valdi_sources).dirname
    ctx.symlink(tools, "tools")
    ctx.symlink(root.get_child("valdi/pnpm-lock.yaml"), "app-pnpm-lock.yaml")
    ctx.symlink(root.get_child("android/app/libs/valdi_runtime.aar"), "valdi_runtime.aar")
    ctx.symlink(root.get_child("ios/Frameworks/ValdiRuntime.xcframework"), "ValdiRuntime.xcframework")
    ctx.file("environment.bzl", "NODE = %r\nTOOLS = %r\nVALDI_SOURCES = %r\n" % (str(node), str(tools), str(valdi_sources)))
    ctx.file("BUILD.bazel", """
load("@rules_android//rules:rules.bzl", "aar_import")
load("@rules_apple//apple:apple.bzl", "apple_dynamic_xcframework_import")
package(default_visibility = ["//visibility:public"])
exports_files(["environment.bzl"])
filegroup(
    name = "tool_sources",
    srcs = glob(["tools/*.ts", "tools/codegen/**/*.ts", "tools/vendor/**"]) +
           ["tools/package.json", "tools/pnpm-lock.yaml", "app-pnpm-lock.yaml"],
)
aar_import(name = "android_runtime", aar = "valdi_runtime.aar")
apple_dynamic_xcframework_import(
    name = "ios_runtime",
    xcframework_imports = glob(["ValdiRuntime.xcframework/**"]),
)
""")

node_valdi_environment = repository_rule(
    implementation = _environment_impl,
    attrs = {
        "project": attr.label(default = "//:MODULE.bazel", allow_single_file = True),
        "valdi_sources": attr.label(default = "@valdi//:MODULE.bazel", allow_single_file = True),
    },
    local = True,
    configure = True,
)
