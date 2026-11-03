#pragma once
#include "valdi_core/cpp/Marshalling/CppMarshaller.hpp"
namespace ValdiHarmony::Platform {
// Use the official generated-interface marshaller: persistent c+ proxy identity,
// native instance retention and weak method references are owned by Valdi.
template<typename Interface> Valdi::Value interfaceValue(const Valdi::Ref<Interface>& object) {
    Valdi::SimpleExceptionTracker error;
    Valdi::Value value;
    Valdi::CppMarshaller::marshall(error, object, value);
    if (!error) throw Valdi::Exception(error.extractError());
    return value;
}
} // namespace ValdiHarmony::Platform
