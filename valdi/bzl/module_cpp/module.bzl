"""Module-owned generated C++ bindings and optional runtime implementations."""

load("//:modules/runtime-cpp.bzl", "CPP_BINDING_DEPS")

def module_cpp_library(module_name, srcs = [], hdrs = [], deps = [], visibility = ["//visibility:public"]):
    """Create :bindings and, when implementation sources exist, :native."""
    if type(module_name) != "string" or not module_name:
        fail("module_name must be a nonempty module ID")
    if module_name[0] not in "abcdefghijklmnopqrstuvwxyz":
        fail("Invalid C++ module ID: %s" % module_name)
    for character in module_name.elems():
        if character not in "abcdefghijklmnopqrstuvwxyz0123456789_":
            fail("Invalid C++ module ID: %s" % module_name)
    expected_package = "modules/%s/cpp" % module_name
    if native.package_name() != expected_package:
        fail("module_cpp_library(%s) must be called from //%s" % (module_name, expected_package))
    if module_name not in CPP_BINDING_DEPS:
        fail("C++ bindings for %s are not planned; regenerate with --cpp-modules-out and enable the module" % module_name)

    core_deps = ["@valdi//valdi_core:valdi_core_cc"]
    generated = "generated/valdi_modules/%s/%s" % (module_name, module_name)
    native.cc_library(
        name = "bindings",
        linkstatic = True,
        srcs = [generated + ".cpp"],
        hdrs = [generated + ".hpp"],
        strip_include_prefix = "generated",
        visibility = visibility,
        deps = core_deps + CPP_BINDING_DEPS[module_name],
    )
    if srcs:
        native.cc_library(
            name = "native",
            linkstatic = True,
            # Factory registration uses static initializers without other references.
            alwayslink = True,
            srcs = srcs,
            hdrs = hdrs,
            visibility = visibility,
            deps = [":bindings"] + core_deps + deps,
        )
