const cppKeywords = new Set(`alignas alignof and and_eq asm atomic_cancel atomic_commit atomic_noexcept auto
bitand bitor bool break case catch char char8_t char16_t char32_t class compl concept const consteval constexpr
constinit const_cast continue co_await co_return co_yield decltype default delete do double dynamic_cast else enum
explicit export extern false float for friend goto if inline int long mutable namespace new noexcept not not_eq
nullptr operator or or_eq private protected public reflexpr register reinterpret_cast requires return short signed
sizeof static static_assert static_cast struct switch synchronized template this thread_local throw true try
typedef typeid typename union unsigned using virtual void volatile wchar_t while xor xor_eq`.split(/\s+/));

export function assertCppModuleName(name: string): void {
  if (cppKeywords.has(name) || name.includes('__')) {
    throw new Error(`Module name cannot be used as a C++ namespace: ${name}`);
  }
}

/** Repository template for C++ implementations registered inside the shared runtime. */
export function cppModuleFiles(name: string, pascal: string, naming?: {
  androidNamespace: string;
  iosPrefix: string;
}): Map<string, string> {
  const iosName = `${naming?.iosPrefix ?? 'SC'}${pascal}Cpp`;
  const androidName = `${naming?.androidNamespace ?? 'com.snap'}.modules.${name}.CppModule`;
  return new Map([
    ['src/Cpp.d.ts', `/**
 * Implemented in cpp/src/Cpp.cpp and linked into the shared Valdi runtime.
 * @ExportModule({ios: '${iosName}', android: '${androidName}'})
 */

export function multiply(left: number, right: number): number;
`],
    ['src/index.ts', `export { multiply } from './Cpp';
`],
    ['cpp/src/Cpp.cpp', `#include "valdi_modules/${name}/${name}.hpp"
#include "valdi_core/cpp/JavaScript/ModuleFactoryRegistry.hpp"

namespace snap::valdi_modules::${name} {
namespace {

class CppModuleImpl final : public CppModule {
public:
    double multiply(double left, double right) final {
        return left * right;
    }
};

class CppModuleFactoryImpl final : public CppModuleFactory {
protected:
    Valdi::Ref<CppModule> onLoadModule() final {
        return Valdi::makeShared<CppModuleImpl>();
    }
};

// The native target retains this registration before any runtime is created.
auto kRegisterCppModule = Valdi::RegisterModuleFactory::registerTyped<CppModuleFactoryImpl>();

} // namespace
} // namespace snap::valdi_modules::${name}
`],
    ['cpp/BUILD.bazel', `load("//bzl/module_cpp:module.bzl", "module_cpp_library")

module_cpp_library(
    module_name = "${name}",
    srcs = glob(["src/**/*.cpp", "src/**/*.cc", "src/**/*.cxx"]),
    hdrs = glob(["src/**/*.h", "src/**/*.hpp"]),
)
`],
    ['TEMPLATE.md', `# ${name}

Generated from the repository's \`cpp_bridge_module\` template.

- \`src/Cpp.d.ts\` declares the synchronous TypeScript API.
- \`cpp/src/Cpp.cpp\` implements that API.
- \`cpp/BUILD.bazel\` declares module-owned bindings and implementation targets.
- \`cpp/generated/\` is generated from the TypeScript declarations; do not edit it.

Enable "${name}" in the App's package.json valdi.modules, then import:

\`\`\`ts
import { multiply } from '${name}/src';
\`\`\`

Export the runtime explicitly with \`sh scripts/export-android.sh\` or \`sh scripts/export-ios.sh\`.
The shared flow regenerates bindings, selects enabled C++ implementations and
exports a matching runtime. No host BUILD or native registration edit is needed.
C++ changes require a new native binary; they cannot be delivered as a TS-only OTA.
Calls execute synchronously on the JS thread, so keep expensive work off that path.
`],
  ]);
}
