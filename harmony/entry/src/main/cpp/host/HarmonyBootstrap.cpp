#include "HarmonyBootstrap.hpp"
#include "valdi_core/cpp/Utils/ValueUtils.hpp"

#include <stdexcept>

namespace ValdiHarmony {

BootstrapProfile parseBootstrapMetadata(std::string_view json) {
    auto parsed = Valdi::correctJsonToValue(json);
    if (!parsed || !parsed.value().isMap()) {
        throw std::runtime_error("Invalid Harmony build-info.json");
    }
    const auto& bootstrap = parsed.value().getMapValue("bootstrap");
    if (!bootstrap.isMap() || !bootstrap.getMapValue("module").isString() ||
        !bootstrap.getMapValue("export").isString() ||
        bootstrap.getMapValue("export").toString() != "start") {
        throw std::runtime_error("Harmony build-info.json requires a known bootstrap module and start export");
    }
    const auto module = bootstrap.getMapValue("module").toString();
    BootstrapProfile result;
    if (module == "harmony_smoke/src/app") result = BootstrapProfile::Smoke;
    else if (module == "harmony_business/src/app") result = BootstrapProfile::Business;
    else throw std::runtime_error("Unsupported Harmony bootstrap module: " + module);
    const auto& profile = parsed.value().getMapValue("profile");
    if (!profile.isNullOrUndefined() &&
        (!profile.isString() || profile.toString() != (result == BootstrapProfile::Business ? "business" : "smoke"))) {
        throw std::runtime_error("Harmony bootstrap profile disagrees with its module");
    }
    if (result == BootstrapProfile::Business &&
        (!bootstrap.getMapValue("payloadGlobal").isString() ||
         bootstrap.getMapValue("payloadGlobal").toString() != "__harmonyBusinessBootstrap")) {
        throw std::runtime_error("Harmony business bootstrap requires __harmonyBusinessBootstrap payload");
    }
    return result;
}

} // namespace ValdiHarmony
