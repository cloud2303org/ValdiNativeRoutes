#include "PlatformServiceCodec.hpp"

#include "valdi_core/cpp/Utils/ValueArray.hpp"
#include "valdi_core/cpp/Utils/ValueTypedArray.hpp"
#include "valdi_core/cpp/Utils/ValueTypedObject.hpp"
#include "valdi_core/cpp/Utils/ValueTypedProxyObject.hpp"
#include <cmath>
#include <stdexcept>

namespace ValdiHarmony::Platform {
namespace {
[[noreturn]] void invalid() {
    throw std::invalid_argument("E_PLATFORM_INVALID:invalid typed service value");
}
Valdi::Value copyAt(const Valdi::ValueSchema& input, const Valdi::Value& value,
                    size_t depth, size_t& budget) {
    if (depth > 32 || budget == 0) invalid();
    --budget;
    auto schema = resolved(input);
    if (schema.isVoid()) {
        if (!value.isNullOrUndefined()) invalid();
        return Valdi::Value::undefined();
    }
    if (value.isNullOrUndefined()) {
        if (!schema.isOptional()) invalid();
        return value; // Preserve null vs undefined.
    }
    if (schema.isString()) {
        if (!value.isString() || value.toStringBox().length() > 1024 * 1024) invalid();
        return Valdi::Value(value.toString());
    }
    if (schema.isBoolean()) {
        if (!value.isBool()) invalid();
        return Valdi::Value(value.toBool());
    }
    if (schema.isDouble() || schema.isInteger() || schema.isLongInteger()) {
        if (!value.isNumber() || value.isBool() || !std::isfinite(value.toDouble())) invalid();
        return Valdi::Value(value.toDouble()); // SDK units unchanged.
    }
    if (schema.isValueTypedArray()) {
        auto* array = value.getTypedArray();
        if (!array || array->getType() != Valdi::Uint8Array ||
            array->getBuffer().size() > 1024 * 1024) invalid();
        auto bytes = Valdi::makeShared<Valdi::Bytes>();
        const auto& buffer = array->getBuffer();
        if (!buffer.empty()) bytes->assignData(buffer.data(), buffer.size());
        return Valdi::Value(Valdi::makeShared<Valdi::ValueTypedArray>(Valdi::Uint8Array, bytes));
    }
    if (schema.isArray()) {
        auto* array = value.getArray();
        if (!array || array->size() > 16384) invalid();
        std::vector<Valdi::Value> result;
        result.reserve(array->size());
        for (const auto& entry : *array)
            result.emplace_back(copyAt(schema.getArrayItemSchema(), entry, depth + 1, budget));
        return Valdi::Value(Valdi::ValueArray::make(std::move(result)));
    }
    if (schema.isClass()) {
        if (!value.isMap() && !value.isTypedObject()) invalid();
        auto object = Valdi::ValueTypedObject::make(schema.getClassRef());
        size_t index = 0;
        for (const auto& field : *schema.getClass()) {
            object->setProperty(index++, copyAt(field.schema, property(value, field.name), depth + 1, budget));
        }
        return Valdi::Value(object);
    }
    invalid();
}
}

Valdi::ValueSchema resolved(Valdi::ValueSchema schema) {
    bool optional = schema.isOptional();
    for (size_t i = 0; schema.isSchemaReference(); ++i) {
        if (i >= 32) invalid();
        schema = schema.getReferencedSchema();
        optional = optional || schema.isOptional();
    }
    return optional ? schema.asOptional() : schema;
}

Valdi::Value property(const Valdi::Value& object, const Valdi::StringBox& name) {
    if (auto* typed = object.getTypedObject()) return typed->getPropertyForName(name);
    if (auto* proxy = object.getProxyObject()) return proxy->getTypedObject()->getPropertyForName(name);
    return object.getMapValue(name);
}

Valdi::Value copy(const Valdi::ValueSchema& schema, const Valdi::Value& value) {
    size_t budget = 65536;
    return copyAt(schema, value, 0, budget);
}

} // namespace ValdiHarmony::Platform
