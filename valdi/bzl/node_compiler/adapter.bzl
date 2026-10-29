"""Produce the existing ValdiModuleInfo outputs using our Node backend.

The fork retains the established native library/export rules and their
output declarations. This adapter does not load the Valdi compiler toolchain.
"""

load("@node_compiler_tools//:environment.bzl", "NODE", "TOOLS")

NODE_COMPILER_ATTRS = {"_node_tools": attr.label(default = Label("@node_compiler_tools//:sources"))}

def invoke_node_compiler(ctx, name, base, outputs, module_directory, dependencies, dependency_inputs):
    if name not in ["valdi_core", "valdi_tsx", "coreutils", "source_map", "jasmine", "drawing", "client_sql"]:
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
    ctx.actions.write(manifest, json.encode(spec))
    ctx.actions.run_shell(
        command = 'exec "$@"',
        arguments = [NODE, TOOLS + "/node_modules/tsx/dist/cli.mjs", TOOLS + "/runtime-module.ts", manifest.path],
        inputs = depset(ctx.files.srcs + ctx.files.res + [manifest] + ctx.files._node_tools,
                        transitive = dependency_inputs),
        outputs = outputs,
        use_default_shell_env = True,
        env = {"TSX_DISABLE_CACHE": "1"},
        execution_requirements = {"local": "1", "no-cache": "1"},
        mnemonic = "NodeValdiRuntimeModule",
        progress_message = "Node compile runtime module " + name,
    )
    return outputs
