#pragma once

#include "valdi_core/cpp/Schema/ValueSchema.hpp"
#include "valdi_core/cpp/Utils/Value.hpp"
#include <vector>

namespace ValdiHarmony::Platform {

// Public codec: validate AND deep-copy at every queue boundary. No functions,
// promises, proxies or borrowed byte storage may pass through this API.
Valdi::ValueSchema resolved(Valdi::ValueSchema schema);
Valdi::Value copy(const Valdi::ValueSchema& schema, const Valdi::Value& value);
Valdi::Value property(const Valdi::Value& object, const Valdi::StringBox& name);

} // namespace ValdiHarmony::Platform
