#pragma once

#include <string_view>

namespace ValdiHarmony {

enum class BootstrapProfile { Smoke, Business };

// Only the two compiled entry points are allowed; metadata is not executable
// configuration. An absent marker preserves the original smoke bootstrap.
BootstrapProfile parseBootstrapMetadata(std::string_view json);

} // namespace ValdiHarmony
