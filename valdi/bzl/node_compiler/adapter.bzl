"""Produce the existing ValdiModuleInfo outputs using our Node backend.

The fork retains the established native library/export rules and their
output declarations. This adapter does not load the Valdi compiler toolchain.
"""

load("@aspect_rules_js//js:providers.bzl", "JsInfo")
load("@rules_nodejs//nodejs:toolchain.bzl", "NodeInfo")

NODE_COMPILER_ATTRS = {
    "_node_tools": attr.label(default = Label("@node_compiler_tools//:compiler"), cfg = "exec"),
    "_node_runtime": attr.label(default = Label("@rules_nodejs//nodejs:current_node_runtime"), cfg = "exec"),
    "_node_context": attr.label(default = Label("@node_compiler_tools//:framework_inputs")),
}

def invoke_node_compiler(ctx, name, base, outputs, module_directory, dependencies, dependency_inputs):
    if name not in ["valdi_core", "valdi_tsx", "coreutils", "source_map", "jasmine", "drawing", "native_web"]:
        fail("The Node runtime backend has not been validated for %s; use standalone node_valdi_module() for custom modules" % name)
    for feature, present in [
        ("legacy Vue", ctx.files.legacy_vue_srcs),
        ("legacy CSS", ctx.files.legacy_style_srcs),
        ("SQL code generation", ctx.files.sql_srcs),
        ("protodecl", ctx.files.protodecl_srcs),
        ("localized strings", ctx.files.strings_json_srcs),
        ("runtime module resources", ctx.files.res),
        ("web output", ctx.var.get("enable_web")),
        ("ids.yaml", ctx.file.ids_yaml),
        ("Swift bindings", "swift" in ctx.attr.ios_language),
        ("native TSN compilation", ctx.attr.compilation_mode == "native"),
        ("downloadable output", ctx.attr.prepared_upload_artifact_name or ctx.attr.downloadable_sources),
    ]:
        if present:
            fail("Node runtime backend does not support %s for %s" % (feature, name))
    manifest = ctx.actions.declare_file(name + ".node-inputs.json")
    spec = {
        "name": name,
        "moduleDirectory": module_directory,
        "outputs": [{"path": file.path, "relative": file.path[len(base) + 1:], "directory": file.is_directory} for file in outputs],
        "sources": [file.path for file in ctx.files.srcs if file.basename != "tsconfig.json"],
        "dependencies": dependencies,
        "iosModuleName": ctx.attr.ios_module_name,
        "iosClassPrefix": ctx.attr.ios_class_prefix,
        "androidClassPath": ctx.attr.android_class_path,
        "disableAnnotations": ctx.attr.disable_annotation_processing,
        "asyncStrictMode": ctx.attr.async_strict_mode,
        "compilationMode": ctx.attr.compilation_mode,
    }
    context = [file for file in ctx.files._node_context if file.path.endswith("/modules/_configs/base.tsconfig.json")][0]
    spec["frameworkRoot"] = context.path[:-len("/modules/_configs/base.tsconfig.json")]
    ctx.actions.write(manifest, json.encode(spec))
    compiler = ctx.attr._node_tools[JsInfo]
    launchers = [file for file in compiler.sources.to_list() if file.basename == "runtime-launcher.mjs"]
    if len(launchers) != 1:
        fail("Expected one runtime-launcher.mjs in the Node compiler inputs")
    node = ctx.attr._node_runtime[NodeInfo].node
    if not node:
        fail("Runtime compilation requires a downloaded Node toolchain, not node_path")
    # Execute the toolchain's Node directly, including on Windows (no MSYS
    # shell launcher), with the complete npm store and authored source closure.
    ctx.actions.run(
        executable = node,
        arguments = [launchers[0].path, manifest.path],
        tools = [node],
        inputs = depset(
            ctx.files.srcs + ctx.files.res + [manifest] + ctx.files._node_context,
            transitive = dependency_inputs + [compiler.transitive_sources, compiler.transitive_types, compiler.npm_sources],
        ),
        outputs = outputs,
        use_default_shell_env = False,
        env = {"TSX_DISABLE_CACHE": "1", "LANG": "C", "LC_ALL": "C", "TZ": "UTC"},
        # Cache locally/remotely; execution stays local until execution-platform
        # native npm binaries and a remote executor have been validated.
        execution_requirements = {"no-remote-exec": "1"},
        mnemonic = "NodeValdiRuntimeModule",
        progress_message = "Node compile runtime module " + name,
    )
    return outputs
