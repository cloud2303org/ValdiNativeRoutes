"""Local Node toolchain for runtime module compilation."""

def _tools_impl(ctx):
    root = ctx.path(ctx.attr.project).dirname.dirname
    node = ctx.which("node")
    if not node:
        fail("The Node Valdi backend requires Node and the installed pnpm dependencies")
    tools = root.get_child("tools/valdi-rolldown")
    ctx.symlink(tools, "tools")
    ctx.file("environment.bzl", "NODE = %r\nTOOLS = %r\n" % (str(node), str(tools)))
    ctx.file("BUILD.bazel", """
package(default_visibility = ["//visibility:public"])
exports_files(["environment.bzl"])
filegroup(name = "sources", srcs = glob(["tools/*.ts", "tools/codegen/**/*.ts", "tools/vendor/**"]) + ["tools/package.json", "tools/pnpm-lock.yaml"])
""")

node_compiler_tools = repository_rule(
    implementation = _tools_impl,
    attrs = {"project": attr.label(allow_single_file = True, mandatory = True)},
    local = True,
    configure = True,
)
