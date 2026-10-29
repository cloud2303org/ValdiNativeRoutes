"""Module-only rules: Node compiles TS/bindings, Bazel compiles native code.

No dependency on valdi_module, valdi_compiled, the Swift compiler or an App rule.
Native libraries compile against the host's exported runtime, never another copy.
"""

load("@node_valdi_local//:environment.bzl", "NODE", "TOOLS", "VALDI_SOURCES")
load("@rules_kotlin//kotlin:android.bzl", "kt_android_library")

NodeValdiModuleInfo = provider(fields = ["inputs", "archive", "resources", "modules"])

def _compiled_impl(ctx):
    name = ctx.attr.module_name
    ios_name = ctx.attr.ios_module_name
    base = ctx.label.name
    archive = ctx.actions.declare_file(base + "/" + name + ".valdimodule")
    source_map = ctx.actions.declare_file(base + "/" + name + ".map.json")
    kotlin = ctx.actions.declare_file(base + "/android/" + name + ".kt")
    objc = [ctx.actions.declare_file(base + "/ios/" + directory + "/" + directory + extension)
            for directory in [ios_name, ios_name + "Types"] for extension in [".h", ".m"]]
    cpp = [ctx.actions.declare_file(base + "/cpp/valdi_modules/" + name + "/" + name + extension)
           for extension in [".hpp", ".cpp"]]
    resources = ctx.actions.declare_directory(base + "/resources")
    manifest = ctx.actions.declare_file(base + "/build.json")
    inputs = depset(ctx.files.srcs + ctx.files.res + [ctx.file.config], transitive = [dep[NodeValdiModuleInfo].inputs for dep in ctx.attr.deps])
    dependencies = {}
    for dep in ctx.attr.deps:
        for module in dep[NodeValdiModuleInfo].modules:
            dependencies[module.name] = module
    outputs = [archive, source_map, kotlin, resources, manifest] + objc + cpp
    ctx.actions.run_shell(
        inputs = depset(ctx.files._tools + [dep.resources for dep in dependencies.values()], transitive = [inputs]),
        outputs = outputs,
        command = 'exec "$@"',
        arguments = [NODE, TOOLS + "/node_modules/tsx/dist/cli.mjs", TOOLS + "/module-build.ts",
                     "--module", name, "--out", archive.dirname, "--ios-module-name", ios_name,
                     "--deps", json.encode([{"name": dep.name, "generatedDir": dep.resources.path + "/ts"} for dep in dependencies.values()]),
                     "--mode", "release" if ctx.attr.release else "debug"],
        env = {"TSX_DISABLE_CACHE": "1", "VALDI_SOURCE_ROOT": VALDI_SOURCES},
        use_default_shell_env = True,
        execution_requirements = {"local": "1", "no-cache": "1"},
        mnemonic = "NodeValdiModule",
        progress_message = "Node Valdi module %s (%s)" % (name, "release" if ctx.attr.release else "debug"),
    )
    return [
        DefaultInfo(files = depset([archive, source_map, resources, manifest])),
        NodeValdiModuleInfo(inputs = inputs, archive = archive, resources = resources,
                            modules = dependencies.values() + [struct(name = name, resources = resources)]),
        OutputGroupInfo(kotlin = depset([kotlin]), objc_headers = depset([f for f in objc if f.extension == "h"]),
                        objc_sources = depset([f for f in objc if f.extension == "m"]), cpp = depset(cpp)),
    ]

_node_valdi_compiled = rule(
    implementation = _compiled_impl,
    attrs = {
        "module_name": attr.string(mandatory = True),
        "ios_module_name": attr.string(mandatory = True),
        "srcs": attr.label_list(allow_files = [".ts", ".tsx"]),
        "res": attr.label_list(allow_files = True),
        "config": attr.label(allow_single_file = [".json"], mandatory = True),
        "deps": attr.label_list(providers = [NodeValdiModuleInfo]),
        "release": attr.bool(),
        "_tools": attr.label(default = "@node_valdi_local//:tool_sources"),
    },
)

def node_valdi_module(name, srcs, config, ios_module_name = None, res = [], deps = [],
                      android_srcs = [], android_deps = [], ios_srcs = [], ios_hdrs = [], ios_deps = [],
                      visibility = ["//visibility:public"]):
    """Create debug/release Node artifacts and standalone Android/iOS libraries.

    Module dependencies name other modules' `_compiled` targets. Kotlin/ObjC
    dependencies are explicit, separate from TS dependencies. C++ generated
    sources are exposed via the `cpp` output group for native consumers.
    """
    if native.package_name() != "modules/" + name:
        fail("node_valdi_module must live at //modules/<name> and use that module's name")
    ios_name = ios_module_name or name
    for suffix, release in [("_compiled", False), ("_release", True)]:
        _node_valdi_compiled(name = name + suffix, module_name = name, ios_module_name = ios_name,
                             srcs = srcs, res = res, config = config, deps = deps,
                             release = release, visibility = visibility)
    for group in ["kotlin", "objc_headers", "objc_sources", "cpp"]:
        native.filegroup(name = name + "_" + group, srcs = [":" + name + "_compiled"], output_group = group, visibility = visibility)
    kt_android_library(
        name = name + "_android",
        srcs = [":" + name + "_kotlin"] + android_srcs,
        deps = ["@node_valdi_local//:android_runtime"] + android_deps,
        visibility = visibility,
    )
    native.objc_library(
        name = name + "_ios",
        srcs = [":" + name + "_objc_sources"] + ios_srcs,
        hdrs = [":" + name + "_objc_headers"] + ios_hdrs,
        includes = [name + "_compiled/ios", name + "_compiled/ios/" + ios_name,
                    name + "_compiled/ios/" + ios_name + "Types"],
        enable_modules = True,
        alwayslink = True,
        deps = ["@node_valdi_local//:ios_runtime"] + ios_deps,
        visibility = visibility,
    )
